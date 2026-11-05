import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MoreVertical, Plus } from "lucide-react";
import { api, isAuthFailure, parseApiError } from "../api/http";
import { Avatar } from "../components/Avatar";
import { ComposerField, MentionText } from "../components/ComposerField";
import { ChatReplyButton, ChatReplyDraft, ChatReplyQuote, replyTarget } from "../components/ChatReply";
import { ReactionBar } from "../components/ReactionBar";
import { ChatAttachSheet } from "../components/ChatAttachSheet";
import { ChatPersonLink } from "../components/ChatPersonLink";
import { ChatSystemEvent } from "../components/ChatSystemEvent";
import { HoldToDelete } from "../components/HoldToDelete";
import { PollCard } from "../components/PollCard";
import { PollSheet } from "../components/PollSheet";
import { BottomSheet } from "../components/ui/BottomSheet";
import { Button } from "../components/ui/Button";
import { ChatEmpty } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { fileToResizedDataUrl } from "../lib/imageResize";
import type { NavFromState } from "../lib/navState";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import { useStickToBottom } from "../lib/useStickToBottom";
import { readScreen, writeScreen } from "../lib/screenCache";
import type { ConversationDTO, MessageDTO, MessageReplyDTO } from "../types/shared";

const POLL_MS = 4000;
const CHAT_IMAGE_MAX_PX = 1024;
const CHAT_IMAGE_QUALITY = 0.85;

/**
 * Network group chat — a thread with several people from your network, not tied
 * to any plan or community. Opened from the Messages inbox or right after you
 * create the group from the compose sheet.
 */
