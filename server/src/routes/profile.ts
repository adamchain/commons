import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store } from "../store.js";
import { planSummary, userToPublic } from "./plans.js";
import type { HostTag } from "../types/shared.js";

export const profileRouter = Router();

const HOST_TAGS: HostTag[] = ["great_host", "would_do_again", "made_me_feel_welcome"];

// GET /api/profile/:userId — public-facing host profile
profileRouter.get("/:userId", requireAuth, (req, res) => {
  const targetId = String(req.params.userId);
  const viewerId = String(req.userId);
  const target = store.findUserById(targetId);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const neighborhood = target.neighborhoodId
    ? store.findNeighborhoodById(target.neighborhoodId)
    : null;
  // Tag counts from feedback
  const feedback = store.listFeedbackForHost(targetId);
  const tagCounts: Record<HostTag, number> = {
    great_host: 0,
    would_do_again: 0,
    made_me_feel_welcome: 0,
  };
  for (const f of feedback) {
    for (const t of f.hostTags) {
      if (HOST_TAGS.includes(t)) tagCounts[t]++;
    }
  }
  // Plans authored
  const allPlans = store.listPlansByCreator(targetId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = allPlans.filter((p) => new Date(p.date).getTime() >= today.getTime());
  const past = allPlans.filter((p) => new Date(p.date).getTime() < today.getTime());

  // "Message in current plan" CTA appears only when viewer + target share a current plan as participants.
  const sharedPlanId = findSharedActivePlan(targetId, viewerId);

  res.json({
    user: userToPublic(target),
    neighborhood: neighborhood ? { id: neighborhood.id, name: neighborhood.name, metro: neighborhood.metro } : null,
    tagCounts,
    upcoming: upcoming.map((p) => planSummary(p, viewerId)),
    past: past
      .slice(-5)
      .reverse()
      .map((p) => ({
        id: p.id,
        title: p.title,
        date: p.date,
        wentCount: store.listParticipationsForPlan(p.id).filter((q) => q.state === "going").length,
      })),
    sharedPlanId,
  });
});

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
