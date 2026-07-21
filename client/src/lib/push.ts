import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { isNative } from "./platform";
import { api } from "../api/http";

let registered = false;
let actionListenerAdded = false;

/** Mirrors the priority order `hrefFor` in Notifications.tsx uses for in-app rows. */
function pathForPushData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, string>;
  if (d.conversationId && d.planId) return `/plans/${d.planId}/chat`;
  if (d.communityId) return `/communities/${d.communityId}`;
  if (d.planId) return `/plans/${d.planId}`;
  return null;
}

// Fires when the user taps a push notification (cold start or from the
// background) — independent of registration state, so it's wired up on every
// native launch. App.tsx listens for the resulting `commons:push-open`
// CustomEvent once the router is mounted and navigates to the deep link.
function ensurePushActionListener(): void {
  if (!isNative() || actionListenerAdded) return;
  actionListenerAdded = true;
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const path = pathForPushData(action.notification.data);
    if (path) {
      window.dispatchEvent(new CustomEvent("commons:push-open", { detail: { path } }));
    }
  });
}

// Idempotent: requests permission, registers with APNs/FCM, and POSTs the
// device token to the server so we can target the user later. No-ops on web
// (browser push lives behind service workers and a separate flow).
export async function ensurePushRegistered(): Promise<void> {
  ensurePushActionListener();
  if (!isNative() || registered) return;
  registered = true;

  try {
    const status = await PushNotifications.checkPermissions();
    if (status.receive !== "granted") {
      const req = await PushNotifications.requestPermissions();
      if (req.receive !== "granted") {
        registered = false;
        return;
      }
    }

    PushNotifications.addListener("registration", (t) => {
      void api("/api/devices/register", {
        method: "POST",
        body: JSON.stringify({ token: t.value, platform: Capacitor.getPlatform() }),
      }).catch(() => undefined);
    });

    PushNotifications.addListener("registrationError", () => {
      registered = false;
    });

    await PushNotifications.register();
  } catch {
    registered = false;
  }
}
