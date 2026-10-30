import { Check, Sparkles } from "lucide-react";

function formatTime(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Join / interested notices as a white card — never bare type on beige. */
export function ChatSystemEvent({ body, at }: { body: string; at?: string }) {
  const time = formatTime(at);
  const interested = /interested/i.test(body) && !/joined/i.test(body);
  return (
    <div className="chat-plan-event">
      <span className="chat-plan-event-icon" aria-hidden="true">
        {interested ? <Sparkles size={16} strokeWidth={2.2} /> : <Check size={16} strokeWidth={2.4} />}
      </span>
      <div>
        <strong>{body}</strong>
        {time ? <small>{time}</small> : null}
      </div>
    </div>
  );
}
