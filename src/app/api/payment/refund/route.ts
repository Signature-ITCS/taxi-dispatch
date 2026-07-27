import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Staff-only (admin or dispatcher): refund a card booking's Stripe payment. */
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ ok: false, error: "payments_not_configured" });

  // Must be signed-in staff (admin or dispatcher)
  const supa = await createClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" });
  const { data: profile } = await supa.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "dispatcher") {
    return NextResponse.json({ ok: false, error: "forbidden" });
  }

  const { booking_id } = await req.json().catch(() => ({}));
  if (!booking_id) return NextResponse.json({ ok: false, error: "missing_booking" });

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, trip_group_id, stripe_payment_intent_id, payment_status")
    .eq("id", booking_id)
    .single();

  if (!booking?.stripe_payment_intent_id) return NextResponse.json({ ok: false, error: "no_payment" });
  if (booking.payment_status === "refunded") return NextResponse.json({ ok: false, error: "already_refunded" });

  try {
    await stripe.refunds.create({ payment_intent: booking.stripe_payment_intent_id });
  } catch {
    return NextResponse.json({ ok: false, error: "refund_failed" });
  }

  // Mark every leg of the trip refunded + update the payment record
  if (booking.trip_group_id) {
    await admin.from("bookings").update({ payment_status: "refunded" }).eq("trip_group_id", booking.trip_group_id);
  } else {
    await admin.from("bookings").update({ payment_status: "refunded" }).eq("id", booking.id);
  }
  await admin
    .from("payments")
    .update({ status: "refunded", refunded_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", booking.stripe_payment_intent_id);

  return NextResponse.json({ ok: true });
}
