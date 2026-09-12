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

/**
 * Driving distance (MILES) + duration (min) through optional waypoints. Null on failure.
 * NOTE: the app works in miles (UK). The `km`/`distance_km` field names are kept
 * for compatibility but hold MILES.
 */
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
    return { km: Number((meters / 1609.344).toFixed(2)), min: Math.round(secs / 60) };
  } catch {
    return null;
  }
}

/**
 * Trusted distance/duration for a booking leg.
 *
 * Distance is ALWAYS re-derived from coordinates via Google. The client's own
 * `distance_km` is only ever honoured when `trustClient` is set, which is
 * reserved for a signed-in staff member typing a phone booking by hand.
 *
 * For anything public this returns null rather than falling back, and the
 * caller refuses the request. That is deliberate: a request that simply omits
 * its coordinates used to be priced off `distance_km: 0`, turning a £257
 * airport run into £15. Refusing to price is the only safe failure here.
 */
export async function resolveLegDistance(
  leg: LegInput,
  opts: { trustClient?: boolean } = {}
): Promise<{ distance_km: number; duration_min: number } | null> {
  const origin: Pt = { lat: leg.pickup_lat, lng: leg.pickup_lng };
  const destination: Pt = { lat: leg.dropoff_lat, lng: leg.dropoff_lng };
  const waypoints: Pt[] = (leg.via_points ?? []).map((v) => ({ lat: v.lat, lng: v.lng }));

  if (hasCoord(origin) && hasCoord(destination)) {
    const r = await googleRouteDistance(origin, destination, waypoints);
    if (r) return { distance_km: r.km, duration_min: r.min };
  }

  // No coordinates, or Google could not route them.
  if (!opts.trustClient) return null;

  return {
    distance_km: Number(leg.distance_km) || 0,
    duration_min: Number(leg.duration_min) || 0,
  };
}
