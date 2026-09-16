import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BarChart2, MessageCircle } from "lucide-react";
import { api, parseApiError } from "../api/http";
import { InterestGlyph } from "../components/InterestGlyph";
import { PlanCoverThumb } from "../components/CoverThumb";
import { EmptyCard, Label, ScreenTitle } from "../components/ui";
import { formatRelative, sentenceCaseTitle } from "../lib/format";
import { photoForInterest } from "../lib/placePhotos";
import {
  FORUM_INTERESTS,
  INTEREST_LABELS,
  type ConversationSummaryDTO,
  type ForumSummaryDTO,
  type InterestTag,
} from "../types/shared";

const MESSAGES_INTERESTS_FROM = { from: "messages" as const, messagesTab: "interests" as const };

function previewLooksLikePoll(text: string | null | undefined): boolean {
  if (!text) return false;
  return /poll|voted/i.test(text);
}

function cleanPreview(text: string | null | undefined): string {
  if (!text) return "No messages yet";
  return text.replace(/📊\s*/g, "").trim() || "No messages yet";
}

export function MessagesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "interests" ? "interests" : "plans";
  const [items, setItems] = useState<ConversationSummaryDTO[]>([]);
  const [ready, setReady] = useState(false);
  const [forums, setForums] = useState<ForumSummaryDTO[]>([]);
  const [forumsReady, setForumsReady] = useState(false);
  const [joiningTag, setJoiningTag] = useState<InterestTag | null>(null);
  const [joinErr, setJoinErr] = useState<string | null>(null);
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

  const joinedTags = new Set(forums.map((f) => f.interestTag));
  const availableForums = FORUM_INTERESTS.filter((t) => !joinedTags.has(t));

  async function joinForum(tag: InterestTag) {
    if (joiningTag) return;
    setJoiningTag(tag);
    setJoinErr(null);
    try {
      await api(`/api/forums/${tag}/join`, { method: "POST" });
      navigate(`/forums/${tag}`, { state: MESSAGES_INTERESTS_FROM });
    } catch (e) {
      setJoinErr(e instanceof Error ? e.message : "Couldn't join that forum.");
      setJoiningTag(null);
    }
  }

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar app-shell--messages-lock">
      <ScreenTitle title="Messages" />

      <div className="messages-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "plans"}
          className={`messages-tab ${tab === "plans" ? "is-active" : ""}`}
          onClick={() => setSearchParams({}, { replace: true })}
        >
          Plans
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "interests"}
          className={`messages-tab ${tab === "interests" ? "is-active" : ""}`}
          onClick={() => setSearchParams({ tab: "interests" }, { replace: true })}
        >
          Interests
        </button>
      </div>

      <div className="messages-scroll">
      {tab === "interests" ? (
        <>
          {!forumsReady ? (
            <div className="feed-skeleton" aria-hidden="true">
              <div className="feed-skeleton-card" />
              <div className="feed-skeleton-card" />
            </div>
          ) : (
            <>
              {forums.length === 0 ? (
                <p className="form-help" style={{ marginTop: 4 }}>
                  No forums yet — Coffee, Workouts, the city chats.
                </p>
              ) : (
                <div className="messages-card">
                  <div className="messages-list">
                    {forums.map((f) => (
                        <Link
                          key={f.interestTag}
                          to={`/forums/${f.interestTag}`}
                          state={MESSAGES_INTERESTS_FROM}
                          className="messages-row"
                        >
                          <InterestGlyph tag={f.interestTag} size={40} />
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
                                  It's quiet in here
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                    ))}
                  </div>
                </div>
              )}
              {availableForums.length > 0 && (
                <div className="forum-join-more-block">
                  <label className="form-eyebrow">
                    {forums.length === 0 ? "Pick an interest" : "Join more forums"}
                  </label>
                  <div className="xpl-photo-grid xpl-photo-grid--forums">
                    {availableForums.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="xpl-photo-tile"
                        disabled={!!joiningTag}
                        onClick={() => void joinForum(t)}
                      >
                        <img src={photoForInterest(t)} alt="" loading="lazy" />
                        <div className="xpl-photo-tile-overlay" aria-hidden="true" />
                        <span className="xpl-photo-tile-label">{INTEREST_LABELS[t]}</span>
                      </button>
                    ))}
                  </div>
                  {joinErr && <p className="error-text" style={{ marginTop: 12 }}>{joinErr}</p>}
                </div>
              )}
            </>
          )}
        </>
      ) : !ready ? (
        <div className="feed-skeleton" aria-hidden="true">
          <div className="feed-skeleton-card" />
          <div className="feed-skeleton-card" />
        </div>
      ) : items.length === 0 ? (
        <EmptyCard
          className="ref-empty-card--inbox"
          icon={<MessageCircle size={22} strokeWidth={1.6} color="var(--red)" />}
          groupChat
          title="It's quiet in here."
          body="Join something and the conversation follows."
          cta={{ to: "/", label: "See what's happening" }}
        />
      ) : (
        <>
          <div className="messages-card">
            <div className="messages-list">
              {items.map((c) => {
                const preview = cleanPreview(c.lastMessagePreview);
                const isPoll = previewLooksLikePoll(c.lastMessagePreview);
                const canDismiss = Boolean(c.conversationId);
                const title = c.communityName ?? sentenceCaseTitle(c.planTitle);
                const rowInner = (
                  <>
                    <PlanCoverThumb
                      planId={c.communityId || c.planId}
                      flyerDataUrl={c.coverImage}
                    />
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
                        {c.communityId
                          ? "Joined"
                          : c.myRole === "going" || c.myRole === "hosting"
                            ? "Going"
                            : "Started"}
                        {" · "}
                        {c.participantCount}{" "}
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
      </div>

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
