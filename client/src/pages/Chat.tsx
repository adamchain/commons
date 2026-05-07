import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import { formatRelative } from "../lib/format";
import type { ConversationDTO, MessageDTO } from "../types/shared";

const POLL_MS = 4000;

export function ChatPage() {
  const { planId = "" } = useParams();
  const { user } = useAuth();
  const [conv, setConv] = useState<ConversationDTO | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const c = await api<ConversationDTO>(`/api/plans/${planId}/conversation`);
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

  if (!conv || !user) return <LoadingScreen tagline="Opening chat" />;

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

  return (
    <main className="app-shell">
      <header className="app-header">
        <Link to={`/plans/${planId}`} className="detail-back">← Back to plan</Link>
      </header>

      <div className="chat-shell">
        <p className="chat-thread-hint">Say hi to the group — keep it short and friendly.</p>

        <div ref={scrollRef} className="chat-messages">
          {messages.length === 0 ? (
            <div className="empty-state">No messages yet. Say hi.</div>
          ) : (
            messages.map((m) => {
              const mine = m.sender.id === user.id;
              return (
                <div key={m.id} className={`chat-bubble-row ${mine ? "is-mine" : ""}`}>
                  {!mine && <Avatar seed={m.sender.avatarSeed} style={m.sender.avatarStyle} photoDataUrl={m.sender.avatarPhotoDataUrl} size="sm" />}
                  <div className="chat-bubble">
                    {!mine && <div className="chat-bubble-author">{m.sender.firstName}</div>}
                    <div className="chat-bubble-body">{m.body}</div>
                    <div className="chat-bubble-time">{formatRelative(m.createdAt)}</div>
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
            placeholder="Message the group…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={sending || !body.trim()}>
            Send
          </button>
        </form>
      </div>
    </main>
  );
}
