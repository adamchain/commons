import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { api, parseApiError } from "../api/http";
import { Avatar } from "../components/Avatar";
import { PollCard } from "../components/PollCard";
import { PollSheet } from "../components/PollSheet";
import { useAuth } from "../context/AuthContext";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { hrefForBack, type NavFromState } from "../lib/navState";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import { useStickToBottom } from "../lib/useStickToBottom";
import type { ConversationDTO, MessageDTO } from "../types/shared";

const POLL_MS = 4000;
const CHAT_IMAGE_MAX_PX = 1024;
const CHAT_IMAGE_QUALITY = 0.85;

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
  const backLabel =
    navFrom?.from === "messages" ? "Messages" : navFrom?.from === "profile" ? "Profile" : "Network";
  const [conv, setConv] = useState<ConversationDTO | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [body, setBody] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [attachingImage, setAttachingImage] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [busyPollId, setBusyPollId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const composerMenuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
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

  const other = conv?.participants.find((p) => p.id !== user?.id) ?? conv?.participants[0];
  const title = [other?.firstName, other?.lastName].filter(Boolean).join(" ") || "Message";

  async function send() {
    const text = body.trim();
    if (!conv || sending || (!text && !pendingImage)) return;
    setSending(true);
    setBody("");
    const image = pendingImage;
    setPendingImage(null);
    try {
      const msg = await api<MessageDTO>(`/api/conversations/${conv.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          ...(text ? { body: text } : {}),
          ...(image ? { imageUrl: image } : {}),
        }),
      });
      setMessages((prev) => [...prev, msg]);
      stickOnSend();
    } catch (e) {
      setBody(text);
      setPendingImage(image);
      setError(parseApiError(e) || "Couldn't send that.");
    } finally {
      setSending(false);
    }
  }

  async function pickImage() {
    setComposerMenuOpen(false);
    try {
      if (isNative()) {
        setAttachingImage(true);
        try {
          const dataUrl = await pickPhotoNative({ maxPx: CHAT_IMAGE_MAX_PX, quality: CHAT_IMAGE_QUALITY });
          if (dataUrl) setPendingImage(dataUrl);
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
      setPendingImage(await fileToResizedDataUrl(file, CHAT_IMAGE_MAX_PX, CHAT_IMAGE_QUALITY));
    } catch {
      setError("Couldn't read that image. Try another.");
    } finally {
      setAttachingImage(false);
    }
  }

  async function createPoll(question: string, options: string[]) {
    if (!conv || !question || options.length < 2) return;
    setCreatingPoll(true);
    try {
      const msg = await api<MessageDTO>(`/api/conversations/${conv.id}/polls`, {
        method: "POST",
        body: JSON.stringify({ question, options }),
      });
      setMessages((prev) => [...prev, msg]);
      setPollModalOpen(false);
      stickOnSend();
    } catch (e) {
      setError(parseApiError(e) || "Couldn't post that poll.");
    } finally {
      setCreatingPoll(false);
    }
  }

  async function votePoll(messageId: string, optionId: string) {
    if (!conv) return;
    setBusyPollId(messageId);
    try {
      const updated = await api<MessageDTO>(`/api/conversations/${conv.id}/messages/${messageId}/vote`, {
        method: "POST",
        body: JSON.stringify({ optionId }),
      });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
    } catch {
      /* they can tap again */
    } finally {
      setBusyPollId(null);
    }
  }

  async function closePoll(messageId: string) {
    if (!conv) return;
    if (!window.confirm("Close this poll? Votes lock in.")) return;
    setBusyPollId(messageId);
    try {
      const updated = await api<MessageDTO>(`/api/conversations/${conv.id}/messages/${messageId}/close-poll`, {
        method: "POST",
      });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
    } catch {
      /* they can tap again */
    } finally {
      setBusyPollId(null);
    }
  }

  async function reopenPoll(messageId: string) {
    if (!conv) return;
    if (!window.confirm("Reopen this poll?")) return;
    setBusyPollId(messageId);
    try {
      const updated = await api<MessageDTO>(`/api/conversations/${conv.id}/messages/${messageId}/reopen-poll`, {
        method: "POST",
      });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
    } catch {
      /* they can tap again */
    } finally {
      setBusyPollId(null);
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
            if (m.kind === "poll" && m.poll && m.sender && conv) {
              return (
                <div key={m.id} className="chat-poll-row">
                  <PollCard
                    poll={m.poll}
                    author={m.sender}
                    participants={conv.participants}
                    busy={busyPollId === m.id}
                    onVote={(optionId) => void votePoll(m.id, optionId)}
                    onClose={m.poll.canClose ? () => void closePoll(m.id) : undefined}
                    onReopen={m.poll.canClose ? () => void reopenPoll(m.id) : undefined}
                  />
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
                  <div className={`chat-bubble${m.imageUrl ? " has-image" : ""}`}>
                    {m.imageUrl && (
                      <a href={m.imageUrl} target="_blank" rel="noopener noreferrer" className="chat-bubble-image-link">
                        <img src={m.imageUrl} alt="" className="chat-bubble-image" />
                      </a>
                    )}
                    {m.body && !(m.imageUrl && m.body === "📷 Photo") && <div className="chat-bubble-body">{m.body}</div>}
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
                    {other && (
                      <Link
                        to={`/plans/new?inviteUser=${encodeURIComponent(other.id)}&inviteName=${encodeURIComponent(other.firstName)}`}
                        role="menuitem"
                        className="chat-composer-menu-link"
                        onClick={() => setComposerMenuOpen(false)}
                      >
                        Make a plan
                      </Link>
                    )}
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
                placeholder={pendingImage ? "Add a caption…" : "Message…"}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (sending || (!body.trim() && !pendingImage)) return;
                  void send();
                }}
              />
              <button
                type="submit"
                className={`chat-composer-send ${body.trim() || pendingImage ? "is-ready" : ""}`}
                disabled={sending || (!body.trim() && !pendingImage)}
                aria-label="Send message"
              >
                <ArrowSendIcon />
              </button>
            </div>
          </form>
        )}
      </div>
      {pollModalOpen && (
        <PollSheet
          submitting={creatingPoll}
          onClose={() => !creatingPoll && setPollModalOpen(false)}
          onSubmit={(question, options) => void createPoll(question, options)}
        />
      )}
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
