import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";

interface PendingItem {
  planId: string;
  planTitle: string;
  hostId: string;
}

// Once dismissed, stay quiet until the next app session. sessionStorage clears
// when the app process is killed/relaunched.
const DISMISS_KEY = "commons.postEventNudge.v1";

/**
 * Post-event nudge. When a plan you attended wraps, surface a tappable card
 * that drops you into its group chat — instead of the old thumbs-up/down host
 * rating. Keeps the conversation going after the event rather than asking for
 * a score.
 */
export function FeedbackPrompt() {
  const [pending, setPending] = useState<PendingItem[]>([]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* storage unavailable — fall through and fetch */
    }
    void api<PendingItem[]>("/api/feedback/pending").then(setPending).catch(() => undefined);
  }, []);

  if (pending.length === 0) return null;
  const current = pending[0];

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* non-fatal */
    }
    setPending([]);
  }

  return (
    <div className="feedback-prompt">
      <div className="feedback-prompt-title">How'd "{current.planTitle}" go?</div>
      <p className="feedback-prompt-sub">Catch up with everyone in the group chat.</p>
      <div className="feedback-actions">
        <button className="btn-link" onClick={dismiss}>
          Dismiss
        </button>
        <Link className="btn-primary" to={`/plans/${current.planId}/chat`} onClick={dismiss}>
          💬 Open group chat
        </Link>
      </div>
    </div>
  );
}
