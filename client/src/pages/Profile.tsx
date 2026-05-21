import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { formatPlanDate } from "../lib/format";
import { fileToResizedDataUrl } from "../lib/imageResize";
import {
  AVATAR_PRESETS,
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
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [feedPlans, setFeedPlans] = useState<PlanDTO[]>([]);
  const [editing, setEditing] = useState(false);
  const isSelf = user?.id === userId;

  const reloadProfile = () =>
    void api<ProfilePayload>(`/api/profile/${userId}`).then(setProfile).catch(() => setProfile(null));

  const signOut = async () => {
    sessionStorage.removeItem("commons_pending_admin_choice");
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    navigate("/onboarding", { replace: true });
  };

  useEffect(() => {
    reloadProfile();
  }, [userId]);

  useEffect(() => {
    if (isSelf) {
      void api<PlanDTO[]>("/api/plans").then(setFeedPlans).catch(() => setFeedPlans([]));
    }
  }, [isSelf]);

  if (!profile) return <LoadingScreen tagline="Loading profile" />;

  const topTags: Array<[HostTag, number]> = (Object.entries(profile.tagCounts) as Array<[HostTag, number]>)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <main className="app-shell app-shell--with-nav">
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
          <div className="profile-neighborhood">📍 {profile.neighborhood.name}</div>
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
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setEditing((v) => !v)}
            style={{ marginTop: 14 }}
          >
            {editing ? "Done editing" : "Edit profile"}
          </button>
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

      {isSelf && editing && user && (
        <EditPanel
          me={user}
          onSaved={(me) => {
            setUser(me);
            reloadProfile();
          }}
        />
      )}

      {profile.interests.length > 0 && (
        <section className="profile-block">
          <h3 className="who-block-heading">Communities</h3>
          <div className="profile-interests">
            {profile.interests.map((t) => (
              <span key={t} className="profile-interest-chip">
                {INTEREST_LABELS[t]}
              </span>
            ))}
          </div>
        </section>
      )}

      {isSelf && <InviteCard firstName={user?.firstName ?? "a friend"} />}

      {isSelf && <CondensedCalendar plans={feedPlans} />}

      {isSelf && user?.canAccessAdmin && (
        <section className="profile-block">
          <Link to="/admin" className="btn-secondary btn-block" style={{ textAlign: "center", display: "block" }}>
            Admin dashboard
          </Link>
        </section>
      )}

      {isSelf && <SettingsPanel onSignOut={() => void signOut()} />}

      {profile.upcoming.length > 0 && (
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

      {profile.past.length > 0 && (
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

      {profile.upcoming.length === 0 && profile.past.length === 0 && (
        <section className="profile-block">
          <p className="empty-state" style={{ marginTop: 8 }}>
            {isSelf ? "Post a plan from your profile." : "No plans yet."}
          </p>
          {isSelf && (
            <Link to="/plans/new" className="btn-primary" style={{ marginTop: 12, display: "inline-block" }}>
              Post a plan
            </Link>
          )}
        </section>
      )}
    </main>
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
      className={inNet ? "btn-secondary" : "btn-primary"}
      onClick={() => void toggle()}
      disabled={busy}
      style={{ marginTop: 14 }}
    >
      {busy ? "…" : inNet ? "In your network" : "Add to network"}
    </button>
  );
}

function EditPanel({ me, onSaved }: { me: MeDTO; onSaved: (next: MeDTO) => void }) {
  const [firstName, setFirstName] = useState(me.firstName);
  const [photo, setPhoto] = useState<string | null>(me.avatarPhotoDataUrl ?? null);
  const [avatarParams, setAvatarParams] = useState<string | null>(me.avatarParams ?? null);
  const [instagram, setInstagram] = useState(me.socialLinks?.instagram ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickPhoto(dataUrl: string) {
    setPhoto(dataUrl);
    setAvatarParams(null);
  }
  function pickPreset(params: string) {
    setAvatarParams((cur) => (cur === params ? null : params));
    if (avatarParams !== params) setPhoto(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const next = await api<MeDTO>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: firstName.trim(),
          avatarPhotoDataUrl: photo ?? null,
          avatarParams: avatarParams ?? null,
          socialLinks: { instagram: instagram.trim().replace(/^@/, "") },
        }),
      });
      onSaved(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="profile-edit-panel">
      <label className="form-question" htmlFor="profile-edit-name">
        Your name
      </label>
      <input
        id="profile-edit-name"
        className="onboarding-input"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        maxLength={40}
      />

      <label className="form-question" style={{ marginTop: 14 }}>
        Profile image
      </label>
      <p className="form-help">Upload a photo or pick a character below — one or the other.</p>

      <div className="profile-edit-photo-row">
        <Avatar
          seed={me.avatarSeed}
          style={me.avatarStyle}
          photoDataUrl={photo ?? undefined}
          params={avatarParams ?? undefined}
          name={firstName.trim() || undefined}
          size="lg"
        />
        <div className="profile-edit-photo-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileRef.current?.click()}
          >
            {photo ? "Replace photo" : "Upload photo"}
          </button>
          {(photo || avatarParams) && (
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setPhoto(null);
                setAvatarParams(null);
              }}
            >
              Remove
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              fileToResizedDataUrl(f)
                .then(pickPhoto)
                .catch(() => setError("Couldn't read that image. Try another."));
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
        </div>
      </div>

      <p className="profile-emoji-label" style={{ marginTop: 12 }}>Or pick a character</p>
      <div className="profile-preset-grid">
        {AVATAR_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`profile-preset-pick ${avatarParams === p.params ? "is-selected" : ""}`}
            onClick={() => pickPreset(p.params)}
            aria-pressed={avatarParams === p.params}
            aria-label={p.label}
            title={p.label}
          >
            <Avatar seed={me.avatarSeed} style="avataaars" params={p.params} size="md" />
          </button>
        ))}
      </div>

      <label className="form-question" htmlFor="profile-edit-ig" style={{ marginTop: 14 }}>
        Instagram
      </label>
      <p className="form-help">
        Only visible to people you’ve actually shown up for — others have to share
        a completed plan with you first.
      </p>
      <input
        id="profile-edit-ig"
        className="onboarding-input"
        value={instagram}
        placeholder="@yourhandle"
        onChange={(e) => setInstagram(e.target.value)}
        maxLength={40}
      />

      {error && <p className="onboarding-error" style={{ marginTop: 8 }}>{error}</p>}

      <button
        type="button"
        className="btn-primary btn-block"
        style={{ marginTop: 16 }}
        disabled={busy || !firstName.trim()}
        onClick={() => void save()}
      >
        {busy ? "Saving…" : "Save changes"}
      </button>
    </section>
  );
}

