import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BarChart2, MessageCircle, Pin, Trash2 } from "lucide-react";
import { api, parseApiError } from "../api/http";
import { InterestCover, PlanCoverThumb } from "../components/CoverThumb";
import { EmptyCard, ScreenTitle } from "../components/ui";
import { BottomSheet } from "../components/ui/BottomSheet";
import { Button } from "../components/ui/Button";
import { sentenceCaseTitle } from "../lib/format";
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
  if (!text) return "No messages yet — say hi";
  return text.replace(/📊\s*/g, "").trim() || "No messages yet — say hi";
}

function formatInboxTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const days = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  if (days > 0 && days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

const SWIPE_BTN_W = 88;
const SWIPE_ACTION_W = SWIPE_BTN_W * 2;
const SWIPE_LOCK_PX = 6;
const SWIPE_OPEN_PX = 36;
const SWIPE_FLICK_PX_MS = 0.4;
const SWIPE_CLOSE_EVENT = "commons:messages-swipe-close";

function byInboxRecency(a: ConversationSummaryDTO, b: ConversationSummaryDTO): number {
  const at = a.lastMessageAt ?? a.planDate;
  const bt = b.lastMessageAt ?? b.planDate;
  return bt.localeCompare(at);
}

/** Pinned rows stay on top in their current order; the rest sort by recency. */
function sortInbox(rows: ConversationSummaryDTO[]): ConversationSummaryDTO[] {
  const pinned = rows.filter((row) => row.pinned);
  const rest = rows.filter((row) => !row.pinned).sort(byInboxRecency);
  return [...pinned, ...rest];
}

function SwipeRemoveRow({
  enabled,
  pinned,
  onPin,
  onRemove,
  children,
}: {
  enabled: boolean;
  pinned: boolean;
  onPin: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const xRef = useRef(0);
  const draggingRef = useRef(false);
  const start = useRef({ x: 0, y: 0, ox: 0, t: 0 });
  const last = useRef({ x: 0, t: 0 });
  const axis = useRef<"h" | "v" | null>(null);
  const idRef = useRef(`swipe-${Math.random().toString(36).slice(2)}`);
  const frontRef = useRef<HTMLDivElement>(null);

  const applyX = (next: number) => {
    const clamped = Math.min(0, Math.max(-SWIPE_ACTION_W, next));
    xRef.current = clamped;
    setX(clamped);
  };

  useEffect(() => {
    const el = frontRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (axis.current === "h") e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  useEffect(() => {
    const onClose = (e: Event) => {
      const other = (e as CustomEvent<string>).detail;
      if (other === idRef.current) return;
      xRef.current = 0;
      setX(0);
      setDragging(false);
      draggingRef.current = false;
      axis.current = null;
    };
    window.addEventListener(SWIPE_CLOSE_EVENT, onClose);
    return () => window.removeEventListener(SWIPE_CLOSE_EVENT, onClose);
  }, []);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    axis.current = null;
    draggingRef.current = true;
    const t = performance.now();
    start.current = { x: e.clientX, y: e.clientY, ox: xRef.current, t };
    last.current = { x: e.clientX, t };
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || !draggingRef.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (!axis.current) {
      if (Math.abs(dx) < SWIPE_LOCK_PX && Math.abs(dy) < SWIPE_LOCK_PX) return;
      axis.current = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
      if (axis.current === "h") {
        window.dispatchEvent(new CustomEvent(SWIPE_CLOSE_EVENT, { detail: idRef.current }));
        setDragging(true);
        try {
          frontRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* capture isn't required if the pointer stays on the row */
        }
      } else {
        draggingRef.current = false;
        return;
      }
    }
    if (axis.current !== "h") return;
    last.current = { x: e.clientX, t: performance.now() };
    applyX(start.current.ox + dx);
  };

  const settle = () => {
    const wasH = axis.current === "h";
    const cur = xRef.current;
    const elapsed = Math.max(16, performance.now() - start.current.t);
    const vx = (last.current.x - start.current.x) / elapsed;
    draggingRef.current = false;
    setDragging(false);
    axis.current = null;
    if (!wasH) return;
    const flickedOpen = vx < -SWIPE_FLICK_PX_MS;
    const flickedClosed = vx > SWIPE_FLICK_PX_MS;
    const next = flickedClosed ? 0 : flickedOpen || cur < -SWIPE_OPEN_PX ? -SWIPE_ACTION_W : 0;
    applyX(next);
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    try {
      if (frontRef.current?.hasPointerCapture(e.pointerId)) {
        frontRef.current.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* already released */
    }
    settle();
  };

  if (!enabled) return <>{children}</>;

  return (
    <div className="messages-swipe">
      <div className="messages-swipe-actions">
        <button
          type="button"
          className="messages-swipe-action messages-swipe-action--pin"
          onClick={() => {
            applyX(0);
            onPin();
          }}
        >
          <Pin size={16} strokeWidth={2.2} aria-hidden="true" />
          {pinned ? "Unpin" : "Pin"}
        </button>
        <button type="button" className="messages-swipe-action messages-swipe-action--remove" onClick={onRemove}>
          <Trash2 size={16} strokeWidth={2.2} aria-hidden="true" />
          Remove
        </button>
      </div>
      <div
        ref={frontRef}
        className={`messages-swipe-front${dragging ? " is-dragging" : ""}`}
        style={{ transform: `translateX(${x}px)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClickCapture={(e) => {
          if (xRef.current < -8) {
            e.preventDefault();
            e.stopPropagation();
            applyX(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
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
  const [pinErr, setPinErr] = useState<string | null>(null);

  useEffect(() => {
    void api<ConversationSummaryDTO[]>("/api/conversations")
      .then((rows) => {
        setItems(sortInbox(rows));
        setReady(true);
      })
      .catch(() => {
        setItems([]);
        setReady(true);
      });
  }, []);

  async function togglePin(conversationId: string) {
    const current = items.find((c) => c.conversationId === conversationId);
    if (!current) return;
    const next = !current.pinned;
    setPinErr(null);
    setItems((prev) => {
      const row = prev.find((c) => c.conversationId === conversationId);
      if (!row) return prev;
      const rest = prev.filter((c) => c.conversationId !== conversationId);
      const updated = { ...row, pinned: next };
      if (next) return [updated, ...rest];
      const stillPinned = rest.filter((c) => c.pinned);
      const unpinned = [...rest.filter((c) => !c.pinned), updated].sort(byInboxRecency);
      return [...stillPinned, ...unpinned];
    });
    try {
      await api(`/api/conversations/${conversationId}/pin`, {
        method: "POST",
        body: JSON.stringify({ pinned: next }),
      });
    } catch (e) {
      setPinErr(parseApiError(e));
      setItems((prev) => {
        const row = prev.find((c) => c.conversationId === conversationId);
        if (!row) return prev;
        const rest = prev.filter((c) => c.conversationId !== conversationId);
        const reverted = { ...row, pinned: !next };
        if (!next) return [reverted, ...rest];
        const stillPinned = rest.filter((c) => c.pinned);
        const unpinned = [...rest.filter((c) => !c.pinned), reverted].sort(byInboxRecency);
        return [...stillPinned, ...unpinned];
      });
    }
  }

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
                  No forums yet. Coffee, workouts, the city chats.
                </p>
              ) : (
                <div className="messages-card">
                  <div className="messages-list">
                    {forums.map((f) => (
                        <Link
                          key={f.interestTag}
                          to={`/forums/${f.interestTag}`}
                          state={MESSAGES_INTERESTS_FROM}
                          className="messages-row messages-row--forum"
                        >
                          <InterestCover tag={f.interestTag} />
                          <div className="messages-row-body">
                            <div className="messages-row-top">
                              <span className="messages-row-title">
                                <span className="messages-row-title-text">{f.label}</span>
                              </span>
                              {f.latestPost?.createdAt ? (
                                <span className={`messages-row-time${f.hasUnread ? " is-unread" : ""}`}>
                                  {formatInboxTime(f.latestPost.createdAt)}
                                </span>
                              ) : null}
                            </div>
                            <div className="messages-row-bottom">
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
                              {f.hasUnread && (
                                <span className="messages-row-unread" aria-label="Unread">
                                  1
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
                  <label className="form-eyebrow" htmlFor="join-more-forums">
                    {forums.length === 0 ? "Pick an interest" : "Join more forums"}
                  </label>
                  <select
                    id="join-more-forums"
                    className="forum-join-select"
                    value=""
                    disabled={!!joiningTag}
                    onChange={(e) => {
                      const next = e.target.value as InterestTag;
                      if (next) void joinForum(next);
                    }}
                  >
                    <option value="" disabled>
                      {joiningTag ? "Joining…" : "Choose a forum…"}
                    </option>
                    {availableForums.map((t) => (
                      <option key={t} value={t}>
                        {INTEREST_LABELS[t]}
                      </option>
                    ))}
                  </select>
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
          body="Join something. The chat finds you."
          cta={{ to: "/", label: "See what's happening" }}
        />
      ) : (
        <>
          {pinErr && <p className="error-text" style={{ marginBottom: 8 }}>{pinErr}</p>}
          <div className="messages-card">
            <div className="messages-list">
              {items.map((c) => {
                const preview = cleanPreview(c.lastMessagePreview);
                const isPoll = previewLooksLikePoll(c.lastMessagePreview);
                const canDismiss = Boolean(c.conversationId);
                const title = c.communityName ?? sentenceCaseTitle(c.planTitle);
                const time = formatInboxTime(c.lastMessageAt ?? c.planDate);
                const unread = c.unreadCount > 0;
                const previewLine = c.lastMessageSender && c.lastMessagePreview
                  ? `${c.lastMessageSender}: ${preview}`
                  : preview;
                const rowInner = (
                  <>
                    <PlanCoverThumb
                      planId={c.communityId || c.planId}
                      flyerDataUrl={c.coverImage}
                      isIdea={Boolean(c.isIdea)}
                    />
                    <div className="messages-row-body">
                      <div className="messages-row-top">
                        <span className="messages-row-title">
                          {c.pinned ? (
                            <Pin size={13} strokeWidth={2.2} className="messages-row-pin" aria-label="Pinned" />
                          ) : null}
                          <span className="messages-row-title-text">{title}</span>
                        </span>
                        {time ? (
                          <span className={`messages-row-time${unread ? " is-unread" : ""}`}>{time}</span>
                        ) : null}
                      </div>
                      <div className="messages-row-bottom">
                        <div className="messages-row-preview">
                          {isPoll && <BarChart2 size={14} strokeWidth={1.8} />}
                          <span>{previewLine}</span>
                        </div>
                        {unread && (
                          <span className="messages-row-unread" aria-label={`${c.unreadCount} unread`}>
                            {c.unreadCount > 9 ? "9+" : c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                );
                return (
                  <SwipeRemoveRow
                    key={c.communityId ? `comm-${c.communityId}` : c.planId}
                    enabled={canDismiss}
                    pinned={Boolean(c.pinned)}
                    onPin={() => {
                      if (c.conversationId) void togglePin(c.conversationId);
                    }}
                    onRemove={() => {
                      setDismissErr(null);
                      setDismissTarget(c.conversationId!);
                    }}
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
                  </SwipeRemoveRow>
                );
              })}
            </div>
          </div>
        </>
      )}
      </div>

      {dismissTarget && (
        <BottomSheet
          onClose={() => !dismissBusy && setDismissTarget(null)}
          closeDisabled={dismissBusy}
          labelledBy="dismiss-chat-title"
        >
            <h2 id="dismiss-chat-title" className="sheet-title">Remove from inbox?</h2>
            <p className="sheet-copy">
              Leaves the inbox. The plan&apos;s still there.
            </p>
            {dismissErr && <p className="error-text">{dismissErr}</p>}
            <div className="sheet-actions">
              <Button
                variant="primary"
                block
                disabled={dismissBusy}
                onClick={() => void dismissPastChat(dismissTarget)}
              >
                {dismissBusy ? "Removing…" : "Remove"}
              </Button>
              <Button variant="secondary" block disabled={dismissBusy} onClick={() => setDismissTarget(null)}>
                Cancel
              </Button>
            </div>
        </BottomSheet>
      )}
    </main>
  );
}
