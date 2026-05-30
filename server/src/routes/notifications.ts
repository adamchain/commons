import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store } from "../store.js";
import type { NotificationDTO } from "../types/shared.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", requireAuth, (req, res) => {
  const userId = String(req.userId);
  const rows = store.listNotificationsForUser(userId, 50);
  const dtos: NotificationDTO[] = rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    body: n.body,
    planId: n.planId,
    conversationId: n.conversationId,
    createdAt: n.createdAt,
    readAt: n.readAt,
  }));
  res.json({ notifications: dtos });
});

notificationsRouter.post("/read", requireAuth, (req, res) => {
  const userId = String(req.userId);
  const count = store.markAllNotificationsRead(userId);
  res.json({ ok: true, count });
});

notificationsRouter.post("/clear", requireAuth, (req, res) => {
  const userId = String(req.userId);
  const count = store.clearAllNotificationsForUser(userId);
  res.json({ ok: true, count });
});

notificationsRouter.delete("/:id", requireAuth, (req, res) => {
  const userId = String(req.userId);
  const ok = store.deleteNotification(userId, String(req.params.id));
  res.json({ ok });
});