/**
 * Light-layer friend invite — opens the OS share sheet (native share) or
 * falls back to a prefilled SMS deep link. No server invite tracking yet —
 * the link just points at the public landing, and after the friend signs up
 * the post-event network prompt is the path to add each other in-app.
 */
function InviteCard({ firstName }: { firstName: string }) {
  const inviteUrl = `${window.location.origin}/`;
  const body = `${firstName} invited you to Commons — neighborhood plans, no pressure. ${inviteUrl}`;

  async function share() {
    const data = { title: "Join me on Commons", text: body, url: inviteUrl };
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (typeof nav.share === "function") {
      try {
        await nav.share(data);
        return;
      } catch {
        // user canceled — silently fall through
      }
    }
    window.location.href = `sms:?&body=${encodeURIComponent(body)}`;
  }

  return (
    <section className="profile-block profile-invite-card">
      <h3 className="who-block-heading">Bring your people</h3>
      <p className="profile-invite-body">
        Want to plan something with a friend who isn’t here yet? Send them an
        invite — once they’re on, you can add each other to your network.
      </p>
      <button type="button" className="btn-secondary btn-block" onClick={() => void share()}>
        Invite a friend by text
      </button>
    </section>
  );
}

function SettingsPanel({ onSignOut }: { onSignOut: () => void }) {
  const { theme } = useTheme();
  return (
    <section className="profile-block profile-settings">
      <h3 className="who-block-heading">Settings</h3>
      <div className="profile-settings-row">
        <div>
          <div className="profile-settings-label">Appearance</div>
          <div className="profile-settings-sub">{theme === "dark" ? "Dark" : "Light"} mode</div>
        </div>
        <ThemeToggle />
      </div>
      <div className="profile-settings-row">
        <div>
          <div className="profile-settings-label">Account</div>
          <div className="profile-settings-sub">Sign out of COMMONS</div>
        </div>
        <button type="button" className="btn-link" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </section>
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
