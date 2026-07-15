import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { PlanCard } from "../components/PlanCard";
import {
  ALL_COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LABELS,
  type CommunityCategory,
  type CommunityDTO,
  type CommunityMemberDTO,
  type CommunityPostDTO,
  type CommunityPostingPermission,
  type PlanDTO,
} from "../types/shared";
import { formatRelative } from "../lib/format";
import "./Communities.css";

type Tab = "bulletin" | "events" | "members" | "settings";

export function CommunityDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [community, setCommunity] = useState<CommunityDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("bulletin");

  const load = useCallback(async () => {
    try {
      const c = await api<CommunityDTO>(`/api/communities/${id}`);
      setCommunity(c);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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

      {/* Header */}
      <header className="cmy-header">
        <div
          className="cmy-cover"
          style={community.coverImage ? { backgroundImage: `url(${community.coverImage})` } : undefined}
          data-cat={community.category}
        >
          <span className="cmy-cover-tag">{catLabel.toUpperCase()}</span>
        </div>
        <div className="cmy-header-body">
          <div className="cmy-title-row">
            <h1 className="cmy-name">{community.name}</h1>
            {community.isFounding && <span className="cmy-founding">★ Founding Community</span>}
          </div>
          <div className="cmy-meta">
            <span>{community.memberCount} {community.memberCount === 1 ? "member" : "members"}</span>
            <span className="cmy-dot">·</span>
            <span>Organized by {community.organizer.firstName}</span>
          </div>
          <JoinControl community={community} onChange={setCommunity} reload={load} />
          {community.description && <p className="cmy-desc">{community.description}</p>}
          {community.chatEnabled && (isActiveMember || community.isOrganizer) && (
            <Link to={`/communities/${community.id}/chat`} className="cmy-chat-link">💬 Open group chat</Link>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="cmy-tabs" role="tablist">
        <TabButton id="bulletin" tab={tab} setTab={setTab}>Bulletin</TabButton>
        <TabButton id="events" tab={tab} setTab={setTab}>Events</TabButton>
        <TabButton id="members" tab={tab} setTab={setTab}>Members</TabButton>
        {community.isOrganizer && <TabButton id="settings" tab={tab} setTab={setTab}>Settings</TabButton>}
      </nav>

      {tab === "bulletin" && <BulletinTab community={community} />}
      {tab === "events" && <EventsTab community={community} onPostPlan={() => navigate(`/plans/new?communityId=${community.id}`)} />}
      {tab === "members" && <MembersTab community={community} onCountChange={load} />}
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
  children,
}: {
  id: Tab;
  tab: Tab;
  setTab: (t: Tab) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      className={`cmy-tab ${tab === id ? "cmy-tab--active" : ""}`}
      onClick={() => setTab(id)}
    >
      {children}
    </button>
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
    return <span className="cmy-pending-pill">Requested — pending</span>;
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

function BulletinTab({ community }: { community: CommunityDTO }) {
  const [posts, setPosts] = useState<CommunityPostDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ posts: CommunityPostDTO[] }>(`/api/communities/${community.id}/posts`);
    setPosts(r.posts);
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
    } finally {
      setBusy(false);
    }
  }

  async function del(postId: string) {
    await api(`/api/communities/${community.id}/posts/${postId}`, { method: "DELETE" });
    await load();
  }
  async function togglePin(post: CommunityPostDTO) {
    await api(`/api/communities/${community.id}/posts/${post.id}/pin`, {
      method: "POST",
      body: JSON.stringify({ pinned: !post.pinned }),
    });
    await load();
  }

  return (
    <section className="cmy-tabpanel">
      {posts.length === 0 && <p className="cmy-muted">No posts yet. Start the conversation.</p>}
      <ul className="cmy-post-list">
        {posts.map((p) => (
          <li key={p.id} className={`cmy-post ${p.pinned ? "cmy-post--pinned" : ""}`}>
            {p.pinned && <div className="cmy-pinned-label">📌 Pinned</div>}
            <div className="cmy-post-head">
              <Avatar seed={p.author.avatarSeed} style={p.author.avatarStyle} photoDataUrl={p.author.avatarPhotoDataUrl} params={p.author.avatarParams} size="sm" />
              <div className="cmy-post-author">
                <span className="cmy-post-name">
                  {p.author.firstName}
                  {p.authorIsOrganizer && <span className="cmy-org-badge">Organizer</span>}
                </span>
                <span className="cmy-post-time">{formatRelative(p.createdAt)}</span>
              </div>
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
          <textarea
            className="cmy-textarea"
            rows={3}
            placeholder="Post something to the group…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="button" className="cmy-btn cmy-btn--primary" disabled={busy || !draft.trim()} onClick={submit}>
            Post
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
      {community.isOrganizer && pending.length > 0 && (
        <div className="cmy-requests">
          <h3 className="cmy-subhead">Requests</h3>
          <ul className="cmy-member-list">
            {pending.map((m) => (
              <li key={m.user.id} className="cmy-request">
                <div className="cmy-member-row">
                  <Avatar seed={m.user.avatarSeed} style={m.user.avatarStyle} photoDataUrl={m.user.avatarPhotoDataUrl} params={m.user.avatarParams} size="sm" />
                  <span className="cmy-member-name">{m.user.firstName} {m.user.lastName ?? ""}</span>
                </div>
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
            <Avatar seed={m.user.avatarSeed} style={m.user.avatarStyle} photoDataUrl={m.user.avatarPhotoDataUrl} params={m.user.avatarParams} size="sm" />
            <span className="cmy-member-name">{m.user.firstName} {m.user.lastName ?? ""}</span>
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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
        }),
      });
      onSaved(updated);
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
        <input className="cmy-input" value={screening} placeholder="e.g. What's your typical pace?" onChange={(e) => setScreening(e.target.value)} />
      </label>

      <div className="cmy-field">
        <span>Who can post to the bulletin?</span>
        <Segmented
          value={bulletinPermission}
          onChange={setBulletinPermission}
          options={[["members", "All members"], ["organizer_only", "Organizer only"]]}
        />
      </div>
      <div className="cmy-field">
        <span>Who can post plans?</span>
        <Segmented
          value={planPostingPermission}
          onChange={setPlanPostingPermission}
          options={[["organizer_only", "Organizer only"], ["members", "All members"]]}
        />
      </div>
      <label className="cmy-toggle-row">
        <span>Group chat</span>
        <input type="checkbox" checked={chatEnabled} onChange={(e) => setChatEnabled(e.target.checked)} />
      </label>

      {err && <p className="cmy-err">{err}</p>}
      {msg && <p className="cmy-saved">{msg}</p>}
      <button type="button" className="cmy-btn cmy-btn--primary cmy-btn--block" disabled={busy} onClick={save}>
        Save changes
      </button>
    </section>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: CommunityPostingPermission;
  onChange: (v: CommunityPostingPermission) => void;
  options: Array<[CommunityPostingPermission, string]>;
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
