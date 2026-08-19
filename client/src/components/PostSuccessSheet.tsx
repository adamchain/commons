import { useEffect, useEffectEvent } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

/**
 * Centered celebratory card shown after a plan posts — combines the old
 * "Just posted" chip and "Your plan is live" toast into one moment.
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
        aria-label="Your plan is live. Just posted."
        onClick={(e) => e.stopPropagation()}
      >
        <div className="join-confirm-icon" aria-hidden="true">
          <Check size={22} strokeWidth={2.4} />
        </div>
        <h2 className="join-confirm-title">Your plan is live</h2>
        <p className="post-live-kicker">Just posted</p>
      </div>
    </div>,
    document.body,
  );
}
