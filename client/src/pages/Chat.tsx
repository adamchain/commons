import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import { PollCard } from "../components/PollCard";
import { useAuth } from "../context/AuthContext";
import { formatPlanDate, formatPlanTime, sentenceCaseTitle } from "../lib/format";
import { planHasEnded } from "../lib/planTime";
import type { ConversationDTO, MessageDTO, PlanDTO, PublicUser } from "../types/shared";

const POLL_MS = 4000;
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function ChatPage() {
  const { planId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [conv, setConv] = useState<ConversationDTO | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [busyPollId, setBusyPollId] = useState<string | null>(null);
  // Pinned active polls collapse into a single dropdown so an open poll doesn't
  // render as a full card twice (pinned + inline in the thread).
  const [pinnedPollsOpen, setPinnedPollsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const [p, c] = await Promise.all([
        api<PlanDTO>(`/api/plans/${planId}`),
        api<ConversationDTO>(`/api/plans/${planId}/conversation`),
      ]);
      setPlan(p);
      setConv(c);
      const msgs = await api<MessageDTO[]>(`/api/conversations/${c.id}/messages`);
      setMessages(msgs);
    })();
  }, [planId]);

  // Poll for new messages.
  useEffect(() => {
    if (!conv) return;
    const interval = setInterval(async () => {
      try {
        const msgs = await api<MessageDTO[]>(`/api/conversations/${conv.id}/messages`);
        setMessages(msgs);
      } catch { /* swallow */ }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [conv]);

  // Autoscroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const grouped = useMemo(() => groupMessages(messages), [messages]);

  if (!conv || !user || !plan) return <LoadingScreen tagline="Opening chat" />;

  async function send() {
    const trimmed = body.trim();
    if (!trimmed || !conv) return;
    setSending(true);
    try {
      const msg = await api<MessageDTO>(`/api/conversations/${conv.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: trimmed }),
      });
      setMessages((prev) => [...prev, msg]);
      setBody("");
    } finally {
      setSending(false);
    }
  }

  async function leaveChat() {
    if (!conv) return;
    if (!window.confirm("Leave this chat? It'll disappear from your Messages. You stay on the plan.")) return;
    try {
      await api(`/api/conversations/${conv.id}/leave`, { method: "POST" });
      navigate("/messages");
    } catch {
      /* swallow */
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
  const replanHref = `/plans/new?inviteUserIds=${encodeURIComponent(inviteIds)}&inviteNames=${encodeURIComponent(inviteNames)}`;

  return (
    <main className="app-shell app-shell--chat">
      <header className="app-header app-header--minimal chat-header-bar">
        <Link to={`/plans/${planId}`} className="detail-back">← Back to plan</Link>
        <button type="button" className="btn-link chat-leave-btn" onClick={() => void leaveChat()}>
          Leave chat
        </button>
      </header>

      <div className="chat-shell">
        <Link to={`/plans/${planId}`} className="chat-header-card" aria-label="Open plan details">
          <span className="chat-header-emoji" aria-hidden>{plan.hostEmoji}</span>
          <div className="chat-header-text">
            <div className="chat-header-title">{sentenceCaseTitle(plan.title)}</div>
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
          <Link to={replanHref} className="chat-replan-cta">
            <span className="chat-replan-emoji" aria-hidden="true">🔁</span>
            <span className="chat-replan-text">
              <strong>Want to make this a regular thing?</strong>
              <span>Post the next one.</span>
            </span>
            <span className="chat-replan-arrow" aria-hidden="true">→</span>
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
              <span className="chat-pinned-polls-badge" aria-hidden="true">📊</span>
              <span className="chat-pinned-polls-summary">
                {openPolls.length === 1
                  ? openPolls[0].poll!.question
                  : `${openPolls.length} active polls`}
              </span>
              <span className="chat-pinned-polls-chevron" aria-hidden="true">
                {pinnedPollsOpen ? "▾" : "▸"}
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
              <div className="chat-empty-glyph" aria-hidden>💬</div>
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
                  <div className="chat-bubble">
                    {!mine && entry.showAvatar && (
                      <div className="chat-bubble-author">{entry.sender.firstName}</div>
                    )}
                    <div className="chat-bubble-body">{entry.body}</div>
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
        </div>

        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <button
            type="button"
            className="chat-composer-poll"
            onClick={() => setPollModalOpen(true)}
            aria-label="Create a poll"
            title="Create a poll"
          >
            <PollIcon />
          </button>
          <input
            type="text"
            className="chat-composer-input"
            placeholder="Message the group…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button
            type="submit"
            className="chat-composer-send"
            disabled={sending || !body.trim()}
            aria-label="Send message"
          >
            <SendIcon />
          </button>
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
    </main>
  );
}

function PollIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="10" width="3.6" height="9" rx="1" stroke="currentColor" strokeWidth="1.8" />
      <rect x="10.2" y="5" width="3.6" height="14" rx="1" stroke="currentColor" strokeWidth="1.8" />
      <rect x="16.4" y="13" width="3.6" height="6" rx="1" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3.4 11.3 20.6 3.4a.6.6 0 0 1 .8.8L13.5 21.4a.6.6 0 0 1-1.1 0l-2.5-7.4-7.4-2.5a.6.6 0 0 1 0-1.1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
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
