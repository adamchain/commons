import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import { formatRelative } from "../lib/format";
import type { ConversationDTO, MessageDTO } from "../types/shared";

const POLL_MS = 4000;

export function ChatPage() {
  const { planId = "", conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conv, setConv] = useState<ConversationDTO | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Resolve which conversation we're showing — group (default) or DM.
  useEffect(() => {
    void (async () => {
      if (conversationId) {
        // We don't have a "get one conversation" endpoint, so just hydrate via messages.
        const msgs = await api<MessageDTO[]>(`/api/conversations/${conversationId}/messages`);
        setMessages(msgs);
        setConv({ id: conversationId, planId, type: "dm", participants: [], lastMessageAt: "", unreadCount: 0 });
        return;
      }
      const c = await api<ConversationDTO>(`/api/plans/${planId}/conversation`);
      setConv(c);
      const msgs = await api<MessageDTO[]>(`/api/conversations/${c.id}/messages`);
      setMessages(msgs);
    })();
  }, [planId, conversationId]);

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

  async function startDmWith(otherUserId: string) {
    const dm = await api<ConversationDTO>(`/api/plans/${planId}/dms`, {
      method: "POST",
      body: JSON.stringify({ otherUserId }),
    });
    navigate(`/plans/${planId}/chat/${dm.id}`);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <Link to={`/plans/${planId}`} className="detail-back">← Back to plan</Link>
      </header>

      <div className="chat-shell">
        {conv.type === "group" && conv.participants.length > 0 && (
          <div className="chat-roster">
            <div className="chat-roster-label">In this chat</div>
            <div className="chat-roster-list">
              {conv.participants.map((p) => (
                <button
                  key={p.id}
                  className="chat-roster-chip"
                  onClick={() => p.id !== user.id && void startDmWith(p.id)}
                  disabled={p.id === user.id}
                  title={p.id === user.id ? "" : `DM ${p.firstName}`}
                >
                  <Avatar seed={p.avatarSeed} style={p.avatarStyle} size="sm" />
                  <span>{p.firstName}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={scrollRef} className="chat-messages">
          {messages.length === 0 ? (
            <div className="empty-state">No messages yet. Say hi.</div>
          ) : (
            messages.map((m) => {
              const mine = m.sender.id === user.id;
              return (
                <div key={m.id} className={`chat-bubble-row ${mine ? "is-mine" : ""}`}>
                  {!mine && <Avatar seed={m.sender.avatarSeed} style={m.sender.avatarStyle} size="sm" />}
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
            placeholder="Message…"
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
