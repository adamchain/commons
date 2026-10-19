import { App } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { isNative } from "./platform";
import { api } from "../api/http";

let listenersPromise: Promise<void> | null = null;
let registering: Promise<void> | null = null;

const PUSH_TOKEN_KEY = "commons.pushToken";

function rememberedPushToken(): string | null {
  try {
    return localStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function rememberPushToken(token: string): void {
  try {
    localStorage.setItem(PUSH_TOKEN_KEY, token);
  } catch {
    /* private mode */
  }
}

/** Apple often emits the token once. A failed POST used to drop it forever. */
async function postPushToken(token: string): Promise<void> {
  rememberPushToken(token);
  await api("/api/devices/register", {
    method: "POST",
    body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
  });
}

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
  if (d.kind === "communityBulletinPosted" && d.communityId) {
    return `/communities/${d.communityId}?tab=bulletin`;
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
function ensurePushActionListener(): Promise<void> {
  if (!isNative()) return Promise.resolve();
  if (!listenersPromise) {
    // addListener resolves only once the native side is listening. Calling
    // register() before that drops the token, which is why some phones never
    // got pushes.
    listenersPromise = Promise.all([
      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const path = pathForPushData(action.notification.data);
        if (path) {
          window.dispatchEvent(new CustomEvent("commons:push-open", { detail: { path } }));
        }
      }),
      PushNotifications.addListener("pushNotificationReceived", () => {
        window.dispatchEvent(new CustomEvent("commons:notifications-changed"));
      }),
      PushNotifications.addListener("registration", (t) => {
        void postPushToken(t.value).catch(() => undefined);
      }),
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void registerForPush();
      }),
    ]).then(() => undefined);
  }
  return listenersPromise;
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
  await ensurePushActionListener();
  if (!isNative()) return;
  const cached = rememberedPushToken();
  if (cached) {
    try {
      await postPushToken(cached);
    } catch {
      /* next resume will try again */
    }
  }
  try {
    await registerForPush();
  } catch {
    /* next resume will try again */
  }
}
