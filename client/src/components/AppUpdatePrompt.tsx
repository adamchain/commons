import { useEffect, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { APP_STORE_URL } from "../lib/appStore";
import { isNative } from "../lib/platform";

const DISMISS_KEY = "commons_update_dismissed";

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

/**
 * When this install is behind the version the server is advertising, add a
 * row to Activity. The blocking card is AppUpdatePrompt.
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

/**
 * Shown on launch (and when they come back to the app) if this iOS build is
 * behind APP_LATEST_VERSION. Required updates hide "Not now".
 */
export function AppUpdatePrompt() {
  const [open, setOpen] = useState(false);
  const [required, setRequired] = useState(false);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;

    async function check() {
      try {
        const [info, release] = await Promise.all([
          CapApp.getInfo(),
          api<{ version: string; minVersion?: string | null; storeUrl: string | null }>("/api/app/release"),
        ]);
        if (cancelled) return;
        if (!release.version || compareVersions(info.version, release.version) >= 0) {
          setOpen(false);
          return;
        }
        const must =
          Boolean(release.minVersion) && compareVersions(info.version, release.minVersion ?? "") < 0;
        if (!must && sessionStorage.getItem(DISMISS_KEY) === release.version) return;
        setLatest(release.version);
        setStoreUrl(release.storeUrl || APP_STORE_URL || null);
        setRequired(must);
        setOpen(true);
      } catch {
        /* offline or an old server — stay quiet */
      }
    }

    void check();
    const resume = CapApp.addListener("appStateChange", (state) => {
      if (state.isActive) void check();
    });
    return () => {
      cancelled = true;
      void resume.then((h) => h.remove());
    };
  }, []);

  if (!open) return null;

  function dismiss() {
    if (required) return;
    if (latest) sessionStorage.setItem(DISMISS_KEY, latest);
    setOpen(false);
  }

  return (
    <div className="app-update-backdrop" role="presentation">
      <div
        className="app-update-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-update-title"
      >
        <h2 id="app-update-title" className="app-update-title">
          Update Commons
        </h2>
        <p className="app-update-copy">
          {required
            ? "This version is out of date. Update to keep chatting, posting, and seeing plans."
            : "A newer version is ready. Update so messages and bulletins stay in sync."}
        </p>
        {storeUrl ? (
          <a className="btn-primary btn-block" href={storeUrl}>
            Update
          </a>
        ) : (
          <p className="app-update-copy">Open the App Store and update Commons.</p>
        )}
        {!required && (
          <button type="button" className="btn-link app-update-later" onClick={dismiss}>
            Not now
          </button>
        )}
      </div>
    </div>
  );
}
