import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store, type ReportReason } from "../store.js";
import { findUserById } from "../userRepo.js";

export const reportsRouter = Router();

const REASONS: ReportReason[] = ["harassment", "spam", "inappropriate", "safety", "other"];

function isReason(value: string): value is ReportReason {
  return (REASONS as string[]).includes(value);
}

// POST /api/reports — member safety report on a person (usually a plan host).
reportsRouter.post("/", requireAuth, async (req, res) => {
  const reporterId = String(req.userId);
  const targetUserId = String(req.body?.targetUserId ?? "").trim();
  const planId = typeof req.body?.planId === "string" ? req.body.planId.trim() : "";
  const reasonRaw = String(req.body?.reason ?? "").trim();
  const details = typeof req.body?.details === "string" ? req.body.details.trim().slice(0, 2000) : "";

  if (!targetUserId || targetUserId === reporterId) {
    res.status(400).json({ error: "Choose someone to report" });
    return;
  }
  if (!isReason(reasonRaw)) {
    res.status(400).json({ error: "Pick a reason" });
    return;
  }
  const target = await findUserById(targetUserId);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (planId) {
    const plan = store.findPlanById(planId);
    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
  }

  const record = store.createReport({
    reporterId,
    targetUserId,
    planId: planId || null,
    reason: reasonRaw,
    details: details || undefined,
  });
  store.log("user_reported", {
    reportId: record.id,
    reporterId,
    targetUserId,
    planId: planId || null,
    reason: reasonRaw,
  });
  res.status(201).json({ ok: true, id: record.id });
});
