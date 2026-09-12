import { NextResponse } from "next/server";
import { getStripe, toMinor, fromMinor } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Staff-only (admin or dispatcher): refund a card payment, in full or in part.
 *
 * Target it either by booking (`booking_id`, from the bookings screen) or by
 * payment row (`payment_id`, from Admin → Payments — this is how an orphaned
 * payment with no booking attached gets refunded). Omit `amount` for a full
 * refund of whatever is left.
 *
 * The database is updated here for immediate feedback, and the charge.refunded
 * webhook re-syncs it afterwards — so a refund issued straight from the Stripe
 * Dashboard lands in exactly the same state.
 */
export async function POST(req: Request) {
  const stripe = await getStripe();
  if (!stripe) return NextResponse.json({ ok: false, error: "payments_not_configured" });

  // Must be signed-in staff (admin or dispatcher)
  const supa = await createClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" });
  const { data: profile } = await supa.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "dispatcher") {
    return NextResponse.json({ ok: false, error: "forbidden" });
  }

  const body = await req.json().catch(() => ({}));
  const { booking_id, payment_id } = body;
  if (!booking_id && !payment_id) return NextResponse.json({ ok: false, error: "missing_target" });

  const admin = createAdminClient();

  // ── Resolve which PaymentIntent we are refunding ──────────────────────────
  let intentId: string | null = null;
  let label = "";
  let bookingRow: { id: string; booking_number: string; trip_group_id: string | null } | null = null;

  if (booking_id) {
    const { data: booking } = await admin
      .from("bookings")
      .select("id, booking_number, trip_group_id, stripe_payment_intent_id, payment_status")
      .eq("id", booking_id)
      .single();
    if (!booking?.stripe_payment_intent_id) return NextResponse.json({ ok: false, error: "no_payment" });
    if (booking.payment_status === "refunded") return NextResponse.json({ ok: false, error: "already_refunded" });
    intentId = booking.stripe_payment_intent_id;
    bookingRow = booking;
    label = booking.booking_number;
  } else {
    const { data: payment } = await admin
      .from("payments")
      .select("id, stripe_payment_intent_id, status, booking_id")
      .eq("id", payment_id)
      .single();
    if (!payment?.stripe_payment_intent_id) return NextResponse.json({ ok: false, error: "no_payment" });
    if (payment.status === "refunded") return NextResponse.json({ ok: false, error: "already_refunded" });
    intentId = payment.stripe_payment_intent_id;
    label = payment.stripe_payment_intent_id;
    if (payment.booking_id) {
      const { data: booking } = await admin
        .from("bookings")
        .select("id, booking_number, trip_group_id")
        .eq("id", payment.booking_id)
        .maybeSingle();
      bookingRow = booking ?? null;
      if (booking?.booking_number) label = booking.booking_number;
    }
  }

  if (!intentId) return NextResponse.json({ ok: false, error: "no_payment" });

  // ── How much is actually left to refund? ──────────────────────────────────
  // Ask Stripe, not our own table: a refund may already have been issued from
  // the Dashboard and our row could be a webhook behind.
  let captured = 0;
  let alreadyRefunded = 0;
  try {
    const pi = await stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] });
    const charge = pi.latest_charge as { amount?: number; amount_refunded?: number } | null;
    captured = fromMinor(charge?.amount ?? pi.amount_received ?? 0);
    alreadyRefunded = fromMinor(charge?.amount_refunded ?? 0);
  } catch (err) {
    console.error("[refund] could not read PaymentIntent", intentId, err);
    return NextResponse.json({ ok: false, error: "stripe_unreachable" });
  }

  const remaining = Math.round((captured - alreadyRefunded) * 100) / 100;
  if (remaining <= 0) return NextResponse.json({ ok: false, error: "already_refunded" });

  const requested = body.amount == null ? remaining : Number(body.amount);
  if (!Number.isFinite(requested) || requested <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_amount" });
  }
  if (requested > remaining + 0.001) {
    return NextResponse.json({ ok: false, error: "amount_too_high", remaining });
  }

  const amountMinor = toMinor(requested);
  const full = requested >= remaining - 0.001;

  try {
    await stripe.refunds.create(
      { payment_intent: intentId, amount: amountMinor },
      // A double-click must not refund twice. Same intent + same amount + same
      // amount already refunded = the same logical refund.
      { idempotencyKey: `refund:${intentId}:${toMinor(alreadyRefunded)}:${amountMinor}` }
    );
  } catch (err) {
    console.error("[refund] stripe refund failed", intentId, err);
    return NextResponse.json({ ok: false, error: "refund_failed" });
  }

  // ── Reflect it locally (the webhook will confirm the same thing) ──────────
  const totalRefunded = Math.round((alreadyRefunded + requested) * 100) / 100;
  await admin
    .from("payments")
    .update({
      amount_refunded: totalRefunded,
      ...(full
        ? { status: "refunded", refunded_at: new Date().toISOString(), needs_review: false, review_reason: null }
        : {}),
    })
    .eq("stripe_payment_intent_id", intentId);

  if (full && bookingRow) {
    // Mark every leg of the trip refunded
    if (bookingRow.trip_group_id) {
      await admin.from("bookings").update({ payment_status: "refunded" }).eq("trip_group_id", bookingRow.trip_group_id);
    } else {
      await admin.from("bookings").update({ payment_status: "refunded" }).eq("id", bookingRow.id);
    }
  }

  await admin.from("activity_logs").insert({
    actor_id: user.id,
    actor_name: profile?.full_name ?? null,
    actor_role: profile?.role ?? null,
    action: "refund",
    description: `${full ? "Refunded" : "Part-refunded"} ${requested.toFixed(2)} for ${label}`,
    metadata: { payment_intent: intentId, amount: requested, full },
  });

  return NextResponse.json({ ok: true, amount: requested, full, refunded_total: totalRefunded });
}
