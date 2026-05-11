import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import { formatPlanDate } from "../lib/format";
import {
  HOST_TAG_LABELS,
  type HostTag,
  type PlanDTO,
  type PublicUser,
} from "../types/shared";

interface ProfilePayload {
  user: PublicUser;
  neighborhood: { id: string; name: string; metro: string } | null;
  tagCounts: Record<HostTag, number>;
  upcoming: PlanDTO[];
  past: Array<{ id: string; title: string; date: string; wentCount: number }>;
  sharedPlanId: string | null;
}

export function ProfilePage() {
  const { userId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [feedPlans, setFeedPlans] = useState<PlanDTO[]>([]);
  const isSelf = user?.id === userId;
  const showCalendar = Boolean(isSelf && searchParams.get("calendar") === "1");

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    navigate("/onboarding", { replace: true });
  };

  useEffect(() => {
    void api<ProfilePayload>(`/api/profile/${userId}`).then(setProfile).catch(() => setProfile(null));
  }, [userId]);

  useEffect(() => {
    if (showCalendar) {
      void api<PlanDTO[]>("/api/plans").then(setFeedPlans).catch(() => setFeedPlans([]));
    }
  }, [showCalendar]);

  if (!profile) return <LoadingScreen tagline="Loading profile" />;

  const topTags: Array<[HostTag, number]> = (Object.entries(profile.tagCounts) as Array<[HostTag, number]>)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <main className="app-shell">
      <header className="app-header">
        <Link to="/" className="detail-back">← Back</Link>
        {isSelf && (
          <button type="button" className="btn-link" onClick={() => void signOut()}>
            Sign out
          </button>
        )}
      </header>

      <section className="profile-hero">
        <Avatar
          seed={profile.user.avatarSeed}
          style={profile.user.avatarStyle}
          photoDataUrl={profile.user.avatarPhotoDataUrl}
          name={profile.user.firstName}
          size="xl"
        />
        <div className="profile-name">{profile.user.firstName}</div>
        {profile.neighborhood && (
          <div className="profile-neighborhood">📍 {profile.neighborhood.name}</div>
        )}

        {topTags.length > 0 && (
          <div className="profile-tags">
            {topTags.map(([tag, count]) => (
              <span key={tag} className="profile-tag">
                {HOST_TAG_LABELS[tag]} ×{count}
              </span>
            ))}
          </div>
        )}

      </section>

      {showCalendar && <MonthCalendar plans={feedPlans} />}

      {profile.upcoming.length > 0 && (
        <>
          <h3 className="who-block-heading">Hosting soon</h3>
          <div className="profile-list">
            {profile.upcoming.map((p) => (
              <Link key={p.id} to={`/plans/${p.id}`} className="profile-list-row">
                <span className="profile-list-emoji">{p.hostEmoji}</span>
                <span className="profile-list-title">{p.title}</span>
                <span className="profile-list-when">{formatPlanDate(p.date)}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {profile.past.length > 0 && (
        <>
          <h3 className="who-block-heading" style={{ marginTop: 18 }}>Past plans</h3>
          <div className="profile-list">
            {profile.past.map((p) => (
              <Link key={p.id} to={`/plans/${p.id}`} className="profile-list-row">
                <span className="profile-list-title">{p.title}</span>
                <span className="profile-list-when">
                  {formatPlanDate(p.date)} · {p.wentCount} went
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function MonthCalendar({ plans }: { plans: PlanDTO[] }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDay = new Map<number, PlanDTO[]>();
  for (const p of plans) {
    const d = new Date(p.date);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const dom = d.getDate();
    if (!byDay.has(dom)) byDay.set(dom, []);
    byDay.get(dom)!.push(p);
  }
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <section className="profile-month-calendar" aria-label="Month view">
      <h3 className="who-block-heading">
        {first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
      </h3>
      <div className="month-cal-grid">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={`${d}-${i}`} className="month-cal-dow">
            {d}
          </div>
        ))}
        {cells.map((dom, i) =>
          dom === null ? (
            <div key={`e-${i}`} className="month-cal-cell month-cal-cell--empty" />
          ) : (
            <div key={dom} className={`month-cal-cell ${byDay.has(dom) ? "has-plans" : ""}`}>
              <span className="month-cal-num">{dom}</span>
              <div className="month-cal-plans">
                {(byDay.get(dom) ?? []).slice(0, 3).map((p) => (
                  <Link key={p.id} to={`/plans/${p.id}`} className="month-cal-dot-plan">
                    <span>{p.hostEmoji}</span> <span className="month-cal-dot-title">{p.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
