import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || closeDisabled) return;

    const drag = {
      active: false,
      tracking: false,
      fromHandle: false,
      startY: 0,
      startX: 0,
      dy: 0,
      grab: 0,
      lastY: 0,
      lastT: 0,
      velocity: 0,
    };
    let settled = false;

    const place = (y: number, animate: boolean) => {
      sheet.style.transition = animate
        ? "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)"
        : "none";
      sheet.style.transform = y > 0 ? `translate3d(0, ${y}px, 0)` : "translate3d(0, 0, 0)";
    };

    const resetDrag = () => {
      drag.active = false;
      drag.tracking = false;
      drag.fromHandle = false;
      drag.dy = 0;
      drag.velocity = 0;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || settled) return;
      const touch = e.touches[0]!;
      const target = e.target;
      drag.active = true;
      drag.tracking = false;
      drag.fromHandle = target instanceof Element && Boolean(target.closest(".sheet-handle-hit"));
      drag.startY = touch.clientY;
      drag.startX = touch.clientX;
      drag.dy = 0;
      drag.lastY = 0;
      drag.lastT = performance.now();
      drag.velocity = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!drag.active || settled || e.touches.length !== 1) return;
      const touch = e.touches[0]!;
      const dy = touch.clientY - drag.startY;
      const dx = touch.clientX - drag.startX;
      if (!drag.tracking) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          drag.active = false;
          return;
        }
        if (dy < 8) return;
        const body = sheet.querySelector(".sheet-body");
        const atTop = !(body instanceof HTMLElement) || body.scrollTop <= 0;
        if (!drag.fromHandle && !atTop) {
          drag.active = false;
          return;
        }
        drag.tracking = true;
        drag.grab = dy;
      }
      e.preventDefault();
      const y = Math.max(0, dy - drag.grab);
      const now = performance.now();
      const dt = now - drag.lastT;
      if (dt > 0) drag.velocity = (y - drag.lastY) / dt;
      drag.lastY = y;
      drag.lastT = now;
      drag.dy = y;
      place(y, false);
    };

    const finishClose = () => {
      if (settled) return;
      settled = true;
      onCloseRef.current();
    };

    const onTouchEnd = () => {
      if (!drag.tracking) {
        drag.active = false;
        return;
      }
      const y = drag.dy;
      const flung = drag.velocity > 0.55;
      resetDrag();
      if (y > 72 || flung) {
        place(sheet.offsetHeight + 24, true);
        sheet.addEventListener("transitionend", finishClose);
        window.setTimeout(finishClose, 260);
        return;
      }
      place(0, true);
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
      sheet.removeEventListener("transitionend", finishClose);
    };
  }, [closeDisabled]);

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
        className={`sheet ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
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
