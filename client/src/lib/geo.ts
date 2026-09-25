const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export interface Coords {
  lat: number;
  lng: number;
}

/** Great-circle distance between two coordinates, in kilometers. */
export function haversineKm(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Center of Philadelphia (City Hall). Used as a fallback when the browser
// can't or won't share a location, so the page still shows something useful.
export const FALLBACK_COORDS: Coords = { lat: 39.9526, lng: -75.1652 };
