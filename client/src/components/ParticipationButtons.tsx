import { useState } from "react";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
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

const INVITE_PROMPT_KEY_PREFIX = "commons:invitePrompted:";

// Once per person per plan — never nag again after the first "you're in"
// invite prompt, even across sessions.
function hasPromptedInvite(planId: string, userId: string | undefined): boolean {
  try {
    return localStorage.getItem(`${INVITE_PROMPT_KEY_PREFIX}${planId}:${userId ?? "anon"}`) === "1";
  } catch {
    return true;
  }
}

function markPromptedInvite(planId: string, userId: string | undefined): void {
  try {
    localStorage.setItem(`${INVITE_PROMPT_KEY_PREFIX}${planId}:${userId ?? "anon"}`, "1");
  } catch {
    /* storage unavailable — non-blocking, just skip the prompt next time too */
  }
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
  /** Called the first time someone commits (going or interested) — opens the full invite sheet. */
  onJustMarkedInterested?: () => void;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<ParticipationState | null>(initialState);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGoingSheet, setShowGoingSheet] = useState(false);
  const [invitePromptFor, setInvitePromptFor] = useState<ParticipationState | null>(null);

  // Shared commit path for every state transition — optimistic update, real
  // request, roll back on failure. Returns whether it actually landed.
  const commit = async (next: ParticipationState | null): Promise<boolean> => {
    const prev = state;
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
      } else {
        await api(`/api/plans/${planId}/participation`, { method: "DELETE" });
      }
      return true;
    } catch (err) {
      setState(prev);
      onChange(prev);
      setError(extractApiError(err));
      return false;
    } finally {
      setPending(false);
    }
  };

  const promptInviteIfNeeded = (next: ParticipationState) => {
    if (hasPromptedInvite(planId, user?.id)) return;
    markPromptedInvite(planId, user?.id);
    setInvitePromptFor(next);
  };

  const tapGoing = async () => {
    if (pending) return;
    // Active "going" opens a sheet instead of toggling off on a plain re-tap
    // — dropping out (and leaving the group chat) should be a conscious act.
    if (goingActive) {
      setShowGoingSheet(true);
      return;
    }
    const ok = await commit("going");
    if (ok) promptInviteIfNeeded("going");
  };

  const tapInterested = async () => {
    if (pending) return;
    const next = state === "interested" ? null : "interested";
    const ok = await commit(next);
    if (ok && next === "interested") promptInviteIfNeeded("interested");
  };

  const switchToInterested = async () => {
    setShowGoingSheet(false);
    await commit("interested");
  };

  const dropOutFromGoing = async () => {
    const confirmed = window.confirm("Drop out? You'll leave the plan and its group chat.");
    if (!confirmed) return;
    setShowGoingSheet(false);
    await commit(null);
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
          onClick={() => void tapGoing()}
          disabled={pending || isFull || isApproveOnly}
        >
          {goingActive
            ? "You're in ✓"
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
        onClick={() => void tapInterested()}
        disabled={pending}
      >
        {interestedActive
          ? isApproveOnly
            ? "Withdraw application"
            : "Drop out"
          : loose
            ? "Interested"
            : isApproveOnly
              ? "Apply"
              : "Interested"}
      </button>
      {error && <p className="onboarding-error" style={{ marginTop: 8 }}>{error}</p>}

      {showGoingSheet && (
        <div className="sheet-backdrop" onClick={() => setShowGoingSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title">You're in</div>
            <button type="button" className="sheet-link" onClick={() => void switchToInterested()}>
              Switch to Interested
            </button>
            <button type="button" className="sheet-link sheet-link--danger" onClick={() => void dropOutFromGoing()}>
              Drop out
            </button>
            <button type="button" className="btn-link sheet-cancel" onClick={() => setShowGoingSheet(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {invitePromptFor && (
        <div className="sheet-backdrop" onClick={() => setInvitePromptFor(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title">
              {invitePromptFor === "going" ? "You're in 🎉" : "Nice — you're on the list"}
            </div>
            <p className="invite-prompt-copy">Know someone who'd love this?</p>
            <button
              type="button"
              className="btn-primary btn-block"
              onClick={() => {
                setInvitePromptFor(null);
                onJustMarkedInterested?.();
              }}
            >
              Invite friends
            </button>
            <button type="button" className="btn-link sheet-cancel" onClick={() => setInvitePromptFor(null)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
