import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import {
  ALL_INTERESTS,
  INTEREST_LABELS,
  type InterestTag,
  type MeDTO,
} from "../types/shared";

/**
 * Dedicated interests editor. The old Settings → Interests row linked to the
 * user's profile, which felt like the app was bouncing them somewhere random
 * since the profile doesn't expose interests for editing. This screen mirrors
 * the onboarding picker and saves directly.
 */
export function SettingsInterestsPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<InterestTag[]>(user?.interests ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return <LoadingScreen tagline="Loading interests" />;

  function toggle(t: InterestTag) {
    setPicked((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function save() {
    if (picked.length < 2) {
      setError("Pick at least two so we can shape your feed.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await api<MeDTO>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ interests: picked }),
      });
      setUser(next);
      navigate("/settings");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to="/settings" className="detail-back">← Settings</Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 8 }}>Interests</h1>
      <p className="brand-tagline" style={{ marginBottom: 24 }}>
        Pick what you're into. Your feed does the rest.
      </p>

      <div className="settings-interests-grid">
        {ALL_INTERESTS.map((t) => {
          const isPicked = picked.includes(t);
          return (
            <button
              key={t}
              type="button"
              className={`community-chip ${isPicked ? "is-active" : ""}`}
              onClick={() => toggle(t)}
              aria-pressed={isPicked}
            >
              {INTEREST_LABELS[t]}
            </button>
          );
        })}
      </div>

      {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}

      <button
        type="button"
        className="btn-primary btn-block"
        style={{ marginTop: 16 }}
        disabled={busy || picked.length < 2}
        onClick={() => void save()}
      >
        {busy ? "Saving…" : `Save · ${picked.length} picked`}
      </button>
    </main>
  );
}
