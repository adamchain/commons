import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { isNative } from "./platform";
import { api } from "../api/http";

let registered = false;

// Idempotent: requests permission, registers with APNs/FCM, and POSTs the
// device token to the server so we can target the user later. No-ops on web
// (browser push lives behind service workers and a separate flow).
export async function ensurePushRegistered(): Promise<void> {
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
