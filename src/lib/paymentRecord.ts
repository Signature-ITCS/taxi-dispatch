import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromMinor } from "@/lib/stripe";

/**
 * Turning a succeeded Stripe PaymentIntent into a paid booking.
 *
 * Every rule that protects real money lives here, in one place, so /api/book and
 * the webhook can never drift apart:
 *
 *   1. ONE intent → ONE booking. A payment row is the receipt; a second booking
 *      trying to redeem the same intent is refused (this is the replay hole:
 *      pay once, then replay the intent id for unlimited free rides).
 *   2. The intent must carry the fingerprint of the trip being booked, so a
 *      cheap quote can't be redeemed against an expensive journey.
 *   3. Money that moved is NEVER silently dropped. If any check fails we still
 *      write the payment row, flag it for review and alert staff — the booking
 *      just doesn't get marked paid.
 */

export interface PaymentOutcome {
  /** Booking was marked paid. */
  paid: boolean;
  /** Amount Stripe actually captured, in pounds. */
  amountPaid: number;
  receiptUrl: string | null;
  /** Money moved but something didn't line up — staff must look. */
  needsReview: boolean;
  reason: string | null;
}

export interface RecordArgs {
  stripe: Stripe;
  paymentIntentId: string;
  /** Fingerprint of the trip being booked right now (see quoteSignature). */
  expectedSig: string;
  outboundBookingId: string | null;
  returnBookingId?: string | null;
  tripGroupId?: string | null;
  /** Fare the create_booking RPC just computed for the whole trip, in pounds. */
  bookingFare: number;
  bookingNumber?: string | null;
}

/**
 * Split a whole-trip total across an outbound/return pair in proportion to the
 * original per-leg fares, so the per-leg figures still sum to the total (cash
 * settlement, driver payouts and analytics all read per-leg estimated_fare).
 */
export function splitFare(total: number, outOrig: number, retOrig: number): { out: number; ret: number } {
  const sum = outOrig + retOrig;
  const out =
    sum > 0 ? Math.round(total * (outOrig / sum) * 100) / 100 : Math.round((total / 2) * 100) / 100;
  return { out, ret: Math.round((total - out) * 100) / 100 };
}

/** A re-priced trip this far off the quote is worth a human look. */
const DRIFT_ABS = 5;
const DRIFT_PCT = 0.25;

const gbp = (n: number) => `GBP ${n.toFixed(2)}`;

export async function recordCardPayment(args: RecordArgs): Promise<PaymentOutcome> {
  const { stripe, paymentIntentId, expectedSig, outboundBookingId, returnBookingId, tripGroupId } = args;
  const admin = createAdminClient();

  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
  } catch (err) {
    // Can't reach Stripe. The customer may well have been charged, so this is
    // never "no payment" — it's "unknown", and it must stay visible.
    console.error("[payments] could not retrieve PaymentIntent", paymentIntentId, err);
    return {
      paid: false,
      amountPaid: 0,
      receiptUrl: null,
      needsReview: true,
      reason: "Stripe could not be reached to verify this payment. Check the Stripe Dashboard for this intent.",
    };
  }

  const charge = pi.latest_charge as Stripe.Charge | null;
  const receiptUrl = (charge && typeof charge === "object" ? charge.receipt_url : null) ?? null;
  const amountPaid = fromMinor(pi.amount_received ?? 0);

  if (pi.status !== "succeeded" || amountPaid <= 0) {
    return {
      paid: false,
      amountPaid,
      receiptUrl,
      needsReview: amountPaid > 0,
      reason: `Stripe reports this payment as "${pi.status}", not succeeded.`,
    };
  }

  // ── 1. Replay guard ───────────────────────────────────────────────────────
  const { data: existing } = await admin
    .from("payments")
    .select("id, booking_id")
    .eq("stripe_payment_intent_id", pi.id)
    .maybeSingle();

  if (existing) {
    if (existing.booking_id && existing.booking_id === outboundBookingId) {
      // Already recorded — a retry of the same booking, not a replay.
      return { paid: true, amountPaid, receiptUrl, needsReview: false, reason: null };
    }
    if (existing.booking_id) {
      const reason = "This Stripe payment was already used for another booking. It has NOT been credited again.";
      await flagPayment(admin, existing.id, reason);
      await logActivity(admin, "payment_replay_blocked", `Blocked reuse of Stripe payment ${pi.id}`, {
        payment_intent: pi.id,
        already_on_booking: existing.booking_id,
        attempted_booking: outboundBookingId,
      });
      return { paid: false, amountPaid, receiptUrl, needsReview: true, reason };
    }
    // Orphan row written by the webhook before the booking existed — adopt it.
    await admin
      .from("payments")
      .update({ booking_id: outboundBookingId, needs_review: false, review_reason: null })
      .eq("id", existing.id);
  }

  // ── 2. The intent must have been priced for THIS trip ─────────────────────
  const sig = typeof pi.metadata?.quote_sig === "string" ? pi.metadata.quote_sig : null;

  if (sig && sig !== expectedSig) {
    const reason =
      "The card was charged for a different journey than the one booked (the trip was edited after payment). Refund it or correct the booking.";
    await upsertPayment(admin, {
      pi,
      bookingId: outboundBookingId,
      amountPaid,
      receiptUrl,
      needsReview: true,
      reason,
    });
    await logActivity(admin, "payment_mismatch", `Stripe payment ${pi.id} does not match the booked trip`, {
      payment_intent: pi.id,
      booking_id: outboundBookingId,
    });
    return { paid: false, amountPaid, receiptUrl, needsReview: true, reason };
  }

  if (!sig) {
    // Intent created before trip fingerprints shipped: fall back to the old
    // amount check so payments already in flight at deploy time still land.
    const matches = Math.abs(amountPaid - args.bookingFare) <= 0.01;
    if (!matches) {
      const reason = `Legacy payment of ${gbp(amountPaid)} does not match the booking fare of ${gbp(args.bookingFare)}.`;
      await upsertPayment(admin, {
        pi,
        bookingId: outboundBookingId,
        amountPaid,
        receiptUrl,
        needsReview: true,
        reason,
      });
      return { paid: false, amountPaid, receiptUrl, needsReview: true, reason };
    }
  }

  // ── 3. Money is in and it belongs to this trip → mark paid ────────────────
  const paidFields = { payment_status: "paid", stripe_payment_intent_id: pi.id };
  if (tripGroupId) {
    await admin.from("bookings").update(paidFields).eq("trip_group_id", tripGroupId);
  } else if (outboundBookingId) {
    await admin.from("bookings").update(paidFields).eq("id", outboundBookingId);
  }

  // ── 4. Reconcile the fare to what was actually charged ────────────────────
  // The quote was priced from one Google Directions call; the booking from a
  // second one minutes later. Traffic and re-routing move that number, and the
  // customer only ever owes what they agreed to pay — so the charged amount
  // wins and the booking is corrected to match.
  const drift = Math.abs(amountPaid - args.bookingFare);
  let reviewReason: string | null = null;

  if (drift > 0.01 && outboundBookingId) {
    const wild = drift > DRIFT_ABS && drift > args.bookingFare * DRIFT_PCT;
    if (returnBookingId) {
      const half = args.bookingFare > 0 ? args.bookingFare / 2 : 0;
      const { out, ret } = splitFare(amountPaid, half, half);
      await setLegFare(admin, outboundBookingId, out, amountPaid, "outbound share");
      await setLegFare(admin, returnBookingId, ret, amountPaid, "return share");
    } else {
      await setLegFare(admin, outboundBookingId, amountPaid, amountPaid, null);
    }
    if (wild) {
      reviewReason = `Charged ${gbp(amountPaid)} but the trip re-priced to ${gbp(args.bookingFare)}. The booking was set to the amount charged — check your pricing.`;
      await logActivity(admin, "payment_price_drift", `Fare drift on ${args.bookingNumber ?? outboundBookingId}`, {
        charged: amountPaid,
        recomputed: args.bookingFare,
      });
    }
  }

  await upsertPayment(admin, {
    pi,
    bookingId: outboundBookingId,
    amountPaid,
    receiptUrl,
    needsReview: !!reviewReason,
    reason: reviewReason,
  });

  return { paid: true, amountPaid, receiptUrl, needsReview: !!reviewReason, reason: reviewReason };
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

