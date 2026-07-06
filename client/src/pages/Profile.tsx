import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import { formatPlanDate } from "../lib/format";
import {
  HOST_TAG_LABELS,
  INTEREST_LABELS,
  type HostTag,
  type InterestTag,
  type MeDTO,
  type PlanDTO,
  type PublicUser,
} from "../types/shared";

interface ProfilePayload {
  user: PublicUser;
  interests: InterestTag[];
  neighborhood: { id: string; name: string; metro: string } | null;
  tagCounts: Record<HostTag, number>;
  stats: { hosted: number; joined: number };
  upcoming: PlanDTO[];
  past: Array<{ id: string; title: string; date: string; wentCount: number }>;
  sharedPlanId: string | null;
  /** Null until viewer earns visibility (shared completed plan or in network). */
  socialLinks: { instagram?: string } | null;
  network: {
    inMyNetwork: boolean;
    mutualCount: number;
    mutuals: PublicUser[];
  };
}

export function ProfilePage() {
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [feedPlans, setFeedPlans] = useState<PlanDTO[]>([]);
  const [network, setNetwork] = useState<PublicUser[] | null>(null);
  const isSelf = user?.id === userId;

  const reloadProfile = () =>
    void api<ProfilePayload>(`/api/profile/${userId}`).then(setProfile).catch(() => setProfile(null));

  useEffect(() => {
    reloadProfile();
  }, [userId]);

  useEffect(() => {
    if (isSelf) {
      void api<PlanDTO[]>("/api/plans").then(setFeedPlans).catch(() => setFeedPlans([]));
    }
  }, [isSelf]);

  useEffect(() => {
    if (!isSelf) return;
    void api<{ users: PublicUser[] }>("/api/auth/network")
      .then((r) => setNetwork(r.users))
      .catch(() => setNetwork([]));
  }, [isSelf, user?.networkUserIds?.length]);

  if (!profile) return <LoadingScreen tagline="Loading profile" />;

  const topTags: Array<[HostTag, number]> = (Object.entries(profile.tagCounts) as Array<[HostTag, number]>)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to="/" className="detail-back">← Back</Link>
      </header>

      <section className="profile-hero">
        <Avatar
          seed={profile.user.avatarSeed}
          style={profile.user.avatarStyle}
          photoDataUrl={profile.user.avatarPhotoDataUrl}
          params={profile.user.avatarParams}
          name={profile.user.firstName}
          size="xl"
        />
        <div className="profile-name">{profile.user.firstName || "Unnamed"}</div>
        {profile.neighborhood && (
          <div className="profile-neighborhood">
            <PinGlyph /> {profile.neighborhood.name}
          </div>
        )}
        {profile.socialLinks?.instagram && (
          <a
            className="profile-social-link"
            href={`https://instagram.com/${profile.socialLinks.instagram}`}
            target="_blank"
            rel="noreferrer"
          >
            @{profile.socialLinks.instagram} on Instagram
          </a>
        )}
        {!isSelf && profile.socialLinks === null && (
          <p className="profile-social-locked">
            Add to your network to see more — face and interests stay public.
          </p>
        )}

        {!isSelf && profile.network.mutualCount > 0 && (
          <div className="profile-mutuals">
            <div className="profile-mutuals-avatars">
              {profile.network.mutuals.map((u) => (
                <Avatar
                  key={u.id}
                  seed={u.avatarSeed}
                  style={u.avatarStyle}
                  photoDataUrl={u.avatarPhotoDataUrl}
                  params={u.avatarParams}
                  name={u.firstName}
                  size="sm"
                />
              ))}
            </div>
            <span className="profile-mutuals-text">
              {profile.network.mutualCount} mutual{profile.network.mutualCount === 1 ? "" : "s"} in your network
            </span>
          </div>
        )}

        <div className="profile-stats" aria-label="Profile stats">
          <div className="profile-stat">
            <span className="profile-stat-num">{profile.stats.hosted}</span>
            <span className="profile-stat-label">hosted</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-num">{profile.stats.joined}</span>
            <span className="profile-stat-label">joined</span>
          </div>
        </div>

        {isSelf && (
          <Link to="/profile/edit" className="btn-secondary" style={{ marginTop: 14 }}>
            Edit profile
          </Link>
        )}

        {!isSelf && (
          <Link
            to={`/plans/new?inviteUser=${encodeURIComponent(profile.user.id)}&inviteName=${encodeURIComponent(profile.user.firstName)}`}
            className="btn-primary btn-block"
            style={{ marginTop: 14, textAlign: "center", display: "block" }}
          >
            Make a plan with {profile.user.firstName}
          </Link>
        )}

        {!isSelf && <FriendButton profile={profile} onUpdated={reloadProfile} />}

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

      {profile.interests.length > 0 && (
        <section className="profile-block">
          <h3 className="who-block-heading">Interests</h3>
          <div className="profile-interests">
            {profile.interests.map((t) => (
              <span key={t} className="profile-interest-chip">
                {INTEREST_LABELS[t]}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* My plans + calendar combined into one view, moved above the menu. */}
      {isSelf && (
        <section className="profile-plans-view">
          <CondensedCalendar plans={feedPlans} />

          {profile.upcoming.length > 0 && (
            <div className="profile-block">
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
            </div>
          )}

          {profile.past.length > 0 && (
            <div className="profile-block">
              <h3 className="who-block-heading">Past plans</h3>
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
            </div>
          )}

          {profile.upcoming.length === 0 && profile.past.length === 0 && (
            <p className="empty-state" style={{ marginTop: 8 }}>
              Plans you host or join will show up here.
            </p>
          )}
        </section>
      )}

      {/* Other people's plans (viewing someone else's profile). */}
      {!isSelf && profile.upcoming.length > 0 && (
        <section className="profile-block">
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
        </section>
      )}
      {!isSelf && profile.past.length > 0 && (
        <section className="profile-block">
          <h3 className="who-block-heading">Past plans</h3>
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
        </section>
      )}

      {/* Menu + Settings sit at the bottom of the profile. */}
      {isSelf && <ProfileMenu networkCount={network?.length ?? null} />}

      {isSelf && (
        <button
          type="button"
          className="settings-signout"
          onClick={async () => {
            sessionStorage.removeItem("commons_pending_admin_choice");
            await api("/api/auth/logout", { method: "POST" });
            setUser(null);
            navigate("/onboarding", { replace: true });
          }}
        >
          <SignOutGlyph />
          Sign out of COMMONS
        </button>
      )}
    </main>
  );
}

function SignOutGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17 5 12l5-5M5 12h11" />
    </svg>
  );
}

function FriendButton({
  profile,
  onUpdated,
}: {
  profile: ProfilePayload;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  const inNet = profile.network.inMyNetwork;

  async function toggle() {
    setBusy(true);
    try {
      const r = await api<{ me: MeDTO }>(
        inNet ? "/api/auth/friend-remove" : "/api/auth/friend-add",
        {
          method: "POST",
          body: JSON.stringify({ userId: profile.user.id }),
        },
      );
      setUser(r.me);
      onUpdated();
    } catch {
      /* swallow */
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={() => void toggle()}
      disabled={busy}
      style={{ marginTop: 10 }}
    >
      {busy ? "…" : inNet ? "In your network" : "Add to network"}
    </button>
  );
}

function CondensedCalendar({ plans }: { plans: PlanDTO[] }) {
  const [expanded, setExpanded] = useState(false);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // Week strip: today + next 6 days
  const week: { iso: string; dow: string; dom: number; isToday: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(year, month, now.getDate() + i);
    week.push({
      iso: d.toISOString().slice(0, 10),
      dow: ["S", "M", "T", "W", "T", "F", "S"][d.getDay()] ?? "",
      dom: d.getDate(),
      isToday: i === 0,
    });
  }
  const byIso = new Map<string, PlanDTO[]>();
  for (const p of plans) {
    const key = p.date.slice(0, 10);
    if (!byIso.has(key)) byIso.set(key, []);
    byIso.get(key)!.push(p);
  }

  return (
    <section className="profile-calendar" aria-label="Your plans">
      <div className="profile-calendar-header">
        <h3 className="who-block-heading">Your plans</h3>
        <button type="button" className="btn-link" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide month" : "Show month"}
        </button>
      </div>
      {!expanded && (
        <div className="profile-week-strip">
          {week.map((d) => {
            const dayPlans = byIso.get(d.iso) ?? [];
            return (
              <div
                key={d.iso}
                className={`profile-week-cell ${dayPlans.length > 0 ? "has-plans" : ""} ${d.isToday ? "is-today" : ""}`}
              >
                <div className="profile-week-dow">{d.dow}</div>
                <div className="profile-week-num">{d.dom}</div>
                {dayPlans.length > 0 && (
                  <div className="profile-week-dot" aria-hidden="true">
                    {dayPlans[0]!.hostEmoji}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {expanded && <MonthCalendar plans={plans} />}
    </section>
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
    <div className="profile-month-calendar" aria-label="Month view">
      <h4 className="profile-month-caption">
        {first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
      </h4>
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
    </div>
  );
}

function ProfileMenu({ networkCount }: { networkCount: number | null }) {
  const countLabel =
    networkCount === null
      ? "Your people"
      : `${networkCount} ${networkCount === 1 ? "person" : "people"}`;
  return (
    <nav className="profile-menu" aria-label="Profile menu">
      <Link to="/network" className="profile-menu-row">
        <span className="profile-menu-icon" aria-hidden="true"><UsersGlyph /></span>
        <span className="profile-menu-text">
          <span className="profile-menu-label">Your network</span>
          <span className="profile-menu-sub">{countLabel}</span>
        </span>
        <ChevronRight />
      </Link>
      <Link to="/invite" className="profile-menu-row">
        <span className="profile-menu-icon" aria-hidden="true"><MailGlyph /></span>
        <span className="profile-menu-text">
          <span className="profile-menu-label">Invite friends</span>
          <span className="profile-menu-sub">Share your codes</span>
        </span>
        <ChevronRight />
      </Link>
      <Link to="/settings" className="profile-menu-row">
        <span className="profile-menu-icon" aria-hidden="true"><GearGlyph /></span>
        <span className="profile-menu-text">
          <span className="profile-menu-label">Settings</span>
          <span className="profile-menu-sub">Notifications, appearance, account</span>
        </span>
        <ChevronRight />
      </Link>
    </nav>
  );
}

function UsersGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function MailGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
function GearGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function PinGlyph() {
  return (
    <svg className="profile-neighborhood-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      className="profile-menu-chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
