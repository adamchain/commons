import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || closeDisabled) return;

    const drag = {
      active: false,
      fromHandle: false,
      startY: 0,
      startX: 0,
      dy: 0,
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0]!;
      const target = e.target;
      drag.active = true;
      drag.fromHandle = target instanceof Element && Boolean(target.closest(".sheet-handle-hit"));
      drag.startY = touch.clientY;
      drag.startX = touch.clientX;
      drag.dy = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!drag.active || e.touches.length !== 1) return;
      const touch = e.touches[0]!;
      const dy = touch.clientY - drag.startY;
      const dx = touch.clientX - drag.startX;
      if (drag.dy === 0 && Math.abs(dx) > Math.abs(dy)) {
        drag.active = false;
        return;
      }
      const body = sheet.querySelector(".sheet-body");
      const atTop = !(body instanceof HTMLElement) || body.scrollTop <= 0;
      const dismiss = drag.fromHandle || (atTop && dy > 0);
      if (!dismiss || dy < 10) return;
      e.preventDefault();
      drag.dy = dy;
      setDragging(true);
      setDragY(dy);
    };

    const onTouchEnd = () => {
      if (!drag.active && drag.dy === 0) return;
      const dy = drag.dy;
      drag.active = false;
      drag.fromHandle = false;
      drag.dy = 0;
      if (dy > 64) {
        onClose();
        return;
      }
      setDragging(false);
      requestAnimationFrame(() => setDragY(0));
    };

    sheet.addEventListener("touchstart", onTouchStart, { passive: true });
    sheet.addEventListener("touchmove", onTouchMove, { passive: false });
    sheet.addEventListener("touchend", onTouchEnd);
    sheet.addEventListener("touchcancel", onTouchEnd);
    return () => {
      sheet.removeEventListener("touchstart", onTouchStart);
      sheet.removeEventListener("touchmove", onTouchMove);
      sheet.removeEventListener("touchend", onTouchEnd);
      sheet.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [onClose, closeDisabled]);

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

  function onBackdropPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
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
        ref={sheetRef}
        className={`sheet ${dragging ? "is-dragging" : ""} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
        onPointerDown={(e: ReactPointerEvent) => e.stopPropagation()}
      >
        <div className="sheet-handle-hit">
          <div className="sheet-handle" aria-hidden="true" />
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
