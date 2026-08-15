import { NextResponse } from "next/server";
import { callRpc } from "@/lib/supabaseRest";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export async function POST(req: Request) {
  if (!rateLimit(`track:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  if (!b.ref) return NextResponse.json({ ok: false, error: "missing_ref" });
  const { data } = await callRpc("get_ride_status", { p_booking_number: String(b.ref).trim() });
  return NextResponse.json(data ?? { ok: false, error: "no_response" });
}
