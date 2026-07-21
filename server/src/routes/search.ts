import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store, type UserRecord } from "../store.js";
import { findUserById } from "../userRepo.js";
import { INTEREST_LABELS, type InterestTag } from "../types/shared.js";
import { planSummary, planVisibleToViewer, userToPublic } from "./plans.js";
import type { PersonSearchResultDTO, SearchResultsDTO } from "../types/shared.js";

export const searchRouter = Router();

const PLAN_LIMIT = 25;
const PEOPLE_LIMIT = 20;

/** Every plan id the user has any relationship to — hosted, going, or interested. */
function planIdsForUser(userId: string): Set<string> {
  const ids = new Set<string>();
  for (const p of store.listPlansByCreator(userId)) ids.add(p.id);
  for (const part of store.listParticipationsForUser(userId)) ids.add(part.planId);
  return ids;
}

// GET /api/search?q=<query> — global search: plans by title/venue/interest,
// and people by name. Respects `discoverableBySearch` and blocking both ways.
searchRouter.get("/", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const me = await findUserById(userId);
  if (!me) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const q = String(req.query.q ?? "").trim().toLowerCase();
  if (!q) {
    res.json({ plans: [], people: [] } satisfies SearchResultsDTO);
    return;
  }

  // ---- Plans: title, venue name, or interest tag label ----
  const matchingTags = (Object.entries(INTEREST_LABELS) as Array<[InterestTag, string]>)
    .filter(([, label]) => label.toLowerCase().includes(q))
    .map(([tag]) => tag);
  const planCandidates = store.listPlans().filter((p) => {
    if (p.cancelledAt) return false;
    if (!planVisibleToViewer(p, me)) return false;
    const titleMatch = p.title.toLowerCase().includes(q);
    const venueMatch = (p.location?.name ?? "").toLowerCase().includes(q);
    const tagMatch = matchingTags.length > 0 && p.tags.some((t) => matchingTags.includes(t));
    return titleMatch || venueMatch || tagMatch;
  });
  // Upcoming first, then by date.
  const today = new Date().toISOString().slice(0, 10);
  planCandidates.sort((a, b) => {
    const aUp = a.date >= today;
    const bUp = b.date >= today;
    if (aUp !== bUp) return aUp ? -1 : 1;
    return a.date.localeCompare(b.date);
  });
  const plans = await Promise.all(
    planCandidates.slice(0, PLAN_LIMIT).map((p) => planSummary(p, userId)),
  );

  // ---- People: first/last name, respecting discoverableBySearch + blocking ----
  const myHoodName = (u: UserRecord): string | null => {
    const hoodId = u.neighborhoodId ?? u.neighborhoodIds?.[0] ?? null;
    if (!hoodId) return null;
    return store.findNeighborhoodById(hoodId)?.name ?? null;
  };
  const myPlanIds = planIdsForUser(userId);
  const peopleCandidates = store.listUsers().filter((u) => {
    if (u.id === userId) return false;
    if (!u.onboardingComplete) return false;
    if (u.discoverableBySearch === false) return false;
    if (store.isBlockedEitherWay(userId, u.id)) return false;
    const fullName = `${u.firstName} ${u.lastName ?? ""}`.trim().toLowerCase();
    return fullName.includes(q) || u.firstName.toLowerCase().includes(q);
  });
  const people: PersonSearchResultDTO[] = peopleCandidates.slice(0, PEOPLE_LIMIT).map((u) => {
    const theirPlanIds = planIdsForUser(u.id);
    let shared = 0;
    for (const id of myPlanIds) if (theirPlanIds.has(id)) shared++;
    return {
      user: userToPublic(u),
      neighborhoodName: myHoodName(u),
      sharedPlansCount: shared,
    };
  });
  // Most shared history first, then alphabetical.
  people.sort((a, b) => {
    if (a.sharedPlansCount !== b.sharedPlansCount) return b.sharedPlansCount - a.sharedPlansCount;
    return a.user.firstName.localeCompare(b.user.firstName);
  });

  const result: SearchResultsDTO = { plans, people };
  res.json(result);
});
