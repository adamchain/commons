import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store } from "../store.js";
import { findUsersByIds } from "../userRepo.js";
import type { NotificationDTO } from "../types/shared.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const rows = store
    .listNotificationsForUser(userId, 50)
    .filter((n) => n.kind !== "communityReview");
  const users = await findUsersByIds(rows.map((n) => n.profileUserId).filter((id): id is string => Boolean(id)));
  const dtos: NotificationDTO[] = rows.map((n) => {
    const actor = n.profileUserId ? users.get(n.profileUserId) : undefined;
    return {
      id: n.id,
      kind: n.kind,
      body: n.body,
      planId: n.planId,
      conversationId: n.conversationId,
      profileUserId: n.profileUserId,
      communityId: n.communityId,
      ...(actor
        ? {
            actor: {
              id: actor.id,
              firstName: actor.firstName || "Someone",
              avatarSeed: actor.avatarSeed,
              avatarStyle: actor.avatarStyle,
              ...(actor.avatarParams ? { avatarParams: actor.avatarParams } : {}),
              ...(actor.avatarPhotoDataUrl ? { avatarPhotoDataUrl: actor.avatarPhotoDataUrl } : {}),
            },
          }
        : {}),
      createdAt: n.createdAt,
      readAt: n.readAt,
    };
  });
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
