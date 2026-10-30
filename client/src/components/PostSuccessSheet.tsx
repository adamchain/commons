import { createPortal } from "react-dom";
import { Check } from "lucide-react";

/**
 * After a plan or idea posts: celebrate, then invite.
 */
export function PostSuccessSheet({
  onInvite,
  onDone,
}: {
  onInvite: () => void;
  onDone: () => void;
}) {
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
        className="join-confirm-card join-confirm-card--celebrate join-confirm-card--wide post-live-card"
        role="dialog"
        aria-labelledby="post-success-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="join-confirm-icon" aria-hidden="true">
          <Check size={22} strokeWidth={2.4} />
        </div>
        <h2 id="post-success-title" className="join-confirm-title">
          It’s out there
        </h2>
        <p className="post-live-kicker">We’ll let you know when someone’s in.</p>
        <p className="post-success-hint">A nudge to people you know helps it land.</p>
        <div className="post-success-actions">
          <button type="button" className="btn-primary btn-block" onClick={onInvite}>
            Invite people you know
          </button>
          <button type="button" className="post-success-later" onClick={onDone}>
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
