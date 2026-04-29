import { useState } from "react";
import { api } from "../api/http";
import type { ParticipationState } from "../types/shared";

export function ParticipationButtons({
  planId,
  initialState,
  onChange,
}: {
  planId: string;
  initialState: ParticipationState | null;
  onChange: (next: ParticipationState | null) => void;
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

  return (
    <div className="participation">
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
        {interestedActive ? "You're interested" : "Interested"}
      </button>
    </div>
  );
}
