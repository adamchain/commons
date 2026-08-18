import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart2, MessageCircle } from "lucide-react";
import { api, parseApiError } from "../api/http";
import { EmptyCard, ScreenTitle } from "../components/ui";
import { formatRelative, sentenceCaseTitle } from "../lib/format";
import { interestVisual } from "../lib/interestIcons";
import type { ConversationSummaryDTO, ForumSummaryDTO, InterestTag } from "../types/shared";

function previewLooksLikePoll(text: string | null | undefined): boolean {
  if (!text) return false;
  return /poll|voted/i.test(text);
}

function cleanPreview(text: string | null | undefined): string {
  if (!text) return "No messages yet";
  return text.replace(/📊\s*/g, "").trim() || "No messages yet";
}

function chatVisual(c: ConversationSummaryDTO) {
  const explicit = (c as { interestTag?: InterestTag }).interestTag;
  if (explicit) return interestVisual(explicit);
  const title = c.planTitle?.toLowerCase() ?? "";
  if (title.includes("yoga")) return interestVisual("wellness");
  if (title.includes("run")) return interestVisual("workouts");
  if (title.includes("coffee") || title.includes("core")) return interestVisual("coffee");
  return interestVisual(null);
}

export function MessagesPage() {
  const [items, setItems] = useState<ConversationSummaryDTO[]>([]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"plans" | "interests">("plans");
  const [forums, setForums] = useState<ForumSummaryDTO[]>([]);
  const [forumsReady, setForumsReady] = useState(false);
  const [dismissTarget, setDismissTarget] = useState<string | null>(null);
  const [dismissBusy, setDismissBusy] = useState(false);
  const [dismissErr, setDismissErr] = useState<string | null>(null);

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
    setDismissBusy(true);
    setDismissErr(null);
    try {
      await api(`/api/conversations/${conversationId}/leave`, { method: "POST" });
      setItems((prev) => prev.filter((c) => c.conversationId !== conversationId));
      setDismissTarget(null);
    } catch (e) {
      setDismissErr(parseApiError(e));
    } finally {
      setDismissBusy(false);
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
      <ScreenTitle title="Messages" />

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
          <p className="messages-tab-sub">
            A citywide forum for interests to connect around recommendations, questions, announcements or advice
          </p>
          {!forumsReady ? (
            <div className="feed-skeleton" aria-hidden="true">
              <div className="feed-skeleton-card" />
              <div className="feed-skeleton-card" />
            </div>
          ) : forums.length === 0 ? (
            <EmptyCard
              icon={<MessageCircle size={22} strokeWidth={1.6} color="var(--muted)" />}
              title="No interest forums yet."
              body="Join an interest to unlock its citywide forum — Coffee, Workouts, and more."
              cta={{ to: "/settings/interests", label: "Join more interests →" }}
            />
          ) : (
            <div className="messages-card">
              <div className="messages-list">
                {forums.map((f) => {
                  const { Icon, iconColor, tint } = interestVisual(f.interestTag);
                  return (
                    <Link
                      key={f.interestTag}
                      to={`/forums/${f.interestTag}`}
                      state={{ from: "messages" }}
                      className="messages-row"
                    >
                      <span
                        className="messages-row-icon"
                        style={{ background: tint, color: iconColor }}
                        aria-hidden="true"
                      >
                        <Icon size={18} strokeWidth={1.8} />
                      </span>
                      <div className="messages-row-body">
                        <div className="messages-row-top">
                          <span className="messages-row-title">{f.label}</span>
                          {f.hasUnread && (
                            <span className="messages-row-unread-dot" aria-label="Unread" />
                          )}
                          {f.latestPost && (
                            <span className="messages-row-time">
                              {formatRelative(f.latestPost.createdAt)}
                            </span>
                          )}
                        </div>
                        <div className="messages-row-preview">
                          {f.latestPost ? (
                            <span>
                              <span className="messages-row-author">{f.latestPost.authorName}</span>
                              {`: ${f.latestPost.preview}`}
                            </span>
                          ) : (
                            <span className="messages-row-preview--empty">
                              No posts yet — be the first
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
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
        <div className="ref-empty-card" role="status" style={{ marginTop: 24 }}>
          <div className="ref-empty-glyph" style={{ background: "rgba(237,229,216,0.8)" }} aria-hidden="true">
            <MessageCircle size={22} strokeWidth={1.6} color="var(--muted)" />
          </div>
          <h2 className="ref-empty-title">Nothing in your inbox yet.</h2>
          <p className="ref-empty-body">Join a plan and its group chat shows up here.</p>
          <Link to="/" className="ref-empty-cta">
            See what&apos;s happening
          </Link>
        </div>
      ) : (
        <>
          <p className="messages-tab-sub">
            Group chats for the plans you&apos;re in. Coordinate the details and stay connected
          </p>
          <div className="messages-card">
            <div className="messages-list">
              {items.map((c) => {
                const preview = cleanPreview(c.lastMessagePreview);
                const isPoll = previewLooksLikePoll(c.lastMessagePreview);
                const canDismiss = Boolean(c.conversationId);
                const title = c.communityName ?? sentenceCaseTitle(c.planTitle);
                const { Icon, iconColor, tint } = chatVisual(c);
                const rowInner = (
                  <>
                    <span
                      className="messages-row-icon"
                      style={{ background: tint, color: iconColor }}
                      aria-hidden="true"
                    >
                      <Icon size={18} strokeWidth={1.8} />
                    </span>
                    <div className="messages-row-body">
                      <div className="messages-row-top">
                        <span className="messages-row-title">{title}</span>
                        {c.lastMessageAt && (
                          <span className="messages-row-time">{formatRelative(c.lastMessageAt)}</span>
                        )}
                      </div>
                      <div className="messages-row-preview">
                        {isPoll && <BarChart2 size={14} strokeWidth={1.8} />}
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
                  <div
                    key={c.communityId ? `comm-${c.communityId}` : c.planId}
                    className="messages-row-wrap"
                  >
                    <Link
                      to={
                        c.communityId
                          ? `/communities/${c.communityId}/chat`
                          : `/plans/${c.planId}/chat`
                      }
                      state={{ from: "messages" }}
                      className="messages-row"
                    >
                      {rowInner}
                    </Link>
                    {canDismiss && (
                      <button
                        type="button"
                        className="messages-row-dismiss"
                        aria-label="Remove from inbox"
                        onClick={() => {
                          setDismissErr(null);
                          setDismissTarget(c.conversationId!);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {dismissTarget && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => !dismissBusy && setDismissTarget(null)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginTop: 0 }}>Remove from inbox?</h4>
            <p style={{ marginTop: 0 }}>
              This chat will disappear from Messages. You can still open it from the plan or community page.
            </p>
            {dismissErr && <p className="error-text">{dismissErr}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn-link" disabled={dismissBusy} onClick={() => setDismissTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={dismissBusy}
                onClick={() => void dismissPastChat(dismissTarget)}
              >
                {dismissBusy ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
