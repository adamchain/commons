import { useEffect, useEffectEvent } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import type { ParticipationState } from "../types/shared";

export type JoinConfirmKind = ParticipationState | "dropped" | "community" | "idea_interested";

const COPY: Record<JoinConfirmKind, { title: string; sub: string; celebrate: boolean }> = {
  going: {
    title: "I'm in.",
    sub: "You're on the list — see you there.",
    celebrate: true,
  },
  interested: {
    title: "You're Interested",
    sub: "We'll keep you posted.",
    celebrate: true,
  },
  idea_interested: {
    title: "You're Interested.",
    sub: "Head to the chat to coordinate the details",
    celebrate: true,
  },
  dropped: {
    title: "Dropped out",
    sub: "You're off the list.",
    celebrate: false,
  },
  community: {
    title: "You're In",
    sub: "Make yourself at home.",
    celebrate: true,
  },
};

/** Centered confirmation card — replaces the inline plan-card toast that collided with Going. */
export function JoinConfirmPopup({
  kind,
  onClose,
  autoDismissMs = 2200,
}: {
  kind: JoinConfirmKind;
  onClose: () => void;
  autoDismissMs?: number;
}) {
  const { title, sub, celebrate } = COPY[kind];
  const dismiss = useEffectEvent(onClose);
  const dismissAfter = kind === "idea_interested" ? Math.max(autoDismissMs, 3200) : autoDismissMs;

  useEffect(() => {
    const t = window.setTimeout(() => dismiss(), dismissAfter);
    return () => window.clearTimeout(t);
  }, [kind, dismissAfter]);

  return createPortal(
    <div
      className="join-confirm-backdrop"
      role="presentation"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className={`join-confirm-card ${celebrate ? "join-confirm-card--celebrate" : ""}`}
        role="status"
        aria-live="polite"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="join-confirm-icon" aria-hidden="true">
          <Check size={22} strokeWidth={2.4} />
        </div>
        <h2 className="join-confirm-title">{title}</h2>
        <p className="join-confirm-sub">{sub}</p>
      </div>
    </div>,
    document.body,
  );
}

export function joinConfirmKind(
  next: ParticipationState | null,
  opts?: { isIdea?: boolean },
): JoinConfirmKind {
  if (next === "going") return "going";
  if (next === "interested") return opts?.isIdea ? "idea_interested" : "interested";
  return "dropped";
}
