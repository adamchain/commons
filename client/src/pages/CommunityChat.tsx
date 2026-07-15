import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { formatRelative } from "../lib/format";
import type { MessageDTO, PublicUser } from "../types/shared";

const POLL_MS = 4000;

interface CommunityConversation {
  id: string;
  communityId: string;
  communityName: string;
  type: "group" | "dm";
  participants: PublicUser[];
  lastMessageAt: string;
  unreadCount: number;
}

// Lightweight persistent chat for a community. Reuses the shared conversation
// message endpoints (/api/conversations/:id/messages) — the same infra plan
// group chats use — but with a slimmer, poll-free UI for V1.
export function CommunityChatPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [conv, setConv] = useState<CommunityConversation | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const c = await api<CommunityConversation>(`/api/communities/${id}/conversation`);
        if (!alive) return;
        setConv(c);
        const msgs = await api<MessageDTO[]>(`/api/conversations/${c.id}/messages`);
        if (!alive) return;
        setMessages(msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Couldn't open chat");
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!conv) return;
    const interval = setInterval(async () => {
      try {
        const msgs = await api<MessageDTO[]>(`/api/conversations/${conv.id}/messages`);
        setMessages(msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      } catch {
        /* swallow */
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [conv]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  async function send() {
    const trimmed = body.trim();
    if (!trimmed || !conv || sending) return;
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

  if (!ready) {
    return (
      <main className="app-shell app-shell--chat">
        <div className="chat-loading-placeholder" aria-hidden="true" />
      </main>
    );
  }

  if (error || !conv) {
    return (
      <main className="app-shell app-shell--chat">
        <div className="chat-header">
          <Link to={`/communities/${id}`} className="chat-back">
            ← Community
          </Link>
        </div>
        <div className="empty-state">
          <p style={{ margin: 0 }}>{error ?? "Chat unavailable."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell app-shell--chat">
      <div className="chat-header">
        <Link to={`/communities/${conv.communityId}`} className="chat-back">
          ← {conv.communityName}
        </Link>
        <span className="chat-header-sub">
          {conv.participants.length} {conv.participants.length === 1 ? "member" : "members"}
        </span>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">No messages yet — say hi 👋</div>
        ) : (
          messages.map((m) => {
            if (m.kind === "system") {
              return (
                <div key={m.id} className="chat-system-line">
                  {m.body}
                </div>
              );
            }
            const mine = m.sender?.id === user?.id;
            return (
              <div key={m.id} className={`chat-msg ${mine ? "chat-msg--mine" : ""}`}>
                {!mine && m.sender && (
                  <Avatar
                    seed={m.sender.avatarSeed}
                    style={m.sender.avatarStyle}
                    photoDataUrl={m.sender.avatarPhotoDataUrl}
                    params={m.sender.avatarParams}
                    size="xs"
                  />
                )}
                <div className="chat-msg-bubble">
                  {!mine && m.sender && (
                    <span className="chat-msg-sender">{m.sender.firstName}</span>
                  )}
                  <span className="chat-msg-body">{m.body}</span>
                  <span className="chat-msg-time">{formatRelative(m.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="chat-composer">
        <textarea
          className="chat-composer-input"
          placeholder="Message the community…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
        />
        <button
          type="button"
          className="chat-composer-send"
          onClick={() => void send()}
          disabled={sending || !body.trim()}
        >
          Send
        </button>
      </div>
    </main>
  );
}
