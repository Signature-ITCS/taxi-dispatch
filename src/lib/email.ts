/**
 * Email sender via the Resend REST API (no SDK dependency — plain fetch).
 *
 * Gracefully no-ops when RESEND_API_KEY is not set, so the app works fine
 * before email is configured (mirrors the Stripe helper). Once the key is
 * added to .env.local, booking emails start sending automatically.
 *
 * Setup:
 *   1. Create a free account at https://resend.com and copy an API key.
 *   2. Put it in .env.local as RESEND_API_KEY=...
 *   3. (optional) Verify your domain in Resend, then set
 *      EMAIL_FROM="TaxiFlow <bookings@your-domain.uk>".
 *      Until then it sends from Resend's shared test address.
 */
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "TaxiFlow <onboarding@resend.dev>";

export const emailEnabled = () => Boolean(RESEND_KEY);

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  if (!RESEND_KEY) return false; // not configured yet — skip silently
  const to = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter(Boolean);
  if (to.length === 0) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
