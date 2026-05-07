import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store, type PlanRecord, type UserRecord } from "../store.js";
import { findUserById, findUsersByIds } from "../userRepo.js";
import { rankPlansForUser } from "../lib/recommend.js";
import {
  ALL_INTERESTS,
  type InterestTag,
  type ParticipationState,
  type PlanDTO,
  type PlanKind,
  type PlanVisibility,
  type PublicUser,
} from "../types/shared.js";

export const plansRouter = Router();

function userHoods(me: UserRecord): string[] {
  if (me.neighborhoodIds?.length) return me.neighborhoodIds;
  if (me.neighborhoodId) return [me.neighborhoodId];
  return [];
}

function combinedNeighborhoodScope(me: UserRecord): string[] | null {
  const hoods = userHoods(me);
  if (hoods.length === 0) return null;
  const set = new Set<string>();
  for (const id of hoods) {
    store.neighborhoodScope(id).forEach((x) => set.add(x));
  }
  return [...set];
}

function planVisibleToViewer(plan: PlanRecord, me: UserRecord): boolean {
  const v: PlanVisibility = plan.visibility ?? "everyone";
  if (v === "network") return false;
  if (v === "community") {
    const tag = plan.visibilityCommunityTag;
    if (!tag) return true;
    return me.interests.includes(tag);
  }
  return true;
}

export function userToPublic(user: UserRecord): PublicUser {
  return {
    id: user.id,
    firstName: user.firstName || "Friend",
    neighborhoodId: user.neighborhoodId,
    avatarSeed: user.avatarSeed,
    avatarStyle: user.avatarStyle,
    avatarPhotoDataUrl: user.avatarPhotoDataUrl,
  };
}

export async function planSummary(plan: PlanRecord, viewerId: string | null): Promise<PlanDTO> {
  const participations = store.listParticipationsForPlan(plan.id);
  const going = participations.filter((p) => p.state === "going");
  const interested = participations.filter((p) => p.state === "interested");
  const ids = [
    plan.creatorId,
    ...going.map((p) => p.userId),
    ...interested.map((p) => p.userId),
  ];
  const users = await findUsersByIds(ids);
  const mine = viewerId ? participations.find((p) => p.userId === viewerId) : undefined;

  function pu(uid: string): PublicUser {
    const u = users.get(uid);
    return u
      ? userToPublic(u)
      : {
          id: uid,
          firstName: "Unknown",
          neighborhoodId: null,
          avatarSeed: "missing",
          avatarStyle: "avataaars",
        };
  }

  const creator = users.get(plan.creatorId);
  const planKind = plan.planKind ?? "standard";
  const visibility = plan.visibility ?? "everyone";
  return {
    id: plan.id,
    title: plan.title,
    creator: creator ? userToPublic(creator) : pu(plan.creatorId),
    neighborhoodId: plan.neighborhoodId,
    location: plan.location,
    date: plan.date,
    time: plan.time,
    isFlexibleTime: plan.isFlexibleTime,
    isFlexibleLocation: plan.isFlexibleLocation ?? false,
    endTime: plan.endTime,
    tags: plan.tags,
    description: plan.description,
    hostEmoji: plan.hostEmoji,
    planKind,
    visibility,
    visibilityCommunityTag: plan.visibilityCommunityTag ?? null,
    isRecurring: plan.isRecurring ?? false,
    lockedAt: plan.lockedAt ?? null,
    participants: {
      going: going.map((p) => pu(p.userId)),
      interested: interested.map((p) => pu(p.userId)),
    },
    myState: mine?.state ?? null,
  };
}

// Public preview for the pre-signup tease (PRD §3.1).
plansRouter.get("/preview", async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = store
    .listPlans()
    .filter((p) => new Date(p.date).getTime() >= today.getTime())
    .slice(0, 6);
  const summaries = await Promise.all(upcoming.map((p) => planSummary(p, null)));
  res.json(summaries);
});

plansRouter.get("/", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const me = await findUserById(userId);
  if (!me) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const scope = combinedNeighborhoodScope(me);
  const inHood = scope ? store.listPlansByNeighborhoods(scope) : store.listPlans();
  const candidates = inHood.filter((p) => planVisibleToViewer(p, me));
  const ranked = rankPlansForUser(me, candidates);
  const summaries = await Promise.all(ranked.map((plan) => planSummary(plan, userId)));
  res.json(summaries);
});

