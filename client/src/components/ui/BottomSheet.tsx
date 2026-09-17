import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Shared bottom sheet: drag handle, full-bleed to the bottom edge,
 * consistent radius/padding. Use for polls, RSVP, filters, settings, share.
 */
export function BottomSheet({
  children,
  onClose,
  labelledBy,
  ariaLabel,
  className = "",
  closeDisabled = false,
}: {
  children: ReactNode;
  onClose: () => void;
  labelledBy?: string;
  ariaLabel?: string;
  className?: string;
  closeDisabled?: boolean;
}) {
  const ignoreUntil = useRef(Date.now() + 450);

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

  function onBackdropPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (closeDisabled) return;
    if (Date.now() < ignoreUntil.current) return;
    onClose();
  }

  return createPortal(
    <div
      className="sheet-backdrop"
      role="presentation"
      onPointerDown={onBackdropPointerDown}
    >
      <div
        className={`sheet ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.body,
  );
}
