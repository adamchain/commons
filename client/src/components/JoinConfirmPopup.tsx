import { useEffect, useEffectEvent } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import type { ParticipationState } from "../types/shared";

export type JoinConfirmKind = ParticipationState | "dropped";

const COPY: Record<JoinConfirmKind, { title: string; sub: string; celebrate: boolean }> = {
  going: {
    title: "You're In",
    sub: "You're on the list — see you there.",
    celebrate: true,
  },
  interested: {
    title: "You're Interested",
    sub: "Soft yes — you'll get updates and join the chat.",
    celebrate: true,
  },
  dropped: {
    title: "Dropped out",
    sub: "You're off the list.",
    celebrate: false,
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

  useEffect(() => {
    const t = window.setTimeout(() => dismiss(), autoDismissMs);
    return () => window.clearTimeout(t);
  }, [kind, autoDismissMs]);

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

export function joinConfirmKind(next: ParticipationState | null): JoinConfirmKind {
  if (next === "going") return "going";
  if (next === "interested") return "interested";
  return "dropped";
}
