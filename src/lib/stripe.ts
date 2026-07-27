import Stripe from "stripe";

/**
 * Server-only Stripe client. Never import into a client component.
 * Requires STRIPE_SECRET_KEY in the environment.
 * Returns null when the key is missing so callers can fail gracefully
 * (card payments disabled) instead of crashing the whole app.
 */
let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cached) cached = new Stripe(key);
  return cached;
}

/** Whether card payments are configured on this deployment. */
export const stripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);
