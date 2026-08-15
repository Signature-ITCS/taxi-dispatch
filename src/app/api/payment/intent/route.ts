import { NextResponse } from "next/server";
import { callRpc } from "@/lib/supabaseRest";
import { getWebsiteKey } from "@/lib/getWebsiteKey";
import { getStripe } from "@/lib/stripe";
import { resolveLegDistance, type LegInput } from "@/lib/googleRoute";
import { rateLimit, clientIp } from "@/lib/rateLimit";

interface Leg extends LegInput {
  route_text?: string;
  scheduled_at?: string | null;
}
interface QuoteRow {
  category_id: string;
  fare: { total: number };
}
interface QuoteResp {
  ok: boolean;
  quotes: QuoteRow[];
  child_seat_price?: number;
}

async function legTotal(key: string, leg: Leg, categoryId: string): Promise<{ total: number; childSeat: number } | null> {
  // Charge the server-recomputed distance, never the client's claimed value.
  const { distance_km, duration_min } = await resolveLegDistance(leg);
  const { data } = await callRpc<QuoteResp>("quote_fares", {
    p_api_key: key,
    p_distance_km: distance_km,
    p_duration_min: duration_min,
    p_route_text: leg.route_text ?? "",
    ...(leg.scheduled_at ? { p_at: leg.scheduled_at } : {}),
  });
  if (!data?.ok) return null;
  const q = data.quotes.find((r) => r.category_id === categoryId);
  if (!q) return null;
  return { total: q.fare.total, childSeat: Number(data.child_seat_price) || 0 };
}

/** Creates a Stripe PaymentIntent for the full server-computed fare of a card booking. */
export async function POST(req: Request) {
  // Throttle: each call hits Google Directions and creates a live Stripe intent.
  if (!rateLimit(`intent:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const stripe = await getStripe();
  if (!stripe) return NextResponse.json({ ok: false, error: "payments_not_configured" });

  const b = await req.json().catch(() => ({}));
  if (!b.category_id || !b.outbound) {
    return NextResponse.json({ ok: false, error: "missing_fields" });
  }

  const key = await getWebsiteKey(b.site ?? "main");
  if (!key) return NextResponse.json({ ok: false, error: "invalid_website" });

  const out = await legTotal(key, b.outbound as Leg, b.category_id);
  if (!out) return NextResponse.json({ ok: false, error: "quote_failed" });

  let total = out.total;
  if (b.return) {
    const ret = await legTotal(key, b.return as Leg, b.category_id);
    if (!ret) return NextResponse.json({ ok: false, error: "quote_failed" });
    total += ret.total;
  }
  if (b.child_seat) total += out.childSeat;

  const amount = Math.round(total * 100); // pence
  if (amount < 30) return NextResponse.json({ ok: false, error: "amount_too_low" });

  try {
    const intent = await stripe.paymentIntents.create({
      amount,
      currency: "gbp",
      description: `Taxi booking${b.return ? " (return)" : ""}`,
      ...(b.email ? { receipt_email: String(b.email).trim() } : {}),
      automatic_payment_methods: { enabled: true },
      metadata: { site: String(b.site ?? "main"), category_id: String(b.category_id) },
    });
    return NextResponse.json({
      ok: true,
      client_secret: intent.client_secret,
      payment_intent_id: intent.id,
      amount: total,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "stripe_error" });
  }
}
