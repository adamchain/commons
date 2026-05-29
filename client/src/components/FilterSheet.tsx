import { useEffect } from "react";
import type { InterestTag, NeighborhoodDTO } from "../types/shared";
import { ALL_INTERESTS, INTEREST_LABELS } from "../types/shared";

/**
 * Bottom-sheet filter for the feed. Surfaces neighborhood + interest pickers
 * triggered by the top-right Filters button. Closes on backdrop tap or Apply.
 */
export function FilterSheet({
  neighborhoods,
  userHoodIds,
  userInterests,
  selectedTag,
  selectedHoodId,
  hideHappened,
  hideCancelled,
  onTagChange,
  onHoodChange,
  onHideHappenedChange,
  onHideCancelledChange,
  onClose,
  onClear,
}: {
  neighborhoods: NeighborhoodDTO[];
  userHoodIds: string[];
  userInterests: InterestTag[];
  selectedTag: InterestTag | null;
  selectedHoodId: string | null;
  hideHappened: boolean;
  hideCancelled: boolean;
  onTagChange: (t: InterestTag | null) => void;
  onHoodChange: (id: string | null) => void;
  onHideHappenedChange: (v: boolean) => void;
  onHideCancelledChange: (v: boolean) => void;
  onClose: () => void;
  onClear: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mineSet = new Set(userHoodIds);
  const orderedHoods = [
    ...neighborhoods.filter((n) => mineSet.has(n.id)),
    ...neighborhoods.filter((n) => !mineSet.has(n.id)).sort((a, b) => a.name.localeCompare(b.name)),
  ];
  const interestSet = new Set(userInterests);
  const orderedInterests = [
    ...userInterests,
    ...ALL_INTERESTS.filter((t) => !interestSet.has(t)),
  ];

  return (
    <div className="filter-sheet-backdrop" onClick={onClose}>
      <div className="filter-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="filter-sheet-header">
          <h2 className="filter-sheet-title">Filters</h2>
          <button type="button" className="btn-link" onClick={onClear}>
            Clear
          </button>
        </div>

        <div className="filter-sheet-group">
          <div className="filter-sheet-group-label">Show</div>
          <div className="filter-sheet-chips">
            <button
              type="button"
              className={`community-chip ${hideHappened ? "is-active" : ""}`}
              onClick={() => onHideHappenedChange(!hideHappened)}
              aria-pressed={hideHappened}
            >
              Hide past
            </button>
            <button
              type="button"
              className={`community-chip ${hideCancelled ? "is-active" : ""}`}
              onClick={() => onHideCancelledChange(!hideCancelled)}
              aria-pressed={hideCancelled}
            >
              Hide cancelled
            </button>
          </div>
        </div>

        <div className="filter-sheet-group">
          <div className="filter-sheet-group-label">Neighborhood</div>
          <div className="filter-sheet-chips">
            <button
              type="button"
              className={`community-chip ${selectedHoodId === null ? "is-active" : ""}`}
              onClick={() => onHoodChange(null)}
            >
              All areas
            </button>
            {orderedHoods.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`community-chip ${selectedHoodId === n.id ? "is-active" : ""}`}
                onClick={() => onHoodChange(selectedHoodId === n.id ? null : n.id)}
              >
                {n.name}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-sheet-group">
          <div className="filter-sheet-group-label">Interests</div>
          <div className="filter-sheet-chips">
            <button
              type="button"
              className={`community-chip ${selectedTag === null ? "is-active" : ""}`}
              onClick={() => onTagChange(null)}
            >
              All
            </button>
            {orderedInterests.map((t) => (
              <button
                key={t}
                type="button"
                className={`community-chip ${selectedTag === t ? "is-active" : ""}`}
                onClick={() => onTagChange(selectedTag === t ? null : t)}
              >
                {INTEREST_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="btn-primary btn-block"
          style={{ marginTop: 18 }}
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </div>
  );
}
