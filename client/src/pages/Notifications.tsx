import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import { formatPlanDate } from "../lib/format";
import type { PlanDTO } from "../types/shared";

/**
 * Lightweight notifications surface. Pulled from plans the viewer is part of —
 * shows upcoming you're in, new looking-fors in your interests, and chat-worthy
 * group activity. No server-side feed yet — derives client-side from /api/plans.
 */
export function NotificationsPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanDTO[] | null>(null);

  useEffect(() => {
    void api<PlanDTO[]>("/api/plans").then(setPlans).catch(() => setPlans([]));
  }, []);

  if (plans === null) return <LoadingScreen tagline="Catching up" />;

  const now = Date.now();
  const upcomingMine = plans
    .filter((p) => {
      const future = new Date(p.date).getTime() > now - 12 * 60 * 60 * 1000;
      return future && (p.myState === "going" || p.creator.id === user?.id);
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);

  const interestedIn = plans
    .filter((p) => p.myState === "interested")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);

  const newLookingFor = plans
    .filter((p) => p.planKind === "looking_for" && !p.lockedAt && p.myState === null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  const empty =
    upcomingMine.length === 0 && interestedIn.length === 0 && newLookingFor.length === 0;

  return (
    <main className="app-shell app-shell--mid app-shell--with-nav app-shell--with-topbar">
      <h1 className="brand" style={{ marginBottom: 18 }}>
        Notifications
      </h1>

      {empty && (
        <p className="empty-state">Nothing new — you're all caught up.</p>
      )}

      {upcomingMine.length > 0 && (
        <NotifSection title="Upcoming for you">
          {upcomingMine.map((p) => (
            <Link key={p.id} to={`/plans/${p.id}`} className="notif-row">
              <Avatar
                seed={p.creator.avatarSeed}
                style={p.creator.avatarStyle}
                photoDataUrl={p.creator.avatarPhotoDataUrl}
                params={p.creator.avatarParams}
                name={p.creator.firstName}
                size="sm"
              />
              <div className="notif-row-body">
                <div className="notif-row-title">{p.title}</div>
                <div className="notif-row-sub">{formatPlanDate(p.date)}</div>
              </div>
              <span className="notif-row-tag">You're in</span>
            </Link>
          ))}
        </NotifSection>
      )}

      {interestedIn.length > 0 && (
        <NotifSection title="Plans you're interested in">
          {interestedIn.map((p) => (
            <Link key={p.id} to={`/plans/${p.id}`} className="notif-row">
              <Avatar
                seed={p.creator.avatarSeed}
                style={p.creator.avatarStyle}
                photoDataUrl={p.creator.avatarPhotoDataUrl}
                params={p.creator.avatarParams}
                name={p.creator.firstName}
                size="sm"
              />
              <div className="notif-row-body">
                <div className="notif-row-title">{p.title}</div>
                <div className="notif-row-sub">{formatPlanDate(p.date)}</div>
              </div>
              <span className="notif-row-tag notif-row-tag--muted">Interested</span>
            </Link>
          ))}
        </NotifSection>
      )}

      {newLookingFor.length > 0 && (
        <NotifSection title="New looking-fors">
          {newLookingFor.map((p) => (
            <Link key={p.id} to={`/plans/${p.id}`} className="notif-row">
              <Avatar
                seed={p.creator.avatarSeed}
                style={p.creator.avatarStyle}
                photoDataUrl={p.creator.avatarPhotoDataUrl}
                params={p.creator.avatarParams}
                name={p.creator.firstName}
                size="sm"
              />
              <div className="notif-row-body">
                <div className="notif-row-title">{p.title}</div>
                <div className="notif-row-sub">{p.creator.firstName} posted</div>
              </div>
            </Link>
          ))}
        </NotifSection>
      )}
    </main>
  );
}

function NotifSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="notif-section">
      <h2 className="section-title">{title}</h2>
      <div className="notif-list">{children}</div>
    </section>
  );
}
