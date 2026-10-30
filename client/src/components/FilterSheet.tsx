import type { AgeRange, InterestTag } from "../types/shared";
import { ALL_AGE_RANGES, ALL_INTERESTS, AGE_RANGE_LABELS, INTEREST_LABELS } from "../types/shared";
import { BottomSheet } from "./ui/BottomSheet";
import { Button } from "./ui/Button";

/**
 * Bottom-sheet filter for the feed. Distance, age, and interest pickers
 * triggered by the top-right Filters button.
 */
export function FilterSheet({
  hasLocation,
  userInterests,
  selectedTag,
  nearbyOnly,
  selectedAgeRange,
  hideCancelled,
  networkOnly,
  onTagChange,
  onNearbyOnlyChange,
  onAgeRangeChange,
  onHideCancelledChange,
  onNetworkOnlyChange,
  onClose,
  onClear,
}: {
  hasLocation: boolean;
  userInterests: InterestTag[];
  selectedTag: InterestTag | null;
  nearbyOnly: boolean;
  selectedAgeRange: AgeRange | null;
  hideCancelled: boolean;
  networkOnly: boolean;
  onTagChange: (t: InterestTag | null) => void;
  onNearbyOnlyChange: (v: boolean) => void;
  onAgeRangeChange: (r: AgeRange | null) => void;
  onHideCancelledChange: (v: boolean) => void;
  onNetworkOnlyChange: (v: boolean) => void;
  onClose: () => void;
  onClear: () => void;
}) {
  const interestSet = new Set(userInterests);
  const orderedInterests = [
    ...userInterests,
    ...ALL_INTERESTS.filter((t) => !interestSet.has(t)),
  ];
  const hasActive =
    networkOnly || hideCancelled || selectedAgeRange !== null || nearbyOnly || selectedTag !== null;

  return (
    <BottomSheet onClose={onClose} labelledBy="filter-sheet-title" className="filters-panel">
      <div className="filter-sheet-header">
        <h2 id="filter-sheet-title" className="filter-sheet-title">
          Filters
        </h2>
        <button type="button" className="filter-sheet-clear" onClick={onClear} disabled={!hasActive}>
          Clear
        </button>
      </div>

      <div className="filters-scroll">
        <div className="filter-section">
          <button
            type="button"
            className="filter-toggle"
            role="switch"
            aria-checked={networkOnly}
            onClick={() => onNetworkOnlyChange(!networkOnly)}
          >
            <span className="filter-toggle-copy">
              <strong>Your network</strong>
              <small>Only people you&apos;ve been out with</small>
            </span>
            <span className={`flex-switch${networkOnly ? " is-on" : ""}`} aria-hidden="true">
              <span className="flex-switch-knob" />
            </span>
          </button>
          <button
            type="button"
            className="filter-toggle"
            role="switch"
            aria-checked={hideCancelled}
            onClick={() => onHideCancelledChange(!hideCancelled)}
          >
            <span className="filter-toggle-copy">
              <strong>Hide cancelled</strong>
              <small>Skip plans that aren&apos;t happening</small>
            </span>
            <span className={`flex-switch${hideCancelled ? " is-on" : ""}`} aria-hidden="true">
              <span className="flex-switch-knob" />
            </span>
          </button>
        </div>

        <div className="filter-section">
          <div className="filter-section-label">Age range</div>
          <div className="filter-pills">
            <button
              type="button"
              className={`filter-pill${!selectedAgeRange ? " is-active" : ""}`}
              onClick={() => onAgeRangeChange(null)}
            >
              All ages
            </button>
            {ALL_AGE_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className={`filter-pill${selectedAgeRange === r ? " is-active" : ""}`}
                onClick={() => onAgeRangeChange(selectedAgeRange === r ? null : r)}
              >
                {AGE_RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {hasLocation && (
          <div className="filter-section">
            <div className="filter-section-label">Distance</div>
            <div className="filter-pills">
              <button
                type="button"
                className={`filter-pill${!nearbyOnly ? " is-active" : ""}`}
                onClick={() => onNearbyOnlyChange(false)}
              >
                Anywhere
              </button>
              <button
                type="button"
                className={`filter-pill${nearbyOnly ? " is-active" : ""}`}
                aria-pressed={nearbyOnly}
                onClick={() => onNearbyOnlyChange(true)}
              >
                Within 15 miles
              </button>
            </div>
          </div>
        )}

        <div className="filter-section">
          <div className="filter-section-label">Interests</div>
          <div className="filter-pills">
            <button
              type="button"
              className={`filter-pill${selectedTag === null ? " is-active" : ""}`}
              onClick={() => onTagChange(null)}
            >
              All
            </button>
            {orderedInterests.map((t) => (
              <button
                key={t}
                type="button"
                className={`filter-pill${selectedTag === t ? " is-active" : ""}`}
                onClick={() => onTagChange(selectedTag === t ? null : t)}
              >
                {INTEREST_LABELS[t]}
              </button>
            ))}
          </div>
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
