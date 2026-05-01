import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store, type PlanRecord, type UserRecord } from "../store.js";
import { rankPlansForUser } from "../lib/recommend.js";
import {
  ALL_INTERESTS,
  type InterestTag,
  type ParticipationState,
  type PlanDTO,
  type PublicUser,
} from "../types/shared.js";

export const plansRouter = Router();

function publicUser(userId: string): PublicUser {
  const user = store.findUserById(userId);
  if (!user) {
    return { id: userId, firstName: "Unknown", neighborhoodId: null, avatarSeed: "missing", avatarStyle: "avataaars" };
  }
  return userToPublic(user);
}

export function userToPublic(user: UserRecord): PublicUser {
  return {
    id: user.id,
    firstName: user.firstName || "Friend",
    neighborhoodId: user.neighborhoodId,
    avatarSeed: user.avatarSeed,
    avatarStyle: user.avatarStyle,
  };
}

export function planSummary(plan: PlanRecord, viewerId: string | null): PlanDTO {
  const creator = store.findUserById(plan.creatorId);
  const participations = store.listParticipationsForPlan(plan.id);
  const going = participations.filter((p) => p.state === "going");
  const interested = participations.filter((p) => p.state === "interested");
  const mine = viewerId ? participations.find((p) => p.userId === viewerId) : undefined;
  return {
    id: plan.id,
    title: plan.title,
    creator: creator ? userToPublic(creator) : publicUser(plan.creatorId),
    neighborhoodId: plan.neighborhoodId,
    location: plan.location,
    date: plan.date,
    time: plan.time,
    isFlexibleTime: plan.isFlexibleTime,
    endTime: plan.endTime,
    tags: plan.tags,
    description: plan.description,
    hostEmoji: plan.hostEmoji,
    participants: {
      going: going.map((p) => publicUser(p.userId)),
      interested: interested.map((p) => publicUser(p.userId)),
    },
    myState: mine?.state ?? null,
  };
}

// Public preview for the pre-signup tease (PRD §3.1).
plansRouter.get("/preview", (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = store
    .listPlans()
    .filter((p) => new Date(p.date).getTime() >= today.getTime())
    .slice(0, 6);
  res.json(upcoming.map((p) => planSummary(p, null)));
});

plansRouter.get("/", requireAuth, (req, res) => {
  const userId = String(req.userId);
  const me = store.findUserById(userId);
  if (!me) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  // If the user has a neighborhood, scope to that + adjacent. Otherwise show everything.
  const scope = me.neighborhoodId ? store.neighborhoodScope(me.neighborhoodId) : null;
  const candidates = scope ? store.listPlansByNeighborhoods(scope) : store.listPlans();
  const ranked = rankPlansForUser(me, candidates);
  res.json(ranked.map((plan) => planSummary(plan, userId)));
});

plansRouter.post("/", requireAuth, (req, res) => {
  const userId = String(req.userId);
  const me = store.findUserById(userId);
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
  const description = req.body?.description ? String(req.body.description).trim() : undefined;
  const hostEmoji = String(req.body?.hostEmoji ?? "").trim() || "✨";
  const neighborhoodId = String(req.body?.neighborhoodId ?? me.neighborhoodId ?? "").trim();

  const tagsInput = Array.isArray(req.body?.tags) ? (req.body.tags as unknown[]) : [];
  const tags = tagsInput
    .map((t) => String(t))
    .filter((t): t is InterestTag => ALL_INTERESTS.includes(t as InterestTag))
    .slice(0, 3);

  if (!title || !locationName || !dateInput || !neighborhoodId) {
    res.status(400).json({ error: "Title, location, date, and neighborhood are required" });
    return;
  }
  if (!store.findNeighborhoodById(neighborhoodId)) {
    res.status(400).json({ error: "Unknown neighborhood" });
    return;
  }

  const plan = store.createPlan({
    creatorId: userId,
    title,
    neighborhoodId,
    location: { name: locationName, address: locationAddress || locationName, lat, lng },
    date: dateInput,
    time: isFlexibleTime ? "" : time,
    isFlexibleTime: isFlexibleTime || !time,
    tags,
    description,
    hostEmoji,
  });

  store.upsertParticipation(plan.id, userId, "going");
  store.ensureGroupConversation(plan.id, [userId]);
  store.log("plan_created", { planId: plan.id, creatorId: userId });

  res.status(201).json(planSummary(plan, userId));
});

plansRouter.get("/:id", requireAuth, (req, res) => {
  const planId = String(req.params.id);
  const userId = String(req.userId);
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  store.log("plan_viewed", { planId, userId });
  res.json(planSummary(plan, userId));
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
