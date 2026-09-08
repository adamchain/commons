import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUp,
  BarChart2,
  ChevronDown,
  ChevronRight,
  MessageCircle,
  MoreVertical,
  Plus,
} from "lucide-react";
import { api, parseApiError } from "../api/http";
import { Avatar } from "../components/Avatar";
import { PlanCoverThumb } from "../components/CoverThumb";
import { BlockConfirmModal, ReportModal } from "../components/PlanSafetyMenu";
import { PollCard } from "../components/PollCard";
import { useAuth } from "../context/AuthContext";
import { formatPlanDate, formatPlanTime, sentenceCaseTitle } from "../lib/format";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { hrefForBack, type NavFromState } from "../lib/navState";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import { planHasEnded } from "../lib/planTime";
import { useStickToBottom } from "../lib/useStickToBottom";
import type { ConversationDTO, MessageDTO, PlanDTO, PublicUser } from "../types/shared";

const POLL_MS = 4000;
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const CHAT_IMAGE_MAX_PX = 1024;
const CHAT_IMAGE_QUALITY = 0.85;

export function ChatPage() {
  const { planId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const navFrom = (location.state as NavFromState | null) ?? null;
  const backState: NavFromState = navFrom?.from ? navFrom : { from: "plan", planId };
  const backHref = hrefForBack(backState);
  const backLabel =
    navFrom?.from === "messages"
      ? "Messages"
      : navFrom?.from === "notifications"
        ? "Notifications"
        : navFrom?.from === "profile"
          ? "Profile"
          : "Plan";
  const planLinkState: NavFromState =
    navFrom?.from === "messages"
      ? { from: "messages" }
      : navFrom?.from === "notifications"
        ? { from: "notifications" }
        : navFrom?.from === "profile"
          ? { from: "profile", profileUserId: navFrom.profileUserId ?? navFrom.planId }
          : { from: "chat", planId };
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [conv, setConv] = useState<ConversationDTO | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [attachingImage, setAttachingImage] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [busyPollId, setBusyPollId] = useState<string | null>(null);
  const [pinnedPollsOpen, setPinnedPollsOpen] = useState(false);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [chatReady, setChatReady] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveErr, setLeaveErr] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const composerMenuRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const lastMessageId = messages[messages.length - 1]?.id ?? "";
  const { scrollRef, endRef, shellRef, stickOnSend } = useStickToBottom(chatReady, `${lastMessageId}:${messages.length}`);

  useEffect(() => {
    void (async () => {
      try {
        const [p, c] = await Promise.all([
          api<PlanDTO>(`/api/plans/${planId}`),
          api<ConversationDTO>(`/api/plans/${planId}/conversation`),
        ]);
        setPlan(p);
        setConv(c);
        const msgs = await api<MessageDTO[]>(`/api/conversations/${c.id}/messages`);
        setMessages(msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      } catch (e) {
        setChatError(parseApiError(e));
      } finally {
        setChatReady(true);
      }
    })();
  }, [planId]);

  // Poll for new messages.
  useEffect(() => {
    if (!conv) return;
    const interval = setInterval(async () => {
      try {
        const msgs = await api<MessageDTO[]>(`/api/conversations/${conv.id}/messages`);
        setMessages(msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      } catch { /* swallow */ }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [conv]);

  useEffect(() => {
    if (!composerMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (composerMenuRef.current && !composerMenuRef.current.contains(e.target as Node)) {
        setComposerMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [composerMenuOpen]);

  useEffect(() => {
    if (!headerMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [headerMenuOpen]);

  const grouped = useMemo(() => groupMessages(messages), [messages]);

  if (!chatReady) {
    return (
      <main className="app-shell app-shell--chat">
        <div className="chat-loading-placeholder" aria-hidden="true" />
      </main>
    );
  }

  if (chatError || !conv || !user || !plan) {
    return (
      <main className="app-shell app-shell--chat">
        <header className="app-header app-header--minimal chat-header-bar chat-header-bar--thread app-header--sticky">
          <Link to={backHref} className="detail-back chat-back-link">
            <ArrowLeft size={13} strokeWidth={2.2} aria-hidden="true" />
            {backLabel}
          </Link>
          <div className="chat-thread-title">Chat</div>
          <span aria-hidden="true" />
        </header>
        <div className="empty-state">
          <p style={{ margin: 0 }}>{chatError ?? "Chat unavailable."}</p>
        </div>
      </main>
    );
  }

  async function send() {
    const trimmed = body.trim();
    if ((!trimmed && !pendingImage) || !conv || sending) return;
    setSending(true);
    try {
      const msg = await api<MessageDTO>(`/api/conversations/${conv.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          ...(trimmed ? { body: trimmed } : {}),
          ...(pendingImage ? { imageUrl: pendingImage } : {}),
        }),
      });
      stickOnSend();
      setMessages((prev) => [...prev, msg]);
      setBody("");
      setPendingImage(null);
    } catch (e) {
      window.alert(parseApiError(e) || "Couldn't send that message.");
    } finally {
      setSending(false);
    }
  }

  async function attachImage(dataUrl: string) {
    setPendingImage(dataUrl);
  }

  async function pickImage() {
    setComposerMenuOpen(false);
    try {
      if (isNative()) {
        setAttachingImage(true);
        try {
          const dataUrl = await pickPhotoNative({
            maxPx: CHAT_IMAGE_MAX_PX,
            quality: CHAT_IMAGE_QUALITY,
          });
          if (dataUrl) await attachImage(dataUrl);
        } finally {
          setAttachingImage(false);
        }
        return;
      }
      imageInputRef.current?.click();
    } catch {
      setAttachingImage(false);
    }
  }

  async function onImageFileSelected(file: File | undefined) {
    if (!file) return;
    setAttachingImage(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file, CHAT_IMAGE_MAX_PX, CHAT_IMAGE_QUALITY);
      await attachImage(dataUrl);
    } catch {
      window.alert("Couldn't read that image. Try another.");
    } finally {
      setAttachingImage(false);
    }
  }

  async function leaveChat() {
    if (!conv) return;
    setLeaveBusy(true);
    setLeaveErr(null);
    try {
      await api(`/api/conversations/${conv.id}/leave`, { method: "POST" });
      setConfirmLeave(false);
      navigate("/messages");
    } catch (e) {
      setLeaveErr(parseApiError(e));
    } finally {
      setLeaveBusy(false);
    }
  }

  async function toggleMute() {
    if (!conv) return;
    setHeaderMenuOpen(false);
    try {
      const r = await api<{ ok: boolean; muted: boolean }>(`/api/conversations/${conv.id}/mute`, {
        method: "POST",
        body: JSON.stringify({ muted: !conv.muted }),
      });
      setConv((prev) => (prev ? { ...prev, muted: r.muted } : prev));
    } catch {
      /* swallow — they can tap again */
    }
  }

  async function toggleHeart(messageId: string) {
    if (!conv) return;
    try {
      const updated = await api<MessageDTO>(
        `/api/conversations/${conv.id}/messages/${messageId}/react`,
        { method: "POST", body: JSON.stringify({ emoji: "❤️" }) },
      );
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
    } catch {
      /* swallow — they can tap again */
    }
  }

  async function createPoll() {
    if (!conv) return;
    const question = pollQuestion.trim();
    const options = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!question || options.length < 2) return;
    setCreatingPoll(true);
    try {
      const msg = await api<MessageDTO>(`/api/conversations/${conv.id}/polls`, {
        method: "POST",
        body: JSON.stringify({ question, options }),
      });
      stickOnSend();
      setMessages((prev) => [...prev, msg]);
      setPollModalOpen(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
    } finally {
      setCreatingPoll(false);
    }
  }

  async function votePoll(messageId: string, optionId: string) {
    if (!conv) return;
    setBusyPollId(messageId);
    try {
      const updated = await api<MessageDTO>(
        `/api/conversations/${conv.id}/messages/${messageId}/vote`,
        { method: "POST", body: JSON.stringify({ optionId }) },
      );
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
    } catch {
      /* swallow — they can tap again */
    } finally {
      setBusyPollId(null);
    }
  }

  async function closePoll(messageId: string) {
    if (!conv) return;
    if (!window.confirm("Close this poll? Results will be final and voting stops.")) return;
    setBusyPollId(messageId);
    try {
      const updated = await api<MessageDTO>(
        `/api/conversations/${conv.id}/messages/${messageId}/close-poll`,
        { method: "POST" },
      );
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
    } catch {
      /* swallow */
    } finally {
      setBusyPollId(null);
    }
  }

  async function reopenPoll(messageId: string) {
    if (!conv) return;
    if (!window.confirm("Reopen this poll? Voting starts again and results unlock.")) return;
    setBusyPollId(messageId);
    try {
      const updated = await api<MessageDTO>(
        `/api/conversations/${conv.id}/messages/${messageId}/reopen-poll`,
        { method: "POST" },
      );
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
    } catch {
      /* swallow */
    } finally {
      setBusyPollId(null);
    }
  }

  const canSubmitPoll =
    pollQuestion.trim().length > 0 && pollOptions.filter((o) => o.trim()).length >= 2;
  const openPolls = messages.filter((m) => m.kind === "poll" && m.poll && !m.poll.closed);

  const visibleAvatars = conv.participants.slice(0, 3);
  const overflowCount = Math.max(0, conv.participants.length - visibleAvatars.length);
  const participantLabel =
    conv.participants.length === 1 ? "1 person" : `${conv.participants.length} people`;

  // "Want to make this a regular thing?" surfaces once the underlying plan is
  // over (or cancelled) so the group chat doesn't just go cold. One tap into
  // Make a Plan with this conversation's participants seeded as the audience.
  const planConcluded = Boolean(plan.cancelledAt) || planHasEnded(plan);
  const others = conv.participants.filter((p) => p.id !== user.id);
  const inviteIds = others.map((p) => p.id).join(",");
  const inviteNames = others.map((p) => p.firstName).join(",");
  // fromPlanId carries this plan's crew + chat history into the new event.
  const replanHref = `/plans/new?fromPlanId=${planId}&title=${encodeURIComponent(plan.title)}&inviteUserIds=${encodeURIComponent(inviteIds)}&inviteNames=${encodeURIComponent(inviteNames)}`;

  return (
    <main ref={shellRef} className="app-shell app-shell--chat">
      <header className="app-header app-header--minimal chat-header-bar chat-header-bar--thread app-header--sticky">
        <Link to={backHref} className="detail-back chat-back-link">
          <ArrowLeft size={13} strokeWidth={2.2} aria-hidden="true" />
          {backLabel}
        </Link>
        <div className="chat-thread-title">{sentenceCaseTitle(plan.title)}</div>
        <div className="chat-header-menu-wrap" ref={headerMenuRef}>
          <button
            type="button"
            className="chat-header-menu-btn"
            onClick={() => setHeaderMenuOpen((v) => !v)}
            aria-label="Chat options"
            aria-expanded={headerMenuOpen}
          >
            <MoreVertical size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
          {headerMenuOpen && (
            <div className="chat-header-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => void toggleMute()}>
                {conv.muted ? "Unmute notifications" : "Mute notifications"}
              </button>
              {!conv.isHost && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      setReportOpen(true);
                    }}
                  >
                    Report organizer
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      setBlockOpen(true);
                    }}
                  >
                    Block organizer
                  </button>
                </>
              )}
              <button
                type="button"
                role="menuitem"
                className="chat-header-menu-leave"
                onClick={() => {
                  setHeaderMenuOpen(false);
                  setLeaveErr(null);
                  setConfirmLeave(true);
                }}
              >
                {planConcluded ? "Remove from inbox" : "Leave chat"}
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="chat-shell">
        <Link
          to={`/plans/${planId}`}
          state={planLinkState}
          className="chat-header-card chat-header-card--compact"
          aria-label="Open plan details"
        >
          <PlanCoverThumb
            planId={plan.id}
            flyerDataUrl={plan.flyerDataUrl}
            className="cover-thumb--sm"
          />
          <div className="chat-header-text">
            <div className="chat-header-meta">
              {formatPlanDate(plan.date)} · {formatPlanTime(plan.time, plan.isFlexibleTime)} · {participantLabel}
            </div>
          </div>
          <div className="chat-header-avatars" aria-hidden>
            {visibleAvatars.map((p) => (
              <span key={p.id} className="chat-header-avatar">
                <Avatar
                  seed={p.avatarSeed}
                  style={p.avatarStyle}
                  photoDataUrl={p.avatarPhotoDataUrl}
                  params={p.avatarParams}
                  size="sm"
                />
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="chat-header-avatar-more">+{overflowCount}</span>
            )}
          </div>
        </Link>

        {planConcluded && others.length > 0 && (
          <Link to={replanHref} className="chat-replan-cta chat-replan-cta--primary">
            <span className="chat-replan-text">
              <strong>Plan the next one</strong>
              <span>Post another with this group.</span>
            </span>
            <span className="chat-replan-arrow" aria-hidden="true">
              <ChevronRight size={16} strokeWidth={2} />
            </span>
          </Link>
        )}

        {openPolls.length > 0 && (
          <div className={`chat-pinned-polls ${pinnedPollsOpen ? "is-open" : ""}`} aria-label="Active polls">
            <button
              type="button"
              className="chat-pinned-polls-toggle"
              onClick={() => setPinnedPollsOpen((v) => !v)}
              aria-expanded={pinnedPollsOpen}
            >
              <span className="chat-pinned-polls-badge" aria-hidden="true">
                <BarChart2 size={13} strokeWidth={1.8} />
              </span>
              <span className="chat-pinned-polls-summary">
                {openPolls.length === 1
                  ? openPolls[0].poll!.question
                  : `${openPolls.length} active polls`}
              </span>
              <span className="chat-pinned-polls-chevron" aria-hidden="true">
                {pinnedPollsOpen ? (
                  <ChevronDown size={12} strokeWidth={2} />
                ) : (
                  <ChevronRight size={12} strokeWidth={2} />
                )}
              </span>
            </button>
            {pinnedPollsOpen && (
              <div className="chat-pinned-polls-list">
                {openPolls.map((m) => (
                  <PollCard
                    key={m.id}
                    poll={m.poll!}
                    author={m.sender!}
                    participants={conv.participants}
                    variant="pinned"
                    showQuestion={openPolls.length > 1}
                    onVote={(optId) => void votePoll(m.id, optId)}
                    onClose={m.poll!.canClose ? () => void closePoll(m.id) : undefined}
                    busy={busyPollId === m.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div ref={scrollRef} className="chat-messages">
          {grouped.length === 0 ? (
            <div className="chat-empty-card">
              <div className="chat-empty-glyph" aria-hidden>
                <MessageCircle size={24} strokeWidth={1.6} />
              </div>
              <div className="chat-empty-headline">It's quiet in here</div>
              <p className="chat-empty-body">
                Be the first to say hi — a quick hello or a logistics note goes a long way.
              </p>
            </div>
          ) : (
            grouped.map((entry) => {
              if (entry.kind === "day") {
                return (
                  <div key={entry.key} className="chat-day-divider" role="separator">
                    <span>{entry.label}</span>
                  </div>
                );
              }
              if (entry.kind === "system") {
                return (
                  <div key={entry.id} className="chat-system-line">{entry.body}</div>
                );
              }
              if (entry.kind === "poll") {
                const msg = entry.message;
                if (!msg.poll || !msg.sender) return null;
                return (
                  <div key={entry.id} className="chat-poll-row">
                    <PollCard
                      poll={msg.poll}
                      author={msg.sender}
                      participants={conv.participants}
                      collapsible
                      onVote={(optId) => void votePoll(msg.id, optId)}
                      onClose={msg.poll.canClose ? () => void closePoll(msg.id) : undefined}
                      onReopen={msg.poll.canClose ? () => void reopenPoll(msg.id) : undefined}
                      busy={busyPollId === msg.id}
                    />
                  </div>
                );
              }
              const mine = entry.sender.id === user.id;
              const rowCls = [
                "chat-bubble-row",
                mine ? "is-mine" : "",
                entry.showAvatar ? "" : "is-cont",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div key={entry.id} className={rowCls}>
                  {!mine && (
                    <span className="chat-bubble-avatar-slot">
                      {entry.showAvatar ? (
                        <Avatar
                          seed={entry.sender.avatarSeed}
                          style={entry.sender.avatarStyle}
                          photoDataUrl={entry.sender.avatarPhotoDataUrl}
                          params={entry.sender.avatarParams}
                          size="sm"
                        />
                      ) : null}
                    </span>
                  )}
                  <div className={`chat-bubble${entry.imageUrl ? " has-image" : ""}`}>
                    {!mine && entry.showAvatar && (
                      <div className="chat-bubble-author">{entry.sender.firstName}</div>
                    )}
                    {entry.imageUrl && (
                      <a
                        href={entry.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="chat-bubble-image-link"
                      >
                        <img src={entry.imageUrl} alt="" className="chat-bubble-image" />
                      </a>
                    )}
                    {entry.body && !(entry.imageUrl && entry.body === "📷 Photo") && (
                      <div className="chat-bubble-body">{entry.body}</div>
                    )}
                    <div className="chat-bubble-time">{formatTimeOnly(entry.createdAt)}</div>
                    {(() => {
                      const hearts = entry.reactions["❤️"] ?? [];
                      const iReacted = hearts.includes(user.id);
                      return (
                        <button
                          type="button"
                          className={`chat-react-btn ${iReacted ? "is-reacted" : ""} ${hearts.length > 0 ? "has-count" : ""}`}
                          onClick={() => void toggleHeart(entry.id)}
                          aria-label={iReacted ? "Remove heart" : "React with heart"}
                          aria-pressed={iReacted}
                        >
                          <span aria-hidden="true">❤️</span>
                          {hearts.length > 0 && <span className="chat-react-count">{hearts.length}</span>}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} className="chat-messages-end" aria-hidden="true" />
        </div>

        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {pendingImage && (
            <div className="chat-composer-attach">
              <div className="chat-composer-attach-thumb">
                <img src={pendingImage} alt="" />
                <button
                  type="button"
                  className="chat-composer-attach-remove"
                  aria-label="Remove image"
                  onClick={() => setPendingImage(null)}
                >
                  ×
                </button>
              </div>
            </div>
          )}
          <div className="chat-composer-row">
            <div className="chat-composer-menu-wrap" ref={composerMenuRef}>
              <button
                type="button"
                className="chat-composer-add"
                onClick={() => setComposerMenuOpen((v) => !v)}
                aria-label="More actions"
                aria-expanded={composerMenuOpen}
              >
                <Plus size={14} strokeWidth={2} aria-hidden="true" />
              </button>
              {composerMenuOpen && (
                <div className="chat-composer-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setComposerMenuOpen(false);
                      setPollModalOpen(true);
                    }}
                  >
                    Add a poll
                  </button>
                  <Link
                    to={replanHref}
                    role="menuitem"
                    className="chat-composer-menu-link"
                    onClick={() => setComposerMenuOpen(false)}
                  >
                    Make a plan
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={attachingImage || sending}
                    onClick={() => void pickImage()}
                  >
                    {attachingImage ? "Adding…" : "Upload an image"}
                  </button>
                </div>
              )}
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                void onImageFileSelected(f);
                if (imageInputRef.current) imageInputRef.current.value = "";
              }}
            />
            <input
              type="text"
              className="chat-composer-input"
              placeholder={pendingImage ? "Add a caption…" : "Message the group…"}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (sending || (!body.trim() && !pendingImage)) return;
                void send();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.currentTarget.focus({ preventScroll: true });
              }}
            />
            <button
              type="submit"
              className={`chat-composer-send ${body.trim() || pendingImage ? "is-ready" : ""}`}
              disabled={sending || (!body.trim() && !pendingImage)}
              aria-label="Send message"
            >
              <ArrowUp size={13} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </form>
      </div>

      {pollModalOpen && (
        <div className="modal-backdrop" onClick={() => !creatingPoll && setPollModalOpen(false)}>
          <div className="modal-card poll-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="poll-modal-title">New poll</h2>
            <p className="poll-modal-sub">Everyone in the chat can vote on one option.</p>
            <input
              type="text"
              className="poll-modal-question"
              placeholder="Ask a question…"
              value={pollQuestion}
              maxLength={140}
              autoFocus
              onChange={(e) => setPollQuestion(e.target.value)}
            />
            <div className="poll-modal-options">
              {pollOptions.map((opt, i) => (
                <div key={i} className="poll-modal-option-row">
                  <input
                    type="text"
                    placeholder={`Option ${i + 1}`}
                    value={opt}
                    maxLength={80}
                    onChange={(e) =>
                      setPollOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))
                    }
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      className="poll-modal-remove"
                      aria-label={`Remove option ${i + 1}`}
                      onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            {pollOptions.length < 6 && (
              <button
                type="button"
                className="poll-modal-add"
                onClick={() => setPollOptions((prev) => [...prev, ""])}
              >
                + Add option
              </button>
            )}
            <div className="poll-modal-actions">
              <button
                type="button"
                className="btn-link"
                onClick={() => setPollModalOpen(false)}
                disabled={creatingPoll}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void createPoll()}
                disabled={!canSubmitPoll || creatingPoll}
              >
                {creatingPoll ? "Posting…" : "Post poll"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmLeave && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => !leaveBusy && setConfirmLeave(false)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginTop: 0 }}>{planConcluded ? "Remove from inbox?" : "Leave this chat?"}</h4>
            <p style={{ marginTop: 0 }}>
              It&apos;ll disappear from Messages. You stay on the plan.
            </p>
            {leaveErr && <p className="error-text">{leaveErr}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn-link" disabled={leaveBusy} onClick={() => setConfirmLeave(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={leaveBusy} onClick={() => void leaveChat()}>
                {leaveBusy ? "Removing…" : planConcluded ? "Remove" : "Leave chat"}
              </button>
            </div>
          </div>
        </div>
      )}
      {reportOpen && (
        <ReportModal
          targetUserId={conv.hostId}
          targetFirstName={plan.creator.firstName}
          planId={plan.id}
          planTitle={plan.title}
          contentKind="plan"
          onClose={() => setReportOpen(false)}
        />
      )}
      {blockOpen && (
        <BlockConfirmModal
          targetUserId={conv.hostId}
          targetFirstName={plan.creator.firstName}
          onClose={() => setBlockOpen(false)}
          onBlocked={async () => {
            navigate("/", { replace: true });
          }}
        />
      )}
    </main>
  );
}

function formatTimeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

type GroupedEntry =
  | { kind: "day"; key: string; label: string }
  | { kind: "system"; id: string; body: string }
  | { kind: "poll"; id: string; message: MessageDTO }
  | {
      kind: "user";
      id: string;
      sender: PublicUser;
      body: string;
      createdAt: string;
      showAvatar: boolean;
      reactions: Record<string, string[]>;
      imageUrl?: string | null;
    };

function groupMessages(msgs: MessageDTO[]): GroupedEntry[] {
  const out: GroupedEntry[] = [];
  let lastDayKey = "";
  let lastUserSenderId = "";
  let lastUserAt = 0;

  for (const m of msgs) {
    const date = new Date(m.createdAt);
    const dayKey = date.toDateString();
    if (dayKey !== lastDayKey) {
      out.push({ kind: "day", key: `day-${dayKey}`, label: dayLabel(date) });
      lastDayKey = dayKey;
      lastUserSenderId = "";
      lastUserAt = 0;
    }
    if (m.kind === "system") {
      out.push({ kind: "system", id: m.id, body: m.body });
      lastUserSenderId = "";
      lastUserAt = 0;
      continue;
    }
    if (m.kind === "poll") {
      out.push({ kind: "poll", id: m.id, message: m });
      lastUserSenderId = "";
      lastUserAt = 0;
      continue;
    }
    const sender = m.sender!;
    const cont =
      sender.id === lastUserSenderId && date.getTime() - lastUserAt < GROUP_WINDOW_MS;
    out.push({
      kind: "user",
      id: m.id,
      sender,
      body: m.body,
      createdAt: m.createdAt,
      showAvatar: !cont,
      reactions: m.reactions ?? {},
      imageUrl: m.imageUrl,
    });
    lastUserSenderId = sender.id;
    lastUserAt = date.getTime();
  }
  return out;
}

function dayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
