import { useState } from "react";
import { api } from "../api/http";
import type { ParticipationState, PlanKind } from "../types/shared";

export function ParticipationButtons({
  planId,
  initialState,
  onChange,
  planKind = "standard",
}: {
  planId: string;
  initialState: ParticipationState | null;
  onChange: (next: ParticipationState | null) => void;
  planKind?: PlanKind;
}) {
  const [state, setState] = useState<ParticipationState | null>(initialState);
  const [pending, setPending] = useState(false);

  const toggleState = async (target: ParticipationState) => {
    if (pending) return;
    const next = state === target ? null : target;
    const prev = state;
    setState(next);
    onChange(next);
    setPending(true);
    try {
      if (next) {
        await api(`/api/plans/${planId}/participation`, {
          method: "PUT",
          body: JSON.stringify({ state: next }),
        });
      } else {
        await api(`/api/plans/${planId}/participation`, { method: "DELETE" });
      }
    } catch {
      setState(prev);
      onChange(prev);
    } finally {
      setPending(false);
    }
  };

  const goingActive = state === "going";
  const interestedActive = state === "interested";
  const loose = planKind === "looking_for";

  return (
    <div className={`participation ${loose ? "participation--loose" : ""}`}>
      <p className="participation-hint">
        {loose ? "Loose idea — tap if you’re tentatively interested." : "Committed vs tentative — pick what fits."}
      </p>
      <button
        type="button"
        className={`btn-going ${goingActive ? "is-active" : ""}`}
        onClick={() => void toggleState("going")}
        disabled={pending}
      >
        {goingActive ? "✓ You're in" : "I'm in"}
      </button>
      <button
        type="button"
        className={`btn-interested ${interestedActive ? "is-active" : ""}`}
        onClick={() => void toggleState("interested")}
        disabled={pending}
      >
        {interestedActive ? (loose ? "You're down" : "You're interested") : loose ? "I'm down" : "Interested"}
      </button>
    </div>
  );
}
