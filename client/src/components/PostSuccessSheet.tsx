import { useEffect, useEffectEvent } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

/**
 * Centered celebratory card shown after a plan posts.
 */
export function PostSuccessSheet({
  onDone,
  autoDismissMs = 2800,
}: {
  onDone: () => void;
  autoDismissMs?: number;
}) {
  const dismiss = useEffectEvent(onDone);

  useEffect(() => {
    const t = window.setTimeout(() => dismiss(), autoDismissMs);
    return () => window.clearTimeout(t);
  }, [autoDismissMs]);

  return createPortal(
    <div
      className="join-confirm-backdrop"
      role="presentation"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDone();
      }}
    >
      <div
        className="join-confirm-card join-confirm-card--celebrate post-live-card"
        role="status"
        aria-live="polite"
        aria-label="It’s out there. We’ll let you know when someone’s in."
        onClick={(e) => e.stopPropagation()}
      >
        <div className="join-confirm-icon" aria-hidden="true">
          <Check size={22} strokeWidth={2.4} />
        </div>
        <h2 className="join-confirm-title">It’s out there</h2>
        <p className="post-live-kicker">We’ll let you know when someone’s in.</p>
      </div>
    </div>,
    document.body,
  );
}
