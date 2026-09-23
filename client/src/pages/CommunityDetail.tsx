import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Calendar, LayoutDashboard, MessageCircle, Send, Users } from "lucide-react";
import { api, parseApiError } from "../api/http";
import { Avatar } from "../components/Avatar";
import { CommunityCover } from "../components/CommunityCover";
import { LinkedText } from "../components/LinkedText";
import { CoverLibraryModal } from "../components/CoverLibraryModal";
import { JoinConfirmPopup } from "../components/JoinConfirmPopup";
import { PlanCard } from "../components/PlanCard";
import { CommunityShareSheet } from "../components/ShareSheet";
import { PlanSafetyMenu } from "../components/PlanSafetyMenu";
import { useAuth } from "../context/AuthContext";
import {
  ALL_COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LABELS,
  MAX_COMMUNITY_CATEGORIES,
  communityCategoriesOf,
  communityCategoryLine,
  communityRequiresJoinApproval,
  toggleCommunityCategory,
  type CommunityAccessLevel,
  type CommunityCategory,
  type CommunityDTO,
  type CommunityMemberDTO,
  type CommunityPostDTO,
  type MeDTO,
  type NetworkLinkStatus,
  type CommunityPostingPermission,
  type CommunitySocialLinks,
  type PersonSearchResultDTO,
  type PlanDTO,
  type SearchResultsDTO,
} from "../types/shared";
import { EmptyCard } from "../components/ui";
import { formatRelative } from "../lib/format";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { planHasEnded } from "../lib/planTime";
import { pickPhotoNative } from "../lib/photoPicker";
import { hrefForBack, type NavFromState } from "../lib/navState";
import { isNative } from "../lib/platform";
import "./Communities.css";

function pendingApprovalSummary(requests: number, posts: number): string {
  const parts: string[] = [];
  if (requests > 0) parts.push(`${requests} join ${requests === 1 ? "request" : "requests"}`);
  if (posts > 0) parts.push(`${posts} ${posts === 1 ? "post" : "posts"}`);
  return `${parts.join(" and ")} waiting for approval`;
}

type Tab = "bulletin" | "events" | "chat" | "members" | "settings";

function tabFromParam(raw: string | null): Tab | null {
  if (raw === "bulletin" || raw === "events" || raw === "members" || raw === "settings") return raw;
  return null;
}

