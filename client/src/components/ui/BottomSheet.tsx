import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Shared bottom sheet: drag handle, full-bleed to the bottom edge,
 * consistent radius/padding. Use for polls, RSVP, filters, settings, share.
 */
export function BottomSheet({
  children,
  onClose,
  labelledBy,
  className = "",
  closeDisabled = false,
}: {
  children: ReactNode;
  onClose: () => void;
  labelledBy?: string;
  className?: string;
  closeDisabled?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closeDisabled) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, closeDisabled]);

  return createPortal(
    <div
      className="sheet-backdrop"
      role="presentation"
      onClick={() => {
        if (!closeDisabled) onClose();
      }}
    >
      <div
        className={`sheet ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.body,
  );
}
