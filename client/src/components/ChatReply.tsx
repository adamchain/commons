import { CornerUpLeft } from "lucide-react";
import type { MessageDTO, MessageReplyDTO } from "../types/shared";

export function replyTarget(message: MessageDTO): MessageReplyDTO {
  return {
    id: message.id,
    senderName: message.sender?.firstName || "Someone",
    preview: replyPreview(message),
  };
}

function replyPreview(message: MessageDTO): string {
  if (message.kind === "poll") return message.poll?.question || message.body || "Poll";
  if (message.imageUrl && (!message.body.trim() || message.body.trim() === "📷 Photo")) return "Photo";
  const text = message.body.trim();
  if (!text) return "Message";
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

export function jumpToChatMessage(id: string) {
  const el = document.getElementById(`chat-msg-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("is-reply-flash");
  void el.offsetWidth;
  el.classList.add("is-reply-flash");
}

export function ChatReplyButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="chat-react-btn chat-reply-btn" onClick={onClick} aria-label="Reply">
      <CornerUpLeft size={14} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}

export function ChatReplyQuote({ reply }: { reply: MessageReplyDTO }) {
  return (
    <button type="button" className="chat-reply-quote" onClick={() => jumpToChatMessage(reply.id)}>
      {reply.senderName ? <span className="chat-reply-quote-name">{reply.senderName}</span> : null}
      <span className="chat-reply-quote-body">{reply.preview}</span>
    </button>
  );
}

export function ChatReplyDraft({
  reply,
  onClear,
}: {
  reply: MessageReplyDTO;
  onClear: () => void;
}) {
  return (
    <div className="chat-composer-reply">
      <CornerUpLeft size={14} strokeWidth={2.2} aria-hidden="true" />
      <div className="chat-composer-reply-text">
        <span className="chat-reply-quote-name">{reply.senderName || "Message"}</span>
        <span className="chat-reply-quote-body">{reply.preview}</span>
      </div>
      <button type="button" className="chat-composer-reply-clear" aria-label="Cancel reply" onClick={onClear}>
        ×
      </button>
    </div>
  );
}
