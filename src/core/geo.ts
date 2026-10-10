// Bounding-box helper. Arkiv has ordered indexes on `dec` attributes, so a
// "within ~N km of me" search is four range predicates on lat/lng, answered by
// the node, not by downloading every request.

export type BBox = { minLat: string; maxLat: string; minLng: string; maxLng: string }

const KM_PER_DEG_LAT = 111.32

/** 6-decimal fixed strings, because `dec()` must be given strings (no float drift). */
export function fix6(n: number): string {
  return n.toFixed(6)
}

export function bboxAround(lat: number, lng: number, radiusKm: number): BBox {
  const dLat = radiusKm / KM_PER_DEG_LAT
  const dLng = radiusKm / (KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))
  return {
    minLat: fix6(lat - dLat),
    maxLat: fix6(lat + dLat),
    minLng: fix6(lng - dLng),
    maxLng: fix6(lng + dLng),
  }
}

/** Great-circle distance in km, used only to sort the already-filtered results client-side
 *  (Arkiv returns newest-first and has no server-side ORDER BY). */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** A few Indian cities so a donor without GPS can still search by area. */
export const CITY_CENTRES: Record<string, { lat: number; lng: number; label: string }> = {
  bengaluru: { lat: 12.9716, lng: 77.5946, label: "Bengaluru" },
  mumbai: { lat: 19.076, lng: 72.8777, label: "Mumbai" },
  delhi: { lat: 28.6139, lng: 77.209, label: "Delhi" },
  chennai: { lat: 13.0827, lng: 80.2707, label: "Chennai" },
  hyderabad: { lat: 17.385, lng: 78.4867, label: "Hyderabad" },
  kolkata: { lat: 22.5726, lng: 88.3639, label: "Kolkata" },
  pune: { lat: 18.5204, lng: 73.8567, label: "Pune" },
  guwahati: { lat: 26.1445, lng: 91.7362, label: "Guwahati" },
}
