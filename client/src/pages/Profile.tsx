import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Ban,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  Flag,
  Leaf,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Palette,
  Share2,
  UserPlus,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { formatPlanDate, formatPlanTime } from "../lib/format";
import { interestVisual } from "../lib/interestIcons";
import { hrefForBack, type NavFromState } from "../lib/navState";
import {
  COMMUNITY_CATEGORY_LABELS,
  INTEREST_LABELS,
  type CommunityCardDTO,
  type CommunityCategory,
  type InterestTag,
  type MeDTO,
  type PlanDTO,
  type PublicUser,
} from "../types/shared";

const COMMUNITY_VISUAL: Record<CommunityCategory, { Icon: LucideIcon; iconColor: string; tint: string }> = {
  run_club: { Icon: Activity, iconColor: "#5B8FBF", tint: "#C8DCF0" },
  book_club: { Icon: BookOpen, iconColor: "#7A5BA0", tint: "#D8D0F0" },
  fitness: { Icon: Activity, iconColor: "#5B8FBF", tint: "#C8DCF0" },
  food_drink: { Icon: UtensilsCrossed, iconColor: "#8A6A2A", tint: "#F5DDBB" },
  arts: { Icon: Palette, iconColor: "#A05B5B", tint: "#F0D8D8" },
  social: { Icon: Users, iconColor: "#A05B5B", tint: "#F0D8D8" },
  wellness: { Icon: Leaf, iconColor: "#7A8F6A", tint: "#D4E0CC" },
  other: { Icon: Users, iconColor: "#8A8A9A", tint: "#EDE5D8" },
};

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
  /** True when upcoming/past plans are hidden until viewer adds this person. */
  plansGated?: boolean;
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
  const location = useLocation();
  const navigate = useNavigate();
  const navFrom = (location.state as NavFromState | null) ?? null;
  const backHref = hrefForBack(navFrom);
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [network, setNetwork] = useState<PublicUser[] | null>(null);
  const [communities, setCommunities] = useState<CommunityCardDTO[]>([]);
  const [plansView, setPlansView] = useState<"list" | "calendar">("list");
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const isSelf = user?.id === userId;

  const reloadProfile = () =>
    void api<ProfilePayload>(`/api/profile/${userId}`).then(setProfile).catch(() => setProfile(null));

  useEffect(() => {
    reloadProfile();
    setPlansView("list");
  }, [userId, location.pathname, location.key]);

  // Refetch when returning to the tab so joins show up without a hard reload.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") reloadProfile();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [userId]);

  useEffect(() => {
    if (isSelf) {
      void api<{ communities: CommunityCardDTO[] }>("/api/communities/mine")
        .then((r) => setCommunities(r.communities))
        .catch(() => setCommunities([]));
    }
  }, [isSelf]);

  useEffect(() => {
    if (!isSelf) return;
    void api<{ users: PublicUser[] }>("/api/auth/network")
      .then((r) => setNetwork(r.users))
      .catch(() => setNetwork([]));
  }, [isSelf, user?.networkUserIds?.length]);

  if (!profile) {
    return (
      <main className="app-shell app-shell--with-nav app-shell--with-topbar profile-shell">
        <div className="feed-skeleton" aria-hidden="true">
          <div className="feed-skeleton-card" />
        </div>
      </main>
    );
  }

  const displayName = [profile.user.firstName, profile.user.lastName].filter(Boolean).join(" ") || "Unnamed";
  const firstName = profile.user.firstName || "them";
  const locationLabel = profile.neighborhood
    ? [profile.neighborhood.name, profile.neighborhood.metro].filter(Boolean).join(" · ")
    : null;

  async function shareProfile() {
    const url = `${window.location.origin}/profile/${userId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: displayName, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* dismissed */
    }
    setActionSheetOpen(false);
  }

  async function reportProfile() {
    setActionSheetOpen(false);
    window.location.href = `mailto:safety@oncommons.co?subject=${encodeURIComponent(`Report ${displayName}`)}&body=${encodeURIComponent(`I'd like to report this profile:\n${window.location.href}`)}`;
  }

  async function blockFromSheet() {
    setActionSheetOpen(false);
    const name = firstName || "this person";
    const targetId = profile?.user.id;
    if (!targetId) return;
    if (
      !window.confirm(
        `Block ${name}? They won't be able to see your plans or profile, and you won't see theirs.`,
      )
    ) {
      return;
    }
    try {
      await api(`/api/users/${targetId}/block`, { method: "POST" });
      navigate("/", { replace: true });
    } catch {
      /* swallow */
    }
  }

  if (!isSelf) {
    const mutuals = profile.network.mutuals;
    const mutualLabel = (() => {
      if (mutuals.length === 0) return null;
      if (mutuals.length === 1) {
        return (
          <>
            Connected to <span className="profile-mutuals-name">{mutuals[0].firstName}</span> you know
          </>
        );
      }
      const rest = profile.network.mutualCount - 1;
      return (
        <>
          Connected to <span className="profile-mutuals-name">{mutuals[0].firstName}</span>
          {rest > 0 && (
            <>
              {" "}and {rest} other{rest === 1 ? "" : "s"} you know
            </>
          )}
        </>
      );
    })();

    return (
      <main className="app-shell app-shell--with-nav app-shell--with-topbar profile-shell profile-other">
        <header className="profile-other-nav">
          <Link to={backHref} className="profile-other-back">
            <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
            Back
          </Link>
          <button
            type="button"
            className="profile-other-more"
            aria-label="More options"
            onClick={() => setActionSheetOpen(true)}
          >
            <MoreHorizontal size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>

        <section className="profile-other-hero">
          <div className="profile-other-hero-row">
            <div className="profile-other-avatar">
              <Avatar
                seed={profile.user.avatarSeed}
                style={profile.user.avatarStyle}
                photoDataUrl={profile.user.avatarPhotoDataUrl}
                params={profile.user.avatarParams}
                name={profile.user.firstName}
                size="lg"
              />
            </div>
            <div className="profile-other-hero-text">
              <div className="profile-other-name">{displayName}</div>
              {locationLabel && (
                <div className="profile-other-location">
                  <MapPin size={11} strokeWidth={1.8} aria-hidden="true" />
                  {locationLabel}
                </div>
              )}
              <div className="profile-other-stats" aria-label="Profile stats">
                <div className="profile-other-stat">
                  <span className="profile-other-stat-num">{profile.stats.hosted}</span>
                  <span className="profile-other-stat-label">Made</span>
                </div>
                <span className="profile-other-stat-divider" aria-hidden="true" />
                <div className="profile-other-stat">
                  <span className="profile-other-stat-num">{profile.stats.joined}</span>
                  <span className="profile-other-stat-label">Joined</span>
                </div>
              </div>
            </div>
          </div>

          <div className="profile-other-ctas">
            <FriendButton profile={profile} onUpdated={reloadProfile} variant="other" />
            <Link
              to={
                profile.sharedPlanId
                  ? `/plans/${profile.sharedPlanId}/chat`
                  : `/plans/new?inviteUser=${encodeURIComponent(profile.user.id)}&inviteName=${encodeURIComponent(profile.user.firstName)}`
              }
              state={profile.sharedPlanId ? { from: "profile", profileUserId: userId } : undefined}
              className="profile-other-cta profile-other-cta--message"
            >
              <MessageCircle size={13} strokeWidth={1.8} aria-hidden="true" />
              Message
            </Link>
          </div>

          {profile.network.mutualCount > 0 && mutualLabel && (
            <div className="profile-other-mutuals">
              <div className="profile-other-mutuals-avatars">
                {mutuals.map((u) => (
                  <span key={u.id} className="profile-other-mutuals-avatar">
                    <Avatar
                      seed={u.avatarSeed}
                      style={u.avatarStyle}
                      photoDataUrl={u.avatarPhotoDataUrl}
                      params={u.avatarParams}
                      name={u.firstName}
                      size="sm"
                    />
                  </span>
                ))}
              </div>
              <span className="profile-other-mutuals-text">{mutualLabel}</span>
            </div>
          )}
        </section>

        <div className="profile-other-divider" />

        {profile.plansGated ? (
          <section className="profile-other-section">
            <h3 className="profile-other-section-label">Upcoming plans</h3>
            <p className="profile-social-locked">
              Add to your network to see their plans — photo and interests stay public.
            </p>
          </section>
        ) : profile.upcoming.length > 0 ? (
          <section className="profile-other-section">
            <div className="profile-other-section-head">
              <h3 className="profile-other-section-label">Upcoming plans</h3>
              <span className="profile-other-section-count">
                {profile.upcoming.length} plan{profile.upcoming.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="profile-other-plans">
              {profile.upcoming.map((p) => {
                const vis = interestVisual(p.tags[0]);
                const Icon = vis.Icon;
                const going = p.participants.going.length;
                return (
                  <Link
                    key={p.id}
                    to={`/plans/${p.id}`}
                    state={{ from: "profile", profileUserId: userId }}
                    className="profile-other-plan-card"
                  >
                    <span
                      className="profile-other-plan-icon"
                      style={{ background: vis.tint, color: vis.iconColor }}
                      aria-hidden="true"
                    >
                      <Icon size={15} strokeWidth={1.8} />
                    </span>
                    <span className="profile-other-plan-body">
                      <span className="profile-other-plan-title">{p.title}</span>
                      <span className="profile-other-plan-date">
                        {formatPlanDate(p.date)}
                        {p.time ? ` · ${formatPlanTime(p.time, p.isFlexibleTime)}` : ""}
                      </span>
                    </span>
                    <span className="profile-other-plan-going">
                      <Users size={11} strokeWidth={1.8} aria-hidden="true" />
                      {going}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {profile.interests.length > 0 && (
          <>
            <div className="profile-other-divider" />
            <section className="profile-other-section">
              <h3 className="profile-other-section-label">Interests</h3>
              <div className="profile-interests">
                {profile.interests.map((t) => (
                  <span key={t} className="profile-interest-chip">
                    {INTEREST_LABELS[t]}
                  </span>
                ))}
              </div>
            </section>
          </>
        )}

        {communities.length > 0 && (
          <>
            <div className="profile-other-divider" />
            <section className="profile-other-section">
              <h3 className="profile-other-section-label">Communities</h3>
              <div className="profile-other-communities">
                {communities.map((c) => {
                  const vis = COMMUNITY_VISUAL[c.category] || COMMUNITY_VISUAL.other;
                  const Icon = vis?.Icon;
                  return (
                    <Link key={c.id} to={`/communities/${c.id}`} className="profile-other-community-row">
                      <span
                        className="profile-other-community-icon"
                        style={{ background: vis.tint, color: vis.iconColor }}
                        aria-hidden="true"
                      >
                        <Icon size={13} strokeWidth={1.8} />
                      </span>
                      <span className="profile-other-community-info">
                        <span className="profile-other-community-name">{c.name}</span>
                        <span className="profile-other-community-meta">
                          {COMMUNITY_CATEGORY_LABELS[c.category]} · {c.memberCount}{" "}
                          {c.memberCount === 1 ? "member" : "members"}
                        </span>
                      </span>
                      <ChevronRight size={13} strokeWidth={1.6} className="profile-other-community-chevron" aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {actionSheetOpen && (
          <div
            className="profile-action-overlay"
            role="presentation"
            onClick={() => setActionSheetOpen(false)}
          >
            <div
              className="profile-action-sheet"
              role="dialog"
              aria-label="Profile actions"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="profile-action-handle" aria-hidden="true" />
              <button type="button" className="profile-action-row" onClick={() => void shareProfile()}>
                <Share2 size={16} strokeWidth={1.8} aria-hidden="true" />
                Share profile
              </button>
              <button type="button" className="profile-action-row is-danger" onClick={() => void reportProfile()}>
                <Flag size={16} strokeWidth={1.8} aria-hidden="true" />
                Report {firstName}
              </button>
              <button type="button" className="profile-action-row is-danger" onClick={() => void blockFromSheet()}>
                <Ban size={16} strokeWidth={1.8} aria-hidden="true" />
                Block {firstName}
              </button>
              <button
                type="button"
                className="profile-action-cancel"
                onClick={() => setActionSheetOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar profile-shell">
      <section className="profile-hero">
        <div className="profile-hero-top">
          <div className="profile-hero-main">
            <Link
              to={`/profile/${userId}/edit`}
              className="profile-hero-avatar-btn"
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
              <span className="profile-hero-avatar-edit" aria-hidden="true">
                <Camera size={12} strokeWidth={2} />
              </span>
            </Link>
            <div className="profile-hero-text">
              <div className="profile-name">{displayName}</div>
              {profile.user.bio && (
                <p className="profile-bio">{profile.user.bio}</p>
              )}
              {profile.neighborhood && (
                <div className="profile-meta-line">
                  <MapPin size={11} strokeWidth={1.8} aria-hidden="true" />
                  {profile.neighborhood.name}
                </div>
              )}
              <div className="profile-stats profile-stats--inline" aria-label="Profile stats">
                <div className="profile-stat">
                  <span className="profile-stat-num">{profile.stats.hosted}</span>
                  <span className="profile-stat-label">Started</span>
                </div>
                <div className="profile-stat">
                  <span className="profile-stat-num">{profile.stats.joined}</span>
                  <span className="profile-stat-label">Joined</span>
                </div>
              </div>
            </div>
          </div>
          <Link to={`/profile/${userId}/edit`} className="profile-edit-btn">
            Edit
          </Link>
        </div>
        <SocialPills
          isSelf
          instagram={profile.socialLinks?.instagram}
          tiktok={profile.socialLinks?.tiktok}
          onEdit={() => navigate(`/profile/${userId}/edit`)}
        />

        <div className="profile-divider" />
      </section>

      {communities.length > 0 && (
        <section className="profile-block">
          <h3 className="profile-section-label">Communities</h3>
          <div className="profile-communities-list">
            {communities.map((c) => {
              const vis = COMMUNITY_VISUAL[c.category] || COMMUNITY_VISUAL.other;
              const Icon = vis?.Icon;
              return (
                <Link key={c.id} to={`/communities/${c.id}`} className="profile-community-row">
                  <span
                    className="profile-community-icon-well"
                    style={{ background: vis.tint, color: vis.iconColor }}
                    aria-hidden="true"
                  >
                    <Icon size={13} strokeWidth={1.8} />
                  </span>
                  <span className="profile-community-info">
                    <span className="profile-community-name">{c.name}</span>
                    <span className="profile-community-meta">
                      {c.myRole === "organizer" ? "Organizer · " : ""}
                      {COMMUNITY_CATEGORY_LABELS[c.category]} · {c.memberCount}{" "}
                      {c.memberCount === 1 ? "member" : "members"}
                    </span>
                  </span>
                  <ChevronRight size={13} strokeWidth={1.6} className="profile-community-chevron" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <YourPlansBlock
        id="profile-plans-block"
        upcoming={profile.upcoming}
        past={profile.past}
        isSelf
        profileUserId={userId}
        view={plansView}
        onViewChange={setPlansView}
      />

      <ProfileMenu network={network} />

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
    </main>
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
  variant = "default",
}: {
  profile: ProfilePayload;
  onUpdated: () => void;
  variant?: "default" | "other";
}) {
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  const inNet = profile.network.inMyNetwork;
  const requestSent = profile.network.requestSent ?? false;
  const requestReceived = profile.network.requestReceived ?? false;
  const other = variant === "other";

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

  // Connected — show status + optional remove.
  if (inNet) {
    if (other) {
      return (
        <button
          type="button"
          className="profile-other-cta profile-other-cta--connected"
          onClick={() => void call("/api/auth/friend-remove")}
          disabled={busy}
        >
          <Check size={13} strokeWidth={2.5} aria-hidden="true" />
          {busy ? "…" : "In your network"}
        </button>
      );
    }
    return (
      <div className="friend-button-connected" style={{ marginTop: 10 }}>
        <span className="friend-connected-pill">In your network</span>
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
    if (other) {
      return (
        <button
          type="button"
          className="profile-other-cta profile-other-cta--primary"
          onClick={() => void call("/api/auth/network-accept")}
          disabled={busy}
        >
          {busy ? "…" : "Accept request"}
        </button>
      );
    }
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
    if (other) {
      return (
        <button type="button" className="profile-other-cta profile-other-cta--connected" disabled>
          Request sent
        </button>
      );
    }
    return (
      <button type="button" className="btn-secondary" disabled style={{ marginTop: 10 }}>
        Request sent
      </button>
    );
  }

  // No relationship yet — send a request.
  if (other) {
    return (
      <button
        type="button"
        className="profile-other-cta profile-other-cta--primary"
        onClick={() => void call("/api/auth/friend-add")}
        disabled={busy}
      >
        <UserPlus size={13} strokeWidth={2} aria-hidden="true" />
        {busy ? "…" : "Add to network"}
      </button>
    );
  }

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


function MonthCalendar({ plans, profileUserId }: { plans: PlanDTO[]; profileUserId: string }) {
  const profileBack: NavFromState = { from: "profile", profileUserId };
  const [monthOffset, setMonthOffset] = useState(0);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDay = new Map<number, PlanDTO[]>();
  for (const p of plans) {
    // Parse YYYY-MM-DD as local calendar parts — never `new Date(isoDate)`.
    const [py, pm, pd] = p.date.split("-").map(Number);
    if (!py || !pm || !pd) continue;
    if (py !== year || pm - 1 !== month) continue;
    if (!byDay.has(pd)) byDay.set(pd, []);
    byDay.get(pd)!.push(p);
  }
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="profile-month-calendar" aria-label="Month view">
      <div className="profile-month-header">
        <button type="button" className="month-cal-nav" onClick={() => { setMonthOffset((m) => m - 1); setOpenDay(null); }} aria-label="Previous month">
          ‹
        </button>
        <h4 className="profile-month-caption">
          {first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h4>
        <button type="button" className="month-cal-nav" onClick={() => { setMonthOffset((m) => m + 1); setOpenDay(null); }} aria-label="Next month">
          ›
        </button>
      </div>
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
              <button
                type="button"
                className="month-cal-day-btn"
                onClick={() => setOpenDay(openDay === dom ? null : dom)}
                aria-expanded={openDay === dom}
              >
                <span className="month-cal-num">{dom}</span>
                {byDay.has(dom) && <span className="month-cal-dot" aria-hidden="true" />}
              </button>
              {openDay === dom && (byDay.get(dom) ?? []).length > 0 && (
                <div className="month-cal-dropdown">
                  {(byDay.get(dom) ?? []).map((p) => (
                    <Link
                      key={p.id}
                      to={`/plans/${p.id}`}
                      state={profileBack}
                      className="month-cal-dropdown-item"
                    >
                      <span className="month-cal-dot-title">{p.title}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function planRelationshipBadge(
  plan: PlanDTO,
  profileUserId: string,
): { label: string; className: string } {
  if (plan.creator.id === profileUserId) {
    return { label: "Your plan", className: "profile-plan-chip--host" };
  }
  if (plan.participants.going.some((u) => u.id === profileUserId)) {
    return { label: "I'm In", className: "profile-plan-chip--going" };
  }
  return { label: "Interested", className: "profile-plan-chip--interested" };
}

/**
 * Combined "Your Plans" section — upcoming (collapsed to 3, "Show X more"),
 * then a Past accordion. Upcoming rows tag each plan with YOUR PLAN (you
 * started it), IN, or INTERESTED.
 */
function YourPlansBlock({
  id,
  upcoming,
  past,
  isSelf,
  profileUserId,
  view,
  onViewChange,
}: {
  id?: string;
  upcoming: PlanDTO[];
  past: Array<{ id: string; title: string; date: string; wentCount: number }>;
  isSelf: boolean;
  profileUserId: string;
  view: "list" | "calendar";
  onViewChange: (v: "list" | "calendar") => void;
}) {
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const visibleUpcoming = upcomingExpanded ? upcoming : upcoming.slice(0, 3);
  const hiddenCount = Math.max(0, upcoming.length - visibleUpcoming.length);
  const profileBack: NavFromState = { from: "profile", profileUserId };

  const seeAllLink = (
    <Link to="/my-plans" className="profile-see-all-link" style={{ display: "inline-block", marginTop: 10 }}>
      See all plans →
    </Link>
  );

  return (
    <section className="profile-block" id={id}>
      <div className="profile-block-heading-row">
        <h3 className="who-block-heading">{isSelf ? "Your plans" : "Plans"}</h3>
        {isSelf && (
          <div className="profile-plans-toggle" role="tablist" aria-label="Plans view">
            <button
              type="button"
              role="tab"
              aria-selected={view === "list"}
              className={view === "list" ? "is-active" : ""}
              onClick={() => onViewChange("list")}
            >
              List
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "calendar"}
              className={view === "calendar" ? "is-active" : ""}
              onClick={() => onViewChange("calendar")}
            >
              Calendar
            </button>
          </div>
        )}
      </div>

      {view === "calendar" && (
        <>
          <MonthCalendar plans={upcoming} profileUserId={profileUserId} />
          {isSelf && seeAllLink}
        </>
      )}

      {view === "list" && (
        <>
          {isSelf && (
            <Link
              to="/my-plans"
              className="profile-see-all-link"
              style={{ display: "inline-block", marginTop: 6, marginBottom: 10 }}
            >
              See all plans →
            </Link>
          )}
          {visibleUpcoming.length > 0 ? (
            <div className="profile-plan-card">
              {visibleUpcoming.map((p) => {
                const badge = planRelationshipBadge(p, profileUserId);
                const vis = interestVisual(p.tags[0]);
                const Icon = vis.Icon;
                return (
                  <Link
                    key={p.id}
                    to={`/plans/${p.id}`}
                    state={profileBack}
                    className="profile-plan-row"
                  >
                    <span
                      className="profile-list-icon-well"
                      style={{ background: vis.tint, color: vis.iconColor }}
                      aria-hidden="true"
                    >
                      <Icon size={15} strokeWidth={1.8} />
                    </span>
                    <span className="profile-list-title">{p.title}</span>
                    <span className="profile-list-when">{formatPlanDate(p.date)}</span>
                    <span className={`profile-plan-chip ${badge.className}`}>
                      {badge.label}
                    </span>
                  </Link>
                );
              })}
              {hiddenCount > 0 && (
                <button type="button" className="profile-show-more-row" onClick={() => setUpcomingExpanded(true)}>
                  Show {hiddenCount} more
                </button>
              )}
              {upcomingExpanded && upcoming.length > 3 && (
                <button type="button" className="profile-show-more-row" onClick={() => setUpcomingExpanded(false)}>
                  Show less
                </button>
              )}
            </div>
          ) : (
            <p className="empty-state" style={{ marginTop: 8 }}>
              {isSelf
                ? "No plans yet — join something from the feed or post your own."
                : "No upcoming plans yet."}
            </p>
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
                <div className="profile-plan-card" style={{ marginTop: 8 }}>
                  {past.map((p) => (
                    // Past events are just a record: title + date. "Do it again"
                    // lives on the event page itself, not as a per-row button.
                    <Link
                    key={p.id}
                    to={`/plans/${p.id}`}
                    state={profileBack}
                    className="profile-plan-row"
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
  return (
    <nav className="profile-menu" aria-label="Profile menu">
      <NetworkCard network={network} />

      <Link to="/invite" className="profile-menu-row">
        <span className="profile-menu-icon" aria-hidden="true"><MailIcon /></span>
        <span className="profile-menu-text">
          <span className="profile-menu-label">Invite friends</span>
          <span className="profile-menu-sub">Share your codes</span>
        </span>
        <ChevronRight size={13} strokeWidth={1.6} className="profile-menu-chevron" aria-hidden="true" />
      </Link>
      <Link to="/settings" className="profile-menu-row profile-menu-row--settings">
        <span className="profile-menu-icon" aria-hidden="true"><SettingsIcon /></span>
        <span className="profile-menu-text">
          <span className="profile-menu-label">Settings</span>
          <span className="profile-menu-sub">Notifications, interests, account</span>
        </span>
        <ChevronRight size={13} strokeWidth={1.6} className="profile-menu-chevron" aria-hidden="true" />
      </Link>
    </nav>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

/**
 * "Your network" card — mirrors the wireframe: a labelled card with a row of
 * five avatar slots (filled for people you're connected with, dashed circles
 * for the rest). Empty state prompts an invite; otherwise it links through to
 * the full network list.
 */
function NetworkCard({ network }: { network: PublicUser[] | null }) {
  const count = network?.length ?? 0;
  const firstFive = (network ?? []).slice(0, 5);
  const emptySlots = Math.max(0, 5 - firstFive.length);
  const isEmpty = count === 0;
  return (
    <div className="profile-network-card">
      <Link to="/network" className="profile-network-card-head">
        <span className="profile-network-card-label">Your network</span>
        <span className="profile-network-card-count">
          {count} {count === 1 ? "person" : "people"}
        </span>
      </Link>
      <Link to="/network" className="profile-network-card-slots" aria-hidden="true">
        {firstFive.map((u) => (
          <span key={u.id} className="profile-network-slot profile-network-slot--filled">
            <Avatar
              seed={u.avatarSeed}
              style={u.avatarStyle}
              photoDataUrl={u.avatarPhotoDataUrl}
              params={u.avatarParams}
              size="sm"
            />
          </span>
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <span key={`empty-${i}`} className="profile-network-slot">
            <span className="profile-network-slot-dot" />
          </span>
        ))}
      </Link>
      {isEmpty ? (
        <>
          <p className="profile-network-card-empty">
            Your people aren't here yet — invite them and plan things together.
          </p>
          <Link to="/invite" className="btn-primary btn-block profile-network-card-invite">
            Invite friends →
          </Link>
        </>
      ) : (
        <Link to="/network" className="btn-link profile-network-card-seeall">
          See all →
        </Link>
      )}
    </div>
  );
}

