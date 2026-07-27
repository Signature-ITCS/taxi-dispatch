import { NextResponse } from "next/server";
import { callRpc } from "@/lib/supabaseRest";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (!b.ref) return NextResponse.json({ ok: false, error: "missing_ref" });
  const { data } = await callRpc("get_ride_status", { p_booking_number: String(b.ref).trim() });
  return NextResponse.json(data ?? { ok: false, error: "no_response" });
}
