import { planHasEnded } from "./planTime.js";
import { store, type CommunityRecord, type NeighborhoodRecord, type UserRecord } from "../store.js";
import type { CommunityProximity } from "../types/shared.js";

const ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** One upcoming event outweighs a few quiet chat lines, without burying a busy bulletin. */
const UPCOMING_EVENT_WEIGHT = 4;

export interface CommunityFeedSignal {
  activityScore: number;
  proximity: CommunityProximity | null;
  distanceKm: number | null;
}

/**
 * Signals for the communities feed hero. Activity is recent posts, chat, RSVPs,
 * and upcoming events. Place comes from the community's city or name, then
 * where its events happen, then the organizer's neighborhood.
 */
export function communityFeedSignals(
  communities: CommunityRecord[],
  viewer: UserRecord | undefined,
  now = new Date(),
): Map<string, CommunityFeedSignal> {
  const hoods = store.listNeighborhoods();
  const viewerHoods = resolveViewerHoods(viewer);
  const here = new Set(viewerHoods);
  const nearby = new Set<string>();
  for (const id of viewerHoods) {
    for (const adj of store.neighborhoodScope(id)) {
      const resolved = store.resolveNeighborhoodId(adj) ?? adj;
      if (!here.has(resolved)) nearby.add(resolved);
    }
  }
  const plans = store.listPlans();
  const cutoff = now.getTime() - ACTIVITY_WINDOW_MS;
  const out = new Map<string, CommunityFeedSignal>();

  for (const community of communities) {
    let activityScore = 0;
    for (const event of store.listCommunityInteractions(community.id)) {
      const at = Date.parse(event.at);
      if (Number.isFinite(at) && at >= cutoff) activityScore += 1;
    }
    for (const plan of plans) {
      if (plan.communityId !== community.id || plan.cancelledAt) continue;
      if (!planHasEnded(plan, now)) activityScore += UPCOMING_EVENT_WEIGHT;
    }

    const placeId = communityPlaceId(community, hoods, plans, now);
    let proximity: CommunityProximity | null = null;
    if (placeId && here.size > 0) {
      if (here.has(placeId)) proximity = "here";
      else if (nearby.has(placeId)) proximity = "nearby";
      else proximity = "far";
    }

    out.set(community.id, {
      activityScore,
      proximity,
      distanceKm: distanceKm(viewerHoods, placeId, hoods),
    });
  }
  return out;
}

function resolveViewerHoods(viewer: UserRecord | undefined): string[] {
  if (!viewer) return [];
  const raw =
    viewer.neighborhoodIds && viewer.neighborhoodIds.length > 0
      ? viewer.neighborhoodIds
      : viewer.neighborhoodId
        ? [viewer.neighborhoodId]
        : [];
  const ids: string[] = [];
  for (const id of raw) {
    const resolved = store.resolveNeighborhoodId(id);
    if (resolved && !ids.includes(resolved)) ids.push(resolved);
  }
  return ids;
}

function communityPlaceId(
  community: CommunityRecord,
  hoods: NeighborhoodRecord[],
  plans: ReturnType<typeof store.listPlans>,
  now: Date,
): string | null {
  const fromCity = matchNeighborhood(community.city ?? "", hoods);
  if (fromCity) return fromCity;
  const fromName = matchNeighborhood(community.name, hoods);
  if (fromName) return fromName;

  const weights = new Map<string, number>();
  for (const plan of plans) {
    if (plan.communityId !== community.id || plan.cancelledAt || !plan.neighborhoodId) continue;
    const id = store.resolveNeighborhoodId(plan.neighborhoodId);
    if (!id) continue;
    const weight = planHasEnded(plan, now) ? 1 : 3;
    weights.set(id, (weights.get(id) ?? 0) + weight);
  }
  let fromEvents: string | null = null;
  let bestWeight = 0;
  for (const [id, weight] of weights) {
    if (weight > bestWeight) {
      fromEvents = id;
      bestWeight = weight;
    }
  }
  if (fromEvents) return fromEvents;

  const organizer = store.findUserById(community.organizerId);
  const organizerHood = organizer?.neighborhoodIds?.[0] ?? organizer?.neighborhoodId ?? null;
  return organizerHood ? (store.resolveNeighborhoodId(organizerHood) ?? null) : null;
}

function matchNeighborhood(text: string, hoods: NeighborhoodRecord[]): string | null {
  const hay = text.trim();
  if (!hay) return null;
  let best: NeighborhoodRecord | null = null;
  for (const hood of hoods) {
    const name = hood.name.trim();
    if (name.length < 4 || !includesName(hay, name)) continue;
    if (!best || name.length > best.name.length) best = hood;
  }
  return best?.id ?? null;
}

function includesName(hay: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(hay);
}

function distanceKm(viewerHoodIds: string[], placeId: string | null, hoods: NeighborhoodRecord[]): number | null {
  if (!placeId || viewerHoodIds.length === 0) return null;
  const place = hoods.find((h) => h.id === placeId);
  if (!place || typeof place.lat !== "number" || typeof place.lng !== "number") return null;
  let best: number | null = null;
  for (const id of viewerHoodIds) {
    const hood = hoods.find((h) => h.id === id);
    if (!hood || typeof hood.lat !== "number" || typeof hood.lng !== "number") continue;
    const km = haversineKm(hood.lat, hood.lng, place.lat, place.lng);
    if (best == null || km < best) best = km;
  }
  return best == null ? null : Math.round(best * 10) / 10;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a1 = (lat1 * Math.PI) / 180;
  const a2 = (lat2 * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
