import { createHash } from "crypto";

/**
 * Canonical fingerprint of a priced trip.
 *
 * /api/payment/intent stamps this onto the PaymentIntent's metadata; /api/book
 * recomputes it from the booking request and refuses to mark a booking paid
 * unless the two match. That binds one PaymentIntent to one exact trip, so a
 * customer can't pay for a short hop and then redeem that intent against a
 * long airport run — every input that moves the price is in the hash.
 *
 * It also lets /api/book trust the amount that was quoted and charged instead
 * of re-deriving the fare from a second Google Directions call, which can drift
 * (traffic, re-routing) and used to leave a paying customer marked unpaid.
 */

export interface SignableLeg {
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  via_points?: { lat?: number | null; lng?: number | null }[] | null;
  scheduled_at?: string | null;
  /** Feeds the keyword pricing rules (airport surcharges etc.) — price-relevant. */
  route_text?: string | null;
}

export interface SignableTrip {
  site?: string | null;
  category_id?: string | null;
  child_seat?: boolean | null;
  outbound: SignableLeg;
  return?: SignableLeg | null;
}

/** ~1 m precision — enough to pin the trip, loose enough to survive float noise. */
const coord = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(5) : "-";

const text = (v: string | null | undefined): string =>
  String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function canonicalLeg(leg: SignableLeg | null | undefined): string {
  if (!leg) return "none";
  const vias = (leg.via_points ?? [])
    .map((v) => `${coord(v?.lat)},${coord(v?.lng)}`)
    .join(";");
  return [
    `${coord(leg.pickup_lat)},${coord(leg.pickup_lng)}`,
    `${coord(leg.dropoff_lat)},${coord(leg.dropoff_lng)}`,
    vias,
    leg.scheduled_at ?? "asap",
    text(leg.route_text),
  ].join("|");
}

/** Stable 32-char hex fingerprint. Same trip in, same string out. */
export function quoteSignature(trip: SignableTrip): string {
  const canonical = [
    text(trip.site) || "main",
    text(trip.category_id),
    trip.child_seat ? "cs1" : "cs0",
    canonicalLeg(trip.outbound),
    canonicalLeg(trip.return),
  ].join("::");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}
