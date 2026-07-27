/**
 * Server-side Google Directions helper.
 *
 * Used both by the /api/route endpoint (for the widget's live distance chip)
 * and by the quote/book/payment routes to RE-DERIVE trip distance from
 * coordinates server-side — so the fare can never be under-reported by a
 * client that lies about `distance_km`.
 */
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export interface Pt {
  lat: number | null | undefined;
  lng: number | null | undefined;
}

export interface LegInput {
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  via_points?: { lat: number | null; lng: number | null }[];
  distance_km?: number | null;
  duration_min?: number | null;
}

const hasCoord = (p?: Pt | null): p is { lat: number; lng: number } =>
  !!p && typeof p.lat === "number" && typeof p.lng === "number";

/** Driving distance (km) + duration (min) through optional waypoints. Null on failure. */
export async function googleRouteDistance(
  origin: Pt,
  destination: Pt,
  waypoints: Pt[] = []
): Promise<{ km: number; min: number } | null> {
  if (!KEY || !hasCoord(origin) || !hasCoord(destination)) return null;

  const vias = waypoints.filter(hasCoord);
  let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}`;
  if (vias.length) {
    url += `&waypoints=` + vias.map((w) => `${w.lat},${w.lng}`).join("|");
  }
  url += `&key=${KEY}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    type Leg = { distance?: { value: number }; duration?: { value: number } };
    const legs: Leg[] = data.routes?.[0]?.legs ?? [];
    if (!legs.length) return null;
    const meters = legs.reduce((s, l) => s + (l.distance?.value ?? 0), 0);
    const secs = legs.reduce((s, l) => s + (l.duration?.value ?? 0), 0);
    return { km: Number((meters / 1000).toFixed(2)), min: Math.round(secs / 60) };
  } catch {
    return null;
  }
}

/**
 * Trusted distance/duration for a booking leg.
 * When the leg has pickup + dropoff coordinates, distance is recomputed
 * server-side from Google and the client-supplied value is IGNORED.
 * When coordinates are missing (e.g. a staff phone booking with a typed
 * address), the caller-provided value is trusted as a fallback.
 */
export async function resolveLegDistance(
  leg: LegInput
): Promise<{ distance_km: number; duration_min: number }> {
  const origin: Pt = { lat: leg.pickup_lat, lng: leg.pickup_lng };
  const destination: Pt = { lat: leg.dropoff_lat, lng: leg.dropoff_lng };
  const waypoints: Pt[] = (leg.via_points ?? []).map((v) => ({ lat: v.lat, lng: v.lng }));

  if (hasCoord(origin) && hasCoord(destination)) {
    const r = await googleRouteDistance(origin, destination, waypoints);
    if (r) return { distance_km: r.km, duration_min: r.min };
  }
  return {
    distance_km: Number(leg.distance_km) || 0,
    duration_min: Number(leg.duration_min) || 0,
  };
}
