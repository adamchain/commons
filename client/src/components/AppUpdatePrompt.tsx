import { useEffect, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { api } from "../api/http";
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
 * Shown on launch when the installed iOS build is behind the version the
 * server is advertising. Dismiss lasts for this app session.
 */
export function AppUpdatePrompt() {
  const [open, setOpen] = useState(false);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;

    async function check() {
      try {
        const [info, release] = await Promise.all([
          CapApp.getInfo(),
          api<{ version: string; storeUrl: string | null }>("/api/app/release"),
        ]);
        if (cancelled) return;
        if (!release.version || compareVersions(info.version, release.version) >= 0) return;
        if (sessionStorage.getItem(DISMISS_KEY) === release.version) return;
        setLatest(release.version);
        setStoreUrl(release.storeUrl);
        setOpen(true);
      } catch {
        /* offline or an old server — stay quiet */
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open) return null;

  function dismiss() {
    if (latest) sessionStorage.setItem(DISMISS_KEY, latest);
    setOpen(false);
  }

  return (
    <div className="app-update-backdrop" role="presentation" onClick={dismiss}>
      <div
        className="app-update-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-update-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="app-update-title" className="app-update-title">Update Commons</h2>
        <p className="app-update-copy">A newer version is ready. Update to keep plans and messages in sync.</p>
        {storeUrl ? (
          <a className="btn-primary btn-block" href={storeUrl}>
            Update
          </a>
        ) : (
          <p className="app-update-copy">Open the App Store and update Commons.</p>
        )}
        <button type="button" className="btn-link app-update-later" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
