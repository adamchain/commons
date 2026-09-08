import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store } from "../store.js";
import { findUserById } from "../userRepo.js";
import { userToPublic } from "./plans.js";

export const usersRouter = Router();

// GET /api/users/blocked — the viewer's blocked list, for Settings → Blocked.
usersRouter.get("/blocked", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const ids = store.listBlockedUserIds(userId);
  const users = ids
    .map((id) => store.findUserById(id))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => userToPublic(u));
  res.json({ users });
});

// POST /api/users/:id/block
usersRouter.post("/:id/block", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const targetId = String(req.params.id);
  if (!targetId || targetId === userId) {
    res.status(400).json({ error: "Can't block yourself" });
    return;
  }
  const target = await findUserById(targetId);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  store.blockUser(userId, targetId);
  const report = store.createReport({
    reporterId: userId,
    targetUserId: targetId,
    reason: "inappropriate",
    source: "block",
    contentKind: "user",
    details:
      "This person was blocked. Their content is hidden from the reporter's feed immediately. Review for Terms violations.",
  });
  store.log("user_blocked", { userId, targetId, reportId: report.id });
  console.warn("[safety] user_blocked", { reporterId: userId, targetUserId: targetId, reportId: report.id });
  res.json({ ok: true, blockedUserIds: store.listBlockedUserIds(userId) });
});

// DELETE /api/users/:id/block
usersRouter.delete("/:id/block", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const targetId = String(req.params.id);
  store.unblockUser(userId, targetId);
  store.log("user_unblocked", { userId, targetId });
  res.json({ ok: true, blockedUserIds: store.listBlockedUserIds(userId) });
});
