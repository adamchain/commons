import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { formatRelative, sentenceCaseTitle } from "../lib/format";
import type { ConversationSummaryDTO, ForumSummaryDTO } from "../types/shared";

function previewLooksLikePoll(text: string | null | undefined): boolean {
  if (!text) return false;
  return /📊|poll|voted/i.test(text);
}

function cleanPreview(text: string | null | undefined): string {
  if (!text) return "No messages yet";
  return text.replace(/📊\s*/g, "").trim() || "No messages yet";
}

export function MessagesPage() {
  const [items, setItems] = useState<ConversationSummaryDTO[]>([]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"plans" | "interests">("plans");
  const [forums, setForums] = useState<ForumSummaryDTO[]>([]);
  const [forumsReady, setForumsReady] = useState(false);

  useEffect(() => {
    void api<ConversationSummaryDTO[]>("/api/conversations")
      .then((rows) => {
        setItems(
          [...rows].sort((a, b) => {
            const at = a.lastMessageAt ?? a.planDate;
            const bt = b.lastMessageAt ?? b.planDate;
            return bt.localeCompare(at);
          }),
        );
        setReady(true);
      })
      .catch(() => {
        setItems([]);
        setReady(true);
      });
  }, []);

  async function dismissPastChat(conversationId: string) {
    if (!window.confirm("Leave this chat? It'll disappear from your Messages. You can still open it from the plan.")) return;
    try {
      await api(`/api/conversations/${conversationId}/leave`, { method: "POST" });
      setItems((prev) => prev.filter((c) => c.conversationId !== conversationId));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Couldn't remove this chat.");
    }
  }

  useEffect(() => {
    if (tab !== "interests" || forumsReady) return;
    void api<{ forums: ForumSummaryDTO[] }>("/api/forums")
      .then((r) => setForums(r.forums))
      .catch(() => setForums([]))
      .finally(() => setForumsReady(true));
  }, [tab, forumsReady]);

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar app-shell--messages-lock">
      <h1 className="messages-page-title">Messages</h1>

      <div className="messages-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "plans"}
          className={`messages-tab ${tab === "plans" ? "is-active" : ""}`}
          onClick={() => setTab("plans")}
        >
          Plans
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "interests"}
          className={`messages-tab ${tab === "interests" ? "is-active" : ""}`}
          onClick={() => setTab("interests")}
        >
          Interests
        </button>
      </div>

      {tab === "interests" ? (
        <>
        <p className="messages-tab-sub">Citywide conversations by interest — no commitment, just talk.</p>
        {!forumsReady ? (
          <div className="feed-skeleton" aria-hidden="true">
            <div className="feed-skeleton-card" />
            <div className="feed-skeleton-card" />
          </div>
        ) : forums.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 24 }}>
            <p style={{ margin: 0 }}>
              Join an interest to unlock its citywide forum — Coffee, Workouts, and more.
            </p>
            <Link to="/settings/interests" className="btn-link" style={{ marginTop: 12, display: "inline-block", color: "var(--accent)" }}>
              Join more interests →
            </Link>
          </div>
        ) : (
          <div className="messages-card">
            <div className="messages-list">
              {forums.map((f) => (
                <Link
                  key={f.interestTag}
                  to={`/forums/${f.interestTag}`}
                  state={{ from: "messages" }}
                  className="messages-row"
                >
                  <span className="messages-row-emoji" aria-hidden="true">
                    {f.emoji}
                  </span>
                  <div className="messages-row-body">
                    <div className="messages-row-top">
                      <span className="messages-row-title">{f.label}</span>
                      {f.latestPost && (
                        <span className="messages-row-time">{formatRelative(f.latestPost.createdAt)}</span>
                      )}
                    </div>
                    <div className="messages-row-preview">
                      <span>
                        {f.latestPost
                          ? `${f.latestPost.authorName}: ${f.latestPost.preview}`
                          : "No posts yet — be the first"}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <Link to="/settings/interests" className="forum-join-more">
              Join more interests →
            </Link>
          </div>
        )}
        </>
      ) : !ready ? (
        <div className="feed-skeleton" aria-hidden="true">
          <div className="feed-skeleton-card" />
          <div className="feed-skeleton-card" />
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p style={{ margin: 0 }}>No chats yet — join a plan and its group chat shows up here.</p>
          <Link to="/" className="btn-primary" style={{ marginTop: 14, display: "inline-block" }}>
            Find plans
          </Link>
        </div>
      ) : (
        <div className="messages-card">
          <div className="messages-list">
            {items.map((c) => {
              const preview = cleanPreview(c.lastMessagePreview);
              const isPoll = previewLooksLikePoll(c.lastMessagePreview);
              const todayIso = new Date().toISOString().slice(0, 10);
              const isPastPlan = !c.communityId && c.planDate < todayIso;
              // Past plan chats + any community thread with a real conversation id.
              const canDismiss = Boolean(c.conversationId) && (isPastPlan || Boolean(c.communityId));
              const title = c.communityName ?? sentenceCaseTitle(c.planTitle);
              const rowInner = (
                <>
                  <span className="messages-row-emoji" aria-hidden="true">
                    {c.hostEmoji || "💬"}
                  </span>
                  <div className="messages-row-body">
                    <div className="messages-row-top">
                      <span className="messages-row-title">{title}</span>
                      {c.lastMessageAt && (
                        <span className="messages-row-time">{formatRelative(c.lastMessageAt)}</span>
                      )}
                    </div>
                    <div className="messages-row-preview">
                      {isPoll && <PollPreviewIcon />}
                      <span>{preview}</span>
                    </div>
                    <div className="messages-row-meta">
                      {c.lastMessageAt ? "Started" : "Not started yet"} · {c.participantCount}{" "}
                      {c.participantCount === 1 ? "person" : "people"}
                    </div>
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="messages-row-unread" aria-label={`${c.unreadCount} unread`}>
                      {c.unreadCount > 9 ? "9+" : c.unreadCount}
                    </span>
                  )}
                </>
              );
              return (
                <div key={c.communityId ? `comm-${c.communityId}` : c.planId} className="messages-row-wrap">
                  <Link
                    to={c.communityId ? `/communities/${c.communityId}/chat` : `/plans/${c.planId}/chat`}
                    state={{ from: "messages" }}
                    className="messages-row"
                  >
                    {rowInner}
                  </Link>
                  {canDismiss && (
                    <button
                      type="button"
                      className="messages-row-dismiss"
                        aria-label="Leave chat"
                      onClick={() => void dismissPastChat(c.conversationId!)}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}

function PollPreviewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M7 14v4" />
      <path d="M12 9v9" />
      <path d="M17 5v13" />
    </svg>
  );
}
