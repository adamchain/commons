import { useEffect, useState } from "react";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import type { JoinType, ParticipationState, PlanKind } from "../types/shared";
import { isPlanAtCapacity, planCapacityValue } from "../lib/planTime";
import { JoinConfirmPopup, joinConfirmKind, type JoinConfirmKind } from "./JoinConfirmPopup";
import { BottomSheet } from "./ui/BottomSheet";

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
  onConfirmClose,
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
  /** Called the first time someone confirms Join — opens the invite sheet. */
  onJustMarkedGoing?: () => void;
  onConfirmClose?: (kind: JoinConfirmKind) => void;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<ParticipationState | null>(initialState);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGoingSheet, setShowGoingSheet] = useState(false);
  const [showInterestedSheet, setShowInterestedSheet] = useState(false);
  const [confirm, setConfirm] = useState<JoinConfirmKind | null>(null);

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  // Shared commit path — optimistic update, real request, roll back on failure.
  // Skip the celebratory popup when the invite sheet is about to open.
  const commit = async (
    next: ParticipationState | null,
    opts?: { celebrate?: boolean },
  ): Promise<boolean> => {
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
      if (opts?.celebrate !== false) setConfirm(joinConfirmKind(next, { isIdea: planKind === "looking_for" }));
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

  const promptInviteIfNeeded = (): boolean => {
    if (hasPromptedInvite(planId, user?.id)) return false;
    markPromptedInvite(planId, user?.id);
    onJustMarkedGoing?.();
    return true;
  };

  const tapGoing = async () => {
    if (pending) return;
    if (goingActive) {
      setShowGoingSheet(true);
      return;
    }
    const willInvite = !hasPromptedInvite(planId, user?.id) && !!onJustMarkedGoing;
    const ok = await commit("going", { celebrate: !willInvite });
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
    if (pending) return;
    setShowGoingSheet(false);
    await commit(null);
  };

  const dropOutFromInterested = async () => {
    if (pending) return;
    setShowInterestedSheet(false);
    await commit(null);
  };

  const switchToGoing = async () => {
    setShowInterestedSheet(false);
    const willInvite = !hasPromptedInvite(planId, user?.id) && !!onJustMarkedGoing;
    const ok = await commit("going", { celebrate: !willInvite });
    if (ok) promptInviteIfNeeded();
  };

  const goingActive = state === "going";
  const interestedActive = state === "interested";
  const loose = planKind === "looking_for";
  const isFull = !isHosting && isPlanAtCapacity(capacity, goingCount) && !goingActive;
  const isApproveOnly =
    !isHosting &&
    (joinType === "approve" || planCapacityValue(capacity) !== null) &&
    !goingActive;
  // A capped or host-review plan can't take a direct Join. Everything else,
  // including ideas, offers Join and Interested together.
  const interestedOnly = (isFull || isApproveOnly) && !goingActive;

  return (
    <div className={`participation ${loose ? "participation--loose" : ""}`}>
      {!loose && (isApproveOnly || isFull || capacity !== null) && (
        <p className="participation-hint">
          {isFull
            ? "This one's full — tap Interested in case a spot opens."
            : isApproveOnly
              ? capacity !== null
                ? `${goingCount}/${capacity} spots — let the host know you're interested.`
                : "The host confirms who's in."
              : `${goingCount}/${capacity} spots taken.`}
        </p>
      )}
      {goingActive ? (
        <>
          <button
            type="button"
            className="btn-going is-active"
            onClick={() => void tapGoing()}
            disabled={pending}
          >
            Joined
          </button>
          <button
            type="button"
            className="btn-interested"
            onClick={() => void switchToInterested()}
            disabled={pending}
          >
            Interested
          </button>
        </>
      ) : interestedOnly ? (
        <button
          type="button"
          className={`btn-interested ${interestedActive ? "is-active" : ""}`}
          onClick={() => void tapInterested()}
          disabled={pending}
        >
          {interestedActive ? "Interested ✓" : "Interested"}
        </button>
      ) : (
        <>
          <button
            type="button"
            className="btn-going"
            onClick={() => void tapGoing()}
            disabled={pending}
          >
            Join
          </button>
          <button
            type="button"
            className={`btn-interested ${interestedActive ? "is-active" : ""}`}
            onClick={() => void tapInterested()}
            disabled={pending}
          >
            {interestedActive ? "Interested ✓" : "Interested"}
          </button>
        </>
      )}
      {error && <p className="onboarding-error" style={{ marginTop: 8 }}>{error}</p>}
      {confirm && (
        <JoinConfirmPopup
          kind={confirm}
          onClose={() => {
            const kind = confirm;
            setConfirm(null);
            onConfirmClose?.(kind);
          }}
        />
      )}

      {showGoingSheet && (
        <BottomSheet onClose={() => setShowGoingSheet(false)} labelledBy="rsvp-going-title">
            <div id="rsvp-going-title" className="sheet-title">Joined</div>
            <button type="button" className="sheet-link" onClick={() => void switchToInterested()}>
              Switch to Interested
            </button>
            <button type="button" className="sheet-link sheet-link--danger" disabled={pending} onClick={() => void dropOutFromGoing()}>
              Drop out
            </button>
            <button type="button" className="btn-link sheet-cancel" onClick={() => setShowGoingSheet(false)}>
              Cancel
            </button>
        </BottomSheet>
      )}

      {showInterestedSheet && (
        <BottomSheet onClose={() => setShowInterestedSheet(false)} labelledBy="rsvp-interested-title">
            <div id="rsvp-interested-title" className="sheet-title">Interested</div>
            {!loose && !isApproveOnly && !isFull && (
              <button type="button" className="sheet-link" onClick={() => void switchToGoing()}>
                Switch to Join
              </button>
            )}
            <button
              type="button"
              className="sheet-link sheet-link--danger"
              disabled={pending}
              onClick={() => void dropOutFromInterested()}
            >
              Drop out
            </button>
            <button type="button" className="btn-link sheet-cancel" onClick={() => setShowInterestedSheet(false)}>
              Cancel
            </button>
        </BottomSheet>
      )}
    </div>
  );
}
