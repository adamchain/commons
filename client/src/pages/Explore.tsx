import { Link } from "react-router-dom";

// Google place types behind each browse chip — kept for the visual shell only.
// Explore is locked to a "Coming Soon" state for launch (no live search /
// nearby calls). Restore the functional version from git history when it ships.
const CATEGORIES: Array<{ type: string; label: string }> = [
  { type: "", label: "All" },
  { type: "cafe", label: "Coffee" },
  { type: "restaurant", label: "Food" },
  { type: "bar", label: "Drinks" },
  { type: "gym", label: "Fitness" },
  { type: "park", label: "Parks" },
  { type: "tourist_attraction", label: "Culture" },
];

export function ExplorePage() {
  return (
    <main className="app-shell app-shell--wide app-shell--with-nav app-shell--with-topbar">
      <h1 className="brand" style={{ marginBottom: 4 }}>Explore</h1>
      <p className="form-help" style={{ marginTop: 0, marginBottom: 14 }}>
        Spots and communities near you — see what's around, then make a plan there.
      </p>

      {/* Visual shell, locked. The search field + category chips render exactly
          as designed but are disabled until Explore launches. */}
      <div className="explore-locked" aria-hidden="false">
        <div className="explore-search explore-search--disabled">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search a café, bar, gym, or park"
            disabled
            aria-disabled="true"
          />
        </div>

        <div className="explore-cats" role="tablist" aria-label="Browse nearby by category">
          {CATEGORIES.map((c) => (
            <button
              key={c.type || "all"}
              type="button"
              className={`explore-cat-chip ${c.type === "" ? "is-active" : ""}`}
              disabled
              aria-disabled="true"
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="explore-coming-soon" role="status">
          <span className="explore-coming-soon-badge">Coming soon</span>
          <h2>Explore is on the way</h2>
          <p>
            Soon you'll be able to browse cafés, bars, parks and more near you —
            and spin up a plan at any of them in a tap. For now, post a plan or
            check your feed.
          </p>
          <Link to="/plans/new" className="btn-primary">
            Post a plan
          </Link>
        </div>
      </div>

      <CommunitiesPreview />
    </main>
  );
}

function CommunitiesPreview() {
  return (
    <aside className="explore-communities-card" aria-label="Communities — coming soon">
      <div className="explore-communities-header">
        <span className="explore-communities-tag">Communities · Soon</span>
        <h2>Find your people</h2>
      </div>
      <p className="explore-communities-body">
        Run clubs, book clubs, recurring crews. Join a community and get their
        plans in your feed automatically.
      </p>
      <ul className="explore-coming-soon-preview" aria-label="Sample communities">
        <li>
          <span className="explore-preview-emoji" aria-hidden="true">🏃</span>
          <div>
            <strong>Saturday Long Run</strong>
            <span>Fishtown · 18 members</span>
          </div>
        </li>
        <li>
          <span className="explore-preview-emoji" aria-hidden="true">📖</span>
          <div>
            <strong>Rittenhouse Book Club</strong>
            <span>Monthly · 9 members</span>
          </div>
        </li>
        <li>
          <span className="explore-preview-emoji" aria-hidden="true">🎲</span>
          <div>
            <strong>Trivia Tuesdays</strong>
            <span>South Philly · 14 members</span>
          </div>
        </li>
      </ul>
    </aside>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
