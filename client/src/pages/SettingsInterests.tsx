import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../api/http";
import { LoadingScreen } from "../components/LoadingScreen";
import { ScreenTitle } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { interestVisual } from "../lib/interestIcons";
import {
  ALL_INTERESTS,
  INTEREST_LABELS,
  type InterestTag,
  type MeDTO,
} from "../types/shared";

/**
 * Dedicated interests editor. Mirrors onboarding picker with icon wells.
 */
export function SettingsInterestsPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo =
    typeof (location.state as { returnTo?: unknown } | null)?.returnTo === "string"
      ? (location.state as { returnTo: string }).returnTo
      : "/settings";
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
      navigate(returnTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to={returnTo} className="detail-back">
          <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />{" "}
          {returnTo.startsWith("/messages") ? "Messages" : "Settings"}
        </Link>
      </header>
      <ScreenTitle title="Interests" subtitle="Pick what you're into. Your feed does the rest." />

      <div className="vibe-grid settings-interests-grid">
        {ALL_INTERESTS.map((t) => {
          const isPicked = picked.includes(t);
          const { Icon, iconColor, tint } = interestVisual(t);
          return (
            <button
              key={t}
              type="button"
              className={`vibe-tile ${isPicked ? "is-selected" : ""}`}
              onClick={() => toggle(t)}
              aria-pressed={isPicked}
            >
              {isPicked && <span className="vibe-tile-dot" aria-hidden="true" />}
              <span
                className="vibe-tile-icon"
                style={{ background: tint, color: iconColor }}
                aria-hidden="true"
              >
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <span className="vibe-tile-label">{INTEREST_LABELS[t]}</span>
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
