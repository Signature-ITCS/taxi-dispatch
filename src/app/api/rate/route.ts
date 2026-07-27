import { NextResponse } from "next/server";
import { callRpc } from "@/lib/supabaseRest";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (!b.ref || !b.rating) return NextResponse.json({ ok: false, error: "missing_fields" });
  const { data } = await callRpc("submit_rating", {
    p_booking_number: String(b.ref).trim(),
    p_rating: Number(b.rating),
    p_comment: b.comment ?? null,
  });
  return NextResponse.json(data ?? { ok: false, error: "no_response" });
}
