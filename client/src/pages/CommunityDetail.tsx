import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
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
import "./Communities.css";

type Tab = "bulletin" | "events" | "chat" | "members" | "settings";

export function CommunityDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [community, setCommunity] = useState<CommunityDTO | null>(null);
  const [previewMembers, setPreviewMembers] = useState<CommunityMemberDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("bulletin");

  const load = useCallback(async () => {
    try {
      const c = await api<CommunityDTO>(`/api/communities/${id}`);
      setCommunity(c);
      setTab((prev) => (prev === "bulletin" && !c.bulletinEnabled ? "events" : prev));
      try {
        const m = await api<{ members: CommunityMemberDTO[] }>(`/api/communities/${id}/members`);
        setPreviewMembers(m.members.slice(0, 3));
      } catch {
        setPreviewMembers([]);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

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
        <p className="cmy-muted">Loading…</p>
      </main>
    );
  }
  if (notFound || !community) {
    return (
      <main className="app-shell app-shell--with-nav app-shell--with-topbar cmy">
        <p className="cmy-muted">This community isn’t available.</p>
        <Link to="/communities" className="cmy-btn cmy-btn--ghost">← All communities</Link>
      </main>
    );
  }

  const catLabel = COMMUNITY_CATEGORY_LABELS[community.category];
  const isActiveMember = community.myMembership?.status === "active";
  const showChatTab = community.chatEnabled && (isActiveMember || community.isOrganizer);
  // "Members only" communities keep discovery info (name/cover/description/count)
  // public, but lock the bulletin/events/members tabs to active members + the organizer.
  const canSeeInside = community.visibility !== "members_only" || isActiveMember || community.isOrganizer;

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar cmy">
      {community.creationStatus === "pending" && (
        <div className="cmy-review-banner">
          ⏳ Pending review — COMMONS is reviewing this community before it goes live.
        </div>
      )}
      {community.creationStatus === "rejected" && (
        <div className="cmy-review-banner cmy-review-banner--warn">
          This community wasn’t approved. You can edit it and resubmit.
        </div>
      )}

      {/* Header — category + name overlay the cover photo; a single compressed
          row below carries member avatars, the meta line, and the Join pill. */}
      <header className="cmy-header">
        <div
          className="cmy-cover"
          style={community.coverImage ? { backgroundImage: `url(${community.coverImage})` } : undefined}
          data-cat={community.category}
        >
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
              {previewMembers.length > 0 && (
                <span className="cmy-header-avatars">
                  {previewMembers.map((m) => (
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
          {community.description && <p className="cmy-desc">{community.description}</p>}
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
          <TabButton id="chat" tab={tab} setTab={setTab} onSelect={() => navigate(`/communities/${community.id}/chat`, { state: { from: "community" } })}>
            Chat
          </TabButton>
        )}
        <TabButton id="members" tab={tab} setTab={setTab} badge={community.pendingRequestCount || undefined}>Members</TabButton>
        {community.isOrganizer && <TabButton id="settings" tab={tab} setTab={setTab}>Settings</TabButton>}
      </nav>

      {tab === "bulletin" && community.bulletinEnabled && (canSeeInside ? <BulletinTab community={community} onPendingChange={load} /> : <LockedPanel />)}
      {tab === "events" && (
        canSeeInside ? (
          <EventsTab community={community} onPostPlan={() => navigate(`/plans/new?communityId=${community.id}`)} />
        ) : (
          <LockedPanel />
        )
      )}
      {tab === "members" && (canSeeInside ? <MembersTab community={community} onCountChange={load} /> : <LockedPanel />)}
      {tab === "settings" && community.isOrganizer && (
        <SettingsTab community={community} onSaved={setCommunity} />
      )}
    </main>
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

function LockedPanel() {
  return (
    <section className="cmy-tabpanel">
      <div className="cmy-locked">
        <span className="cmy-locked-icon" aria-hidden="true">🔒</span>
        <p className="cmy-locked-text">Join to see what’s happening inside.</p>
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
  const [justRequested, setJustRequested] = useState(false);

  async function doJoin(screeningAnswer?: string) {
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
      if (updated.myMembership?.status === "pending") setJustRequested(true);
    } catch (e) {
      setErr(cleanError(e));
    } finally {
      setBusy(false);
    }
  }

  async function doLeave() {
    setBusy(true);
    try {
      const updated = await api<CommunityDTO>(`/api/communities/${community.id}/leave`, { method: "POST" });
      onChange(updated);
      await reload();
    } catch (e) {
      setErr(cleanError(e));
    } finally {
      setBusy(false);
    }
  }

  if (community.creationStatus !== "approved") return null;

  const status = community.myMembership?.status;
  if (status === "active") {
    return (
      <div className="cmy-join-row">
        <span className="cmy-member-pill">Member ✓</span>
        {!community.isOrganizer && (
          <button type="button" className="cmy-btn cmy-btn--ghost" disabled={busy} onClick={doLeave}>
            Leave
          </button>
        )}
      </div>
    );
  }
  if (status === "pending") {
    return (
      <div className="cmy-join-row cmy-join-col">
        <button type="button" className="cmy-btn cmy-btn--ghost" disabled>Requested</button>
        {justRequested && (
          <p className="cmy-pending-note">Request sent — organizers usually respond within a day.</p>
        )}
      </div>
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
        />
        {err && <p className="cmy-err">{err}</p>}
        <div className="cmy-join-row">
          <button
            type="button"
            className="cmy-btn cmy-btn--primary"
            disabled={busy || !answer.trim()}
            onClick={() => doJoin(answer.trim())}
          >
            Send request
          </button>
          <button type="button" className="cmy-btn cmy-btn--ghost" onClick={() => setAsking(false)}>
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
        className="cmy-btn cmy-btn--primary"
        disabled={busy}
        onClick={() => (community.hasScreening ? setAsking(true) : doJoin())}
      >
        {community.hasScreening ? "Request to join" : "Join"}
      </button>
      {err && <p className="cmy-err">{err}</p>}
    </div>
  );
}

function BulletinTab({ community, onPendingChange }: { community: CommunityDTO; onPendingChange?: () => void }) {
  const [posts, setPosts] = useState<CommunityPostDTO[]>([]);
  const [pending, setPending] = useState<CommunityPostDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

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
    try {
      await api(`/api/communities/${community.id}/posts`, {
        method: "POST",
        body: JSON.stringify({ content: draft.trim() }),
      });
      setDraft("");
      await load();
      onPendingChange?.();
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

      {community.canPostBulletin && (
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
      )}
    </section>
  );
}

function EventsTab({ community, onPostPlan }: { community: CommunityDTO; onPostPlan: () => void }) {
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
      {community.canPostPlan && (
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

function MembersTab({ community, onCountChange }: { community: CommunityDTO; onCountChange: () => Promise<void> }) {
  const [members, setMembers] = useState<CommunityMemberDTO[]>([]);
  const [pending, setPending] = useState<CommunityMemberDTO[]>([]);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<PersonSearchResultDTO[]>([]);
  const [addBusy, setAddBusy] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const addDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ members: CommunityMemberDTO[]; pending: CommunityMemberDTO[] }>(
      `/api/communities/${community.id}/members`,
    );
    setMembers(r.members);
    setPending(r.pending ?? []);
  }, [community.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!community.isOrganizer || !addQuery.trim()) {
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
  }, [addQuery, community.isOrganizer, members]);

  async function addMember(userId: string) {
    setAddBusy(true);
    try {
      await api(`/api/communities/${community.id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      setAddQuery("");
      setAddResults([]);
      await load();
      await onCountChange();
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

  async function approve(userId: string) {
    await api(`/api/communities/${community.id}/members/${userId}/approve`, { method: "POST" });
    await load();
    await onCountChange();
  }
  async function decline(userId: string) {
    await api(`/api/communities/${community.id}/members/${userId}/decline`, { method: "POST" });
    await load();
  }
  async function remove(userId: string) {
    await api(`/api/communities/${community.id}/members/${userId}`, { method: "DELETE" });
    await load();
    await onCountChange();
  }

  return (
    <section className="cmy-tabpanel">
      {community.isOrganizer && community.creationStatus === "approved" && (
        <div className="cmy-members-tools">
          <button type="button" className="cmy-btn cmy-btn--ghost cmy-btn--sm" onClick={() => void shareCommunity()}>
            Share community
          </button>
          {shareMsg && <span className="cmy-saved">{shareMsg}</span>}
        </div>
      )}

      {community.isOrganizer && (
        <div className="cmy-add-member">
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

      {community.isOrganizer && pending.length > 0 && (
        <div className="cmy-requests">
          <h3 className="cmy-subhead">Requests</h3>
          <ul className="cmy-member-list">
            {pending.map((m) => (
              <li key={m.user.id} className="cmy-request">
                <Link to={`/profile/${m.user.id}`} className="cmy-member-row cmy-member-link">
                  <Avatar seed={m.user.avatarSeed} style={m.user.avatarStyle} photoDataUrl={m.user.avatarPhotoDataUrl} params={m.user.avatarParams} size="sm" />
                  <span className="cmy-member-name">{m.user.firstName} {m.user.lastName ?? ""}</span>
                </Link>
                {m.screeningAnswer && <p className="cmy-answer">“{m.screeningAnswer}”</p>}
                <div className="cmy-join-row">
                  <button type="button" className="cmy-btn cmy-btn--primary cmy-btn--sm" onClick={() => approve(m.user.id)}>Approve</button>
                  <button type="button" className="cmy-btn cmy-btn--ghost cmy-btn--sm" onClick={() => decline(m.user.id)}>Decline</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
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
            {community.isOrganizer && m.role !== "organizer" && (
              <button type="button" className="cmy-icon-btn cmy-remove" onClick={() => remove(m.user.id)} title="Remove">
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SettingsTab({ community, onSaved }: { community: CommunityDTO; onSaved: (c: CommunityDTO) => void }) {
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description);
  const [category, setCategory] = useState<CommunityCategory>(community.category);
  const [screening, setScreening] = useState(community.screeningQuestion ?? "");
  const [bulletinPermission, setBulletinPermission] = useState<CommunityPostingPermission>(community.bulletinPermission);
  const [planPostingPermission, setPlanPostingPermission] = useState<CommunityPostingPermission>(community.planPostingPermission);
  const [chatEnabled, setChatEnabled] = useState(community.chatEnabled);
  const [bulletinEnabled, setBulletinEnabled] = useState(community.bulletinEnabled);
  const [bulletinRequiresApproval, setBulletinRequiresApproval] = useState(community.bulletinRequiresApproval);
  const [visibility, setVisibility] = useState<CommunityAccessLevel>(community.visibility);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setName(community.name);
    setDescription(community.description);
    setCategory(community.category);
    setScreening(community.screeningQuestion ?? "");
    setBulletinPermission(community.bulletinPermission);
    setPlanPostingPermission(community.planPostingPermission);
    setChatEnabled(community.chatEnabled);
    setBulletinEnabled(community.bulletinEnabled);
    setBulletinRequiresApproval(community.bulletinRequiresApproval);
    setVisibility(community.visibility);
  }, [community]);

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
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
        }),
      });
      onSaved(updated);
      setName(updated.name);
      setDescription(updated.description);
      setCategory(updated.category);
      setScreening(updated.screeningQuestion ?? "");
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

  return (
    <section className="cmy-tabpanel cmy-settings">
      <label className="cmy-field">
        <span>Name</span>
        <input className="cmy-input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="cmy-field">
        <span>Description</span>
        <textarea className="cmy-textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="cmy-field">
        <span>Category</span>
        <select className="cmy-input" value={category} onChange={(e) => setCategory(e.target.value as CommunityCategory)}>
          {ALL_COMMUNITY_CATEGORIES.map((c) => (
            <option key={c} value={c}>{COMMUNITY_CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </label>
      <label className="cmy-field">
        <span>Screening question <em className="cmy-hint">(leave blank to let anyone join instantly)</em></span>
        <textarea
          className="cmy-textarea"
          rows={3}
          value={screening}
          placeholder="e.g. What's your typical pace?"
          onChange={(e) => setScreening(e.target.value)}
        />
      </label>

      <div className="cmy-toggle-row">
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
      {bulletinEnabled && (
        <>
          <div className="cmy-field">
            <span>Who can post to the bulletin?</span>
            <Segmented
              value={bulletinPermission}
              onChange={setBulletinPermission}
              options={[["members", "All members"], ["organizer_only", "Organizer only"]]}
            />
          </div>
          {bulletinPermission === "members" && (
            <div className="cmy-toggle-row">
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
      <div className="cmy-field">
        <span>Who can post plans?</span>
        <Segmented
          value={planPostingPermission}
          onChange={setPlanPostingPermission}
          options={[["members", "All members"], ["organizer_only", "Organizer only"]]}
        />
      </div>
      <div className="cmy-field">
        <span>Who can see inside <em className="cmy-hint">(name, cover, and description always stay public)</em></span>
        <Segmented
          value={visibility}
          onChange={setVisibility}
          options={[["everyone", "Everyone"], ["members_only", "Members only"]]}
        />
      </div>
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

      {err && <p className="cmy-err">{err}</p>}
      {msg && <p className="cmy-saved">{msg}</p>}
      <button type="button" className="cmy-btn cmy-btn--primary cmy-btn--block" disabled={busy} onClick={save}>
        Save changes
      </button>
    </section>
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
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.match(/^\d+:\s*(.*)$/);
  if (m) {
    try {
      const parsed = JSON.parse(m[1]!);
      if (parsed?.error) return parsed.error;
    } catch {
      /* not JSON */
    }
    return m[1]!;
  }
  return raw;
}
