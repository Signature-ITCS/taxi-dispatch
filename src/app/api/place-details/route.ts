import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;

/** Resolve a place_id to a formatted address + coordinates. */
export async function POST(req: Request) {
  if (!rateLimit(`place-details:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const { place_id } = await req.json().catch(() => ({ place_id: "" }));
  if (!place_id) return NextResponse.json({ ok: false });

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place_id)}&fields=formatted_address,geometry&key=${KEY}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    const r = data.result;
    if (!r) return NextResponse.json({ ok: false });
    return NextResponse.json({
      ok: true,
      address: r.formatted_address ?? null,
      lat: r.geometry?.location?.lat ?? null,
      lng: r.geometry?.location?.lng ?? null,
    });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
