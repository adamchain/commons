import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Heart, MessageCircle } from "lucide-react";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { formatRelative } from "../lib/format";
import { interestVisual } from "../lib/interestIcons";
import { hrefForBack, type NavFromState } from "../lib/navState";
import type { ForumPostDTO, ForumSort, InterestTag } from "../types/shared";

interface ForumPostsResponse {
  interestTag: InterestTag;
  label: string;
  emoji: string;
  posts: ForumPostDTO[];
}

export function ForumPage() {
  const { tag = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navFrom = (location.state as NavFromState | null) ?? null;
  const backHref = hrefForBack(
    navFrom?.from
      ? navFrom.from === "forum"
        ? { ...navFrom, forumTag: navFrom.forumTag ?? tag }
        : navFrom
      : { from: "messages" },
  );
  const backLabel =
    navFrom?.from === "feed"
      ? "Home"
      : navFrom?.from === "settings-forums"
        ? "Interests"
        : navFrom?.from === "notifications"
          ? "Notifications"
          : "Messages";
  const { user } = useAuth();
  const [data, setData] = useState<ForumPostsResponse | null>(null);
  const [sort, setSort] = useState<ForumSort>("recent");
  const [ready, setReady] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);

  const load = (nextSort: ForumSort) => {
    setReady(false);
    void api<ForumPostsResponse>(`/api/forums/${tag}/posts?sort=${nextSort}`)
      .then((r) => setData(r))
      .catch(() => setData(null))
      .finally(() => setReady(true));
  };

  useEffect(() => {
    load(sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag, sort]);

  const submitPost = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    setPosting(true);
    setError(null);
    try {
      const post = await api<ForumPostDTO>(`/api/forums/${tag}/posts`, {
        method: "POST",
        body: JSON.stringify({ content: trimmed }),
      });
      setData((prev) => (prev ? { ...prev, posts: [post, ...prev.posts] } : prev));
      setContent("");
      setComposerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post — try again.");
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (postId: string) => {
    const updated = await api<ForumPostDTO>(`/api/forums/posts/${postId}/like`, { method: "POST" }).catch(
      () => null,
    );
    if (!updated) return;
    setData((prev) =>
      prev ? { ...prev, posts: prev.posts.map((p) => (p.id === postId ? updated : p)) } : prev,
    );
  };

  const leaveForum = async () => {
    setLeaving(true);
    try {
      await api(`/api/forums/${tag}/leave`, { method: "POST" });
      navigate("/messages");
    } catch {
      setLeaving(false);
    }
  };

  const makeThisAPlan = () => {
    setPlanModalOpen(true);
  };

  const confirmPostPlan = () => {
    setPlanModalOpen(false);
    navigate("/plans/new", { state: { fromForumTag: tag } });
  };

  if (!ready && !data) {
    return (
      <main className="app-shell app-shell--mid app-shell--with-nav app-shell--with-topbar">
        <div className="feed-skeleton" aria-hidden="true">
          <div className="feed-skeleton-card" />
          <div className="feed-skeleton-card" />
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="app-shell app-shell--mid app-shell--with-nav app-shell--with-topbar">
        <div className="empty-state">
          <p style={{ margin: 0 }}>Couldn't load this forum.</p>
          <Link to="/messages" className="btn-primary" style={{ marginTop: 14, display: "inline-block" }}>
            Back to Messages
          </Link>
        </div>
      </main>
    );
  }

  const { Icon, iconColor, tint } = interestVisual(data.interestTag ?? tag);

  return (
    <main className="app-shell app-shell--mid app-shell--with-nav app-shell--with-topbar forum-page">
      <header className="forum-header">
        <Link to={backHref} className="forum-header-back" aria-label={`Back to ${backLabel}`}>
          <ArrowLeft size={18} strokeWidth={1.8} />
        </Link>
        <span className="forum-header-icon" style={{ background: tint, color: iconColor }} aria-hidden="true">
          <Icon size={18} strokeWidth={1.8} />
        </span>
        <div className="forum-header-text">
          <span className="forum-header-title">{data.label}</span>
        </div>
        <button type="button" className="forum-leave-btn" onClick={() => void leaveForum()} disabled={leaving}>
          {leaving ? "Leaving…" : "Leave"}
        </button>
      </header>

      <div className="forum-toolbar">
        <div className="seg-toggle" role="group" aria-label="Sort posts">
          <button
            type="button"
            className={`seg-toggle-btn ${sort === "recent" ? "is-active" : ""}`}
            onClick={() => setSort("recent")}
            aria-pressed={sort === "recent"}
          >
            Recent
          </button>
          <button
            type="button"
            className={`seg-toggle-btn ${sort === "popular" ? "is-active" : ""}`}
            onClick={() => setSort("popular")}
            aria-pressed={sort === "popular"}
          >
            Popular
          </button>
        </div>
        <button type="button" className="btn forum-make-plan-btn" onClick={makeThisAPlan}>
          Post a Plan
        </button>
      </div>

      <div className="forum-composer-card">
        {!composerOpen ? (
          <button type="button" className="forum-composer-trigger" onClick={() => setComposerOpen(true)}>
            <Avatar
              seed={user?.avatarSeed ?? "me"}
              style={user?.avatarStyle}
              photoDataUrl={user?.avatarPhotoDataUrl}
              params={user?.avatarParams}
              name={user?.firstName}
              size="sm"
            />
            <span>Share something with the {data.label} forum…</span>
          </button>
        ) : (
          <form onSubmit={submitPost} className="forum-composer-form">
            <textarea
              className="forum-composer-textarea"
              placeholder={`What's on your mind, ${data.label} fans?`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              autoFocus
            />
            {error && <p className="error-text">{error}</p>}
            <div className="forum-composer-actions">
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setComposerOpen(false);
                  setContent("");
                  setError(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={posting || !content.trim()}>
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
          </form>
        )}
      </div>

      {data.posts.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 16 }}>
          <p style={{ margin: 0 }}>Nothing here yet — say hi or post a plan to get things going.</p>
        </div>
      ) : (
        <div className="forum-post-list">
          {data.posts.map((post) => (
            <ForumPostCard key={post.id} post={post} tag={tag} onLike={() => void toggleLike(post.id)} />
          ))}
        </div>
      )}

      {planModalOpen && (
        <div className="modal-backdrop" onClick={() => setPlanModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="poll-modal-title">Post a {data.label} plan</h2>
            <p className="poll-modal-sub">
              Your plan will be tagged <strong>{data.label}</strong> and show up for everyone on COMMONS
              with that interest — not just people in this forum thread.
            </p>
            <div className="poll-modal-actions">
              <button type="button" className="btn-link" onClick={() => setPlanModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={confirmPostPlan}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ForumPostCard({
  post,
  tag,
  onLike,
}: {
  post: ForumPostDTO;
  tag: string;
  onLike: () => void;
}) {
  return (
    <article className="forum-post-card">
      <Link to={`/forums/${tag}/posts/${post.id}`} className="forum-post-card-link">
        <div className="forum-post-head">
          <Avatar
            seed={post.author.avatarSeed}
            style={post.author.avatarStyle}
            photoDataUrl={post.author.avatarPhotoDataUrl}
            params={post.author.avatarParams}
            name={post.author.firstName}
            size="sm"
          />
          <div className="forum-post-head-body">
            <span className="forum-post-author">
              {post.author.firstName}
              {post.isSponsored && (
                <span className="badge badge-muted forum-sponsored-badge">
                  Sponsored{post.sponsorName ? ` · ${post.sponsorName}` : ""}
                </span>
              )}
            </span>
            <span className="forum-post-time">{formatRelative(post.createdAt)}</span>
          </div>
        </div>
        <p className="forum-post-content">{post.content}</p>
        {post.imageUrl && <img src={post.imageUrl} alt="" className="forum-post-image" />}
      </Link>
      <div className="forum-post-footer">
        <button
          type="button"
          className={`forum-like-btn ${post.likedByMe ? "is-active" : ""}`}
          onClick={onLike}
          aria-pressed={post.likedByMe}
        >
          <Heart size={16} strokeWidth={1.8} fill={post.likedByMe ? "currentColor" : "none"} />{" "}
          {post.likeCount}
        </button>
        <Link to={`/forums/${tag}/posts/${post.id}`} className="forum-reply-link">
          <MessageCircle size={16} strokeWidth={1.8} /> {post.replyCount}{" "}
          {post.replyCount === 1 ? "reply" : "replies"}
        </Link>
      </div>
    </article>
  );
}
