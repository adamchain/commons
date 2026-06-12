import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import { formatPlanDate, formatPlanTime, sentenceCaseTitle } from "../lib/format";
import { planHasEnded } from "../lib/planTime";
import type { ConversationDTO, MessageDTO, PlanDTO, PublicUser } from "../types/shared";

const POLL_MS = 4000;
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function ChatPage() {
  const { planId = "" } = useParams();
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [conv, setConv] = useState<ConversationDTO | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
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

  const visibleAvatars = conv.participants.slice(0, 4);
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
      <header className="app-header app-header--minimal">
        <Link to={`/plans/${planId}`} className="detail-back">← Back to plan</Link>
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
    </main>
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
  | {
      kind: "user";
      id: string;
      sender: PublicUser;
      body: string;
      createdAt: string;
      showAvatar: boolean;
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
