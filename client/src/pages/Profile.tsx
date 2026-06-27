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
  INTEREST_LABELS,
  type InterestTag,
  type MeDTO,
  type PlanDTO,
  type PublicUser,
} from "../types/shared";

interface ProfilePayload {
  user: PublicUser;
  interests: InterestTag[];
  neighborhood: { id: string; name: string; metro: string } | null;
  stats: { hosted: number; joined: number };
  upcoming: PlanDTO[];
  past: Array<{ id: string; title: string; date: string; wentCount: number }>;
  sharedPlanId: string | null;
  /** Null until viewer earns visibility (shared completed plan or in network). */
  socialLinks: { instagram?: string; tiktok?: string } | null;
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

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      {!isSelf && (
        <header className="app-header app-header--minimal">
          <Link to="/" className="detail-back">← Back</Link>
        </header>
      )}

      <section className="profile-hero">
        <div className="profile-hero-top">
          <div className="profile-hero-main">
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
            <div className="profile-hero-text">
              <div className="profile-name">{profile.user.firstName || "Unnamed"}</div>
              {profile.neighborhood && (
                <div className="profile-meta-line">
                  <PinIcon />
                  {profile.neighborhood.name}
                </div>
              )}
            </div>
          </div>
          {isSelf && !editing && (
            <button type="button" className="profile-edit-btn" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
        <SocialPills
          isSelf={isSelf}
          instagram={profile.socialLinks?.instagram}
          tiktok={profile.socialLinks?.tiktok}
          onEdit={() => setEditing(true)}
        />
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

        <div className="profile-divider" />

        <div className="profile-stats" aria-label="Profile stats">
          <div className="profile-stat">
            <span className="profile-stat-num">{profile.stats.hosted}</span>
            <span className="profile-stat-label">Started</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-num">{profile.stats.joined}</span>
            <span className="profile-stat-label">Joined</span>
          </div>
        </div>

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
          <h3 className="profile-section-label">Interests</h3>
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
        <a
          className="settings-feedback"
          href="https://docs.google.com/forms/u/0/d/e/1FAIpQLSfiQUov1e2K9wUlgvIR26Qxnm9MPhQ88MHgophxKS4AClZwZQ/viewform"
          target="_blank"
          rel="noopener noreferrer"
        >
          <FeedbackGlyph />
          <span className="settings-feedback-text">
            Share beta feedback
            <span className="settings-feedback-sub">Tell us what's working and what's not</span>
          </span>
        </a>
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

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="11" height="11">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/**
 * Instagram + TikTok handles rendered as pills. Active pills (handle set) link
 * out; empty pills show just the brand icon. On your own profile empty pills are
 * always shown as a prompt and open the editor; on others' profiles empty pills
 * are hidden — no value in surfacing a stranger's missing handle.
 */
function SocialPills({
  isSelf,
  instagram,
  tiktok,
  onEdit,
}: {
  isSelf: boolean;
  instagram?: string;
  tiktok?: string;
  onEdit: () => void;
}) {
  const items = [
    {
      key: "instagram",
      label: "Instagram",
      handle: instagram,
      href: (h: string) => `https://instagram.com/${h}`,
      Icon: InstagramGlyph,
    },
    {
      key: "tiktok",
      label: "TikTok",
      handle: tiktok,
      href: (h: string) => `https://tiktok.com/@${h}`,
      Icon: TikTokGlyph,
    },
  ];
  const visible = isSelf ? items : items.filter((it) => it.handle);
  if (visible.length === 0) return null;

  return (
    <div className="profile-social-pills">
      {visible.map(({ key, label, handle, href, Icon }) =>
        handle ? (
          <a
            key={key}
            className={`social-pill social-pill--${key} is-active`}
            href={href(handle)}
            target="_blank"
            rel="noreferrer"
            aria-label={`@${handle} on ${label}`}
          >
            <Icon />
            <span className="social-pill-handle">@{handle}</span>
          </a>
        ) : (
          <button
            key={key}
            type="button"
            className={`social-pill social-pill--${key} is-empty`}
            onClick={onEdit}
            aria-label={`Add your ${label}`}
          >
            <Icon />
          </button>
        ),
      )}
    </div>
  );
}

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5.5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37Z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function TikTokGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z" />
    </svg>
  );
}

function FeedbackGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
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
  const [tiktok, setTiktok] = useState(me.socialLinks?.tiktok ?? "");
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
          socialLinks: {
            instagram: instagram.trim().replace(/^@/, ""),
            tiktok: tiktok.trim().replace(/^@/, ""),
          },
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

      <label className="form-question" htmlFor="profile-edit-tt" style={{ marginTop: 14 }}>
        TikTok
      </label>
      <input
        id="profile-edit-tt"
        className="onboarding-input"
        value={tiktok}
        placeholder="@yourhandle"
        onChange={(e) => setTiktok(e.target.value)}
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
              {past.map((p) => (
                // Past events are just a record: title + date. "Do it again"
                // lives on the event page itself, not as a per-row button.
                <Link
                  key={p.id}
                  to={`/plans/${p.id}`}
                  className="profile-list-row profile-list-row--past"
                >
                  <span className="profile-list-title">{p.title}</span>
                  <span className="profile-list-when">{formatPlanDate(p.date)}</span>
                </Link>
              ))}
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
