import type { AgeRange, InterestTag, NeighborhoodDTO } from "../types/shared";
import { ALL_AGE_RANGES, ALL_INTERESTS, AGE_RANGE_LABELS, INTEREST_LABELS } from "../types/shared";
import { BottomSheet } from "./ui/BottomSheet";
import { Button } from "./ui/Button";

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
  selectedAgeRange,
  hideCancelled,
  networkOnly,
  onTagChange,
  onHoodChange,
  onAgeRangeChange,
  onHideCancelledChange,
  onNetworkOnlyChange,
  onClose,
  onClear,
}: {
  neighborhoods: NeighborhoodDTO[];
  userHoodIds: string[];
  userInterests: InterestTag[];
  selectedTag: InterestTag | null;
  selectedHoodId: string | null;
  selectedAgeRange: AgeRange | null;
  hideCancelled: boolean;
  networkOnly: boolean;
  onTagChange: (t: InterestTag | null) => void;
  onHoodChange: (id: string | null) => void;
  onAgeRangeChange: (r: AgeRange | null) => void;
  onHideCancelledChange: (v: boolean) => void;
  onNetworkOnlyChange: (v: boolean) => void;
  onClose: () => void;
  onClear: () => void;
}) {
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
    <BottomSheet onClose={onClose} labelledBy="filter-sheet-title">
        <div className="filter-sheet-header">
          <h2 id="filter-sheet-title" className="filter-sheet-title">Filters</h2>
          <button type="button" className="btn-link" onClick={onClear}>
            Clear
          </button>
        </div>

        <div className="filter-sheet-group">
          <div className="filter-sheet-chips">
            <button
              type="button"
              className={`community-chip ${networkOnly ? "is-active" : ""}`}
              onClick={() => onNetworkOnlyChange(!networkOnly)}
              aria-pressed={networkOnly}
            >
              Your Network
            </button>
          </div>
        </div>

        <div className="filter-sheet-group">
          <div className="filter-sheet-group-label">Show</div>
          <div className="filter-sheet-chips">
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
          <div className="filter-sheet-group-label">Age range</div>
          <div className="filter-sheet-chips">
            <button
              type="button"
              className={`community-chip ${selectedAgeRange === null ? "is-active" : ""}`}
              onClick={() => onAgeRangeChange(null)}
            >
              All ages
            </button>
            {ALL_AGE_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className={`community-chip ${selectedAgeRange === r ? "is-active" : ""}`}
                onClick={() => onAgeRangeChange(selectedAgeRange === r ? null : r)}
              >
                {AGE_RANGE_LABELS[r]}
              </button>
            ))}
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

        <div className="sheet-actions">
          <Button variant="primary" block onClick={onClose}>
            Done
          </Button>
        </div>
    </BottomSheet>
  );
}
