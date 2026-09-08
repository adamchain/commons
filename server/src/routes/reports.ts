import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store, type ReportContentKind, type ReportReason } from "../store.js";
import { findUserById } from "../userRepo.js";

export const reportsRouter = Router();

const REASONS: ReportReason[] = ["harassment", "spam", "inappropriate", "safety", "other"];
const CONTENT_KINDS: ReportContentKind[] = [
  "user",
  "plan",
  "message",
  "forum_post",
  "community_post",
];

function isReason(value: string): value is ReportReason {
  return (REASONS as string[]).includes(value);
}

function isContentKind(value: string): value is ReportContentKind {
  return (CONTENT_KINDS as string[]).includes(value);
}

function alertSafety(event: string, payload: unknown): void {
  store.log(event, payload);
  console.warn(`[safety] ${event}`, payload);
}

// POST /api/reports — flag a person and optional piece of content.
reportsRouter.post("/", requireAuth, async (req, res) => {
  const reporterId = String(req.userId);
  const targetUserId = String(req.body?.targetUserId ?? "").trim();
  const planId = typeof req.body?.planId === "string" ? req.body.planId.trim() : "";
  const reasonRaw = String(req.body?.reason ?? "").trim();
  const details = typeof req.body?.details === "string" ? req.body.details.trim().slice(0, 2000) : "";
  const contentKindRaw =
    typeof req.body?.contentKind === "string" ? req.body.contentKind.trim() : "";
  const contentId =
    typeof req.body?.contentId === "string" ? req.body.contentId.trim().slice(0, 128) : "";

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
  const contentKind = isContentKind(contentKindRaw) ? contentKindRaw : planId ? "plan" : "user";

  const record = store.createReport({
    reporterId,
    targetUserId,
    planId: planId || null,
    contentKind,
    contentId: contentId || planId || null,
    source: "report",
    reason: reasonRaw,
    details: details || undefined,
  });
  alertSafety("user_reported", {
    reportId: record.id,
    reporterId,
    targetUserId,
    planId: planId || null,
    contentKind,
    contentId: contentId || null,
    reason: reasonRaw,
  });
  res.status(201).json({ ok: true, id: record.id });
});
