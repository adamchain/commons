// "Week at a glance" recommendation algorithm — implements PRD §15.
// Pure ranking; the route filters the candidate set first.

import { store, type PlanRecord, type UserRecord } from "../store.js";
import { NEARBY_MILES, distanceMiles } from "./geo.js";
import { calendarDayInPlanZone } from "./planTime.js";

interface ScoredPlan {
  plan: PlanRecord;
  score: number;
}

const WEIGHTS = {
  interest: 3.0,
  proximity: 1.5,
  social: 1.2,
  hostQuality: 1.0,
  recency: 0.8,
  decline: 2.0,
  saturation: 1.0,
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

function jaccard<T>(a: T[], b: T[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection++;
  const union = new Set<T>([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function proximityScore(user: UserRecord, plan: PlanRecord): number {
  const miles = distanceMiles(user, plan);
  if (miles != null) {
    if (miles <= NEARBY_MILES) return 1;
    if (miles >= 50) return 0;
    return 1 - (miles - NEARBY_MILES) / (50 - NEARBY_MILES);
  }
  const hoods =
    user.neighborhoodIds && user.neighborhoodIds.length > 0
      ? user.neighborhoodIds
      : user.neighborhoodId
        ? [user.neighborhoodId]
        : [];
  if (hoods.length === 0) return 0.5;
  let best = 0;
  for (const h of hoods) {
    if (plan.neighborhoodId === h) {
      best = Math.max(best, 1);
      continue;
    }
    const scope = store.neighborhoodScope(h);
    if (scope.includes(plan.neighborhoodId)) best = Math.max(best, 0.5);
  }
  return best;
}

function socialProofScore(plan: PlanRecord): number {
  const going = store
    .listParticipationsForPlan(plan.id)
    .filter((p) => p.state === "going").length;
  // log-scaled, capped at 1.0 around ~10
  return Math.min(1, Math.log10(going + 1) / Math.log10(11));
}

function hostQualityScore(plan: PlanRecord): number {
  const feedback = store.listFeedbackForHost(plan.creatorId);
  const recent = feedback.filter(
    (f) => Date.now() - new Date(f.createdAt).getTime() < 30 * 24 * 60 * 60 * 1000
  );
  if (recent.length === 0) return 0.5; // no signal — neutral
  const ups = recent.filter((f) => f.thumb === "up").length;
  return ups / recent.length;
}

function recencyScore(plan: PlanRecord): number {
  const ageMs = Date.now() - new Date(plan.createdAt).getTime();
  if (ageMs <= 0) return 1;
  if (ageMs >= TWO_DAYS_MS) return 0;
  return 1 - ageMs / TWO_DAYS_MS;
}

function declinePenalty(user: UserRecord, plan: PlanRecord): number {
  const sinceIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  const declines = store.recentDeclinesForUser(user.id, sinceIso);
  if (declines.length === 0) return 0;
  let max = 0;
  for (const d of declines) {
    const declined = store.findPlanById(d.planId);
    if (!declined) continue;
    const sameHost = declined.creatorId === plan.creatorId;
    const tagOverlap = jaccard(declined.tags, plan.tags);
    if (sameHost || tagOverlap >= 0.5) {
      const ageMs = Date.now() - new Date(d.createdAt).getTime();
      const decay = Math.max(0, 1 - ageMs / SEVEN_DAYS_MS);
      max = Math.max(max, 0.3 * decay);
    }
  }
  return max;
}

function shiftCalendarDay(day: string, deltaDays: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays, 12)).toISOString().slice(0, 10);
}

export function rankPlansForUser(user: UserRecord, candidates: PlanRecord[]): PlanRecord[] {
  // Keep today, upcoming, and the last four months. `new Date("YYYY-MM-DD")`
  // is UTC midnight, which in US timezones is still "yesterday" and was
  // dropping every plan dated today before the feed ever saw it.
  const today = calendarDayInPlanZone();
  const cutoff = shiftCalendarDay(today, -120);
  // Discovery drops plans older than four months. Plans this person hosts or
  // joined stay, so Past on the feed, profile, and My Plans can still list them.
  const mine = new Set(
    store
      .listParticipationsForUser(user.id)
      .filter((part) => part.state === "going" || part.state === "interested")
      .map((part) => part.planId),
  );
  const fresh = candidates.filter((p) => {
    if (p.creatorId === user.id || mine.has(p.id) || p.isFlexibleDate) return true;
    const day = String(p.date).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= cutoff;
  });

  // Score everything
  const scored: ScoredPlan[] = fresh.map((plan) => {
    const interest = jaccard(user.interests, plan.tags);
    const proximity = proximityScore(user, plan);
    const social = socialProofScore(plan);
    const hostQ = hostQualityScore(plan);
    const recency = recencyScore(plan);
    const decline = declinePenalty(user, plan);
    const score =
      interest * WEIGHTS.interest +
      proximity * WEIGHTS.proximity +
      social * WEIGHTS.social +
      hostQ * WEIGHTS.hostQuality +
      recency * WEIGHTS.recency -
      decline * WEIGHTS.decline;
    return { plan, score };
  });

  // Saturation pass: if the same host has multiple plans in the top 3, demote duplicates.
  scored.sort((a, b) => b.score - a.score);
  const seenHostsInTop = new Map<string, number>();
  const adjusted: ScoredPlan[] = [];
  for (let i = 0; i < scored.length; i++) {
    const { plan, score } = scored[i];
    const seenCount = seenHostsInTop.get(plan.creatorId) ?? 0;
    let finalScore = score;
    if (i < 3 && seenCount > 0) finalScore -= WEIGHTS.saturation * 0.5;
    seenHostsInTop.set(plan.creatorId, seenCount + 1);
    adjusted.push({ plan, score: finalScore });
  }
  adjusted.sort((a, b) => b.score - a.score);
  return adjusted.map((s) => s.plan);
}
