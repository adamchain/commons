import { App } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { isNative } from "./platform";
import { api } from "../api/http";

let listenersReady = false;
let registering: Promise<void> | null = null;

/** Mirrors the priority order `hrefFor` in Notifications.tsx uses for in-app rows. */
function pathForPushData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, string>;
  if (d.kind === "communityReview") return "/admin#communities-review";
  if (d.kind === "helpReply") return "/helpchat";
  if (d.kind === "communityJoinRequest" && d.communityId) {
    return `/communities/${d.communityId}/dashboard?section=requests`;
  }
  if (d.kind === "communityPostPending" && d.communityId) {
    return `/communities/${d.communityId}/dashboard?section=bulletin`;
  }
  if (d.kind === "newGroupChatMessage" && d.profileUserId && !d.planId) return `/dm/${d.profileUserId}`;
  if (d.conversationId && d.planId) return `/plans/${d.planId}/chat`;
  if (
    d.communityId &&
    (d.kind === "communityRequestApproved" ||
      d.kind === "communityRequestDeclined" ||
      d.kind === "communityPlanPosted")
  ) {
    return `/communities/${d.communityId}`;
  }
  if (d.planId) return `/plans/${d.planId}`;
  if (d.communityId) return `/communities/${d.communityId}`;
  return null;
}

// Fires when the user taps a push notification (cold start or from the
// background) — independent of registration state, so it's wired up on every
// native launch. App.tsx listens for the resulting `commons:push-open`
// CustomEvent once the router is mounted and navigates to the deep link.
function ensurePushActionListener(): void {
  if (!isNative() || listenersReady) return;
  listenersReady = true;
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const path = pathForPushData(action.notification.data);
    if (path) {
      window.dispatchEvent(new CustomEvent("commons:push-open", { detail: { path } }));
    }
  });
  PushNotifications.addListener("pushNotificationReceived", () => {
    window.dispatchEvent(new CustomEvent("commons:notifications-changed"));
  });
  PushNotifications.addListener("registration", (t) => {
    void api("/api/devices/register", {
      method: "POST",
      body: JSON.stringify({ token: t.value, platform: Capacitor.getPlatform() }),
    }).catch(() => undefined);
  });
  void App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) void registerForPush();
  });
}

async function registerForPush(): Promise<void> {
  if (!isNative()) return;
  if (registering) return registering;
  registering = (async () => {
    const status = await PushNotifications.checkPermissions();
    if (status.receive !== "granted") {
      const req = await PushNotifications.requestPermissions();
      if (req.receive !== "granted") return;
    }
    await PushNotifications.register();
  })().finally(() => {
    registering = null;
  });
  return registering;
}

// Idempotent: requests permission, registers with APNs/FCM, and POSTs the
// device token to the server so we can target the user later. No-ops on web
// (browser push lives behind service workers and a separate flow).
export async function ensurePushRegistered(): Promise<void> {
  ensurePushActionListener();
  if (!isNative()) return;
  try {
    await registerForPush();
  } catch {
    /* next resume will try again */
  }
}
