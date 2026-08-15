import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { callRpc } from "@/lib/supabaseRest";
import { getWebsiteKey } from "@/lib/getWebsiteKey";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegDistance, type LegInput } from "@/lib/googleRoute";
import { isValidPhone } from "@/lib/format";
import { getSessionProfile } from "@/lib/auth";
import { sendEmail, emailEnabled } from "@/lib/email";
import { sendSms, smsEnabled } from "@/lib/sms";
import { customerConfirmationEmail, staffAlertEmail, type BookingEmailData } from "@/lib/emailTemplates";
import { rateLimit, clientIp } from "@/lib/rateLimit";

interface Leg extends LegInput {
  pickup_address: string;
  dropoff_address: string;
  via_points?: { address: string; lat: number | null; lng: number | null }[];
  scheduled_at?: string | null;
  route_text?: string;
}

interface BookResult {
  ok: boolean;
  error?: string;
  booking_id?: string;
  booking_number?: string;
  estimated_fare?: number;
  website?: string;
}

export async function POST(req: Request) {
  // Throttle: booking sends an SMS + emails to client-supplied addresses and hits
  // Google/Stripe — cap per IP so it can't be scripted to bomb numbers or run up bills.
  if (!rateLimit(`book:${clientIp(req)}`, 15, 60_000)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));

  if (!b.name?.trim() || !b.whatsapp?.trim() || !b.category_id || !b.outbound) {
    return NextResponse.json({ ok: false, error: "missing_fields" });
  }

  if (!b.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim())) {
    return NextResponse.json({ ok: false, error: "invalid_email" });
  }

  if (!isValidPhone(b.whatsapp)) {
    return NextResponse.json({ ok: false, error: "invalid_phone" });
  }

  const key = await getWebsiteKey(b.site ?? "main");
  if (!key) return NextResponse.json({ ok: false, error: "invalid_website" });

  const hasReturn = !!b.return;
  const tripGroupId = hasReturn ? randomUUID() : null;

  const createLeg = async (leg: Leg, isReturn: boolean) => {
    // Recompute distance from coordinates server-side — the stored fare must
    // not depend on a client-supplied distance_km.
    const { distance_km, duration_min } = await resolveLegDistance(leg);
    const { data } = await callRpc<BookResult>("create_booking", {
      p_api_key: key,
      p_customer_name: b.name,
      p_whatsapp: b.whatsapp,
      p_pickup_address: leg.pickup_address,
      p_dropoff_address: leg.dropoff_address,
      p_category_id: b.category_id,
      p_pickup_lat: leg.pickup_lat ?? null,
      p_pickup_lng: leg.pickup_lng ?? null,
      p_dropoff_lat: leg.dropoff_lat ?? null,
      p_dropoff_lng: leg.dropoff_lng ?? null,
      p_distance_km: distance_km,
      p_duration_min: duration_min,
      p_payment_method: b.payment_method ?? "cash",
      p_notes: b.notes ?? null,
      p_scheduled_at: leg.scheduled_at ?? null,
      p_via_points: leg.via_points ?? [],
      p_trip_group_id: tripGroupId,
      p_is_return: isReturn,
      p_route_text: leg.route_text ?? null,
      p_email: b.email ?? null,
      p_child_seat: b.child_seat ? "1" : null,
      p_passengers: b.passengers ?? 1,
      p_suitcases: b.suitcases ?? 0,
      p_hand_luggage: b.hand_luggage ?? 0,
    });
    return data;
  };

  const outbound = await createLeg(b.outbound as Leg, false);
  if (!outbound?.ok) {
    return NextResponse.json(outbound ?? { ok: false, error: "no_response" });
  }

  let ret: BookResult | null = null;
  if (hasReturn) {
    ret = await createLeg(b.return as Leg, true);
  }

  // Card payments: verify the Stripe PaymentIntent succeeded AND that the
  // amount actually captured matches this booking's server-computed fare,
  // then mark paid. This blocks the "cheap intent, expensive booking" bypass.
  let paid = false;
  let receiptUrl: string | null = null;
  if (b.payment_method === "card" && b.payment_intent_id) {
    const stripe = await getStripe();
    if (stripe) {
      try {
        const pi = await stripe.paymentIntents.retrieve(b.payment_intent_id, {
          expand: ["latest_charge"],
        });
        const bookingTotal =
          (outbound.estimated_fare ?? 0) + (ret?.ok ? ret.estimated_fare ?? 0 : 0);
        const paidPence = pi.amount_received ?? pi.amount ?? 0;
        const amountMatches = Math.abs(paidPence - Math.round(bookingTotal * 100)) <= 1;

        if (pi.status === "succeeded" && amountMatches) {
          paid = true;
          const charge = pi.latest_charge as { receipt_url?: string | null } | null;
          receiptUrl = charge?.receipt_url ?? null;
          const amountPaid = paidPence / 100;

          const admin = createAdminClient();
          const paidFields = { payment_status: "paid", stripe_payment_intent_id: pi.id };
          if (tripGroupId) {
            await admin.from("bookings").update(paidFields).eq("trip_group_id", tripGroupId);
          } else if (outbound.booking_id) {
            await admin.from("bookings").update(paidFields).eq("id", outbound.booking_id);
          }
          if (outbound.booking_id) {
            await admin.from("payments").insert({
              booking_id: outbound.booking_id,
              amount: amountPaid,
              method: "card",
              status: "paid",
              stripe_payment_intent_id: pi.id,
              receipt_url: receiptUrl,
            });
          }
        }
      } catch {
        /* leave booking as pending if verification fails */
      }
    }
  }

  // Staff-only manual price override (discount / rush pricing). Verified against
  // the logged-in staff session, so a public customer can NEVER set their own price.
  let overrideFare: number | null = null;
  const requestedFare = Number(b.custom_fare);
  if (b.custom_fare != null && Number.isFinite(requestedFare) && requestedFare >= 0 && outbound.booking_id) {
    const me = await getSessionProfile();
    if (me && (me.role === "admin" || me.role === "dispatcher")) {
      overrideFare = requestedFare;
      const admin = createAdminClient();
      if (ret?.ok && ret.booking_id) {
        // The custom price is the WHOLE-TRIP total. Split it across both legs so the
        // per-leg fares still sum to it (cash collection, settlement, analytics all
        // read per-leg estimated_fare). Split in proportion to the original leg fares.
        const outOrig = outbound.estimated_fare ?? 0;
        const retOrig = ret.estimated_fare ?? 0;
        const sumOrig = outOrig + retOrig;
        const outShare =
          sumOrig > 0
            ? Math.round(overrideFare * (outOrig / sumOrig) * 100) / 100
            : Math.round((overrideFare / 2) * 100) / 100;
        const retShare = Math.round((overrideFare - outShare) * 100) / 100;
        await admin
          .from("bookings")
          .update({
            estimated_fare: outShare,
            fare_breakdown: { total: outShare, custom: true, custom_trip_total: overrideFare, note: "Custom price set by staff (outbound share)" },
          })
          .eq("id", outbound.booking_id);
        await admin
          .from("bookings")
          .update({
            estimated_fare: retShare,
            fare_breakdown: { total: retShare, custom: true, custom_trip_total: overrideFare, note: "Custom price set by staff (return share)" },
          })
          .eq("id", ret.booking_id);
      } else {
        await admin
          .from("bookings")
          .update({
            estimated_fare: overrideFare,
            fare_breakdown: { total: overrideFare, custom: true, note: "Custom price set by staff" },
          })
          .eq("id", outbound.booking_id);
      }
    }
  }

  // SMS confirmation to the customer's phone (best-effort, independent of email)
  if ((await smsEnabled()) && b.whatsapp) {
    try {
      const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
      const out = b.outbound as Leg;
      const totalFare = overrideFare ?? (outbound.estimated_fare ?? 0) + (ret?.ok ? ret.estimated_fare ?? 0 : 0);
      const when = out.scheduled_at
        ? new Date(out.scheduled_at).toLocaleString("en-GB", {
            timeZone: "Europe/London",
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "ASAP";
      const site = outbound.website || "Your taxi";
      const text =
        `${site}: Booking confirmed. Ref ${outbound.booking_number}. ` +
        `${out.pickup_address} to ${out.dropoff_address}. ${when}. ` +
        `Total £${totalFare.toFixed(2)} (${b.payment_method ?? "cash"}). ` +
        `Track your ride: ${origin}/track/${outbound.booking_number}`;
      await sendSms(b.whatsapp, text);
    } catch {
      /* SMS is best-effort — booking already succeeded */
    }
  }

  // Confirmation emails — customer + staff (dispatch/admin). Never block or fail
  // the booking on an email error; skips entirely when email isn't configured.
  if (await emailEnabled()) {
    try {
      const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
      const admin = createAdminClient();
      const out = b.outbound as Leg;
      const [{ data: cat }, { data: staff }] = await Promise.all([
        admin.from("vehicle_categories").select("name").eq("id", b.category_id).maybeSingle(),
        admin.from("profiles").select("email").in("role", ["admin", "dispatcher"]),
      ]);
      const staffEmails = ((staff ?? []) as { email: string | null }[])
        .map((s) => s.email)
        .filter((e): e is string => !!e);

      const totalFare = overrideFare ?? ((outbound.estimated_fare ?? 0) + (ret?.ok ? ret.estimated_fare ?? 0 : 0));
      const data: BookingEmailData = {
        bookingNumber: outbound.booking_number ?? "",
        customerName: b.name,
        customerWhatsapp: b.whatsapp,
        customerEmail: b.email,
        pickup: out.pickup_address,
        vias: (out.via_points ?? []).map((v) => v.address).filter(Boolean),
        dropoff: out.dropoff_address,
        carName: (cat as { name?: string } | null)?.name ?? null,
        distanceKm: out.distance_km ?? null,
        fare: totalFare,
        paymentMethod: (b.payment_method ?? "cash") as "cash" | "card",
        paid,
        scheduledAt: out.scheduled_at ?? null,
        isReturn: false,
        returnBookingNumber: ret?.booking_number ?? null,
        trackUrl: `${origin}/track/${outbound.booking_number}`,
        siteName: outbound.website,
      };

      const customer = customerConfirmationEmail(data);
      const staffMail = staffAlertEmail(data, `${origin}/dispatch`);
      await Promise.all([
        b.email ? sendEmail({ to: b.email, subject: customer.subject, html: customer.html }) : null,
        staffEmails.length
          ? sendEmail({ to: staffEmails, subject: staffMail.subject, html: staffMail.html })
          : null,
      ]);
    } catch {
      /* email is best-effort — booking already succeeded */
    }
  }

  // Activity log (best-effort — never break the booking)
  try {
    const logAdmin = createAdminClient();
    await logAdmin.from("activity_logs").insert({
      action: "booking_created",
      description: `New booking ${outbound.booking_number} — ${b.name}`,
      metadata: { fare: overrideFare ?? outbound.estimated_fare ?? null, payment: b.payment_method ?? "cash" },
    });
  } catch {
    /* ignore logging errors */
  }

  return NextResponse.json({ ok: true, outbound, return: ret, paid, receipt_url: receiptUrl });
}
