import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api, parseApiError } from "../api/http";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { hrefForBack, type NavFromState } from "../lib/navState";
import { useStickToBottom } from "../lib/useStickToBottom";
import type { ConversationDTO, MessageDTO } from "../types/shared";

const POLL_MS = 4000;

/**
 * Direct chat with someone in your network. Opened from the network Message
 * button — that button used to open their profile with a back path to the feed.
 */
export function DmChatPage() {
  const { userId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const navFrom = (location.state as NavFromState | null) ?? null;
  const backState: NavFromState = navFrom?.from ? navFrom : { from: "network" };
  const backHref = hrefForBack(backState);
  const backLabel = navFrom?.from === "messages" ? "Messages" : "Network";
  const [conv, setConv] = useState<ConversationDTO | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const lastId = messages[messages.length - 1]?.id ?? "";
  const { scrollRef, endRef, shellRef, stickOnSend } = useStickToBottom(ready, `${lastId}:${messages.length}`);

  useEffect(() => {
    let live = true;
    setReady(false);
    setError(null);
    void (async () => {
      try {
        const c = await api<ConversationDTO>("/api/dm", {
          method: "POST",
          body: JSON.stringify({ userId }),
        });
        if (!live) return;
        setConv(c);
        const msgs = await api<MessageDTO[]>(`/api/conversations/${c.id}/messages`);
        if (!live) return;
        setMessages(msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      } catch (e) {
        if (live) setError(parseApiError(e) || "Couldn't open this chat.");
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!conv) return;
    const interval = setInterval(() => {
      void api<MessageDTO[]>(`/api/conversations/${conv.id}/messages`)
        .then((msgs) => setMessages(msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))))
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [conv]);

  const other = conv?.participants.find((p) => p.id !== user?.id) ?? conv?.participants[0];
  const title = [other?.firstName, other?.lastName].filter(Boolean).join(" ") || "Message";

  async function send() {
    if (!conv || sending || !body.trim()) return;
    const text = body.trim();
    setSending(true);
    setBody("");
    try {
      const msg = await api<MessageDTO>(`/api/conversations/${conv.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: text }),
      });
      setMessages((prev) => [...prev, msg]);
      stickOnSend();
    } catch (e) {
      setBody(text);
      setError(parseApiError(e) || "Couldn't send that.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main ref={shellRef} className="app-shell app-shell--chat">
      <header className="app-header app-header--minimal chat-header-bar chat-header-bar--thread app-header--sticky">
        <Link to={backHref} className="detail-back chat-back-link" aria-label={backLabel}>
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </Link>
        <div className="chat-thread-heading">
          <div className="chat-thread-title">{title}</div>
        </div>
        <span className="profile-other-more-spacer" aria-hidden="true" />
      </header>

      <div className="chat-shell">
        {other && (
          <Link to={`/profile/${other.id}`} state={{ from: "network" }} className="chat-header-card chat-header-card--compact">
            <Avatar
              seed={other.avatarSeed}
              style={other.avatarStyle}
              photoDataUrl={other.avatarPhotoDataUrl}
              params={other.avatarParams}
              name={other.firstName}
              size="sm"
            />
            <div className="chat-header-text">
              <div className="chat-header-meta">{title}</div>
            </div>
          </Link>
        )}

        <div ref={scrollRef} className="chat-messages">
          {!ready && <p className="network-empty">Opening chat…</p>}
          {ready && error && !conv && (
            <p className="error-text">
              {error}{" "}
              <button type="button" className="btn-link" onClick={() => navigate(backHref)}>
                Back
              </button>
            </p>
          )}
          {ready && conv && messages.length === 0 && (
            <p className="network-empty">Say hi — this chat is just the two of you.</p>
          )}
          {messages.map((m) => {
            if (m.kind === "system") {
              return (
                <div key={m.id} className="chat-system-line">
                  {m.body}
                </div>
              );
            }
            const mine = m.sender?.id === user?.id;
            return (
              <div key={m.id} className={`chat-bubble-row${mine ? " is-mine" : ""}`}>
                {!mine && m.sender && (
                  <span className="chat-bubble-avatar-slot">
                    <Avatar
                      seed={m.sender.avatarSeed}
                      style={m.sender.avatarStyle}
                      photoDataUrl={m.sender.avatarPhotoDataUrl}
                      params={m.sender.avatarParams}
                      size="sm"
                    />
                  </span>
                )}
                <div className="chat-bubble-stack">
                  <div className="chat-bubble">
                    {m.body && <div className="chat-bubble-body">{m.body}</div>}
                    <div className="chat-bubble-time">
                      {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} className="chat-messages-end" aria-hidden="true" />
        </div>

        {error && conv && <p className="error-text">{error}</p>}
        {conv && (
          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="chat-composer-row">
              <input
                type="text"
                className="chat-composer-input"
                placeholder="Message…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  void send();
                }}
              />
              <button
                type="submit"
                className={`chat-composer-send ${body.trim() ? "is-ready" : ""}`}
                disabled={sending || !body.trim()}
                aria-label="Send message"
              >
                <ArrowSendIcon />
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function ArrowSendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m13 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
