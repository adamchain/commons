import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MessageCircle, MoreVertical, Plus } from "lucide-react";
import { api, parseApiError } from "../api/http";
import { Avatar } from "../components/Avatar";
import { PollCard } from "../components/PollCard";
import { PollSheet } from "../components/PollSheet";
import { BottomSheet } from "../components/ui/BottomSheet";
import { Button } from "../components/ui/Button";
import { EmptyCard } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { fileToResizedDataUrl } from "../lib/imageResize";
import type { NavFromState } from "../lib/navState";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import { useStickToBottom } from "../lib/useStickToBottom";
import type { ConversationDTO, MeDTO, MessageDTO, PublicUser } from "../types/shared";

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
  const { user, setUser } = useAuth();
  const navFrom = (location.state as NavFromState | null) ?? null;
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
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveErr, setLeaveErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<DmGate | null>(null);
  const [gateBusy, setGateBusy] = useState(false);
  const [connectErr, setConnectErr] = useState<string | null>(null);
  const [openAttempt, setOpenAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const composerMenuRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
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
        setError(null);
        setConnectErr(null);
        setGate(null);
        setConv(c);
        const msgs = await api<MessageDTO[]>(`/api/conversations/${c.id}/messages`);
        if (!live) return;
        setMessages(msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      } catch (e) {
        if (!live) return;
        const message = parseApiError(e) || "Couldn't open this chat.";
        setError(message);
        const profile = await peekProfile(userId);
        if (!live) return;
        setGate(gateFromError(message, profile));
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [userId, openAttempt]);

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
    if (!headerMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [headerMenuOpen]);

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
  const gateName = personName(gate?.person ?? null);
  const title = other
    ? [other.firstName, other.lastName].filter(Boolean).join(" ") || "Message"
    : gateName || "Message";
  const blocked = ready && !conv && gate;

  async function acceptRequest() {
    if (!userId || gateBusy) return;
    setGateBusy(true);
    setConnectErr(null);
    try {
      const r = await api<{ me?: MeDTO }>("/api/auth/network-accept", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      if (r.me) setUser(r.me);
      setOpenAttempt((n) => n + 1);
    } catch (e) {
      setConnectErr(parseApiError(e) || "Couldn't accept that request.");
    } finally {
      setGateBusy(false);
    }
  }

  async function connectThenOpen() {
    if (!userId || gateBusy) return;
    setGateBusy(true);
    setConnectErr(null);
    try {
      const path = gate?.kind === "incoming" ? "/api/auth/network-accept" : "/api/auth/friend-add";
      const r = await api<{ status?: string; me?: MeDTO }>(path, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      if (r.me) setUser(r.me);
      if (r.status === "connected" || gate?.kind === "incoming") {
        setOpenAttempt((n) => n + 1);
        return;
      }
      setGate((prev) => (prev ? { ...prev, kind: "pending" } : prev));
    } catch (e) {
      setConnectErr(parseApiError(e) || "Couldn't send that request.");
    } finally {
      setGateBusy(false);
    }
  }

  function goBack() {
    if (navFrom?.from === "messages") {
      navigate("/messages");
      return;
    }
    if (navFrom?.from === "profile" && navFrom.profileUserId) {
      navigate(`/profile/${navFrom.profileUserId}`, { state: { from: "network" } });
      return;
    }
    navigate("/network");
  }

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
      if (conv.awaitingAccept) {
        const next = await api<ConversationDTO>("/api/dm", {
          method: "POST",
          body: JSON.stringify({ userId }),
        });
        setConv(next);
      }
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

  return (
    <main ref={shellRef} className={`app-shell app-shell--chat${conv?.awaitingAccept ? " dm-hold" : ""}`}>
      <header className="app-header app-header--minimal chat-header-bar chat-header-bar--thread app-header--sticky">
        <button type="button" className="detail-back chat-back-link" aria-label={backLabel} onClick={goBack}>
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="chat-thread-heading">
          <div className="chat-thread-title">{title}</div>
          {conv && (
            <div className="chat-thread-sub">
              {conv.muted
                ? "Muted"
                : conv.awaitingAccept
                  ? "Not visible to them yet"
                  : "Direct message"}
            </div>
          )}
        </div>
        {conv ? (
        <div className="chat-header-menu-wrap" ref={headerMenuRef}>
          <button
            type="button"
            className="chat-header-menu-btn"
            onClick={() => setHeaderMenuOpen((v) => !v)}
            aria-label="Chat options"
            aria-expanded={headerMenuOpen}
            disabled={!conv}
          >
            <MoreVertical size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
          {headerMenuOpen && conv && (
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
        {gate && ready && !conv && (
          <DmUnavailable
            gate={gate}
            busy={gateBusy}
            note={connectErr}
            onProfile={() => navigate(`/profile/${userId}`, { state: { from: "network" } })}
            onConnect={() => void connectThenOpen()}
          />
        )}
        {(conv?.awaitingAccept || conv?.incomingRequest) && (
          <div className="dm-hold-note">
            <p>
              {conv.incomingRequest
                ? conv.awaitingAccept
                  ? `${other?.firstName ?? "They"} asked to connect. They won't see this until you accept.`
                  : `${other?.firstName ?? "They"} asked to connect.`
                : `${other?.firstName ?? "They"} won't see this until they accept your request to connect.`}
            </p>
            {conv.incomingRequest && (
              <Button variant="link" disabled={gateBusy} onClick={() => void acceptRequest()}>
                {gateBusy ? "Accepting…" : "Accept request"}
              </Button>
            )}
            {connectErr && <p className="error-text">{connectErr}</p>}
          </div>
        )}
        {!blocked && other && !conv?.awaitingAccept && (
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

        {!blocked && (
        <div ref={scrollRef} className="chat-messages">
          {!ready && <p className="network-empty">Opening chat…</p>}
          {ready && conv && messages.length === 0 && !conv.awaitingAccept && (
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
                  {user && (() => {
                    const hearts = m.reactions?.["❤️"] ?? [];
                    const iReacted = hearts.includes(user.id);
                    return (
                      <button
                        type="button"
                        className={`chat-react-btn ${iReacted ? "is-reacted" : ""} ${hearts.length > 0 ? "has-count" : ""}`}
                        onClick={() => void toggleHeart(m.id)}
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
          })}
          <div ref={endRef} className="chat-messages-end" aria-hidden="true" />
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
      {confirmLeave && (
        <BottomSheet
          onClose={() => !leaveBusy && setConfirmLeave(false)}
          closeDisabled={leaveBusy}
          labelledBy="leave-dm-title"
        >
          <h2 id="leave-dm-title" className="sheet-title">Leave this chat?</h2>
          <p className="sheet-copy">
            It leaves your Messages inbox. A new message brings it back, or you can open it again from your network.
          </p>
          {leaveErr && <p className="error-text">{leaveErr}</p>}
          <div className="sheet-actions">
            <Button variant="primary" block disabled={leaveBusy} onClick={() => void leaveChat()}>
              {leaveBusy ? "Leaving…" : "Leave chat"}
            </Button>
            <Button variant="secondary" block disabled={leaveBusy} onClick={() => setConfirmLeave(false)}>
              Cancel
            </Button>
          </div>
        </BottomSheet>
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

type DmGateKind = "network" | "pending" | "incoming" | "blocked" | "missing" | "other";

type DmGate = {
  kind: DmGateKind;
  person: PublicUser | null;
};

type ProfilePeek = {
  user: PublicUser;
  network?: { inMyNetwork?: boolean; requestSent?: boolean; requestReceived?: boolean };
};

function personName(person: PublicUser | null): string {
  if (!person) return "";
  return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

async function peekProfile(userId: string): Promise<ProfilePeek | null> {
  try {
    return await api<ProfilePeek>(`/api/profile/${userId}`);
  } catch {
    return null;
  }
}

function gateFromError(message: string, profile: ProfilePeek | null): DmGate {
  const person = profile?.user ?? null;
  if (/find that person/i.test(message)) return { kind: "missing", person };
  if (/can't message this person/i.test(message)) return { kind: "blocked", person };
  if (/network/i.test(message)) {
    if (profile?.network?.requestReceived) return { kind: "incoming", person };
    if (profile?.network?.requestSent) return { kind: "pending", person };
    return { kind: "network", person };
  }
  return { kind: "other", person };
}

function DmUnavailable({
  gate,
  busy,
  note,
  onProfile,
  onConnect,
}: {
  gate: DmGate;
  busy: boolean;
  note: string | null;
  onProfile: () => void;
  onConnect: () => void;
}) {
  const named = gate.person?.firstName?.trim();
  let title = "Couldn't open this chat";
  let body = "Something went wrong. Go back and try again.";
  if (gate.kind === "network") {
    title = "You can't message them yet";
    body = named
      ? `Chats like this are only for people in your network. Send ${named} a request. After they accept, you can message them here.`
      : "Chats like this are only for people in your network. Send a request from their profile. After they accept, you can message them here.";
  } else if (gate.kind === "pending") {
    title = named ? `Waiting for ${named}` : "Request sent";
    body = named
      ? `You already asked to connect with ${named}. This chat opens once they accept.`
      : "You already sent a request. This chat opens once they accept.";
  } else if (gate.kind === "incoming") {
    title = named ? `${named} wants to connect` : "They want to connect";
    body = "Accept their request and this chat will open.";
  } else if (gate.kind === "blocked") {
    title = "You can't message them";
    body = "This chat isn't available.";
  } else if (gate.kind === "missing") {
    title = "Couldn't find them";
    body = "This profile isn't here anymore.";
  }

  const showConnect = gate.kind === "network" || gate.kind === "incoming";

  return (
    <div className="dm-gate">
      <EmptyCard
        icon={
          gate.person ? (
            <Avatar
              seed={gate.person.avatarSeed}
              style={gate.person.avatarStyle}
              photoDataUrl={gate.person.avatarPhotoDataUrl}
              params={gate.person.avatarParams}
              name={gate.person.firstName}
              size="md"
            />
          ) : (
            <MessageCircle size={22} strokeWidth={1.6} color="var(--red)" />
          )
        }
        tint={gate.person ? "transparent" : undefined}
        title={title}
        body={body}
        footer={
          <div className="dm-gate-actions">
            {showConnect ? (
              <Button variant="primary" block disabled={busy} onClick={onConnect}>
                {busy ? "Sending…" : gate.kind === "incoming" ? "Accept" : "Send a request"}
              </Button>
            ) : gate.kind !== "missing" ? (
              <Button variant="primary" block onClick={onProfile}>
                View profile
              </Button>
            ) : null}
            {showConnect && gate.kind !== "missing" && (
              <Button variant="link" onClick={onProfile}>
                View profile
              </Button>
            )}
            {note && <p className="error-text">{note}</p>}
          </div>
        }
      />
    </div>
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
