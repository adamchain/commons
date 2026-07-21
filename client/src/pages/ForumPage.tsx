import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { formatRelative } from "../lib/format";
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
  const { user } = useAuth();
  const [data, setData] = useState<ForumPostsResponse | null>(null);
  const [sort, setSort] = useState<ForumSort>("recent");
  const [ready, setReady] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

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

  return (
    <main className="app-shell app-shell--mid app-shell--with-nav app-shell--with-topbar forum-page">
      <header className="app-header create-header">
        <Link to="/messages" className="detail-back">
          ← Messages
        </Link>
        <span className="create-header-title">
          {data.emoji} {data.label}
        </span>
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
        <button type="button" className="btn btn-primary forum-make-plan-btn" onClick={makeThisAPlan}>
          Make this a plan
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
          <p style={{ margin: 0 }}>No posts yet — be the first to say something.</p>
        </div>
      ) : (
        <div className="forum-post-list">
          {data.posts.map((post) => (
            <ForumPostCard key={post.id} post={post} tag={tag} onLike={() => void toggleLike(post.id)} />
          ))}
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
          <HeartIcon filled={post.likedByMe} /> {post.likeCount}
        </button>
        <Link to={`/forums/${tag}/posts/${post.id}`} className="forum-reply-link">
          <ReplyIcon /> {post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}
        </Link>
      </div>
    </article>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
