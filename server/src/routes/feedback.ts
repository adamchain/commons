import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store } from "../store.js";

export const feedbackRouter = Router();

// GET /api/feedback/pending — plans the user attended that are over and have no feedback yet
feedbackRouter.get("/pending", requireAuth, (req, res) => {
  const userId = String(req.userId);
  const myParticipations = store.listParticipationsForUser(userId).filter((p) => p.state === "going");
  const now = Date.now();
  const ninetyMinMs = 90 * 60 * 1000;

  const pending = [];
  for (const p of myParticipations) {
    const plan = store.findPlanById(p.planId);
    if (!plan) continue;
    const endTime = plan.endTime
      ? new Date(plan.endTime).getTime()
      : new Date(plan.date).getTime() + 2 * 60 * 60 * 1000;
    if (endTime + ninetyMinMs > now) continue; // not ready yet
    const already = store.listFeedbackForPlan(plan.id).some((f) => f.fromUserId === userId);
    if (already) continue;
    if (plan.creatorId === userId) continue; // don't ask host to rate themselves
    pending.push({
      planId: plan.id,
      planTitle: plan.title,
      hostId: plan.creatorId,
    });
  }
  res.json(pending);
});

// POST /api/feedback { planId, thumb, note? }
feedbackRouter.post("/", requireAuth, (req, res) => {
  const userId = String(req.userId);
  const planId = String(req.body?.planId ?? "");
  const thumb = req.body?.thumb === "down" ? "down" : req.body?.thumb === "up" ? "up" : null;
  if (!thumb || !planId) {
    res.status(400).json({ error: "planId and thumb are required" });
    return;
  }
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  const part = store.findParticipation(planId, userId);
  if (part?.state !== "going") {
    res.status(403).json({ error: "Only attendees can leave feedback" });
    return;
  }
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : undefined;
  const record = store.createFeedback({
    planId,
    fromUserId: userId,
    toHostId: plan.creatorId,
    thumb,
    note,
  });
  // Submitting feedback implicitly confirms attendance — the prompt asks "how
  // was it", not "did you go". Mark the participation as attended so the
  // post-plan attendance signal lands in the same write the user made.
  store.markAttended(planId, userId, true);
  res.status(201).json({ ok: true, id: record.id });
});
