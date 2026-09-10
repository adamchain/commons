import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ImagePlus } from "lucide-react";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { PlanSafetyMenu } from "../components/PlanSafetyMenu";
import { formatRelative } from "../lib/format";
import { resolveForumImage } from "../lib/forumImage";
import { isNative } from "../lib/platform";
import type { ForumPostDetailDTO, ForumPostDTO, ForumReplyDTO } from "../types/shared";

export function ForumPostPage() {
  const { tag = "", postId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [data, setData] = useState<ForumPostDetailDTO | null>(null);
  const [ready, setReady] = useState(false);
  const [reply, setReply] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [attachingImage, setAttachingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setReady(false);
    void api<ForumPostDetailDTO>(`/api/forums/posts/${postId}`)
      .then((r) => setData(r))
      .catch(() => setData(null))
      .finally(() => setReady(true));
  }, [postId]);

  const toggleLike = async () => {
    if (!data) return;
    const updated = await api<ForumPostDTO>(`/api/forums/posts/${postId}/like`, {
      method: "POST",
    }).catch(() => null);
    if (!updated) return;
    setData((prev) => (prev ? { ...prev, post: updated } : prev));
  };

  const pickReplyImage = async (file?: File) => {
    setAttachingImage(true);
    setError(null);
    try {
      const dataUrl = await resolveForumImage(file ?? null);
      if (dataUrl) setPendingImage(dataUrl);
    } catch {
      setError("Couldn't read that image. Try another.");
    } finally {
      setAttachingImage(false);
    }
  };

  const submitReply = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = reply.trim();
    if ((!trimmed && !pendingImage) || !data) return;
    setSending(true);
    setError(null);
    try {
      const created = await api<ForumReplyDTO>(`/api/forums/posts/${postId}/replies`, {
        method: "POST",
        body: JSON.stringify({
          content: trimmed,
          ...(pendingImage ? { imageUrl: pendingImage } : {}),
        }),
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              replies: [...prev.replies, created],
              post: { ...prev.post, replyCount: prev.post.replyCount + 1 },
            }
          : prev,
      );
      setReply("");
      setPendingImage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reply — try again.");
    } finally {
      setSending(false);
    }
  };

  const deletePost = async () => {
    if (!data || user?.id !== data.post.author.id) return;
    setDeleting(true);
    try {
      await api(`/api/forums/posts/${postId}`, { method: "DELETE" });
      navigate(`/forums/${tag}`, { state: location.state });
    } catch {
      setDeleting(false);
    }
  };

  const makeThisAPlan = () => {
    navigate("/plans/new", { state: { fromForumTag: tag, forumNav: location.state } });
  };

  if (!ready) {
    return (
      <main className="app-shell app-shell--mid app-shell--with-nav app-shell--with-topbar">
        <div className="feed-skeleton" aria-hidden="true">
          <div className="feed-skeleton-card" />
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="app-shell app-shell--mid app-shell--with-nav app-shell--with-topbar">
        <div className="empty-state">
          <p style={{ margin: 0 }}>This post isn't available.</p>
          <Link to={`/forums/${tag}`} state={location.state} className="btn-primary" style={{ marginTop: 14, display: "inline-block" }}>
            Back to forum
          </Link>
        </div>
      </main>
    );
  }

  const { post, replies } = data;
  const isOwner = !!user && user.id === post.author.id;

  return (
    <main className="app-shell app-shell--mid app-shell--with-nav app-shell--with-topbar forum-page">
      <header className="app-header create-header">
        <Link to={`/forums/${tag}`} state={location.state} className="detail-back">
          ← Forum
        </Link>
        <span className="create-header-title">Post</span>
        {isOwner ? (
          <button type="button" className="forum-leave-btn" onClick={() => void deletePost()} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        ) : (
          <PlanSafetyMenu
            targetUserId={post.author.id}
            targetFirstName={post.author.firstName}
            contentKind="forum_post"
            contentId={post.id}
          />
        )}
      </header>

      <article className="forum-post-card forum-post-card--detail">
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
        {post.content ? <p className="forum-post-content">{post.content}</p> : null}
        {post.imageUrl && <img src={post.imageUrl} alt="" className="forum-post-image" />}
        <div className="forum-post-footer">
          <button
            type="button"
            className={`forum-like-btn ${post.likedByMe ? "is-active" : ""}`}
            onClick={() => void toggleLike()}
            aria-pressed={post.likedByMe}
          >
            <HeartIcon filled={post.likedByMe} /> {post.likeCount}
          </button>
          <button type="button" className="btn btn-primary forum-make-plan-btn" onClick={makeThisAPlan}>
            Make this a plan
          </button>
        </div>
      </article>

      <section className="forum-reply-list">
        <p className="form-eyebrow">
          {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
        </p>
        {replies.length === 0 ? (
          <p className="form-help">No replies yet — say something.</p>
        ) : (
          replies.map((r) => (
            <div key={r.id} className="forum-reply-row">
              <Avatar
                seed={r.author.avatarSeed}
                style={r.author.avatarStyle}
                photoDataUrl={r.author.avatarPhotoDataUrl}
                params={r.author.avatarParams}
                name={r.author.firstName}
                size="xs"
              />
              <div className="forum-reply-body">
                <div className="forum-reply-top">
                  <span className="forum-reply-author">{r.author.firstName}</span>
                  <span className="forum-reply-time">{formatRelative(r.createdAt)}</span>
                </div>
                {r.content ? <p className="forum-reply-content">{r.content}</p> : null}
                {r.imageUrl && <img src={r.imageUrl} alt="" className="forum-reply-image" />}
              </div>
            </div>
          ))
        )}
      </section>

      <form onSubmit={submitReply} className="forum-reply-composer">
        {pendingImage && (
          <div className="forum-attach-preview">
            <div className="forum-attach-thumb">
              <img src={pendingImage} alt="" />
              <button
                type="button"
                className="forum-attach-remove"
                aria-label="Remove image"
                onClick={() => setPendingImage(null)}
              >
                ×
              </button>
            </div>
          </div>
        )}
        <div className="forum-reply-composer-row">
        <Avatar
          seed={user?.avatarSeed ?? "me"}
          style={user?.avatarStyle}
          photoDataUrl={user?.avatarPhotoDataUrl}
          params={user?.avatarParams}
          name={user?.firstName}
          size="sm"
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            void pickReplyImage(f);
            if (imageInputRef.current) imageInputRef.current.value = "";
          }}
        />
        <button
          type="button"
          className="forum-attach-btn forum-attach-btn--icon"
          disabled={attachingImage || sending}
          aria-label="Add photo"
          onClick={() => {
            if (isNative()) void pickReplyImage();
            else imageInputRef.current?.click();
          }}
        >
          <ImagePlus size={18} strokeWidth={1.8} />
        </button>
        <input
          type="text"
          placeholder={pendingImage ? "Add a caption…" : "Write a reply…"}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        <button
          type="submit"
          className="forum-reply-send-btn"
          disabled={sending || attachingImage || (!reply.trim() && !pendingImage)}
          aria-label="Send reply"
        >
          <SendIcon />
        </button>
        </div>
      </form>
      {error && <p className="error-text">{error}</p>}
    </main>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </svg>
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
