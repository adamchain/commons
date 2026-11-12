import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { emit } from "../lib/notify.js";
import { store } from "../store.js";
import { findUserById, findUsersByIds } from "../userRepo.js";
import type { NotificationDTO } from "../types/shared.js";
import type { NotificationRecord, UserRecord } from "../store.js";

export const notificationsRouter = Router();

function resolutionFor(
  n: NotificationRecord,
  viewer: UserRecord | undefined,
): NotificationDTO["resolution"] {
  if (n.kind === "networkRequest" && n.profileUserId && viewer) {
    if ((viewer.networkIds ?? []).includes(n.profileUserId)) return "accepted";
    if (!(viewer.incomingNetworkRequests ?? []).includes(n.profileUserId)) return "closed";
  }
  if (n.kind === "communityJoinRequest" && n.communityId && n.profileUserId) {
    const membership = store.findCommunityMembership(n.communityId, n.profileUserId);
    if (membership?.status === "active") return "accepted";
    if (!membership || membership.status !== "pending") return "closed";
  }
  return undefined;
}

notificationsRouter.get("/", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const viewer = await findUserById(userId);
  const rows = store
    .listNotificationsForUser(userId, 50)
    .filter((n) => n.kind !== "communityReview");
  const users = await findUsersByIds(rows.map((n) => n.profileUserId).filter((id): id is string => Boolean(id)));
  const dtos: NotificationDTO[] = rows.map((n) => {
    const actor = n.profileUserId ? users.get(n.profileUserId) : undefined;
    const resolution = resolutionFor(n, viewer ?? undefined);
    return {
      id: n.id,
      kind: n.kind,
      body: n.body,
      planId: n.planId,
      ...(n.planIds?.length ? { planIds: n.planIds } : {}),
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
      ...(resolution ? { resolution } : {}),
    };
  });
  res.json({ notifications: dtos });
});

function compareVersions(installed: string, latest: string): number {
  const a = installed.split(".").map((n) => parseInt(n, 10) || 0);
  const b = latest.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Drop an "update the app" row into Activity when this install is behind. */
notificationsRouter.post("/app-update", requireAuth, async (req, res) => {
  const installed = typeof req.body?.installed === "string" ? req.body.installed.trim().slice(0, 20) : "";
  if (!/^\d+(\.\d+){0,3}$/.test(installed)) {
    res.status(400).json({ error: "installed version required" });
    return;
  }
  const latest = (process.env.APP_LATEST_VERSION?.trim() || "1.7").slice(0, 20);
  const userId = String(req.userId);
  if (!/^\d+(\.\d+){0,3}$/.test(latest) || compareVersions(installed, latest) >= 0) {
    store.deleteNotificationsByKind(userId, "appUpdate");
    res.json({ ok: true, needed: false });
    return;
  }
  await emit({
    userId,
    kind: "appUpdate",
    body: "A newer version of Commons is ready. Update to keep plans and messages in sync.",
    dedupKey: `appUpdate:${userId}:${latest}`,
    skipPush: true,
  });
  res.json({ ok: true, needed: true });
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
