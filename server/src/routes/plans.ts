import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store, type PlanRecord } from "../store.js";
import type { ParticipationState, PlanDTO, PlanTag } from "../types/shared.js";

export const plansRouter = Router();

const ALLOWED_TAGS: PlanTag[] = ["coffee", "workout", "social", "outdoors", "events"];

function planSummary(plan: PlanRecord): PlanDTO {
  const creator = store.findUserById(plan.creatorId);
  const participations = store.listParticipationsForPlan(plan.id);
  const going = participations.filter((p) => p.state === "going");
  const interested = participations.filter((p) => p.state === "interested");
  return {
    id: plan.id,
    title: plan.title,
    creator: {
      id: creator?.id ?? "",
      displayName: creator?.displayName ?? "Unknown",
    },
    location: plan.location,
    date: plan.date,
    time: plan.time,
    isFlexibleTime: plan.isFlexibleTime,
    tags: plan.tags,
    description: plan.description,
    participants: {
      going: going.map((p) => userBrief(p.userId)),
      interested: interested.map((p) => userBrief(p.userId)),
    },
    myState: null,
  };
}

function userBrief(userId: string): { id: string; displayName: string } {
  const user = store.findUserById(userId);
  return { id: user?.id ?? userId, displayName: user?.displayName ?? "Unknown" };
}

plansRouter.get("/", requireAuth, (req, res) => {
  const userId = String(req.userId);
  const plans = store.listPlans().map((plan) => {
    const dto = planSummary(plan);
    const mine = store.findParticipation(plan.id, userId);
    dto.myState = mine?.state ?? null;
    return dto;
  });
  res.json(plans);
});

plansRouter.post("/", requireAuth, (req, res) => {
  const userId = String(req.userId);
  const title = String(req.body?.title ?? "").trim();
  const location = req.body?.location ?? {};
  const locationName = String(location.name ?? "").trim();
  const locationAddress = String(location.address ?? "").trim();
  const dateInput = String(req.body?.date ?? "").trim();
  const time = String(req.body?.time ?? "").trim();
  const isFlexibleTime = Boolean(req.body?.isFlexibleTime);
  const description = req.body?.description ? String(req.body.description).trim() : undefined;

  const tagsInput = Array.isArray(req.body?.tags) ? (req.body.tags as unknown[]) : [];
  const tags = tagsInput
    .map((t) => String(t))
    .filter((t): t is PlanTag => ALLOWED_TAGS.includes(t as PlanTag))
    .slice(0, 3);

  if (!title || !locationName || !dateInput) {
    res.status(400).json({ error: "Title, location and date are required" });
    return;
  }

  const isoDate = new Date(dateInput).toISOString();

  const plan = store.createPlan({
    creatorId: userId,
    title,
    location: { name: locationName, address: locationAddress || locationName },
    date: isoDate,
    time: isFlexibleTime ? "Flexible" : time || "Flexible",
    isFlexibleTime: isFlexibleTime || !time,
    tags,
    description,
  });

  store.upsertParticipation(plan.id, userId, "going");
  store.log("plan_created", { planId: plan.id, creatorId: userId });

  const dto = planSummary(plan);
  dto.myState = "going";
  res.status(201).json(dto);
});

plansRouter.get("/:id", requireAuth, (req, res) => {
  const planId = String(req.params.id);
  const userId = String(req.userId);
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const dto = planSummary(plan);
  const mine = store.findParticipation(planId, userId);
  dto.myState = mine?.state ?? null;

  const comments = store.listCommentsForPlan(planId).map((c) => {
    const user = store.findUserById(c.userId);
    return {
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      user: { id: user?.id ?? c.userId, displayName: user?.displayName ?? "Unknown" },
    };
  });

  store.log("plan_viewed", { planId, userId });
  res.json({ ...dto, comments });
});

plansRouter.put("/:id/participation", requireAuth, (req, res) => {
  const planId = String(req.params.id);
  const userId = String(req.userId);
  const state = req.body?.state as ParticipationState;
  if (state !== "interested" && state !== "going") {
    res.status(400).json({ error: "Invalid participation state" });
    return;
  }
  if (!store.findPlanById(planId)) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  const existing = store.findParticipation(planId, userId);
  store.upsertParticipation(planId, userId, state);
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
  store.log("participation_changed", {
    planId,
    userId,
    from: existing?.state ?? null,
    to: null,
  });
  res.json({ ok: true });
});

plansRouter.post("/:id/comments", requireAuth, (req, res) => {
  const planId = String(req.params.id);
  const userId = String(req.userId);
  const body = String(req.body?.body ?? "").trim();
  if (!body) {
    res.status(400).json({ error: "Comment body is required" });
    return;
  }
  if (!store.findPlanById(planId)) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  const comment = store.createComment(planId, userId, body);
  store.log("comment_posted", { planId, userId, commentId: comment.id });
  res.status(201).json({ ok: true });
});

plansRouter.get("/:id/comments", requireAuth, (req, res) => {
  const planId = String(req.params.id);
  const comments = store.listCommentsForPlan(planId).map((c) => {
    const user = store.findUserById(c.userId);
    return {
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      user: { id: user?.id ?? c.userId, displayName: user?.displayName ?? "Unknown" },
    };
  });
  res.json(comments);
});