export function GroupChatPage() {
  const { conversationId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const navFrom = (location.state as NavFromState | null) ?? null;
  const backLabel = navFrom?.from === "messages" ? "Messages" : "Back";
  type GroupCache = { conv: ConversationDTO; messages: MessageDTO[] };
  const cached = readScreen<GroupCache>(`group:${conversationId}`);
  const [conv, setConv] = useState<ConversationDTO | null>(cached?.conv ?? null);
  const [messages, setMessages] = useState<MessageDTO[]>(cached?.messages ?? []);
  const [body, setBody] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<MessageReplyDTO | null>(null);
  const [attachingImage, setAttachingImage] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [busyPollId, setBusyPollId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveErr, setLeaveErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gateMsg, setGateMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(cached != null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const deletedIdsRef = useRef(new Set<string>());
  const lastId = messages[messages.length - 1]?.id ?? "";
  const { scrollRef, endRef, shellRef, stickOnSend } = useStickToBottom(ready, `${lastId}:${messages.length}`);

  useEffect(() => {
    let live = true;
    if (!cached) setReady(false);
    setError(null);
    void (async () => {
      try {
        const c = await api<ConversationDTO & { messages?: MessageDTO[] }>(
          `/api/conversations/${conversationId}?messages=1`,
        );
        if (!live) return;
        setError(null);
        setGateMsg(null);
        const msgs = c.messages ?? [];
        const freshConv: ConversationDTO = { ...c, messages: undefined };
        const freshMessages = visibleMessages(msgs, deletedIdsRef.current);
        setConv(freshConv);
        setMessages(freshMessages);
        writeScreen(`group:${conversationId}`, { conv: freshConv, messages: freshMessages });
      } catch (e) {
        if (!live) return;
        const message = parseApiError(e) || "Couldn't open this chat.";
        if (!cached) setGateMsg(message);
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for new messages — only fetch messages newer than the last one we have.
  useEffect(() => {
    if (!conv) return;
    const interval = setInterval(() => {
      setMessages((prev) => {
        const since = prev[prev.length - 1]?.createdAt ?? "";
        void api<MessageDTO[]>(
          `/api/conversations/${conv.id}/messages${since ? `?since=${encodeURIComponent(since)}` : ""}`,
        ).then((incoming) => {
          if (!incoming.length) return;
          setMessages((cur) => {
            const ids = new Set(cur.map((m) => m.id));
            const fresh = incoming.filter((m) => !ids.has(m.id) && !deletedIdsRef.current.has(m.id));
            return fresh.length ? [...cur, ...fresh].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : cur;
          });
        }).catch(() => undefined);
        return prev;
      });
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [conv]);

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

  const others = conv?.participants.filter((p) => p.id !== user?.id) ?? [];
  const title = groupTitle(conv, user?.id);
  const memberLine =
    conv?.participants.length != null ? `${conv.participants.length} ${conv.participants.length === 1 ? "member" : "members"}` : "";

  function goBack() {
    navigate("/messages");
  }

  async function send() {
    const text = body.trim();
    if (!conv || sending || (!text && !pendingImage)) return;
    setSending(true);
    setBody("");
    const image = pendingImage;
    const reply = replyTo;
    setPendingImage(null);
    setReplyTo(null);
    try {
      const msg = await api<MessageDTO>(`/api/conversations/${conv.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          ...(text ? { body: text } : {}),
          ...(image ? { imageUrl: image } : {}),
          ...(reply ? { replyToId: reply.id } : {}),
        }),
      });
      setMessages((prev) => [...prev, msg]);
      stickOnSend();
    } catch (e) {
      setBody(text);
      setPendingImage(image);
      setReplyTo(reply);
      if (!isAuthFailure(e)) setError(parseApiError(e) || "Couldn't send that.");
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

  async function deleteOwnMessage(messageId: string) {
    if (!conv || deletingMessageId) return;
    if (!window.confirm("Delete this message? It's removed for everyone in this chat.")) return;
    setDeletingMessageId(messageId);
    try {
      await api(`/api/conversations/${conv.id}/messages/${messageId}`, { method: "DELETE" });
      deletedIdsRef.current.add(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (e) {
      window.alert(parseApiError(e) || "Couldn't delete that message.");
    } finally {
      setDeletingMessageId(null);
    }
  }

  async function toggleHeart(messageId: string) {
    if (!conv) return;
    try {
      const updated = await api<MessageDTO>(`/api/conversations/${conv.id}/messages/${messageId}/react`, {
        method: "POST",
        body: JSON.stringify({ emoji: "❤️" }),
      });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
    } catch {
      /* they can tap again */
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
      /* they can tap again */
    }
  }

  async function leaveChat() {
    if (!conv) return;
    setLeaveBusy(true);
    setLeaveErr(null);
    try {
      await api(`/api/conversations/${conv.id}/leave`, { method: "POST" });
      setConfirmLeave(false);
      goBack();
    } catch (e) {
      setLeaveErr(parseApiError(e) || "Couldn't leave this chat.");
    } finally {
      setLeaveBusy(false);
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

  const personProfileFrom: NavFromState = { from: "messages" };

  return (
    <main ref={shellRef} className="app-shell app-shell--chat">
      <header className="app-header app-header--minimal chat-header-bar chat-header-bar--thread app-header--sticky">
        <button type="button" className="detail-back chat-back-link" aria-label={backLabel} onClick={goBack}>
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="chat-thread-heading">
          <div className="chat-thread-title">{title}</div>
          {conv && <div className="chat-thread-sub">{conv.muted ? "Muted" : memberLine || "Group chat"}</div>}
        </div>
        {conv ? (
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
                  {conv.muted ? "Unmute chat" : "Mute chat"}
                </button>
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
                  Leave chat
                </button>
              </div>
            )}
          </div>
        ) : (
          <span className="chat-header-menu-wrap" aria-hidden="true" />
        )}
      </header>

      <div className="chat-shell">
        {gateMsg && ready && !conv && (
          <div className="dm-hold-note">
            <p>{gateMsg}</p>
            <Button variant="link" onClick={goBack}>
              Back to Messages
            </Button>
          </div>
        )}

        {conv && (
          <div
            ref={scrollRef}
            className={`chat-messages${ready && messages.length === 0 ? " chat-messages--empty" : ""}`}
          >
            {!ready && <p className="network-empty">Opening chat…</p>}
            {ready && messages.length === 0 && (
              <ChatEmpty title="It's quiet in here." body="Say hi — this group is just getting started." />
            )}
            {messages.map((m) => {
              if (m.kind === "system") {
                return <ChatSystemEvent key={m.id} body={m.body} at={m.createdAt} />;
              }
              if (m.kind === "poll" && m.poll && m.sender) {
                return (
                  <div key={m.id} id={`chat-msg-${m.id}`} className="chat-poll-row">
                    <PollCard
                      poll={m.poll}
                      author={m.sender}
                      profileFrom={personProfileFrom}
                      participants={conv.participants}
                      onVote={(optionId) => void votePoll(m.id, optionId)}
                      onClose={m.poll.canClose ? () => void closePoll(m.id) : undefined}
                      onReopen={m.poll.canClose ? () => void reopenPoll(m.id) : undefined}
                      onDelete={m.sender.id === user?.id ? () => void deleteOwnMessage(m.id) : undefined}
                      busy={busyPollId === m.id || deletingMessageId === m.id}
                    />
                    <div className="chat-bubble-actions">
                      <ChatReplyButton onClick={() => setReplyTo(replyTarget(m))} />
                    </div>
                  </div>
                );
              }
              const mine = m.sender?.id === user?.id;
              return (
                <div key={m.id} id={`chat-msg-${m.id}`} className={`chat-bubble-row${mine ? " is-mine" : ""}`}>
                  {!mine && m.sender && (
                    <span className="chat-bubble-avatar-slot">
                      <ChatPersonLink userId={m.sender.id} name={m.sender.firstName} state={personProfileFrom}>
                        <Avatar
                          seed={m.sender.avatarSeed}
                          style={m.sender.avatarStyle}
                          photoDataUrl={m.sender.avatarPhotoDataUrl}
                          params={m.sender.avatarParams}
                          size="sm"
                        />
                      </ChatPersonLink>
                    </span>
                  )}
                  <div className="chat-bubble-stack">
                    <HoldToDelete
                      className={`chat-bubble${m.imageUrl ? " has-image" : ""}`}
                      enabled={Boolean(mine && user && deletingMessageId !== m.id)}
                      onDelete={() => void deleteOwnMessage(m.id)}
                    >
                      {!mine && m.sender && (
                        <ChatPersonLink
                          userId={m.sender.id}
                          name={m.sender.firstName}
                          state={personProfileFrom}
                          className="chat-bubble-author"
                        >
                          {m.sender.firstName}
                        </ChatPersonLink>
                      )}
                      {m.replyTo && <ChatReplyQuote reply={m.replyTo} />}
                      {m.imageUrl && (
                        <a href={m.imageUrl} target="_blank" rel="noopener noreferrer" className="chat-bubble-image-link">
                          <img src={m.imageUrl} alt="" className="chat-bubble-image" />
                        </a>
                      )}
                      {m.body && !(m.imageUrl && m.body === "📷 Photo") && (
                        <div className="chat-bubble-body">
                          <MentionText text={m.body} people={conv.participants} />
                        </div>
                      )}
                      <div className="chat-bubble-time">
                        {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </div>
                    </HoldToDelete>
                    {user && (
                      <div className="chat-bubble-actions">
                        <ChatReplyButton onClick={() => setReplyTo(replyTarget(m))} />
                        <ReactionBar
                          hearts={m.reactions?.["❤️"] ?? []}
                          meId={user.id}
                          people={conv.participants}
                          profileFrom={personProfileFrom}
                          onToggle={() => void toggleHeart(m.id)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {messages.length > 0 && <div ref={endRef} className="chat-messages-end" aria-hidden="true" />}
          </div>
        )}

        {error && conv && <p className="error-text">{error}</p>}
        {conv && (
          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {replyTo && <ChatReplyDraft reply={replyTo} onClear={() => setReplyTo(null)} />}
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
              <button
                type="button"
                className="chat-composer-add"
                onClick={() => setComposerMenuOpen(true)}
                aria-label="Add to the conversation"
              >
                <Plus size={20} strokeWidth={2} aria-hidden="true" />
              </button>
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
              <ComposerField
                className="chat-composer-input"
                placeholder={pendingImage ? "Add a caption…" : "Message…"}
                value={body}
                onChange={setBody}
                people={others}
                disabled={sending}
                focusToken={replyTo?.id}
                onEscape={() => setReplyTo(null)}
                onSubmit={() => {
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
      {confirmLeave && (
        <BottomSheet
          onClose={() => !leaveBusy && setConfirmLeave(false)}
          closeDisabled={leaveBusy}
          labelledBy="leave-group-title"
        >
          <h2 id="leave-group-title" className="sheet-title">Leave this group?</h2>
          <p className="sheet-copy">
            You'll stop getting messages from this group and it leaves your inbox. Someone can add you back later.
          </p>
          {leaveErr && <p className="error-text">{leaveErr}</p>}
          <div className="sheet-actions">
            <Button variant="primary" block disabled={leaveBusy} onClick={() => void leaveChat()}>
              {leaveBusy ? "Leaving…" : "Leave group"}
            </Button>
            <Button variant="secondary" block disabled={leaveBusy} onClick={() => setConfirmLeave(false)}>
              Cancel
            </Button>
          </div>
        </BottomSheet>
      )}
      {composerMenuOpen && (
        <ChatAttachSheet
          photoBusy={attachingImage || sending}
          plan={null}
          onClose={() => setComposerMenuOpen(false)}
          onPhoto={() => void pickImage()}
          onPoll={() => {
            setComposerMenuOpen(false);
            setPollModalOpen(true);
          }}
        />
      )}
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

function groupTitle(conv: ConversationDTO | null, meId: string | undefined): string {
  if (!conv) return "Group chat";
  if (conv.name && conv.name.trim()) return conv.name.trim();
  const names = conv.participants.filter((p) => p.id !== meId).map((p) => p.firstName).filter(Boolean);
  if (names.length === 0) return "Group chat";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
}

function visibleMessages(msgs: MessageDTO[], deleted: Set<string>): MessageDTO[] {
  const visible = deleted.size === 0 ? msgs : msgs.filter((m) => !deleted.has(m.id));
  return visible.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function ArrowSendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="m13 6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
