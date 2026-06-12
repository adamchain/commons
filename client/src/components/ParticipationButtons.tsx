import { useState } from "react";
import { api } from "../api/http";
import type { JoinType, ParticipationState, PlanKind } from "../types/shared";

// API errors arrive as "<status>: <jsonBody>" — pull the friendly message out.
function extractApiError(err: unknown): string {
  if (!(err instanceof Error)) return "Couldn't update";
  const m = err.message.match(/^\d+:\s*(.+)$/s);
  const body = m ? m[1] : err.message;
  if (body === undefined) return err.message;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.error === "string") return parsed.error;
  } catch {
    /* not JSON — fall through */
  }
  return body;
}

export function ParticipationButtons({
  planId,
  initialState,
  onChange,
  planKind = "standard",
  capacity = null,
  goingCount = 0,
  joinType = "open",
  isHosting = false,
  onJustMarkedInterested,
}: {
  planId: string;
  initialState: ParticipationState | null;
  onChange: (next: ParticipationState | null) => void;
  planKind?: PlanKind;
  /** Capacity caps the "going" list. Null = unlimited. */
  capacity?: number | null;
  /** Current count of "going" participants (for full/approve display). */
  goingCount?: number;
  joinType?: JoinType;
  /** Host bypasses capacity and approve gates. */
  isHosting?: boolean;
  /** Called when the user goes from null → interested (open invite sheet). */
  onJustMarkedInterested?: () => void;
}) {
  const [state, setState] = useState<ParticipationState | null>(initialState);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleState = async (target: ParticipationState) => {
    if (pending) return;
    const next = state === target ? null : target;
    const prev = state;
    // Confirm before dropping from "going" — the host will be notified, so we
    // want this to be a conscious act, not a fat-finger un-tap.
    if (next === null && prev === "going" && !isHosting) {
      const confirmed = window.confirm(
        "Drop out? The host will be notified.",
      );
      if (!confirmed) return;
    }
    setState(next);
    onChange(next);
    setPending(true);
    setError(null);
    try {
      if (next) {
        await api(`/api/plans/${planId}/participation`, {
          method: "PUT",
          body: JSON.stringify({ state: next }),
        });
        if (next === "interested" && prev === null) onJustMarkedInterested?.();
      } else {
        await api(`/api/plans/${planId}/participation`, { method: "DELETE" });
      }
    } catch (err) {
      setState(prev);
      onChange(prev);
      setError(extractApiError(err));
    } finally {
      setPending(false);
    }
  };

  const goingActive = state === "going";
  const interestedActive = state === "interested";
  const loose = planKind === "looking_for";
  const isFull = !isHosting && capacity !== null && goingCount >= capacity && !goingActive;
  const isApproveOnly = !isHosting && joinType === "approve" && !goingActive;

  return (
    <div className={`participation ${loose ? "participation--loose" : ""}`}>
      {!loose && (
        <p className="participation-hint">
          {isApproveOnly
            ? "Application-only — tap interested to request a spot."
            : isFull
              ? "This plan is full."
              : capacity !== null
                ? `${goingCount}/${capacity} spots taken — first come, first serve.`
                : "Committed vs tentative — pick what fits."}
        </p>
      )}
      {!loose && (
        <button
          type="button"
          className={`btn-going ${goingActive ? "is-active" : ""}`}
          onClick={() => void toggleState("going")}
          disabled={pending || isFull || isApproveOnly}
        >
          {goingActive
            ? "✓ You're in"
            : isFull
              ? "Full"
              : isApproveOnly
                ? "Application-only"
                : "I'm in"}
        </button>
      )}
      <button
        type="button"
        className={`btn-interested ${interestedActive ? "is-active" : ""}`}
        onClick={() => void toggleState("interested")}
        disabled={pending}
      >
        {interestedActive
          ? isApproveOnly
            ? "Withdraw application"
            : "Drop out"
          : loose
            ? "I'm Interested"
            : isApproveOnly
              ? "Apply"
              : "I'm interested"}
      </button>
      {error && <p className="onboarding-error" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
