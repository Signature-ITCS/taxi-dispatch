import Stripe from "stripe";

/**
 * Server-only Stripe client. The secret key comes from STRIPE_SECRET_KEY in the
 * environment (kept in .env / Vercel — never in the DB or admin UI).
 * Returns null when no key is configured (card payments disabled).
 * Never import into a client component.
 */
let cached: Stripe | null = null;

export async function getStripe(): Promise<Stripe | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cached) cached = new Stripe(key);
  return cached;
}
