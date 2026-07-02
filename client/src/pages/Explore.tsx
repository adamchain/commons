import { Link } from "react-router-dom";

// Explore is locked to an editorial "Coming Soon" state for launch (no live
// search / nearby calls). The layout below is the real, designed page — a
// masthead, a coming-soon pitch, a browse-categories mosaic, and a communities
// preview — rendered as a visual showcase. Restore the functional search +
// nearby version from git history when Explore ships.

// Browse categories — photo + label tiles arranged in the mosaic.
const CATEGORIES: Array<{ label: string; photo: string }> = [
  { label: "Coffee", photo: "https://images.unsplash.com/photo-1453614512568-c4024d13c247?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=600&q=80" },
  { label: "Food", photo: "https://images.unsplash.com/photo-1574966739987-65e38db0f7ce?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80" },
  { label: "Drinks", photo: "https://images.unsplash.com/photo-1568644396922-5c3bfae12521?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80" },
  { label: "Fitness", photo: "https://images.unsplash.com/photo-1603455778956-d71832eafa4e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80" },
  { label: "Parks", photo: "https://images.unsplash.com/photo-1615373111465-965023eb989c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80" },
  { label: "Culture", photo: "https://images.unsplash.com/photo-1518998053901-5348d3961a04?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80" },
];

const COMMUNITIES: Array<{ name: string; sub: string; photo: string }> = [
  { name: "Saturday Long Run", sub: "Fishtown · 18 members", photo: "https://images.unsplash.com/photo-1607962837359-5e7e89f86776?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=80" },
  { name: "Rittenhouse Book Club", sub: "Monthly · 9 members", photo: "https://images.unsplash.com/photo-1763896081109-ed6bf56ae955?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=80" },
  { name: "Trivia Tuesdays", sub: "South Philly · 14 members", photo: "https://images.unsplash.com/photo-1538488881038-e252a119ace7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800&q=80" },
];

export function ExplorePage() {
  return (
    <main className="app-shell app-shell--wide app-shell--with-nav app-shell--with-topbar xpl">
      {/* Masthead — neighbourhood eyebrow + big title + inert search pill */}
      <header className="xpl-masthead">
        <div>
          <div className="xpl-eyebrow">Philadelphia</div>
          <h1 className="xpl-title">Explore</h1>
        </div>
        <button type="button" className="xpl-search-pill" disabled aria-disabled="true">
          <SearchIcon />
          <span>Search</span>
        </button>
      </header>

      <div className="xpl-divider" />

      {/* Coming soon — large editorial pitch, no card */}
      <section className="xpl-pitch" aria-label="Explore — coming soon">
        <div className="xpl-pitch-eyebrow">Coming soon</div>
        <h2 className="xpl-pitch-head">
          Browse spots.<br />Make plans<br />there.
        </h2>
        <p className="xpl-pitch-body">
          This page is a preview of what&apos;s coming — browse cafés, bars, parks,
          and gyms in your neighborhood, with plans already happening at them.
          Search and nearby discovery aren&apos;t live yet.
        </p>
        <Link to="/plans/new" className="xpl-pitch-cta">
          Post a plan now →
        </Link>
      </section>

      {/* Photo mosaic — large Coffee tile + stacked Food/Drinks, then a tight row */}
      <section className="xpl-mosaic" aria-label="Browse by category">
        <div className="xpl-mosaic-top">
          <PhotoTile cat={CATEGORIES[0]!} className="xpl-tile--lead" />
          <div className="xpl-mosaic-stack">
            <PhotoTile cat={CATEGORIES[1]!} className="xpl-tile--sm" />
            <PhotoTile cat={CATEGORIES[2]!} className="xpl-tile--sm" />
          </div>
        </div>
        <div className="xpl-mosaic-row">
          {CATEGORIES.slice(3).map((cat) => (
            <PhotoTile key={cat.label} cat={cat} className="xpl-tile--row" />
          ))}
        </div>
      </section>

      <div className="xpl-divider" />

      {/* Communities — numbered photo rows */}
      <section className="xpl-communities" aria-label="Communities — coming soon">
        <div className="xpl-section-head">
          <div className="xpl-eyebrow">Communities · Soon</div>
          <h2 className="xpl-section-title">Find your people</h2>
        </div>
        <ul className="xpl-comm-list">
          {COMMUNITIES.map((c, i) => (
            <li key={c.name} className="xpl-comm-card">
              <img src={c.photo} alt="" loading="lazy" />
              <div className="xpl-comm-overlay" aria-hidden="true" />
              <div className="xpl-comm-body">
                <span className="xpl-comm-num">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div className="xpl-comm-name">{c.name}</div>
                  <div className="xpl-comm-sub">{c.sub}</div>
                </div>
              </div>
              <ChevronIcon />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function PhotoTile({ cat, className }: { cat: { label: string; photo: string }; className?: string }) {
  return (
    <div className={`xpl-tile ${className ?? ""}`}>
      <img src={cat.photo} alt="" loading="lazy" />
      <div className="xpl-tile-overlay" aria-hidden="true" />
      <span className="xpl-tile-label">{cat.label}</span>
    </div>
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

function ChevronIcon() {
  return (
    <svg className="xpl-comm-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
