import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";

const HOLD_MS = 480;
const MOVE_PX = 12;

/**
 * Long-press a message bubble to delete it. A short tap still works (links,
 * nothing else). Moving a finger to scroll cancels the hold.
 */
export function HoldToDelete({
  enabled,
  onDelete,
  className,
  children,
}: {
  enabled: boolean;
  onDelete: () => void;
  className?: string;
  children: ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  function clear() {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
    setHolding(false);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!enabled || e.button !== 0) return;
    fired.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      origin.current = null;
      fired.current = true;
      setHolding(false);
      onDelete();
    }, HOLD_MS);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!origin.current) return;
    const dx = e.clientX - origin.current.x;
    const dy = e.clientY - origin.current.y;
    if (dx * dx + dy * dy > MOVE_PX * MOVE_PX) clear();
  }

  function onClickCapture(e: MouseEvent) {
    if (!fired.current) return;
    e.preventDefault();
    e.stopPropagation();
    fired.current = false;
  }

  const cls = [className, enabled ? "chat-bubble--holdable" : "", holding ? "is-holding" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      onPointerDown={enabled ? onPointerDown : undefined}
      onPointerMove={enabled ? onPointerMove : undefined}
      onPointerUp={enabled ? clear : undefined}
      onPointerCancel={enabled ? clear : undefined}
      onContextMenu={enabled ? (e) => e.preventDefault() : undefined}
      onClickCapture={enabled ? onClickCapture : undefined}
    >
      {children}
    </div>
  );
}
