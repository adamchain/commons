import { useEffect } from "react";
import { App as CapApp } from "@capacitor/app";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { isNative } from "../lib/platform";

/**
 * When this install is behind the version the server is advertising, add a
 * row to Activity. The old blocking card is gone.
 */
export function useAppUpdateNotice(): void {
  const { user } = useAuth();

  useEffect(() => {
    if (!isNative() || !user) return;
    let cancelled = false;

    async function check() {
      try {
        const info = await CapApp.getInfo();
        if (cancelled) return;
        await api<{ needed: boolean }>("/api/notifications/app-update", {
          method: "POST",
          body: JSON.stringify({ installed: info.version }),
        });
        if (!cancelled) {
          window.dispatchEvent(new CustomEvent("commons:notifications-changed"));
        }
      } catch {
        /* offline or an old server — stay quiet */
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);
}
