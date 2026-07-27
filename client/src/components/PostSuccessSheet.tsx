/**
 * F.3 — shown right after a plan/idea posts successfully. Gives the host a
 * clear "you're live" moment plus a one-tap path into inviting people,
 * instead of dropping them straight into the invite sheet with no context.
 */
export function PostSuccessSheet({
  onInvite,
  onDone,
}: {
  onInvite: () => void;
  onDone: () => void;
}) {
  return (
    <div className="filter-sheet-backdrop" onClick={onDone}>
      <div
        className="filter-sheet post-success-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Plan posted"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="post-success-icon" aria-hidden="true">🎉</div>
        <h2 className="post-success-title">Your plan is live!</h2>
        <p className="post-success-sub">We&apos;ll tell you the second someone joins.</p>
        <button type="button" className="btn-primary btn-block" onClick={onInvite}>
          Invite someone
        </button>
        <button type="button" className="btn-link post-success-done" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