type Admin = ReturnType<typeof createAdminClient>;

async function setLegFare(admin: Admin, bookingId: string, fare: number, tripTotal: number, share: string | null) {
  await admin
    .from("bookings")
    .update({
      estimated_fare: fare,
      fare_breakdown: {
        total: fare,
        charged: true,
        trip_total: tripTotal,
        note: `Set to the amount actually charged to the card${share ? ` (${share})` : ""}`,
      },
    })
    .eq("id", bookingId);
}

/**
 * Write (or update) the payment row. The unique index on
 * stripe_payment_intent_id is the last line of defence against two concurrent
 * bookings redeeming the same intent — a 23505 here means we lost that race.
 */
async function upsertPayment(
  admin: Admin,
  opts: {
    pi: Stripe.PaymentIntent;
    bookingId: string | null;
    amountPaid: number;
    receiptUrl: string | null;
    needsReview: boolean;
    reason: string | null;
  }
): Promise<void> {
  const row = {
    booking_id: opts.bookingId,
    amount: opts.amountPaid,
    method: "card",
    status: "paid",
    currency: opts.pi.currency ?? "gbp",
    stripe_payment_intent_id: opts.pi.id,
    receipt_url: opts.receiptUrl,
    needs_review: opts.needsReview,
    review_reason: opts.reason,
  };

  const { error } = await admin.from("payments").insert(row);
  if (!error) return;

  if (error.code === "23505") {
    // Row already exists (the webhook beat us, or a concurrent retry). Update it
    // rather than creating a second receipt for the same money.
    await admin
      .from("payments")
      .update({
        ...(opts.bookingId ? { booking_id: opts.bookingId } : {}),
        amount: opts.amountPaid,
        status: "paid",
        receipt_url: opts.receiptUrl,
        needs_review: opts.needsReview,
        review_reason: opts.reason,
      })
      .eq("stripe_payment_intent_id", opts.pi.id);
    return;
  }
  console.error("[payments] could not write payment row", error);
}

async function flagPayment(admin: Admin, paymentId: string, reason: string) {
  await admin
    .from("payments")
    .update({ needs_review: true, review_reason: reason, alerted_at: null })
    .eq("id", paymentId);
}

async function logActivity(admin: Admin, action: string, description: string, metadata?: Record<string, unknown>) {
  try {
    await admin.from("activity_logs").insert({ action, description, metadata: metadata ?? null });
  } catch {
    /* logging must never break a payment path */
  }
}
