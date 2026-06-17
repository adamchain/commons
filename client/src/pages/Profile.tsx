import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/http";
import { clearAuthToken } from "../api/authToken";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import { formatPlanDate } from "../lib/format";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
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
    requestSent?: boolean;
    requestReceived?: boolean;
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
  const [editing, setEditing] = useState(false);
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
        {isSelf ? (
          <button
            type="button"
            className="profile-hero-avatar-btn"
            onClick={() => setEditing(true)}
            aria-label="Update profile photo"
          >
            <Avatar
              seed={profile.user.avatarSeed}
              style={profile.user.avatarStyle}
              photoDataUrl={profile.user.avatarPhotoDataUrl}
              params={profile.user.avatarParams}
              name={profile.user.firstName}
              size="xl"
            />
            <span className="profile-hero-avatar-edit" aria-hidden="true">✎</span>
          </button>
        ) : (
          <Avatar
            seed={profile.user.avatarSeed}
            style={profile.user.avatarStyle}
            photoDataUrl={profile.user.avatarPhotoDataUrl}
            params={profile.user.avatarParams}
            name={profile.user.firstName}
            size="xl"
          />
        )}
        <div className="profile-name">{profile.user.firstName || "Unnamed"}</div>
        {/* Age + location on a single line directly under the name/photo. Age is
            not captured at signup yet — it slots in here once a birthdate field
            is added; until then we show location alone. */}
        {profile.neighborhood && (
          <div className="profile-meta-line">📍 {profile.neighborhood.name}</div>
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
            <span className="profile-stat-label">started</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-num">{profile.stats.joined}</span>
            <span className="profile-stat-label">joined</span>
          </div>
        </div>

        {isSelf && !editing && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setEditing(true)}
            style={{ marginTop: 14 }}
          >
            Edit profile
          </button>
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

      {isSelf && editing && user && (
        <EditPanel
          me={user}
          onSaved={(me) => {
            setUser(me);
            reloadProfile();
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}

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

      {isSelf && <ProfileMenu network={network} />}

      {(profile.upcoming.length > 0 || profile.past.length > 0) && (
        <YourPlansBlock
          upcoming={profile.upcoming}
          past={profile.past}
          isSelf={isSelf}
          viewerId={user?.id}
          calendarPlans={isSelf ? feedPlans : profile.upcoming}
        />
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

      {isSelf && (
        <button
          type="button"
          className="settings-signout"
          onClick={async () => {
            sessionStorage.removeItem("commons_pending_admin_choice");
            await api("/api/auth/logout", { method: "POST" });
            await clearAuthToken();
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
  const requestSent = profile.network.requestSent ?? false;
  const requestReceived = profile.network.requestReceived ?? false;

  async function call(path: string) {
    setBusy(true);
    try {
      const r = await api<{ me: MeDTO }>(path, {
        method: "POST",
        body: JSON.stringify({ userId: profile.user.id }),
      });
      setUser(r.me);
      onUpdated();
    } catch {
      /* swallow */
    } finally {
      setBusy(false);
    }
  }

  // Connected — show status + explicit remove.
  if (inNet) {
    return (
      <div className="friend-button-connected" style={{ marginTop: 10 }}>
        <span className="friend-connected-pill">✓ In your network</span>
        <button
          type="button"
          className="btn-link friend-remove-btn"
          onClick={() => void call("/api/auth/friend-remove")}
          disabled={busy}
        >
          {busy ? "…" : "Remove from network"}
        </button>
      </div>
    );
  }

  // They requested you — show Accept / Decline.
  if (requestReceived) {
    return (
      <div className="friend-button-connected" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn-primary"
          onClick={() => void call("/api/auth/network-accept")}
          disabled={busy}
        >
          {busy ? "…" : "Accept request"}
        </button>
        <button
          type="button"
          className="btn-link friend-remove-btn"
          onClick={() => void call("/api/auth/network-decline")}
          disabled={busy}
        >
          Decline
        </button>
      </div>
    );
  }

  // You already requested them — pending.
  if (requestSent) {
    return (
      <button type="button" className="btn-secondary" disabled style={{ marginTop: 10 }}>
        Request sent
      </button>
    );
  }

  // No relationship yet — send a request.
  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={() => void call("/api/auth/friend-add")}
      disabled={busy}
      style={{ marginTop: 10 }}
    >
      {busy ? "…" : "Add to network"}
    </button>
  );
}

function EditPanel({
  me,
  onSaved,
  onCancel,
}: {
  me: MeDTO;
  onSaved: (next: MeDTO) => void;
  onCancel: () => void;
}) {
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
            onClick={async () => {
              if (isNative()) {
                try {
                  const dataUrl = await pickPhotoNative({ maxPx: 512, quality: 0.82 });
                  if (dataUrl) pickPhoto(dataUrl);
                } catch {
                  /* user canceled */
                }
                return;
              }
              fileRef.current?.click();
            }}
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

      <p className="profile-emoji-label" style={{ marginTop: 12 }}>Or pick an avatar</p>
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

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          type="button"
          className="btn-secondary"
          style={{ flex: 1 }}
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          style={{ flex: 2 }}
          disabled={busy || !firstName.trim()}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
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

/**
 * Combined "Your Plans" section — upcoming (collapsed to 3, "Show X more"),
 * then a Past accordion. Upcoming rows tag each plan with YOUR PLAN (you
 * started it) or INTERESTED so users see at a glance what their relationship
 * to each plan is. Past rows tag HOSTED or WENT.
 */
function YourPlansBlock({
  upcoming,
  past,
  isSelf,
  viewerId,
  calendarPlans,
}: {
  upcoming: PlanDTO[];
  past: Array<{ id: string; title: string; date: string; wentCount: number }>;
  isSelf: boolean;
  viewerId: string | undefined;
  calendarPlans: PlanDTO[];
}) {
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  // List is the default; calendar is an opt-in toggle (not the default view).
  const [view, setView] = useState<"list" | "calendar">("list");
  const visibleUpcoming = upcomingExpanded ? upcoming : upcoming.slice(0, 3);
  const hiddenCount = Math.max(0, upcoming.length - visibleUpcoming.length);
  return (
    <section className="profile-block">
      <div className="profile-block-heading-row">
        <h3 className="who-block-heading">{isSelf ? "Your plans" : "Plans"}</h3>
        <div className="profile-plans-toggle" role="tablist" aria-label="Plans view">
          <button
            type="button"
            role="tab"
            aria-selected={view === "list"}
            className={view === "list" ? "is-active" : ""}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "calendar"}
            className={view === "calendar" ? "is-active" : ""}
            onClick={() => setView("calendar")}
          >
            Calendar
          </button>
        </div>
      </div>

      {view === "calendar" ? (
        <>
          <MonthCalendar plans={calendarPlans} />
          {isSelf && (
            <Link to="/my-plans" className="btn-link profile-block-see-all" style={{ display: "inline-block", marginTop: 10 }}>
              See all →
            </Link>
          )}
        </>
      ) : (
      <>
      {isSelf && (
        <Link to="/my-plans" className="btn-link profile-block-see-all">
          See all →
        </Link>
      )}
      <div className="profile-list">
        {visibleUpcoming.map((p) => {
          const youStarted = viewerId !== undefined && p.creator.id === viewerId;
          const badge = youStarted ? "YOUR PLAN" : "INTERESTED";
          return (
            <Link
              key={p.id}
              to={`/plans/${p.id}`}
              className={`profile-list-row ${youStarted ? "profile-list-row--hosting" : ""}`}
            >
              <span className="profile-list-emoji">{p.hostEmoji}</span>
              <span className="profile-list-title">{p.title}</span>
              <span className="profile-list-when">{formatPlanDate(p.date)}</span>
              <span className={`profile-list-badge ${youStarted ? "is-host" : "is-interested"}`}>
                {badge}
              </span>
            </Link>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          className="profile-list-show-more"
          onClick={() => setUpcomingExpanded(true)}
        >
          Show {hiddenCount} more
        </button>
      )}
      {upcomingExpanded && upcoming.length > 3 && (
        <button
          type="button"
          className="profile-list-show-more"
          onClick={() => setUpcomingExpanded(false)}
        >
          Show less
        </button>
      )}

      {past.length > 0 && (
        <>
          <button
            type="button"
            className="profile-past-toggle"
            aria-expanded={pastOpen}
            onClick={() => setPastOpen((v) => !v)}
          >
            <span>Past · {past.length}</span>
            <span className={`profile-past-chevron ${pastOpen ? "is-open" : ""}`}>›</span>
          </button>
          {pastOpen && (
            <div className="profile-list profile-list--past-group">
              {past.map((p) => {
                // Past payload doesn't carry creatorId today; treat any plan in
                // your past list with wentCount > 0 as something you went to,
                // and rely on the server to scope "hosted" via a future field.
                // For now the badge defaults to WENT.
                const badge = "WENT";
                return (
                  <div key={p.id} className="profile-list-row profile-list-row--past">
                    <Link to={`/plans/${p.id}`} className="profile-list-row-main">
                      <span className="profile-list-title">{p.title}</span>
                      <span className="profile-list-when">
                        {formatPlanDate(p.date)} · {p.wentCount} went
                      </span>
                      <span className="profile-list-badge is-past">{badge}</span>
                    </Link>
                    <Link
                      to={`/plans/new?title=${encodeURIComponent(p.title)}`}
                      className="btn-link profile-do-again"
                      title="Plan this again"
                    >
                      🔁 Again
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      </>
      )}
    </section>
  );
}

function ProfileMenu({ network }: { network: PublicUser[] | null }) {
  const networkCount = network?.length ?? null;
  const firstFive = (network ?? []).slice(0, 5);
  const countLabel =
    networkCount === null
      ? "Your people"
      : `${networkCount} ${networkCount === 1 ? "person" : "people"}`;
  return (
    <nav className="profile-menu" aria-label="Profile menu">
      <Link to="/network" className="profile-menu-row profile-menu-row--with-stack">
        <span className="profile-menu-icon" aria-hidden="true">👥</span>
        <span className="profile-menu-text">
          <span className="profile-menu-label">Your network</span>
          <span className="profile-menu-sub">{countLabel}</span>
        </span>
        {firstFive.length > 0 && (
          <span className="profile-menu-avatar-stack avatar-stack avatar-stack--md">
            {firstFive.map((u) => (
              <Avatar
                key={u.id}
                seed={u.avatarSeed}
                style={u.avatarStyle}
                photoDataUrl={u.avatarPhotoDataUrl}
                params={u.avatarParams}
                size="xs"
              />
            ))}
          </span>
        )}
        <ChevronRight />
      </Link>
      <Link to="/invite" className="profile-menu-row">
        <span className="profile-menu-icon" aria-hidden="true">✉️</span>
        <span className="profile-menu-text">
          <span className="profile-menu-label">Invite friends</span>
          <span className="profile-menu-sub">Share your codes</span>
        </span>
        <ChevronRight />
      </Link>
      <Link to="/settings" className="profile-menu-row">
        <span className="profile-menu-icon" aria-hidden="true">⚙️</span>
        <span className="profile-menu-text">
          <span className="profile-menu-label">Settings</span>
          <span className="profile-menu-sub">Interests, notifications, invite codes, account</span>
        </span>
        <ChevronRight />
      </Link>
    </nav>
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