export function CommunityDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navFrom = (location.state as NavFromState | null) ?? null;
  const backHref = navFrom?.from ? hrefForBack(navFrom) : "/communities";
  const [searchParams] = useSearchParams();
  const [community, setCommunity] = useState<CommunityDTO | null>(null);
  // One shared members payload for header preview, Members tab, join
  // requests, and organizer transfer — avoids 2–3× /members on load.
  const [members, setMembers] = useState<CommunityMemberDTO[]>([]);
  const [pendingMembers, setPendingMembers] = useState<CommunityMemberDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>(() => tabFromParam(searchParams.get("tab")) ?? "bulletin");
  const tabParam = searchParams.get("tab");
  useEffect(() => {
    const next = tabFromParam(tabParam);
    if (next) setTab(next);
  }, [tabParam]);
  const [joinConfirm, setJoinConfirm] = useState(false);
  const [editSocials, setEditSocials] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveErr, setLeaveErr] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);

  const loadMembers = useCallback(async () => {
    try {
      const m = await api<{ members: CommunityMemberDTO[]; pending?: CommunityMemberDTO[] }>(
        `/api/communities/${id}/members`,
      );
      setMembers(m.members);
      setPendingMembers(m.pending ?? []);
    } catch {
      setMembers([]);
      setPendingMembers([]);
    }
  }, [id]);

  const load = useCallback(async () => {
    try {
      const c = await api<CommunityDTO>(`/api/communities/${id}`);
      setCommunity(c);
      setTab((prev) => (prev === "bulletin" && !c.bulletinEnabled ? "events" : prev));
      await loadMembers();
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id, loadMembers]);

  useEffect(() => {
    void load();
  }, [load]);
  // If the organizer turns the bulletin off while you're on that tab, land on Events.
  useEffect(() => {
    if (community && !community.bulletinEnabled && tab === "bulletin") {
      setTab("events");
    }
  }, [community, tab]);

  if (loading) {
    return (
      <main className="app-shell app-shell--with-nav app-shell--with-topbar cmy">
        <button type="button" className="back-circle" aria-label="Back" onClick={() => navigate(backHref)}>
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <p className="cmy-muted">Loading…</p>
      </main>
    );
  }
  if (notFound || !community) {
    return (
      <main className="app-shell app-shell--with-nav app-shell--with-topbar cmy">
        <p className="cmy-muted">This community isn’t available.</p>
        <Link to={backHref} className="back-circle" aria-label="Back">
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </Link>
      </main>
    );
  }

  const catLabels = communityCategoriesOf(community).map((tag) => COMMUNITY_CATEGORY_LABELS[tag]);
  const placeLabel = community.city?.trim() || "Philadelphia";
  const isActiveMember = community.myMembership?.status === "active";
  // isOrganizer is the real community organizer only (never a COMMONS admin).
  const showChatTab = community.chatEnabled && (isActiveMember || community.isOrganizer);
  // Board view is open for instant-join / "Everyone" communities. Locked for
  // request-to-join (screening) or visibility=members_only. Posting / chat /
  // manage still require membership regardless.
  const boardRestricted = communityRequiresJoinApproval(community);
  const canSeeInside = !boardRestricted || isActiveMember || community.isOrganizer;
  const canPostBulletin = community.canPostBulletin && (isActiveMember || community.isOrganizer);
  const canPostPlan = community.canPostPlan && (isActiveMember || community.isOrganizer);
  const canManage = community.isOrganizer;
  const canLeave =
    community.creationStatus === "approved" && isActiveMember && !community.isOrganizer;
  const canShare = community.creationStatus === "approved";

  async function leaveCommunity() {
    if (leaveBusy || !canLeave) return;
    setLeaveBusy(true);
    setLeaveErr(null);
    try {
      const updated = await api<CommunityDTO>(`/api/communities/${id}/leave`, { method: "POST" });
      setCommunity(updated);
      await load();
    } catch (e) {
      setLeaveErr(parseApiError(e));
    } finally {
      setLeaveBusy(false);
    }
  }

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar cmy">
      {community.creationStatus === "pending" && (
        <div className="cmy-review-banner">
          ⏳ Pending review — COMMONS is reviewing this community before it goes live.
        </div>
      )}
      {community.creationStatus === "rejected" && (
        <div className="cmy-review-banner cmy-review-banner--warn">
          This community was taken offline. Edit any setting to send it back for review.
        </div>
      )}

      {/* Header — category + name overlay the cover photo; a single compressed
          row below carries member avatars, the meta line, and the Join pill. */}
      <header className="cmy-header">
        <div className="cmy-cover">
          <CommunityCover
            coverImage={community.coverImage}
            category={community.category}
            className="cmy-cover-fill"
            iconSize={44}
          />
          <button
            type="button"
            className="cmy-detail-back"
            aria-label="Back"
            onClick={() => navigate(backHref)}
          >
            <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
          </button>
          {(community.isFounding || canLeave || canShare) && (
            <div className="cmy-cover-actions">
              {community.isFounding && <span className="cmy-cover-founding">Founding</span>}
              {canLeave && (
                <button
                  type="button"
                  className="cmy-cover-leave"
                  disabled={leaveBusy}
                  onClick={() => void leaveCommunity()}
                >
                  {leaveBusy ? "Leaving…" : "Leave"}
                </button>
              )}
              {canShare && (
                <button
                  type="button"
                  className="cmy-cover-share"
                  aria-label="Share"
                  onClick={() => setShowShare(true)}
                >
                  <Send size={18} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
          {leaveErr && <p className="cmy-cover-note">{leaveErr}</p>}
          <div className="cmy-cover-overlay">
            <div className="cmy-cover-kicker">{placeLabel}</div>
            <h1 className="cmy-name">{community.name}</h1>
            <div className="cmy-cover-pills">
              {catLabels.map((label) => (
                <span key={label} className="cmy-cover-tag">{label}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="cmy-header-body">
          <div className="cmy-header-row">
            <button
              type="button"
              className="cmy-header-members"
              onClick={() => setTab("members")}
              aria-label={`${community.memberCount} ${community.memberCount === 1 ? "member" : "members"}`}
            >
              {members.length > 0 && (
                <span className="cmy-header-avatars">
                  {members.slice(0, 3).map((m) => (
                    <Avatar
                      key={m.user.id}
                      seed={m.user.avatarSeed}
                      style={m.user.avatarStyle}
                      photoDataUrl={m.user.avatarPhotoDataUrl}
                      params={m.user.avatarParams}
                      size="xs"
                    />
                  ))}
                </span>
              )}
              <span className="cmy-header-members-copy">
                <span className="cmy-header-count">
                  {community.memberCount} {community.memberCount === 1 ? "member" : "members"}
                </span>
                <span className="cmy-header-org">{placeLabel}</span>
              </span>
            </button>
            <JoinControl
              community={community}
              onChange={setCommunity}
              reload={load}
              onJoined={() => setJoinConfirm(true)}
              compact
            />
          </div>
          {(community.description || community.organizer) && (
            <div className="cmy-about">
              {community.description && (
                <p className="cmy-desc">
                  <LinkedText text={community.description} />
                </p>
              )}
              <p className="cmy-owner-line">
                Organized by{" "}
                <Link
                  to={`/profile/${community.organizer.id}`}
                  state={{ from: "community", communityId: community.id }}
                >
                  {community.organizer.firstName}
                </Link>
              </p>
            </div>
          )}
          <CommunitySocialPills
            isOrganizer={community.isOrganizer}
            links={community.socialLinks}
            onEdit={() => {
              setEditSocials(true);
              setTab("settings");
            }}
          />
          {canManage && (
            <Link
              to={`/communities/${community.id}/dashboard${
                community.pendingRequestCount > 0
                  ? "?section=requests"
                  : community.pendingBulletinCount > 0
                    ? "?section=bulletin"
                    : ""
              }`}
              className="cmy-dash-entry"
            >
              <LayoutDashboard size={18} strokeWidth={1.8} aria-hidden="true" />
              <span className="cmy-dash-entry-copy">
                <span className="cmy-dash-entry-title">Dashboard</span>
                <span className="cmy-dash-entry-sub">
                  {community.pendingRequestCount + community.pendingBulletinCount > 0
                    ? pendingApprovalSummary(community.pendingRequestCount, community.pendingBulletinCount)
                    : "Analytics, approvals, and members"}
                </span>
              </span>
              {community.pendingRequestCount + community.pendingBulletinCount > 0 && (
                <span className="cmy-requests-count">
                  {community.pendingRequestCount + community.pendingBulletinCount}
                </span>
              )}
            </Link>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="cmy-tabs" role="tablist">
        {community.bulletinEnabled && (
          <TabButton id="bulletin" tab={tab} setTab={setTab} badge={community.pendingBulletinCount || undefined}>
            Bulletin
          </TabButton>
        )}
        <TabButton id="events" tab={tab} setTab={setTab}>Events</TabButton>
        {showChatTab && (
          <TabButton id="chat" tab={tab} setTab={setTab} onSelect={() => navigate(`/communities/${community.id}/chat`, { state: { from: "community", communityId: community.id } })}>
            Chat
          </TabButton>
        )}
        <TabButton id="members" tab={tab} setTab={setTab} badge={community.pendingRequestCount || undefined}>Members</TabButton>
        {canManage && (
          <TabButton id="settings" tab={tab} setTab={setTab} badge={community.pendingRequestCount || undefined}>
            Settings
          </TabButton>
        )}
      </nav>

      {tab === "bulletin" && community.bulletinEnabled && (canSeeInside ? <BulletinTab community={community} canPost={canPostBulletin} canReply={isActiveMember || community.isOrganizer} onPendingChange={load} /> : (
        <LockedPanel
          community={community}
          onChange={setCommunity}
          reload={load}
          onJoined={() => setJoinConfirm(true)}
        />
      ))}
      {tab === "events" && (
        canSeeInside ? (
          <EventsTab
            community={community}
            canPost={canPostPlan}
            onPostPlan={() =>
              navigate(
                `/plans/new?communityId=${encodeURIComponent(community.id)}&communityName=${encodeURIComponent(community.name)}&returnTo=events`,
                { state: { hubEventsReturnId: community.id } },
              )
            }
          />
        ) : (
          <LockedPanel
            community={community}
            onChange={setCommunity}
            reload={load}
            onJoined={() => setJoinConfirm(true)}
          />
        )
      )}
      {tab === "members" && (canSeeInside ? (
        <MembersTab
          community={community}
          members={members}
          pendingMembers={pendingMembers}
          onCountChange={load}
        />
      ) : (
        <LockedPanel
          community={community}
          onChange={setCommunity}
          reload={load}
          onJoined={() => setJoinConfirm(true)}
        />
      ))}
      {tab === "settings" && canManage && (
        <SettingsTab
          community={community}
          members={members}
          pendingMembers={pendingMembers}
          startOnAbout={editSocials}
          onAboutOpened={() => setEditSocials(false)}
          onSaved={setCommunity}
          onRequestsChange={load}
          onLeft={() => navigate("/communities")}
          onDeleted={() => navigate("/communities")}
        />
      )}
      {joinConfirm && <JoinConfirmPopup kind="community" onClose={() => setJoinConfirm(false)} />}
      {showShare && (
        <CommunityShareSheet
          name={community.name}
          communityId={community.id}
          onClose={() => setShowShare(false)}
        />
      )}
    </main>
  );
}

/** Approve/decline queue — shared by Members + Settings. Organizer-only. */
function JoinRequestsPanel({
  communityId,
  canManage,
  pending,
  onChange,
}: {
  communityId: string;
  canManage: boolean;
  pending: CommunityMemberDTO[];
  onChange: () => Promise<void>;
}) {
  async function approve(userId: string) {
    if (!canManage) return;
    await api(`/api/communities/${communityId}/members/${userId}/approve`, { method: "POST" });
    await onChange();
  }
  async function decline(userId: string) {
    if (!canManage) return;
    await api(`/api/communities/${communityId}/members/${userId}/decline`, { method: "POST" });
    await onChange();
  }

  // Same gate as Bulletin pending queue — never show manage UI to non-organizers
  // (including pending join requesters / COMMONS admins who aren't the organizer).
  if (!canManage) return null;
  if (pending.length === 0) {
    return (
      <TabEmpty
        icon={<Users size={24} strokeWidth={1.6} />}
        headline="Nobody at the door."
        body="That's a good problem."
      />
    );
  }

  return (
    <div className="cmy-requests">
      <h3 className="cmy-subhead">
        Join requests <span className="cmy-requests-count">{pending.length}</span>
      </h3>
      <ul className="cmy-member-list">
        {pending.map((m) => (
          <li key={m.user.id} className="cmy-request">
            <Link to={`/profile/${m.user.id}`} state={{ from: "community", communityId }} className="cmy-member-row cmy-member-link">
              <Avatar
                seed={m.user.avatarSeed}
                style={m.user.avatarStyle}
                photoDataUrl={m.user.avatarPhotoDataUrl}
                params={m.user.avatarParams}
                size="sm"
              />
              <span className="cmy-member-name">
                {m.user.firstName} {m.user.lastName ?? ""}
              </span>
            </Link>
            {m.screeningAnswer && <p className="cmy-answer">“{m.screeningAnswer}”</p>}
            <div className="cmy-join-row">
              <button type="button" className="cmy-btn cmy-btn--primary cmy-btn--sm" onClick={() => void approve(m.user.id)}>
                Approve
              </button>
              <button type="button" className="cmy-btn cmy-btn--ghost cmy-btn--sm" onClick={() => void decline(m.user.id)}>
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TabEmpty({
  icon,
  headline,
  body,
}: {
  icon: ReactNode;
  headline: string;
  body: string;
}) {
  return <EmptyCard icon={icon} title={headline} body={body} />;
}

function TabButton({
  id,
  tab,
  setTab,
  badge,
  onSelect,
  children,
}: {
  id: Tab;
  tab: Tab;
  setTab: (t: Tab) => void;
  badge?: number;
  onSelect?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      className={`cmy-tab ${tab === id ? "cmy-tab--active" : ""}`}
      onClick={() => {
        setTab(id);
        onSelect?.();
      }}
    >
      {children}
      {!!badge && <span className="cmy-tab-badge">{badge}</span>}
    </button>
  );
}

function LockedPanel({
  community,
  onChange,
  reload,
  onJoined,
}: {
  community: CommunityDTO;
  onChange: (c: CommunityDTO) => void;
  reload: () => Promise<void>;
  onJoined: () => void;
}) {
  const pending = community.myMembership?.status === "pending";
  return (
    <section className="cmy-tabpanel">
      <div className="cmy-locked">
        {pending ? (
          <>
            <p className="cmy-locked-text">Request pending.</p>
            <p className="cmy-locked-sub">
              Hang tight — they&apos;ll see you.
            </p>
          </>
        ) : (
          <>
            <p className="cmy-locked-text">It&apos;s quiet until you&apos;re in.</p>
            <div className="cmy-locked-join">
              <JoinControl community={community} onChange={onChange} reload={reload} onJoined={onJoined} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function JoinControl({
  community,
  onChange,
  reload,
  onJoined,
  compact = false,
}: {
  community: CommunityDTO;
  onChange: (c: CommunityDTO) => void;
  reload: () => Promise<void>;
  onJoined: () => void;
  compact?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Local success flag so we can show confirmation even before parent state settles. */
  const [requested, setRequested] = useState(community.myMembership?.status === "pending");

  useEffect(() => {
    if (community.myMembership?.status === "pending") setRequested(true);
    if (community.myMembership?.status === "active" || !community.myMembership) {
      setRequested(false);
    }
  }, [community.myMembership?.status]);

  async function doJoin(screeningAnswer?: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await api<CommunityDTO>(`/api/communities/${community.id}/join`, {
        method: "POST",
        body: JSON.stringify(screeningAnswer ? { screeningAnswer } : {}),
      });
      if (updated.myMembership?.status === "active") onJoined();
      onChange(updated);
      setAsking(false);
      setAnswer("");
      if (updated.myMembership?.status === "pending") {
        setRequested(true);
      }
    } catch (e) {
      setErr(cleanError(e));
    } finally {
      setBusy(false);
    }
  }

  async function doLeave() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await api<CommunityDTO>(`/api/communities/${community.id}/leave`, { method: "POST" });
      onChange(updated);
      setRequested(false);
      await reload();
    } catch (e) {
      setErr(cleanError(e));
    } finally {
      setBusy(false);
    }
  }

  if (community.creationStatus !== "approved") return null;

  const status = community.myMembership?.status;
  const isPending = status === "pending" || requested;
  const needsApproval = communityRequiresJoinApproval(community);

  if (status === "active") {
    return (
      <div className="cmy-join-row">
        <span className="cmy-joined-pill cmy-joined-pill--member">Joined</span>
        {!compact && !community.isOrganizer && (
          <button type="button" className="cmy-btn cmy-btn--ghost cmy-btn--sm" disabled={busy} onClick={() => void doLeave()}>
            {busy ? "Leaving…" : "Leave"}
          </button>
        )}
      </div>
    );
  }
  if (isPending) {
    return (
      <div className="cmy-join-row">
        <span className="cmy-joined-pill cmy-joined-pill--quiet">Requested</span>
      </div>
    );
  }

  // Visitor
  if (community.hasScreening && asking) {
    return (
      <div className="cmy-join-col cmy-screen">
        <p className="cmy-screen-q">{community.screeningQuestion ?? "A quick question before you join:"}</p>
        <textarea
          className="cmy-textarea"
          rows={3}
          value={answer}
          placeholder="Your answer…"
          onChange={(e) => setAnswer(e.target.value)}
          disabled={busy}
        />
        {err && <p className="cmy-err">{err}</p>}
        <div className="cmy-join-row">
          <button
            type="button"
            className="cmy-btn cmy-btn--primary"
            disabled={busy || !answer.trim()}
            onClick={() => void doJoin(answer.trim())}
          >
            {busy ? "Sending…" : "Send request"}
          </button>
          <button
            type="button"
            className="cmy-btn cmy-btn--ghost"
            disabled={busy}
            onClick={() => setAsking(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cmy-join-row">
      <button
        type="button"
        className={compact ? "cmy-joined-pill cmy-compact-join" : "cmy-btn cmy-btn--primary cmy-btn--sm"}
        disabled={busy}
        onClick={() => (community.hasScreening ? setAsking(true) : void doJoin())}
      >
        {busy
          ? needsApproval
            ? "Sending…"
            : "Joining…"
          : needsApproval
            ? "Request to join"
            : "Join"}
      </button>
      {err && <p className="cmy-err">{err}</p>}
    </div>
  );
}

function BulletinTab({
  community,
  canPost,
  canReply,
  onPendingChange,
}: {
  community: CommunityDTO;
  canPost: boolean;
  canReply: boolean;
  onPendingChange?: () => void;
}) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<CommunityPostDTO[]>([]);
  const [pending, setPending] = useState<CommunityPostDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [postErr, setPostErr] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ posts: CommunityPostDTO[]; pending?: CommunityPostDTO[] }>(
      `/api/communities/${community.id}/posts`,
    );
    setPosts(r.posts);
    setPending(r.pending ?? []);
  }, [community.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setPostErr(null);
    try {
      await api(`/api/communities/${community.id}/posts`, {
        method: "POST",
        body: JSON.stringify({ content: draft.trim() }),
      });
      setDraft("");
      await load();
      onPendingChange?.();
    } catch (e) {
      setPostErr(parseApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitReply(parentId: string) {
    if (!replyDraft.trim() || replyBusy) return;
    setReplyBusy(true);
    setPostErr(null);
    try {
      await api(`/api/communities/${community.id}/posts`, {
        method: "POST",
        body: JSON.stringify({ content: replyDraft.trim(), parentId }),
      });
      setReplyDraft("");
      setReplyTo(null);
      await load();
    } catch (e) {
      setPostErr(parseApiError(e));
    } finally {
      setReplyBusy(false);
    }
  }

  async function del(postId: string) {
    await api(`/api/communities/${community.id}/posts/${postId}`, { method: "DELETE" });
    await load();
    onPendingChange?.();
  }
  async function togglePin(post: CommunityPostDTO) {
    await api(`/api/communities/${community.id}/posts/${post.id}/pin`, {
      method: "POST",
      body: JSON.stringify({ pinned: !post.pinned }),
    });
    await load();
  }
  async function approve(postId: string) {
    await api(`/api/communities/${community.id}/posts/${postId}/approve`, { method: "POST" });
    await load();
    onPendingChange?.();
  }
  async function decline(postId: string) {
    await api(`/api/communities/${community.id}/posts/${postId}/decline`, { method: "POST" });
    await load();
    onPendingChange?.();
  }

  function postMenu(p: CommunityPostDTO) {
    const canReport = Boolean(user && user.id !== p.author.id);
    if (!p.canDelete && !canReport) return null;
    return (
      <PlanSafetyMenu
        targetUserId={p.author.id}
        targetFirstName={p.author.firstName}
        contentKind="community_post"
        contentId={p.id}
        onDelete={p.canDelete ? () => del(p.id) : undefined}
      />
    );
  }

  const livePosts = posts.filter((p) => p.approvalStatus === "approved");
  const myPending = posts.filter((p) => p.approvalStatus === "pending");
  const composerHint = community.bulletinRequiresApproval && !community.isOrganizer
    ? "Submit a post for approval…"
    : "Share something with the group…";

  const composer = canPost ? (
    <div className="cmy-composer-wrap">
      {postErr && <p className="cmy-err">{postErr}</p>}
      <div className="cmy-composer">
        <input
          type="text"
          className="cmy-composer-input"
          placeholder={composerHint}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <button type="button" className="cmy-btn cmy-btn--primary cmy-btn--sm" disabled={busy || !draft.trim()} onClick={submit}>
          {community.bulletinRequiresApproval && !community.isOrganizer ? "Submit" : "Post"}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <section className="cmy-tabpanel">
      {composer}
      {community.isOrganizer && pending.length > 0 && (
        <div className="cmy-requests">
          <h3 className="cmy-subhead">Awaiting approval</h3>
          <ul className="cmy-post-list">
            {pending.map((p) => (
              <li key={p.id} className="cmy-post cmy-post--pending">
                <div className="cmy-post-head">
                  <Avatar seed={p.author.avatarSeed} style={p.author.avatarStyle} photoDataUrl={p.author.avatarPhotoDataUrl} params={p.author.avatarParams} size="sm" />
                  <span className="cmy-post-name">{p.author.firstName}</span>
                  <span className="cmy-post-time">{formatRelative(p.createdAt)}</span>
                </div>
                {p.content && <p className="cmy-post-body">{p.content}</p>}
                {p.image && <img className="cmy-post-image" src={p.image} alt="" loading="lazy" />}
                <div className="cmy-join-row">
                  <button type="button" className="cmy-btn cmy-btn--primary cmy-btn--sm" onClick={() => approve(p.id)}>
                    Approve
                  </button>
                  <button type="button" className="cmy-btn cmy-btn--ghost cmy-btn--sm" onClick={() => decline(p.id)}>
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!community.isOrganizer && myPending.length > 0 && (
        <div className="cmy-requests">
          <h3 className="cmy-subhead">Your posts awaiting approval</h3>
          <ul className="cmy-post-list">
            {myPending.map((p) => (
              <li key={p.id} className="cmy-post cmy-post--pending">
                <div className="cmy-post-head">
                  <Avatar seed={p.author.avatarSeed} style={p.author.avatarStyle} photoDataUrl={p.author.avatarPhotoDataUrl} params={p.author.avatarParams} size="sm" />
                  <span className="cmy-post-name">{p.author.firstName}</span>
                  <span className="cmy-pending-badge">Pending</span>
                  <span className="cmy-post-time">{formatRelative(p.createdAt)}</span>
                  <div className="cmy-post-actions">{postMenu(p)}</div>
                </div>
                {p.content && <p className="cmy-post-body">{p.content}</p>}
                {p.image && <img className="cmy-post-image" src={p.image} alt="" loading="lazy" />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {livePosts.length === 0 && pending.length === 0 && myPending.length === 0 && (
        <TabEmpty
          icon={<MessageCircle size={24} strokeWidth={1.6} />}
          headline="It's quiet in here."
          body="Somebody's gotta go first."
        />
      )}
      <ul className="cmy-post-list">
        {livePosts.map((p) => (
          <li key={p.id} className={`cmy-post ${p.pinned ? "cmy-post--pinned" : ""}`}>
            <div className="cmy-post-head">
              <Avatar seed={p.author.avatarSeed} style={p.author.avatarStyle} photoDataUrl={p.author.avatarPhotoDataUrl} params={p.author.avatarParams} size="sm" />
              <span className="cmy-post-name">{p.author.firstName}</span>
              {p.authorIsOrganizer && <span className="cmy-org-badge">Organizer</span>}
              {p.pinned && <span className="cmy-pinned-label">📌 Pinned</span>}
              <span className="cmy-post-time">{formatRelative(p.createdAt)}</span>
              <div className="cmy-post-actions">
                {community.isOrganizer && (
                  <button type="button" className="cmy-icon-btn" onClick={() => togglePin(p)} title={p.pinned ? "Unpin" : "Pin"}>
                    {p.pinned ? "📌" : "📍"}
                  </button>
                )}
                {postMenu(p)}
              </div>
            </div>
            {p.content && <p className="cmy-post-body">{p.content}</p>}
            {p.image && <img className="cmy-post-image" src={p.image} alt="" loading="lazy" />}
            {(p.replies?.length ?? 0) > 0 && (
              <ul className="cmy-reply-list">
                {(p.replies ?? []).map((r) => (
                  <li key={r.id} className="cmy-reply">
                    <Avatar seed={r.author.avatarSeed} style={r.author.avatarStyle} photoDataUrl={r.author.avatarPhotoDataUrl} params={r.author.avatarParams} size="xs" />
                    <div className="cmy-reply-body">
                      <div className="cmy-reply-top">
                        <span className="cmy-post-name">{r.author.firstName}</span>
                        <span className="cmy-post-time">{formatRelative(r.createdAt)}</span>
                        {postMenu(r)}
                      </div>
                      {r.content && <p className="cmy-post-body">{r.content}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {canReply && (
              replyTo === p.id ? (
                <div className="cmy-reply-composer">
                  <input
                    type="text"
                    className="cmy-composer-input"
                    placeholder={`Reply to ${p.author.firstName}…`}
                    value={replyDraft}
                    autoFocus
                    onChange={(e) => setReplyDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitReply(p.id);
                      if (e.key === "Escape") {
                        setReplyTo(null);
                        setReplyDraft("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="cmy-btn cmy-btn--primary cmy-btn--sm"
                    disabled={replyBusy || !replyDraft.trim()}
                    onClick={() => void submitReply(p.id)}
                  >
                    Reply
                  </button>
                  <button
                    type="button"
                    className="cmy-btn cmy-btn--ghost cmy-btn--sm"
                    disabled={replyBusy}
                    onClick={() => {
                      setReplyTo(null);
                      setReplyDraft("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="cmy-reply-btn"
                  onClick={() => {
                    setReplyTo(p.id);
                    setReplyDraft("");
                    setPostErr(null);
                  }}
                >
                  <MessageCircle size={14} strokeWidth={2} aria-hidden="true" />
                  Reply{p.replies?.length ? ` · ${p.replies.length}` : ""}
                </button>
              )
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EventsTab({
  community,
  canPost,
  onPostPlan,
}: {
  community: CommunityDTO;
  canPost: boolean;
  onPostPlan: () => void;
}) {
  const [plans, setPlans] = useState<PlanDTO[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const r = await api<PlanDTO[]>(`/api/communities/${community.id}/events`);
    setPlans(r);
    setLoaded(true);
  }, [community.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const upcoming = plans.filter((p) => !p.cancelledAt && !planHasEnded(p));
  const past = plans.filter((p) => Boolean(p.cancelledAt) || planHasEnded(p));

  return (
    <section className="cmy-tabpanel">
      {canPost && (
        <button type="button" className="cmy-btn cmy-btn--primary cmy-btn--block" onClick={onPostPlan}>
          + Post a new event
        </button>
      )}
      {loaded && plans.length === 0 && (
        <TabEmpty
          icon={<Calendar size={24} strokeWidth={1.6} />}
          headline="Nothing on the calendar."
          body="Host something. The regulars will come."
        />
      )}
      {upcoming.length > 0 && (
        <div className="cmy-events">
          {upcoming.map((p) => (
            <PlanCard key={p.id} plan={p} onPlanRefresh={load} hideHappened navFrom={{ from: "community", communityId: community.id }} />
          ))}
        </div>
      )}
      {past.length > 0 && (
        <details className="cmy-past-events">
          <summary>
            Past events
            <span>{past.length}</span>
          </summary>
          <div className="cmy-events">
            {past.map((p) => (
              <PlanCard key={p.id} plan={p} onPlanRefresh={load} hideHappened navFrom={{ from: "community", communityId: community.id }} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

/** Add this community member to the viewer's network. Hidden on your own row and once connected. */
export function MemberNetworkButton({
  userId,
  status,
  requestReceived = false,
}: {
  userId: string;
  status?: NetworkLinkStatus;
  requestReceived?: boolean;
}) {
  const { setUser } = useAuth();
  const [override, setOverride] = useState<NetworkLinkStatus | null>(null);
  const [incoming, setIncoming] = useState(requestReceived);
  const [busy, setBusy] = useState(false);
  const current = override ?? status;
  if (!current) return null;
  if (current === "connected") return null;

  async function add() {
    if (busy) return;
    setBusy(true);
    try {
      const accept = incoming;
      const r = await api<{ status?: string; me: MeDTO }>(
        accept ? "/api/auth/network-accept" : "/api/auth/friend-add",
        { method: "POST", body: JSON.stringify({ userId }) },
      );
      setUser(r.me);
      setIncoming(false);
      setOverride(accept || r.status === "connected" ? "connected" : "pending");
    } catch {
      /* leave the button so they can retry */
    } finally {
      setBusy(false);
    }
  }

  if (current === "pending") {
    return (
      <button type="button" className="cmy-network-btn" disabled>
        Requested
      </button>
    );
  }

  return (
    <button type="button" className="cmy-network-btn cmy-network-btn--add" disabled={busy} onClick={() => void add()}>
      {busy ? "…" : incoming ? "Accept" : "Add to network"}
    </button>
  );
}

function MembersTab({
  community,
  members,
  pendingMembers,
  onCountChange,
}: {
  community: CommunityDTO;
  members: CommunityMemberDTO[];
  pendingMembers: CommunityMemberDTO[];
  onCountChange: () => Promise<void>;
}) {
  const { user } = useAuth();
  // Real organizer only (same as P0 non-member-permissions fix — never admin).
  const canManage = community.isOrganizer;
  const organizer = members.find((m) => m.role === "organizer") ?? members[0];
  const rest = members.filter((m) => m.user.id !== organizer?.user.id);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<PersonSearchResultDTO[]>([]);
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const addDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!canManage || !addQuery.trim()) {
      setAddResults([]);
      return;
    }
    if (addDebounce.current) clearTimeout(addDebounce.current);
    addDebounce.current = setTimeout(() => {
      const memberIds = new Set(members.map((m) => m.user.id));
      void api<SearchResultsDTO>(`/api/search?q=${encodeURIComponent(addQuery.trim())}`)
        .then((r) => setAddResults(r.people.filter((p) => !memberIds.has(p.user.id))))
        .catch(() => setAddResults([]));
    }, 300);
    return () => {
      if (addDebounce.current) clearTimeout(addDebounce.current);
    };
  }, [addQuery, canManage, members]);

  async function addMember(userId: string) {
    if (!canManage) return;
    setAddBusy(true);
    setAddErr(null);
    try {
      await api(`/api/communities/${community.id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      setAddQuery("");
      setAddResults([]);
      await onCountChange();
    } catch (e) {
      setAddErr(parseApiError(e));
    } finally {
      setAddBusy(false);
    }
  }

  async function remove(userId: string) {
    if (!canManage) return;
    await api(`/api/communities/${community.id}/members/${userId}`, { method: "DELETE" });
    await onCountChange();
  }

  return (
    <section className="cmy-tabpanel">
      {canManage && (
        <div className="cmy-add-member">
          {addErr && <p className="cmy-err">{addErr}</p>}
          <label className="cmy-field">
            <span>Add a member</span>
            <input
              className="cmy-input"
              placeholder="Search by name…"
              value={addQuery}
              onChange={(e) => setAddQuery(e.target.value)}
            />
          </label>
          {addResults.length > 0 && (
            <ul className="cmy-add-member-results">
              {addResults.map((p) => (
                <li key={p.user.id} className="cmy-member-row">
                  <Avatar seed={p.user.avatarSeed} style={p.user.avatarStyle} photoDataUrl={p.user.avatarPhotoDataUrl} params={p.user.avatarParams} size="sm" />
                  <span className="cmy-member-name">{p.user.firstName} {p.user.lastName ?? ""}</span>
                  <button type="button" className="cmy-btn cmy-btn--primary cmy-btn--sm" disabled={addBusy} onClick={() => void addMember(p.user.id)}>
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canManage && (communityRequiresJoinApproval(community) || community.pendingRequestCount > 0) && (
        <JoinRequestsPanel
          communityId={community.id}
          canManage={canManage}
          pending={pendingMembers}
          onChange={onCountChange}
        />
      )}

      {organizer && (
        <>
          <h3 className="cmy-subhead">Organizer</h3>
          <ul className="cmy-member-list cmy-member-card">
            <li className="cmy-member-row">
              <Link to={`/profile/${organizer.user.id}`} state={{ from: "community", communityId: community.id }} className="cmy-member-link-row">
                <Avatar seed={organizer.user.avatarSeed} style={organizer.user.avatarStyle} photoDataUrl={organizer.user.avatarPhotoDataUrl} params={organizer.user.avatarParams} size="sm" />
                <span className="cmy-member-name">{organizer.user.firstName} {organizer.user.lastName ?? ""}</span>
              </Link>
              <MemberNetworkButton
                userId={organizer.user.id}
                status={organizer.networkStatus}
                requestReceived={organizer.networkRequestReceived}
              />
            </li>
          </ul>
        </>
      )}

      <h3 className="cmy-subhead">
        Members <span className="cmy-header-count">{members.length}</span>
      </h3>
      {rest.length > 0 && (
        <ul className="cmy-member-list cmy-member-card">
          {rest.map((m) => (
            <li key={m.user.id} className="cmy-member-row">
              <Link to={`/profile/${m.user.id}`} state={{ from: "community", communityId: community.id }} className="cmy-member-link-row">
                <Avatar seed={m.user.avatarSeed} style={m.user.avatarStyle} photoDataUrl={m.user.avatarPhotoDataUrl} params={m.user.avatarParams} size="sm" />
                <span className="cmy-member-name">{m.user.firstName} {m.user.lastName ?? ""}</span>
              </Link>
              <MemberNetworkButton
                userId={m.user.id}
                status={m.networkStatus}
                requestReceived={m.networkRequestReceived}
              />
              {canManage && (
                <button type="button" className="cmy-icon-btn cmy-remove" onClick={() => void remove(m.user.id)} title="Remove">
                  Remove
                </button>
              )}
              {user?.id === m.user.id && !community.isOrganizer && (
                <button
                  type="button"
                  className="cmy-icon-btn cmy-remove"
                  onClick={() => void api(`/api/communities/${community.id}/leave`, { method: "POST" }).then(() => onCountChange())}
                >
                  Leave
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommunitySocialPills({
  isOrganizer,
  links,
  onEdit,
}: {
  isOrganizer: boolean;
  links?: CommunitySocialLinks | null;
  onEdit: () => void;
}) {
  const items = [
    {
      key: "instagram",
      label: "Instagram",
      handle: links?.instagram,
      href: (h: string) => `https://instagram.com/${encodeURIComponent(h)}`,
      Icon: InstagramGlyph,
    },
    {
      key: "tiktok",
      label: "TikTok",
      handle: links?.tiktok,
      href: (h: string) => `https://www.tiktok.com/@${encodeURIComponent(h)}`,
      Icon: TikTokGlyph,
    },
    {
      key: "linktree",
      label: "Linktree",
      handle: links?.linktree,
      href: (h: string) => `https://linktr.ee/${encodeURIComponent(h)}`,
      Icon: LinktreeGlyph,
    },
  ];
  const visible = isOrganizer ? items : items.filter((it) => it.handle);
  if (visible.length === 0) return null;

  return (
    <div className="cmy-socials">
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
          </a>
        ) : (
          <button
            key={key}
            type="button"
            className={`social-pill social-pill--${key} is-empty`}
            onClick={onEdit}
            aria-label={`Add ${label}`}
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

function LinktreeGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="10" y="2" width="4" height="7" rx="2" />
      <rect x="3" y="9" width="4" height="7" rx="2" />
      <rect x="17" y="9" width="4" height="7" rx="2" />
      <rect x="10" y="9" width="4" height="13" rx="2" />
    </svg>
  );
}

function SettingsTab({
  community,
  members,
  pendingMembers,
  startOnAbout = false,
  onAboutOpened,
  onSaved,
  onRequestsChange,
  onLeft,
  onDeleted,
}: {
  community: CommunityDTO;
  members: CommunityMemberDTO[];
  pendingMembers: CommunityMemberDTO[];
  startOnAbout?: boolean;
  onAboutOpened?: () => void;
  onSaved: (c: CommunityDTO) => void;
  onRequestsChange: () => Promise<void>;
  onLeft: () => void;
  onDeleted: () => void;
}) {
  const coverRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description);
  const [instagram, setInstagram] = useState(community.socialLinks?.instagram ?? "");
  const [tiktok, setTiktok] = useState(community.socialLinks?.tiktok ?? "");
  const [linktree, setLinktree] = useState(community.socialLinks?.linktree ?? "");
  const [categories, setCategories] = useState<CommunityCategory[]>(() => communityCategoriesOf(community));
  const [screening, setScreening] = useState(community.screeningQuestion ?? "");
  const [coverImage, setCoverImage] = useState<string | null>(community.coverImage ?? null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [showCoverLib, setShowCoverLib] = useState(false);
  const [bulletinPermission, setBulletinPermission] = useState<CommunityPostingPermission>(community.bulletinPermission);
  const [planPostingPermission, setPlanPostingPermission] = useState<CommunityPostingPermission>(community.planPostingPermission);
  const [chatEnabled, setChatEnabled] = useState(community.chatEnabled);
  const [bulletinEnabled, setBulletinEnabled] = useState(community.bulletinEnabled);
  const [bulletinRequiresApproval, setBulletinRequiresApproval] = useState(community.bulletinRequiresApproval);
  const [visibility, setVisibility] = useState<CommunityAccessLevel>(community.visibility);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<
    null | "name" | "category" | "about" | "screening" | "permissions" | "channels"
  >(null);

  useEffect(() => {
    setName(community.name);
    setDescription(community.description);
    setInstagram(community.socialLinks?.instagram ?? "");
    setTiktok(community.socialLinks?.tiktok ?? "");
    setLinktree(community.socialLinks?.linktree ?? "");
    setCategories(communityCategoriesOf(community));
    setScreening(community.screeningQuestion ?? "");
    setCoverImage(community.coverImage ?? null);
    setBulletinPermission(community.bulletinPermission);
    setPlanPostingPermission(community.planPostingPermission);
    setChatEnabled(community.chatEnabled);
    setBulletinEnabled(community.bulletinEnabled);
    setBulletinRequiresApproval(community.bulletinRequiresApproval);
    setVisibility(community.visibility);
  }, [community]);

  useEffect(() => {
    if (!startOnAbout) return;
    setOpenRow("about");
    onAboutOpened?.();
  }, [startOnAbout, onAboutOpened]);

  async function applyCoverFile(file: File) {
    setCoverBusy(true);
    setErr(null);
    try {
      setCoverImage(await fileToResizedDataUrl(file, 1024, 0.85));
    } catch {
      setErr("Couldn't read that image. Try another.");
    } finally {
      setCoverBusy(false);
    }
  }

  async function openCoverUpload() {
    if (isNative()) {
      setCoverBusy(true);
      setErr(null);
      try {
        const dataUrl = await pickPhotoNative({ maxPx: 1024, quality: 0.85 });
        if (dataUrl) setCoverImage(dataUrl);
      } catch {
        /* user canceled */
      } finally {
        setCoverBusy(false);
      }
      return;
    }
    coverRef.current?.click();
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      if (!coverImage) {
        setErr("A cover photo is required");
        setBusy(false);
        return;
      }
      if (categories.length === 0) {
        setErr("Pick at least one category");
        setBusy(false);
        return;
      }
      const prevCover = community.coverImage ?? null;
      const updated = await api<CommunityDTO>(`/api/communities/${community.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          description,
          socialLinks: {
            instagram,
            tiktok,
            linktree,
          },
          category: categories[0],
          categories,
          screeningQuestion: screening,
          bulletinPermission,
          planPostingPermission,
          chatEnabled,
          bulletinEnabled,
          bulletinRequiresApproval,
          visibility,
          ...(coverImage !== prevCover ? { coverImage } : {}),
        }),
      });
      onSaved(updated);
      setName(updated.name);
      setDescription(updated.description);
      setInstagram(updated.socialLinks?.instagram ?? "");
      setTiktok(updated.socialLinks?.tiktok ?? "");
      setLinktree(updated.socialLinks?.linktree ?? "");
      setCategories(communityCategoriesOf(updated));
      setScreening(updated.screeningQuestion ?? "");
      setCoverImage(updated.coverImage ?? null);
      setBulletinPermission(updated.bulletinPermission);
      setPlanPostingPermission(updated.planPostingPermission);
      setChatEnabled(updated.chatEnabled);
      setBulletinEnabled(updated.bulletinEnabled);
      setBulletinRequiresApproval(updated.bulletinRequiresApproval);
      setVisibility(updated.visibility);
      setMsg("Saved.");
    } catch (e) {
      setErr(cleanError(e));
    } finally {
      setBusy(false);
    }
  }

  // Organizer-only — Settings tab is already gated, but mirror canManage into
  // the panel so Approve/Decline never render without an organizer check.
  const canManage = community.isOrganizer;

  return (
    <section className="cmy-tabpanel cmy-settings">
      {canManage && (communityRequiresJoinApproval(community) || community.pendingRequestCount > 0) && (
        <JoinRequestsPanel
          communityId={community.id}
          canManage={canManage}
          pending={pendingMembers}
          onChange={onRequestsChange}
        />
      )}
      <div className="cmy-cover-upload">
        <span className="cmy-field-label">Cover image</span>
        {coverImage ? (
          <div className="cmy-cover-preview" style={{ backgroundImage: `url(${coverImage})` }}>
            <div className="cmy-cover-preview-actions">
              <button
                type="button"
                className="cmy-btn cmy-btn--ghost cmy-btn--sm"
                disabled={coverBusy}
                onClick={() => setShowCoverLib(true)}
              >
                Library
              </button>
              <button
                type="button"
                className="cmy-btn cmy-btn--ghost cmy-btn--sm"
                disabled={coverBusy}
                onClick={() => void openCoverUpload()}
              >
                Upload
              </button>
            </div>
          </div>
        ) : (
          <div className="cmy-cover-empty">
            <button
              type="button"
              className="cmy-cover-upload-btn"
              disabled={coverBusy}
              onClick={() => setShowCoverLib(true)}
            >
              Choose from library
            </button>
            <button
              type="button"
              className="cmy-btn cmy-btn--ghost cmy-btn--sm"
              disabled={coverBusy}
              onClick={() => void openCoverUpload()}
            >
              {coverBusy ? "Uploading…" : "Upload your own"}
            </button>
          </div>
        )}
        <input
          ref={coverRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void applyCoverFile(f);
            if (coverRef.current) coverRef.current.value = "";
          }}
        />
      </div>
      {showCoverLib && (
        <CoverLibraryModal
          onPick={(url) => {
            setCoverImage(url);
            setShowCoverLib(false);
          }}
          onClose={() => setShowCoverLib(false)}
        />
      )}

      <div className="cmy-settings-list">
        <SettingsRow
          id="name"
          label="Name"
          summary={name || "Untitled"}
          open={openRow === "name"}
          onToggle={() => setOpenRow((r) => (r === "name" ? null : "name"))}
        >
          <input className="cmy-input" value={name} onChange={(e) => setName(e.target.value)} />
        </SettingsRow>

        <SettingsRow
          id="category"
          label="Categories"
          summary={communityCategoryLine({ category: categories[0] ?? community.category, categories }) || "Pick up to 3"}
          open={openRow === "category"}
          onToggle={() => setOpenRow((r) => (r === "category" ? null : "category"))}
        >
          <div className="cmy-create-cats" role="group" aria-label="Categories">
            {ALL_COMMUNITY_CATEGORIES.map((c) => {
              const selected = categories.includes(c);
              const blocked = !selected && categories.length >= MAX_COMMUNITY_CATEGORIES;
              return (
                <button
                  key={c}
                  type="button"
                  className={`cmy-cat-pill ${selected ? "is-active" : ""}`}
                  aria-pressed={selected}
                  disabled={blocked}
                  onClick={() => setCategories((prev) => toggleCommunityCategory(prev, c))}
                >
                  {COMMUNITY_CATEGORY_LABELS[c]}
                </button>
              );
            })}
          </div>
        </SettingsRow>

        <SettingsRow
          id="about"
          label="About"
          summary={description.trim() ? description.trim().slice(0, 48) + (description.trim().length > 48 ? "…" : "") : "Add a description"}
          open={openRow === "about"}
          onToggle={() => setOpenRow((r) => (r === "about" ? null : "about"))}
        >
          <textarea
            className="cmy-textarea"
            rows={4}
            value={description}
            placeholder="What is this community about? Paste your profile link to connect it."
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="cmy-social-fields">
          <label className="cmy-field">
            <span>Instagram</span>
            <input
              className="cmy-input"
              value={instagram}
              placeholder="@handle"
              maxLength={200}
              onChange={(e) => setInstagram(e.target.value)}
            />
          </label>
          <label className="cmy-field">
            <span>TikTok</span>
            <input
              className="cmy-input"
              value={tiktok}
              placeholder="@handle"
              maxLength={200}
              onChange={(e) => setTiktok(e.target.value)}
            />
          </label>
          <label className="cmy-field">
            <span>Linktree</span>
            <input
              className="cmy-input"
              value={linktree}
              placeholder="linktr.ee/you"
              maxLength={200}
              onChange={(e) => setLinktree(e.target.value)}
            />
          </label>
          </div>
        </SettingsRow>

        <SettingsRow
          id="screening"
          label="Screening"
          summary={
            screening.trim()
              ? "Question set"
              : visibility === "members_only"
                ? "Approval required"
                : "Anyone can join"
          }
          open={openRow === "screening"}
          onToggle={() => setOpenRow((r) => (r === "screening" ? null : "screening"))}
        >
          <p className="cmy-hint" style={{ margin: "0 0 8px" }}>
            {visibility === "members_only"
              ? "Optional. People still need your approval to join."
              : "Leave blank and anyone can walk in."}
          </p>
          <textarea
            className="cmy-textarea"
            rows={3}
            value={screening}
            placeholder="e.g. What's your typical pace?"
            onChange={(e) => setScreening(e.target.value)}
          />
        </SettingsRow>

        <SettingsRow
          id="permissions"
          label="Permissions"
          summary={
            visibility === "everyone"
              ? "Open · plans " + (planPostingPermission === "members" ? "anyone" : "organizer")
              : "Members only · plans " + (planPostingPermission === "members" ? "anyone" : "organizer")
          }
          open={openRow === "permissions"}
          onToggle={() => setOpenRow((r) => (r === "permissions" ? null : "permissions"))}
        >
          <div className="cmy-field">
            <span>Who can post plans?</span>
            <Segmented
              value={planPostingPermission}
              onChange={setPlanPostingPermission}
              options={[["members", "All members"], ["organizer_only", "Organizer only"]]}
            />
          </div>
          <div className="cmy-field" style={{ marginTop: 12 }}>
            <span>Who&apos;s inside</span>
            <Segmented
              value={visibility}
              onChange={setVisibility}
              options={[["everyone", "Everyone"], ["members_only", "Members only"]]}
            />
          </div>
          {bulletinEnabled && (
            <>
              <div className="cmy-field" style={{ marginTop: 12 }}>
                <span>Who can post to the bulletin?</span>
                <Segmented
                  value={bulletinPermission}
                  onChange={setBulletinPermission}
                  options={[["members", "All members"], ["organizer_only", "Organizer only"]]}
                />
              </div>
              {bulletinPermission === "members" && (
                <div className="cmy-toggle-row" style={{ marginTop: 12 }}>
                  <span>Require approval for member posts</span>
                  <button
                    type="button"
                    className={`cmy-chip-toggle ${bulletinRequiresApproval ? "is-active" : ""}`}
                    aria-pressed={bulletinRequiresApproval}
                    onClick={() => setBulletinRequiresApproval((v) => !v)}
                  >
                    {bulletinRequiresApproval ? "On" : "Off"}
                  </button>
                </div>
              )}
            </>
          )}
        </SettingsRow>

        <SettingsRow
          id="channels"
          label="Chat & Bulletin"
          summary={[
            chatEnabled ? "Chat on" : "Chat off",
            bulletinEnabled ? "Bulletin on" : "Bulletin off",
          ].join(" · ")}
          open={openRow === "channels"}
          onToggle={() => setOpenRow((r) => (r === "channels" ? null : "channels"))}
        >
          <div className="cmy-toggle-row">
            <span>Group chat</span>
            <button
              type="button"
              className={`cmy-chip-toggle ${chatEnabled ? "is-active" : ""}`}
              aria-pressed={chatEnabled}
              onClick={() => setChatEnabled((v) => !v)}
            >
              {chatEnabled ? "On" : "Off"}
            </button>
          </div>
          <div className="cmy-toggle-row" style={{ marginTop: 12 }}>
            <span>Bulletin</span>
            <button
              type="button"
              className={`cmy-chip-toggle ${bulletinEnabled ? "is-active" : ""}`}
              aria-pressed={bulletinEnabled}
              onClick={() => setBulletinEnabled((v) => !v)}
            >
              {bulletinEnabled ? "On" : "Off"}
            </button>
          </div>
        </SettingsRow>
      </div>

      {err && <p className="cmy-err">{err}</p>}
      {msg && <p className="cmy-saved">{msg}</p>}
      <button type="button" className="cmy-btn cmy-btn--primary cmy-btn--block" disabled={busy} onClick={save}>
        Save changes
      </button>

      <OrganizerExitControls
        community={community}
        members={members}
        onLeft={onLeft}
        onDeleted={onDeleted}
      />
    </section>
  );
}

/**
 * Transfer-then-leave (hand off to an active member) or delete the community
 * outright. Lives in Settings so organizers have one place for ownership exit.
 */
function OrganizerExitControls({
  community,
  members: allMembers,
  onLeft,
  onDeleted,
}: {
  community: CommunityDTO;
  members: CommunityMemberDTO[];
  onLeft: () => void;
  onDeleted: () => void;
}) {
  const members = allMembers.filter((m) => m.role !== "organizer");
  const [transferOpen, setTransferOpen] = useState(false);
  const [pendingTransfer, setPendingTransfer] = useState<CommunityMemberDTO | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function transferTo(member: CommunityMemberDTO) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/communities/${community.id}/transfer-organizer`, {
        method: "POST",
        body: JSON.stringify({ newOrganizerId: member.user.id }),
      });
      onLeft();
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCommunity() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/communities/${community.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  }

  if (pendingTransfer) {
    return (
      <div className="cmy-danger-zone" role="group">
        <h3 className="cmy-danger-title">Hand off & leave</h3>
        <p className="cmy-danger-copy">
          Make {pendingTransfer.user.firstName} the organizer of &ldquo;{community.name}&rdquo;?
          You&apos;ll leave the community.
        </p>
        {error && <p className="cmy-err">{error}</p>}
        <div className="cmy-danger-actions">
          <button
            type="button"
            className="cmy-btn cmy-btn--ghost"
            disabled={busy}
            onClick={() => setPendingTransfer(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cmy-btn cmy-btn--primary"
            disabled={busy}
            onClick={() => void transferTo(pendingTransfer)}
          >
            {busy ? "Handing off…" : `Hand off to ${pendingTransfer.user.firstName}`}
          </button>
        </div>
      </div>
    );
  }

  if (confirmDelete) {
    return (
      <div className="cmy-danger-zone" role="group">
        <h3 className="cmy-danger-title">Delete community</h3>
        <p className="cmy-danger-copy">
          Permanently delete &ldquo;{community.name}&rdquo;? This removes members, the bulletin,
          and chat, and cancels any open community plans. This can&apos;t be undone.
        </p>
        {error && <p className="cmy-err">{error}</p>}
        <div className="cmy-danger-actions">
          <button
            type="button"
            className="cmy-btn cmy-btn--ghost"
            disabled={busy}
            onClick={() => setConfirmDelete(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cmy-btn cmy-btn--danger"
            disabled={busy}
            onClick={() => void deleteCommunity()}
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cmy-danger-zone">
      <h3 className="cmy-danger-title">Leave or delete</h3>
      <p className="cmy-danger-copy">
        Hand the community to another member and leave, or delete it for everyone.
      </p>
      {error && <p className="cmy-err">{error}</p>}

      {!transferOpen ? (
        <button
          type="button"
          className="cmy-btn cmy-btn--ghost cmy-btn--block"
          disabled={busy}
          onClick={() => setTransferOpen(true)}
        >
          Transfer & leave
        </button>
      ) : members.length === 0 ? (
        <p className="cmy-hint">
          Add another active member first, then you can hand off. Or delete the community below.
        </p>
      ) : (
        <ul className="cmy-transfer-list">
          {members.map((m) => (
            <li key={m.user.id}>
              <button
                type="button"
                className="cmy-transfer-pick"
                disabled={busy}
                onClick={() => setPendingTransfer(m)}
              >
                <Avatar
                  seed={m.user.avatarSeed}
                  style={m.user.avatarStyle}
                  photoDataUrl={m.user.avatarPhotoDataUrl}
                  params={m.user.avatarParams}
                  size="sm"
                />
                <span>
                  {m.user.firstName} {m.user.lastName ?? ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="cmy-btn cmy-btn--danger-ghost cmy-btn--block"
        disabled={busy}
        onClick={() => {
          setTransferOpen(false);
          setConfirmDelete(true);
        }}
      >
        Delete community
      </button>
    </div>
  );
}

function SettingsRow({
  id,
  label,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = `cmy-settings-panel-${id}`;
  return (
    <div className={`cmy-settings-row ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="cmy-settings-row-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="cmy-settings-row-text">
          <span className="cmy-settings-row-label">{label}</span>
          <span className="cmy-settings-row-summary">{summary}</span>
        </span>
        <span className="cmy-settings-row-chevron" aria-hidden="true">
          {open ? "▾" : "›"}
        </span>
      </button>
      {open && (
        <div className="cmy-settings-row-panel" id={panelId}>
          {children}
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <div className="cmy-segmented">
      {options.map(([val, label]) => (
        <button
          key={val}
          type="button"
          className={`cmy-seg ${value === val ? "cmy-seg--active" : ""}`}
          onClick={() => onChange(val)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function cleanError(e: unknown): string {
  return parseApiError(e);
}
