import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { BarChart2 } from "lucide-react";
import { api, parseApiError } from "../api/http";
import { Avatar } from "../components/Avatar";
import { CommunityCoverThumb } from "../components/CoverThumb";
import { PollCard } from "../components/PollCard";
import { useAuth } from "../context/AuthContext";
import { sentenceCaseTitle } from "../lib/format";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import { useStickToBottom } from "../lib/useStickToBottom";
import type { CommunityCategory, MessageDTO, PublicUser } from "../types/shared";

const CHAT_IMAGE_MAX_PX = 1024;
const CHAT_IMAGE_QUALITY = 0.85;

const POLL_MS = 4000;
const GROUP_WINDOW_MS = 5 * 60 * 1000;

interface CommunityConversation {
  id: string;
  communityId: string;
  communityName: string;
  type: "group" | "dm";
  participants: PublicUser[];
  lastMessageAt: string;
  unreadCount: number;
  muted: boolean;
  isHost: boolean;
  hostId: string;
  coverImage?: string | null;
  category?: CommunityCategory;
}

export function CommunityChatPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fromMessages = (location.state as { from?: string } | null)?.from === "messages";
  const communityIdFromState = (location.state as { communityId?: string } | null)?.communityId;
  const backTo = fromMessages
    ? "/messages"
    : `/communities/${communityIdFromState || id}`;
  const backLabel = fromMessages ? "← Messages" : "← Community";
  const { user } = useAuth();
  const [conv, setConv] = useState<CommunityConversation | null>(null);
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
  const [blockArmed, setBlockArmed] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [chatReady, setChatReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsJoin, setNeedsJoin] = useState(false);
  const composerMenuRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const lastMessageId = messages[messages.length - 1]?.id ?? "";
  const { scrollRef, endRef, shellRef, stickOnSend } = useStickToBottom(
    chatReady && !needsJoin,
    `${lastMessageId}:${messages.length}`,
  );

  useEffect(() => {
    let alive = true;
    setChatReady(false);
    setConv(null);
    setMessages([]);
    setError(null);
    setNeedsJoin(false);
    void (async () => {
      try {
        const c = await api<CommunityConversation>(`/api/communities/${id}/conversation`);
        if (!alive) return;
        setConv(c);
        const msgs = await api<MessageDTO[]>(`/api/conversations/${c.id}/messages`);
        if (!alive) return;
        setMessages(msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      } catch (e) {
        if (!alive) return;
        const msg = parseApiError(e);
        // Non-members get 403 "Join the community…"; chat-disabled is also 403.
        if (apiErrorStatus(e) === 403 && /join/i.test(msg)) {
          setNeedsJoin(true);
        } else {
          setError(msg);
        }
      } finally {
        if (alive) setChatReady(true);
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
    if (!headerMenuOpen) {
      setBlockArmed(false);
      setBlockBusy(false);
      return;
    }
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

  if (needsJoin) {
    const communityHref = `/communities/${communityIdFromState || id}`;
    return (
      <main className="app-shell app-shell--chat">
        <header className="app-header app-header--minimal chat-header-bar chat-header-bar--thread">
          <Link to={backTo} className="detail-back">{backLabel}</Link>
          <div className="chat-thread-title">Chat</div>
          <span aria-hidden="true" />
        </header>
        <div className="empty-state">
          <p style={{ margin: 0 }}>Join to see this chat.</p>
          <p style={{ margin: "0.75rem 0 0" }}>
            <Link to={communityHref}>Go to community</Link>
          </p>
        </div>
      </main>
    );
  }

  if (error || !conv || !user) {
    return (
      <main className="app-shell app-shell--chat">
        <header className="app-header app-header--minimal chat-header-bar chat-header-bar--thread">
          <Link to={backTo} className="detail-back">{backLabel}</Link>
          <div className="chat-thread-title">Chat</div>
          <span aria-hidden="true" />
        </header>
        <div className="empty-state">
          <p style={{ margin: 0 }}>{error ?? "Chat unavailable."}</p>
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
    if (!window.confirm("Leave this chat? It'll disappear from your Messages. You stay in the community.")) return;
    try {
      await api(`/api/conversations/${conv.id}/leave`, { method: "POST" });
      navigate("/messages");
    } catch {
      /* swallow */
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

  async function blockOrganizer() {
    if (!conv) return;
    // Two-tap confirm in the menu — native window.confirm freezes the iOS WebView
    // for ~30s and never sends the request.
    if (!blockArmed) {
      setBlockArmed(true);
      return;
    }
    setBlockBusy(true);
    try {
      await api(`/api/users/${conv.hostId}/block`, { method: "POST" });
      await api(`/api/conversations/${conv.id}/leave`, { method: "POST" }).catch(() => undefined);
      navigate("/messages");
    } catch {
      setBlockBusy(false);
      setBlockArmed(false);
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
    conv.participants.length === 1 ? "1 member" : `${conv.participants.length} members`;

  const makePlanHref = `/plans/new?communityId=${encodeURIComponent(conv.communityId)}&communityName=${encodeURIComponent(conv.communityName)}`;

  return (
    <main ref={shellRef} className="app-shell app-shell--chat">
      <header className="app-header app-header--minimal chat-header-bar chat-header-bar--thread">
        <Link to={backTo} className="detail-back">{backLabel}</Link>
        <div className="chat-thread-title">{sentenceCaseTitle(conv.communityName)}</div>
        <div className="chat-header-menu-wrap" ref={headerMenuRef}>
          <button
            type="button"
            className="chat-header-menu-btn"
            onClick={() => setHeaderMenuOpen((v) => !v)}
            aria-label="Chat options"
            aria-expanded={headerMenuOpen}
          >
            <MoreIcon />
          </button>
          {headerMenuOpen && (
            <div className="chat-header-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => void toggleMute()}>
                {conv.muted ? "Unmute notifications" : "Mute notifications"}
              </button>
              {!conv.isHost && (
                <button type="button" role="menuitem" disabled={blockBusy} onClick={() => void blockOrganizer()}>
                  {blockBusy ? "Blocking…" : blockArmed ? "Tap again to confirm" : "Block organizer"}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className="chat-header-menu-leave"
                onClick={() => {
                  setHeaderMenuOpen(false);
                  void leaveChat();
                }}
              >
                Leave chat
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="chat-shell">
        <Link
          to={`/communities/${conv.communityId}`}
          className="chat-header-card chat-header-card--compact"
          aria-label="Open community"
        >
          <CommunityCoverThumb
            coverImage={conv.coverImage ?? null}
            category={conv.category ?? "coffee"}
            className="cover-thumb-frame--sm"
          />
          <div className="chat-header-text">
            <div className="chat-header-meta">{participantLabel}</div>
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

        {openPolls.length > 0 && (
          <div className={`chat-pinned-polls ${pinnedPollsOpen ? "is-open" : ""}`} aria-label="Active polls">
            <button
              type="button"
              className="chat-pinned-polls-toggle"
              onClick={() => setPinnedPollsOpen((v) => !v)}
              aria-expanded={pinnedPollsOpen}
            >
              <span className="chat-pinned-polls-badge" aria-hidden="true">
                <BarChart2 size={13} strokeWidth={1.8} color="var(--red)" />
              </span>
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
                <MessageCircleIcon />
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
                +
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
                    to={makePlanHref}
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

/** Status code from `api()` errors shaped as `"<status>: <body>"`. */
function apiErrorStatus(err: unknown): number | null {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.match(/^(\d+):/);
  return m ? Number(m[1]) : null;
}

function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
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

function MessageCircleIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
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
