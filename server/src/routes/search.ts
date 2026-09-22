import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { isOnboardingFinished } from "../lib/onboarding.js";
import { store, type UserRecord } from "../store.js";
import { findUserById, findUsersByIds } from "../userRepo.js";
import { INTEREST_LABELS, COMMUNITY_CATEGORY_LABELS, type InterestTag, type CommunityCategory } from "../types/shared.js";
import { planSummary, planVisibleToViewer, userToPublic } from "./plans.js";
import { communityCategoriesOf } from "../types/shared.js";
import type { PersonSearchResultDTO, SearchResultsDTO, CommunityCardDTO, PublicUser } from "../types/shared.js";

export const searchRouter = Router();

const PLAN_LIMIT = 25;
const PEOPLE_LIMIT = 20;
const COMMUNITY_LIMIT = 15;

/** Every plan id the user has any relationship to — hosted, going, or interested. */
function planIdsForUser(userId: string): Set<string> {
  const ids = new Set<string>();
  for (const p of store.listPlansByCreator(userId)) ids.add(p.id);
  for (const part of store.listParticipationsForUser(userId)) ids.add(part.planId);
  return ids;
}

function publicFor(uid: string, users: Map<string, Awaited<ReturnType<typeof findUserById>>>): PublicUser {
  const u = users.get(uid);
  return u
    ? userToPublic(u)
    : { id: uid, firstName: "Former member", neighborhoodId: null, avatarSeed: uid, avatarStyle: "avataaars" };
}

function toCommunityCard(
  community: ReturnType<typeof store.findCommunityById>,
  viewerId: string,
  users: Awaited<ReturnType<typeof findUsersByIds>>,
): CommunityCardDTO | null {
  if (!community) return null;
  const membership = store.findCommunityMembership(community.id, viewerId);
  const active = store.listActiveCommunityMembers(community.id);
  const ordered = [
    ...active.filter((m) => m.userId === community.organizerId),
    ...active.filter((m) => m.userId !== community.organizerId),
  ];
  const organizer = users.get(community.organizerId);
  return {
    id: community.id,
    name: community.name,
    coverImage: community.coverImage ?? null,
    category: communityCategoriesOf(community)[0]!,
    categories: communityCategoriesOf(community),
    memberCount: community.memberCount,
    isFounding: community.isFounding,
    organizer: organizer
      ? userToPublic(organizer)
      : { id: community.organizerId, firstName: "Organizer", neighborhoodId: null, avatarSeed: community.organizerId, avatarStyle: "avataaars" },
    myRole: membership?.status === "active" ? membership.role : null,
    myMembershipStatus: membership?.status ?? null,
    hasScreening: !!community.screeningQuestion,
    visibility: community.visibility ?? "everyone",
    memberPreview: ordered.slice(0, 3).map((m) => publicFor(m.userId, users)),
  };
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
  if (!isOnboardingFinished(me)) {
    res.status(403).json({ error: "Finish setting up your profile to continue" });
    return;
  }
  const q = String(req.query.q ?? "").trim().toLowerCase();
  if (!q) {
    res.json({ plans: [], people: [], communities: [] } satisfies SearchResultsDTO);
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
    if (store.isUserEjected(u.id)) return false;
    const fullName = `${u.firstName} ${u.lastName ?? ""}`.trim().toLowerCase();
    return fullName.includes(q) || u.firstName.toLowerCase().includes(q);
  });
  const viewerNetwork = new Set(me.networkIds ?? []);
  const people: PersonSearchResultDTO[] = peopleCandidates.slice(0, PEOPLE_LIMIT).map((u) => {
    const theirPlanIds = planIdsForUser(u.id);
    let shared = 0;
    for (const id of myPlanIds) if (theirPlanIds.has(id)) shared++;
    const inNetwork = viewerNetwork.has(u.id);
    const requestSent = (u.incomingNetworkRequests ?? []).includes(userId);
    return {
      user: userToPublic(u),
      neighborhoodName: myHoodName(u),
      sharedPlansCount: shared,
      networkStatus: inNetwork ? "connected" : requestSent ? "pending" : "none",
      mutualCount: (u.networkIds ?? []).filter((id) => viewerNetwork.has(id)).length,
    };
  });
  // Most shared history first, then alphabetical.
  people.sort((a, b) => {
    if (a.sharedPlansCount !== b.sharedPlansCount) return b.sharedPlansCount - a.sharedPlansCount;
    return a.user.firstName.localeCompare(b.user.firstName);
  });

  // ---- Communities: name or category ----
  const matchingCategories = (Object.entries(COMMUNITY_CATEGORY_LABELS) as Array<[CommunityCategory, string]>)
    .filter(([, label]) => label.toLowerCase().includes(q))
    .map(([cat]) => cat);
  const communityCandidates = store.listApprovedCommunities().filter((c) => {
    if (store.isBlockedEitherWay(userId, c.organizerId)) return false;
    const nameMatch = c.name.toLowerCase().includes(q);
    const catMatch = matchingCategories.length > 0 && communityCategoriesOf(c).some((cat) => matchingCategories.includes(cat));
    return nameMatch || catMatch;
  });
  // Sort by member count (most popular first), then alphabetical.
  communityCandidates.sort((a, b) => {
    if (a.memberCount !== b.memberCount) return b.memberCount - a.memberCount;
    return a.name.localeCompare(b.name);
  });
  const communityUserIds = new Set<string>();
  for (const c of communityCandidates.slice(0, COMMUNITY_LIMIT)) {
    communityUserIds.add(c.organizerId);
    for (const m of store.listActiveCommunityMembers(c.id).slice(0, 3)) {
      communityUserIds.add(m.userId);
    }
  }
  const communityUsers = await findUsersByIds([...communityUserIds]);
  const communities = communityCandidates
    .slice(0, COMMUNITY_LIMIT)
    .map((c) => toCommunityCard(c, userId, communityUsers))
    .filter((c): c is CommunityCardDTO => c !== null);

  const result: SearchResultsDTO = { plans, people, communities };
  res.json(result);
});
