import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store } from "../store.js";
import { findUserById } from "../userRepo.js";
import { planSummary, userToPublic } from "./plans.js";

export const profileRouter = Router();

// GET /api/profile/:userId — public-facing host profile
profileRouter.get("/:userId", requireAuth, async (req, res) => {
  const targetId = String(req.params.userId);
  const viewerId = String(req.userId);
  const target = await findUserById(targetId);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  // Blocking hides the profile both ways — don't reveal which side blocked.
  if (targetId !== viewerId && store.isBlockedEitherWay(viewerId, targetId)) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const neighborhood = target.neighborhoodId
    ? store.findNeighborhoodById(target.neighborhoodId)
    : null;
  // Plans authored (all-time, for stats + past accordion).
  const allPlans = store.listPlansByCreator(targetId);
  // Compare YYYY-MM-DD strings — never `new Date("YYYY-MM-DD")` (UTC midnight
  // shifts the calendar day in US timezones and drops "today" from upcoming).
  const todayIso = new Date().toISOString().slice(0, 10);
  const past = allPlans.filter((p) => p.date < todayIso);

  // Upcoming = hosting + I'm In or Interested (two-state participation).
  const upcomingHosted = allPlans.filter((p) => !p.cancelledAt && p.date >= todayIso);
  const upcomingJoined = store
    .listParticipationsForUser(targetId)
    .filter((p) => p.state === "going" || p.state === "interested")
    .map((p) => store.findPlanById(p.planId))
    .filter((p): p is NonNullable<typeof p> => {
      if (!p || p.cancelledAt) return false;
      if (p.creatorId === targetId) return false;
      return p.date >= todayIso;
    });
  const upcomingById = new Map<string, (typeof upcomingHosted)[number]>();
  for (const p of [...upcomingHosted, ...upcomingJoined]) upcomingById.set(p.id, p);
  const upcoming = [...upcomingById.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );

  // "Message in current plan" CTA appears only when viewer + target share a current plan as participants.
  const sharedPlanId = findSharedActivePlan(targetId, viewerId);

  // Plans joined as a non-creator (rough "joined" count for the stat strip).
  const joinedCount = store
    .listParticipationsForUser(targetId)
    .filter((p) => p.state === "going")
    .filter((p) => {
      const plan = store.findPlanById(p.planId);
      return plan && plan.creatorId !== targetId;
    }).length;

  // Social links visibility: only show when the viewer has earned the connection.
  // Earn = (a) self, (b) in target's network, (c) shared a completed plan
  // with target (both went).
  const isSelf = viewerId === targetId;
  const viewer = await findUserById(viewerId);
  const viewerNetwork = new Set(viewer?.networkIds ?? []);
  const targetNetwork = new Set(target.networkIds ?? []);
  const inMyNetwork = viewerNetwork.has(targetId);
  // Pending-request state for the connect button: did I request them, or did
  // they request me (so I can Accept)?
  const requestSent = (target.incomingNetworkRequests ?? []).includes(viewerId);
  const requestReceived = (viewer?.incomingNetworkRequests ?? []).includes(targetId);
  // Mutual = users that are in BOTH the viewer's and the target's network.
  const mutualIds = [...viewerNetwork].filter((id) => targetNetwork.has(id));
  const mutuals = mutualIds
    .map((id) => store.findUserById(id))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .slice(0, 3)
    .map((u) => userToPublic(u));

  // Network-only privacy: most of the profile is visible only after the viewer
  // has added the target. Face + interests + first-name stay public.
  const inEitherNetwork = inMyNetwork || targetNetwork.has(viewerId);
  const sharedCompleted = hasSharedCompletedPlan(targetId, viewerId);
  const showFullProfile = isSelf || inEitherNetwork || sharedCompleted;
  const socialLinks = target.socialLinks ?? null;

  res.json({
    user: userToPublic(target),
    interests: target.interests ?? [],
    neighborhood: neighborhood ? { id: neighborhood.id, name: neighborhood.name, metro: neighborhood.metro } : null,
    stats: {
      hosted: allPlans.length,
      joined: joinedCount,
    },
    upcoming: showFullProfile
      ? await Promise.all(upcoming.map((p) => planSummary(p, viewerId)))
      : [],
    past: showFullProfile
      ? past
          .slice(-5)
          .reverse()
          .map((p) => ({
            id: p.id,
            title: p.title,
            date: p.date,
            wentCount: store.listParticipationsForPlan(p.id).filter((q) => q.state === "going").length,
          }))
      : [],
    sharedPlanId,
    socialLinks,
    plansGated: !showFullProfile && !isSelf,
    network: {
      inMyNetwork,
      requestSent,
      requestReceived,
      mutualCount: mutualIds.length,
      mutuals,
    },
  });
});

function hasSharedCompletedPlan(a: string, b: string): boolean {
  const now = Date.now();
  for (const p of store.listPlans()) {
    if (new Date(p.date).getTime() >= now) continue;
    const aWent = store.findParticipation(p.id, a)?.state === "going" || p.creatorId === a;
    const bWent = store.findParticipation(p.id, b)?.state === "going" || p.creatorId === b;
    if (aWent && bWent) return true;
  }
  return false;
}

function findSharedActivePlan(a: string, b: string): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const p of store.listPlans()) {
    if (new Date(p.date).getTime() < today.getTime()) continue;
    const aIn = p.creatorId === a || store.findParticipation(p.id, a)?.state === "going";
    const bIn = p.creatorId === b || store.findParticipation(p.id, b)?.state === "going";
    if (aIn && bIn) return p.id;
  }
  return null;
}
