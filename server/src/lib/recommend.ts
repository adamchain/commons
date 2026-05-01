// "Week at a glance" recommendation algorithm — implements PRD §15.
// Pure ranking; the route filters the candidate set first.

import { store, type PlanRecord, type UserRecord } from "../store.js";

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
  if (!user.neighborhoodId) return 0.5; // unknown — neutral
  if (plan.neighborhoodId === user.neighborhoodId) return 1.0;
  const scope = store.neighborhoodScope(user.neighborhoodId);
  return scope.includes(plan.neighborhoodId) ? 0.5 : 0;
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

export function rankPlansForUser(user: UserRecord, candidates: PlanRecord[]): PlanRecord[] {
  // First: drop plans that have already happened (today or future only).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fresh = candidates.filter((p) => new Date(p.date).getTime() >= today.getTime());

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
