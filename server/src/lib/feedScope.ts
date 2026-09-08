import { store, type PlanRecord, type UserRecord } from "../store.js";
import type { PlanVisibility } from "../types/shared.js";

export function userHoods(me: UserRecord): string[] {
  const raw = me.neighborhoodIds?.length
    ? me.neighborhoodIds
    : me.neighborhoodId
      ? [me.neighborhoodId]
      : [];
  return [
    ...new Set(
      raw
        .map((id) => store.resolveNeighborhoodId(id))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

export function combinedNeighborhoodScope(me: UserRecord): string[] | null {
  const hoods = userHoods(me);
  if (hoods.length === 0) return null;
  const set = new Set<string>();
  for (const id of hoods) {
    store.neighborhoodScope(id).forEach((x) => set.add(x));
  }
  return set.size > 0 ? [...set] : null;
}

export function planVisibleToViewer(plan: PlanRecord, me: UserRecord): boolean {
  if (plan.creatorId !== me.id && store.isBlockedEitherWay(me.id, plan.creatorId)) {
    return false;
  }
  if (plan.creatorId !== me.id && store.isUserEjected(plan.creatorId)) {
    return false;
  }
  if (plan.creatorId !== me.id && store.viewerReportedPlan(me.id, plan.id)) {
    return false;
  }
  if (plan.communityId && plan.communityVisibility === "community_only") {
    if (plan.creatorId === me.id) return true;
    const membership = store.findCommunityMembership(plan.communityId, me.id);
    if (membership?.status !== "active") return false;
  }
  const v: PlanVisibility = plan.visibility ?? "everyone";
  if (v === "network") {
    if (plan.creatorId === me.id) return true;
    const creator = store.findUserById(plan.creatorId);
    if (creator?.networkIds?.includes(me.id)) return true;
    const myPart = store.findParticipation(plan.id, me.id);
    if (myPart?.state === "going" || myPart?.state === "interested") return true;
    return false;
  }
  if (v === "community") {
    const tag = plan.visibilityCommunityTag;
    if (!tag) return true;
    return me.interests.includes(tag);
  }
  return true;
}

/** Same candidate merge as GET /api/plans, then upcoming + not cancelled. */
export function upcomingFeedForUser(me: UserRecord): PlanRecord[] {
  const scope = combinedNeighborhoodScope(me);
  const inHood = scope ? store.listPlansByNeighborhoods(scope) : store.listPlans();
  const ownPlans = store.listPlansByCreator(me.id);
  const rsvpPlanIds = new Set(store.listParticipationsForUser(me.id).map((p) => p.planId));
  const rsvpPlans = store.listPlans().filter((p) => rsvpPlanIds.has(p.id));
  const merged = new Map<string, PlanRecord>();
  for (const p of [...inHood, ...ownPlans, ...rsvpPlans]) merged.set(p.id, p);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  return [...merged.values()].filter((p) => {
    if (p.cancelledAt) return false;
    if (new Date(p.date).getTime() < todayMs) return false;
    return planVisibleToViewer(p, me);
  });
}
