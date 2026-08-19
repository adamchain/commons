import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, parseApiError } from "../api/http";
import { Avatar } from "../components/Avatar";
import { CommunityCover } from "../components/CommunityCover";
import { CoverLibraryModal } from "../components/CoverLibraryModal";
import { PlanCard } from "../components/PlanCard";
import {
  ALL_COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LABELS,
  type CommunityAccessLevel,
  type CommunityCategory,
  type CommunityDTO,
  type CommunityMemberDTO,
  type CommunityPostDTO,
  type CommunityPostingPermission,
  type PersonSearchResultDTO,
  type PlanDTO,
  type SearchResultsDTO,
} from "../types/shared";
import { formatRelative } from "../lib/format";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { pickPhotoNative } from "../lib/photoPicker";
import { hrefForBack, type NavFromState } from "../lib/navState";
import { isNative } from "../lib/platform";
import "./Communities.css";

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
        <button type="button" className="cmy-btn cmy-btn--ghost cmy-btn--sm" onClick={() => navigate(backHref)}>
          ← Back
        </button>
        <p className="cmy-muted">Loading…</p>
      </main>
    );
  }
  if (notFound || !community) {
    return (
      <main className="app-shell app-shell--with-nav app-shell--with-topbar cmy">
        <p className="cmy-muted">This community isn’t available.</p>
        <Link to={backHref} className="cmy-btn cmy-btn--ghost">← All communities</Link>
      </main>
    );
  }

  const catLabel = COMMUNITY_CATEGORY_LABELS[community.category];
  const isActiveMember = community.myMembership?.status === "active";
  // isOrganizer is the real community organizer only (never a COMMONS admin).
  const showChatTab = community.chatEnabled && (isActiveMember || community.isOrganizer);
  // Board view is open for instant-join / "Everyone" communities. Locked for
  // request-to-join (screening) or visibility=members_only. Posting / chat /
  // manage still require membership regardless.
  const boardRestricted =
    community.hasScreening || community.visibility === "members_only";
  const canSeeInside = !boardRestricted || isActiveMember || community.isOrganizer;
  const canPostBulletin = community.canPostBulletin && (isActiveMember || community.isOrganizer);
  const canPostPlan = community.canPostPlan && (isActiveMember || community.isOrganizer);
  const canManage = community.isOrganizer;

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar cmy">
      {community.creationStatus === "pending" && (
        <div className="cmy-review-banner">
          ⏳ Pending review — COMMONS is reviewing this community before it goes live.
        </div>
      )}
      {community.creationStatus === "rejected" && (
        <div className="cmy-review-banner cmy-review-banner--warn">
          This community was taken offline. Edit any setting to republish it.
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
            ←
          </button>
          <div className="cmy-cover-overlay">
            <span className="cmy-cover-tag">{catLabel}</span>
            <div className="cmy-cover-title-row">
              <h1 className="cmy-name">{community.name}</h1>
              {community.isFounding && <span className="cmy-founding">★ Founding</span>}
            </div>
          </div>
        </div>
        <div className="cmy-header-body">
          <div className="cmy-header-row">
            <div className="cmy-header-info">
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
              <span className="cmy-header-meta">
                {community.memberCount} {community.memberCount === 1 ? "member" : "members"} · Organized by {community.organizer.firstName}
              </span>
            </div>
            <JoinControl community={community} onChange={setCommunity} reload={load} />
          </div>
          {community.description && (
            <div className="cmy-about">
              <p className="cmy-desc">{community.description}</p>
            </div>
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

      {tab === "bulletin" && community.bulletinEnabled && (canSeeInside ? <BulletinTab community={community} canPost={canPostBulletin} onPendingChange={load} /> : (
        <LockedPanel community={community} onChange={setCommunity} reload={load} />
      ))}
      {tab === "events" && (
        canSeeInside ? (
          <EventsTab
            community={community}
            canPost={canPostPlan}
            onPostPlan={() =>
              navigate(
                `/plans/new?communityId=${encodeURIComponent(community.id)}&communityName=${encodeURIComponent(community.name)}`,
              )
            }
          />
        ) : (
          <LockedPanel community={community} onChange={setCommunity} reload={load} />
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
        <LockedPanel community={community} onChange={setCommunity} reload={load} />
      ))}
      {tab === "settings" && canManage && (
        <SettingsTab
          community={community}
          members={members}
          pendingMembers={pendingMembers}
          onSaved={setCommunity}
          onRequestsChange={load}
          onLeft={() => navigate("/communities")}
          onDeleted={() => navigate("/communities")}
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
      <div className="cmy-requests cmy-requests--empty">
        <h3 className="cmy-subhead">Join requests</h3>
        <p className="cmy-muted">No pending requests.</p>
      </div>
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
            <Link to={`/profile/${m.user.id}`} className="cmy-member-row cmy-member-link">
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
}: {
  community: CommunityDTO;
  onChange: (c: CommunityDTO) => void;
  reload: () => Promise<void>;
}) {
  return (
    <section className="cmy-tabpanel">
      <div className="cmy-locked">
        <span className="cmy-locked-icon" aria-hidden="true">🔒</span>
        <p className="cmy-locked-text">Join to see what’s happening inside.</p>
        <div className="cmy-locked-join">
          <JoinControl community={community} onChange={onChange} reload={reload} />
        </div>
      </div>
    </section>
  );
}

function JoinControl({
  community,
  onChange,
  reload,
}: {
  community: CommunityDTO;
  onChange: (c: CommunityDTO) => void;
  reload: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Local success flag so we can show confirmation even before parent state settles. */
  const [requested, setRequested] = useState(community.myMembership?.status === "pending");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (community.myMembership?.status === "pending") setRequested(true);
    if (community.myMembership?.status === "active" || !community.myMembership) {
      setRequested(false);
    }
  }, [community.myMembership?.status]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function doJoin(screeningAnswer?: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await api<CommunityDTO>(`/api/communities/${community.id}/join`, {
        method: "POST",
        body: JSON.stringify(screeningAnswer ? { screeningAnswer } : {}),
      });
      onChange(updated);
      setAsking(false);
      setAnswer("");
      if (updated.myMembership?.status === "pending") {
        setRequested(true);
        setToast("Request sent");
      } else if (updated.myMembership?.status === "active") {
        setToast("You're in");
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

  if (status === "active") {
    return (
      <div className="cmy-join-row cmy-join-col">
        <div className="cmy-join-row">
          <span className="cmy-member-pill">Member ✓</span>
          {!community.isOrganizer && (
            <button type="button" className="cmy-btn cmy-btn--ghost" disabled={busy} onClick={() => void doLeave()}>
              {busy ? "Leaving…" : "Leave"}
            </button>
          )}
        </div>
        {toast && (
          <p className="cmy-join-toast" role="status" aria-live="polite">
            {toast}
          </p>
        )}
      </div>
    );
  }
  if (isPending) {
    return (
      <>
        <span className="cmy-status-pill">Requested</span>
        <p className="cmy-pending-note">
          Request sent — organizers usually respond within a day.
        </p>
      </>
    );
  }

  // Visitor
  if (community.hasScreening && asking) {
    return (
      <div className="cmy-screen">
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
    <div className="cmy-join-row cmy-join-col">
      <button
        type="button"
        className="cmy-btn cmy-btn--primary"
        disabled={busy}
        onClick={() => (community.hasScreening ? setAsking(true) : void doJoin())}
      >
        {busy
          ? community.hasScreening
            ? "Sending…"
            : "Joining…"
          : community.hasScreening
            ? "Request to join"
            : "Join"}
      </button>
      {err && <p className="cmy-err">{err}</p>}
      {toast && (
        <p className="cmy-join-toast" role="status" aria-live="polite">
          {toast}
        </p>
      )}
    </div>
  );
}

function BulletinTab({
  community,
  canPost,
  onPendingChange,
}: {
  community: CommunityDTO;
  canPost: boolean;
  onPendingChange?: () => void;
}) {
  const [posts, setPosts] = useState<CommunityPostDTO[]>([]);
  const [pending, setPending] = useState<CommunityPostDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [postErr, setPostErr] = useState<string | null>(null);

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

  const livePosts = posts.filter((p) => p.approvalStatus === "approved");
  const myPending = posts.filter((p) => p.approvalStatus === "pending");
  const composerHint = community.bulletinRequiresApproval && !community.isOrganizer
    ? "Submit a post for approval…"
    : "Post something to the group…";

  return (
    <section className="cmy-tabpanel">
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
                  {p.canDelete && (
                    <div className="cmy-post-actions">
                      <button type="button" className="cmy-icon-btn" onClick={() => del(p.id)} title="Delete">×</button>
                    </div>
                  )}
                </div>
                {p.content && <p className="cmy-post-body">{p.content}</p>}
                {p.image && <img className="cmy-post-image" src={p.image} alt="" loading="lazy" />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {livePosts.length === 0 && pending.length === 0 && myPending.length === 0 && (
        <p className="cmy-muted">No posts yet. Start the conversation.</p>
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
                {p.canDelete && (
                  <button type="button" className="cmy-icon-btn" onClick={() => del(p.id)} title="Delete">×</button>
                )}
              </div>
            </div>
            {p.content && <p className="cmy-post-body">{p.content}</p>}
            {p.image && <img className="cmy-post-image" src={p.image} alt="" loading="lazy" />}
          </li>
        ))}
      </ul>

      {canPost && (
        <div className="cmy-composer">
          {postErr && <p className="cmy-err">{postErr}</p>}
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
      )}
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

  return (
    <section className="cmy-tabpanel">
      {canPost && (
        <button type="button" className="cmy-btn cmy-btn--primary cmy-btn--block" onClick={onPostPlan}>
          + Post a plan
        </button>
      )}
      {loaded && plans.length === 0 && <p className="cmy-muted">No events yet.</p>}
      <div className="cmy-events">
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} onPlanRefresh={load} />
        ))}
      </div>
    </section>
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
  // Real organizer only (same as P0 non-member-permissions fix — never admin).
  const canManage = community.isOrganizer;
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<PersonSearchResultDTO[]>([]);
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
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

  async function shareCommunity() {
    const url = `${window.location.origin}/communities/${community.id}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: community.name, text: `Join ${community.name} on COMMONS`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareMsg("Link copied.");
        setTimeout(() => setShareMsg(null), 2500);
      }
    } catch {
      /* user cancelled share sheet */
    }
  }

  async function remove(userId: string) {
    if (!canManage) return;
    await api(`/api/communities/${community.id}/members/${userId}`, { method: "DELETE" });
    await onCountChange();
  }

  return (
    <section className="cmy-tabpanel">
      {canManage && community.creationStatus === "approved" && (
        <div className="cmy-members-tools">
          <button type="button" className="cmy-btn cmy-btn--ghost cmy-btn--sm" onClick={() => void shareCommunity()}>
            Share community
          </button>
          {shareMsg && <span className="cmy-saved">{shareMsg}</span>}
        </div>
      )}

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

      {canManage && (community.hasScreening || community.pendingRequestCount > 0) && (
        <JoinRequestsPanel
          communityId={community.id}
          canManage={canManage}
          pending={pendingMembers}
          onChange={onCountChange}
        />
      )}

      <h3 className="cmy-subhead">{members.length} {members.length === 1 ? "member" : "members"}</h3>
      <ul className="cmy-member-list">
        {members.map((m) => (
          <li key={m.user.id} className="cmy-member-row">
            <Link to={`/profile/${m.user.id}`} className="cmy-member-link-row">
              <Avatar seed={m.user.avatarSeed} style={m.user.avatarStyle} photoDataUrl={m.user.avatarPhotoDataUrl} params={m.user.avatarParams} size="sm" />
              <span className="cmy-member-name">{m.user.firstName} {m.user.lastName ?? ""}</span>
            </Link>
            {m.role === "organizer" && <span className="cmy-org-badge">Organizer</span>}
            {canManage && m.role !== "organizer" && (
              <button type="button" className="cmy-icon-btn cmy-remove" onClick={() => void remove(m.user.id)} title="Remove">
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SettingsTab({
  community,
  members,
  pendingMembers,
  onSaved,
  onRequestsChange,
  onLeft,
  onDeleted,
}: {
  community: CommunityDTO;
  members: CommunityMemberDTO[];
  pendingMembers: CommunityMemberDTO[];
  onSaved: (c: CommunityDTO) => void;
  onRequestsChange: () => Promise<void>;
  onLeft: () => void;
  onDeleted: () => void;
}) {
  const coverRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description);
  const [category, setCategory] = useState<CommunityCategory>(community.category);
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
    setCategory(community.category);
    setScreening(community.screeningQuestion ?? "");
    setCoverImage(community.coverImage ?? null);
    setBulletinPermission(community.bulletinPermission);
    setPlanPostingPermission(community.planPostingPermission);
    setChatEnabled(community.chatEnabled);
    setBulletinEnabled(community.bulletinEnabled);
    setBulletinRequiresApproval(community.bulletinRequiresApproval);
    setVisibility(community.visibility);
  }, [community]);

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
      const prevCover = community.coverImage ?? null;
      const updated = await api<CommunityDTO>(`/api/communities/${community.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          description,
          category,
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
      setCategory(updated.category);
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
      {canManage && (community.hasScreening || community.pendingRequestCount > 0) && (
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
              <button
                type="button"
                className="cmy-btn cmy-btn--ghost cmy-btn--sm"
                disabled={coverBusy}
                onClick={() => setCoverImage(null)}
              >
                Remove
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
          label="Category"
          summary={COMMUNITY_CATEGORY_LABELS[category]}
          open={openRow === "category"}
          onToggle={() => setOpenRow((r) => (r === "category" ? null : "category"))}
        >
          <select
            className="cmy-input"
            value={category}
            onChange={(e) => setCategory(e.target.value as CommunityCategory)}
          >
            {ALL_COMMUNITY_CATEGORIES.map((c) => (
              <option key={c} value={c}>{COMMUNITY_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
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
            placeholder="What is this community about?"
            onChange={(e) => setDescription(e.target.value)}
          />
        </SettingsRow>

        <SettingsRow
          id="screening"
          label="Screening"
          summary={screening.trim() ? "Question set" : "Anyone can join"}
          open={openRow === "screening"}
          onToggle={() => setOpenRow((r) => (r === "screening" ? null : "screening"))}
        >
          <p className="cmy-hint" style={{ margin: "0 0 8px" }}>
            Leave blank to let anyone join instantly.
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
            <span>Who can see inside <em className="cmy-hint">(name, cover, and description stay public)</em></span>
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