plansRouter.post("/", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const me = await findUserById(userId);
  if (!me) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const title = String(req.body?.title ?? "").trim();
  const location = req.body?.location ?? {};
  const locationName = String(location.name ?? "").trim();
  const locationAddress = String(location.address ?? "").trim();
  const lat = typeof location.lat === "number" ? location.lat : undefined;
  const lng = typeof location.lng === "number" ? location.lng : undefined;
  const dateInput = String(req.body?.date ?? "").trim();
  const time = String(req.body?.time ?? "").trim();
  const isFlexibleTime = Boolean(req.body?.isFlexibleTime);
  const isFlexibleLocation = Boolean(req.body?.isFlexibleLocation);
  const description = req.body?.description ? String(req.body.description).trim() : undefined;
  const hostEmoji = String(req.body?.hostEmoji ?? "").trim() || "✨";
  const neighborhoodId = String(req.body?.neighborhoodId ?? userHoods(me)[0] ?? "").trim();
  const planKind = (req.body?.planKind === "looking_for" ? "looking_for" : "standard") as PlanKind;
  const rawVis = String(req.body?.visibility ?? "everyone");
  const visibility = (["everyone", "community", "network"].includes(rawVis) ? rawVis : "everyone") as PlanVisibility;
  const isRecurring = Boolean(req.body?.isRecurring);

  const tagsInput = Array.isArray(req.body?.tags) ? (req.body.tags as unknown[]) : [];
  const tags = tagsInput
    .map((t) => String(t))
    .filter((t): t is InterestTag => ALL_INTERESTS.includes(t as InterestTag))
    .slice(0, 3);

  let visibilityCommunityTag: InterestTag | null = null;
  if (visibility === "community") {
    const tagPick = req.body?.visibilityCommunityTag
      ? String(req.body.visibilityCommunityTag)
      : tags[0];
    if (!tagPick || !ALL_INTERESTS.includes(tagPick as InterestTag)) {
      res.status(400).json({ error: "Pick a vibe tag for community visibility" });
      return;
    }
    visibilityCommunityTag = tagPick as InterestTag;
  }

  if (!title || !dateInput || !neighborhoodId) {
    res.status(400).json({ error: "Title, date, and neighborhood are required" });
    return;
  }
  if (!isFlexibleLocation && !locationName) {
    res.status(400).json({ error: "Add a spot or turn on flexible location" });
    return;
  }
  if (!store.findNeighborhoodById(neighborhoodId)) {
    res.status(400).json({ error: "Unknown neighborhood" });
    return;
  }
  if (visibility === "network") {
    res.status(400).json({ error: "Network visibility is coming soon — choose Everyone or A community" });
    return;
  }

  const resolvedLocationName = isFlexibleLocation ? (locationName || "Flexible location") : locationName;
  const resolvedAddress = locationAddress || resolvedLocationName;

  const plan = store.createPlan({
    creatorId: userId,
    title,
    neighborhoodId,
    location: { name: resolvedLocationName, address: resolvedAddress, lat, lng },
    date: dateInput,
    time: isFlexibleTime ? "" : time,
    isFlexibleTime: isFlexibleTime || !time,
    isFlexibleLocation,
    tags,
    description,
    hostEmoji,
    planKind,
    visibility,
    visibilityCommunityTag,
    isRecurring,
    lockedAt: null,
  });

  store.upsertParticipation(plan.id, userId, "going");
  store.ensureGroupConversation(plan.id, [userId]);
  store.log("plan_created", { planId: plan.id, creatorId: userId });

  res.status(201).json(await planSummary(plan, userId));
});

plansRouter.get("/:id", requireAuth, async (req, res) => {
  const planId = String(req.params.id);
  const userId = String(req.userId);
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  store.log("plan_viewed", { planId, userId });
  res.json(await planSummary(plan, userId));
});

plansRouter.put("/:id/participation", requireAuth, (req, res) => {
  const planId = String(req.params.id);
  const userId = String(req.userId);
  const state = req.body?.state as ParticipationState;
  if (state !== "interested" && state !== "going") {
    res.status(400).json({ error: "Invalid participation state" });
    return;
  }
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  const existing = store.findParticipation(planId, userId);
  store.upsertParticipation(planId, userId, state);
  // Joining adds you to the group conversation.
  if (state === "going") {
    store.ensureGroupConversation(planId, [plan.creatorId, userId]);
  }
  store.log("participation_changed", {
    planId,
    userId,
    from: existing?.state ?? null,
    to: state,
  });
  res.json({ ok: true });
});

plansRouter.delete("/:id/participation", requireAuth, (req, res) => {
  const planId = String(req.params.id);
  const userId = String(req.userId);
  const existing = store.findParticipation(planId, userId);
  store.deleteParticipation(planId, userId);
  // A removal counts as a soft "decline" for the recommendation algo.
  store.recordDecline(userId, planId);
  store.log("participation_changed", {
    planId,
    userId,
    from: existing?.state ?? null,
    to: null,
  });
  res.json({ ok: true });
});
