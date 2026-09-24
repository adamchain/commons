import { store, type PlanRecord, type UserRecord } from "../store.js";

/** Plans inside this radius are shown ahead of everything farther away. */
export const NEARBY_MILES = 15;

export interface LatLng {
  lat: number;
  lng: number;
}

export function userOrigin(user: UserRecord): LatLng | null {
  if (typeof user.locationLat !== "number" || typeof user.locationLng !== "number") return null;
  return { lat: user.locationLat, lng: user.locationLng };
}

/** Venue coordinates when the host picked a place; otherwise the plan's neighborhood center. */
export function planPoint(plan: PlanRecord): LatLng | null {
  const lat = plan.location?.lat;
  const lng = plan.location?.lng;
  if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
  const hood = store.findNeighborhoodById(plan.neighborhoodId);
  if (!hood || typeof hood.lat !== "number" || typeof hood.lng !== "number") return null;
  return { lat: hood.lat, lng: hood.lng };
}

export function milesBetween(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const a1 = (a.lat * Math.PI) / 180;
  const a2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Miles from the viewer's shared location to the plan, or null when either side has no point. */
export function distanceMiles(user: UserRecord, plan: PlanRecord): number | null {
  const origin = userOrigin(user);
  const point = planPoint(plan);
  if (!origin || !point) return null;
  return Math.round(milesBetween(origin, point) * 10) / 10;
}
