import { useEffect, useState } from "react";
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
    /* storage unavailable — non-blocking */
  }
}

function confirmCopy(next: ParticipationState | null): string {
  if (next === "going") return "You're In";
  if (next === "interested") return "Marked Interested";
  return "Dropped out";
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
  onJustMarkedGoing,
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
  /** Called the first time someone confirms In — opens the invite sheet. */
  onJustMarkedGoing?: () => void;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<ParticipationState | null>(initialState);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGoingSheet, setShowGoingSheet] = useState(false);
  const [showInterestedSheet, setShowInterestedSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Shared commit path — optimistic update, real request, roll back on failure.
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
      setToast(confirmCopy(next));
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

  const promptInviteIfNeeded = () => {
    if (hasPromptedInvite(planId, user?.id)) return;
    markPromptedInvite(planId, user?.id);
    onJustMarkedGoing?.();
  };

  const tapGoing = async () => {
    if (pending) return;
    if (goingActive) {
      setShowGoingSheet(true);
      return;
    }
    const ok = await commit("going");
    if (ok) promptInviteIfNeeded();
  };

  const tapInterested = async () => {
    if (pending) return;
    if (interestedActive) {
      setShowInterestedSheet(true);
      return;
    }
    await commit("interested");
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

  const dropOutFromInterested = async () => {
    const confirmed = window.confirm(
      "Drop Interested? You'll leave the count and the group chat.",
    );
    if (!confirmed) return;
    setShowInterestedSheet(false);
    await commit(null);
  };

  const switchToGoing = async () => {
    setShowInterestedSheet(false);
    const ok = await commit("going");
    if (ok) promptInviteIfNeeded();
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
            ? "Application-only — tap Interested to request a spot."
            : isFull
              ? "This plan is full."
              : capacity !== null
                ? `${goingCount}/${capacity} spots taken — first come, first serve.`
                : "In is committed. Interested is soft — both count and join the chat."}
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
            ? "You're In ✓"
            : isFull
              ? "Full"
              : isApproveOnly
                ? "Application-only"
                : "In"}
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
            : "Interested ✓"
          : loose
            ? "Interested"
            : isApproveOnly
              ? "Apply"
              : "Interested"}
      </button>
      {error && <p className="onboarding-error" style={{ marginTop: 8 }}>{error}</p>}
      {toast && (
        <p className="participation-toast" role="status" aria-live="polite">
          {toast}
        </p>
      )}

      {showGoingSheet && (
        <div className="sheet-backdrop" onClick={() => setShowGoingSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title">You're In</div>
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

      {showInterestedSheet && (
        <div className="sheet-backdrop" onClick={() => setShowInterestedSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title">Interested</div>
            {!loose && !isApproveOnly && !isFull && (
              <button type="button" className="sheet-link" onClick={() => void switchToGoing()}>
                Switch to In
              </button>
            )}
            <button
              type="button"
              className="sheet-link sheet-link--danger"
              onClick={() => void dropOutFromInterested()}
            >
              Drop out
            </button>
            <button type="button" className="btn-link sheet-cancel" onClick={() => setShowInterestedSheet(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
