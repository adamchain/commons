import { useEffect, useRef, useState } from "react";

/**
 * Horizontally-scrollable number picker for small, common caps (e.g. plan
 * spots). Swaps the native <input type="number"> spinner — fiddly on
 * mobile — for a tap/scroll strip. Falls back to a plain number input for
 * values outside the common range via the trailing "Other" chip.
 */
export function NumberPicker({
  value,
  onChange,
  min = 2,
  max = 20,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  ariaLabel?: string;
}) {
  const [customMode, setCustomMode] = useState(value > 0 && (value < min || value > max));
  const activeRef = useRef<HTMLButtonElement>(null);

  // Re-center only when the picker (re-)enters list mode, not on every value
  // change, so scrolling to tap a chip doesn't fight the user's own scroll.
  useEffect(() => {
    if (customMode) return;
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [customMode]);

  if (customMode) {
    return (
      <div className="number-picker-custom">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="e.g. 25"
          value={value > 0 ? value : ""}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
        <button type="button" className="btn-link" onClick={() => setCustomMode(false)}>
          Pick from list
        </button>
      </div>
    );
  }

  const numbers = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="number-picker-scroll" role="listbox" aria-label={ariaLabel ?? "Pick a number"}>
      {numbers.map((n) => {
        const active = n === value;
        return (
          <button
            key={n}
            ref={active ? activeRef : undefined}
            type="button"
            role="option"
            aria-selected={active}
            className={`number-picker-chip ${active ? "is-active" : ""}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        );
      })}
      <button
        type="button"
        className="number-picker-chip number-picker-chip--other"
        onClick={() => setCustomMode(true)}
      >
        Other
      </button>
    </div>
  );
}
