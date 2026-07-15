import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { COMMUNITY_CATEGORY_LABELS, type CommunityCardDTO } from "../types/shared";

// Explore is locked to an editorial "Coming Soon" state for launch (no live
// search / nearby calls) — EXCEPT the Communities rail, which is the one live
// element at launch (per the Communities V1 spec). Restore the functional
// search + nearby version from git history when the rest of Explore ships.

// Browse categories — photo + label tiles arranged in the mosaic.
const CATEGORIES: Array<{ label: string; photo: string }> = [
  { label: "Coffee", photo: "https://images.unsplash.com/photo-1453614512568-c4024d13c247?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=600&q=80" },
  { label: "Food", photo: "https://images.unsplash.com/photo-1574966739987-65e38db0f7ce?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80" },
  { label: "Drinks", photo: "https://images.unsplash.com/photo-1568644396922-5c3bfae12521?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80" },
  { label: "Fitness", photo: "https://images.unsplash.com/photo-1603455778956-d71832eafa4e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80" },
  { label: "Parks", photo: "https://images.unsplash.com/photo-1615373111465-965023eb989c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80" },
  { label: "Culture", photo: "https://images.unsplash.com/photo-1518998053901-5348d3961a04?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80" },
];

export function ExplorePage() {
  const [communities, setCommunities] = useState<CommunityCardDTO[]>([]);
  const [loadedComm, setLoadedComm] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ communities: CommunityCardDTO[] }>("/api/communities")
      .then((r) => {
        if (alive) setCommunities(r.communities);
      })
      .catch(() => {
        /* rail just stays empty on error */
      })
      .finally(() => {
        if (alive) setLoadedComm(true);
      });
    return () => {
      alive = false;
    };
  }, []);

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

      {/* Coming soon — compact button, not oversized headline */}
      <section className="xpl-pitch" aria-label="Explore — coming soon">
        <button type="button" className="xpl-coming-soon-btn" disabled aria-disabled="true">
          Coming soon
        </button>
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

      {/* Communities — the one live Explore element at launch */}
      <section className="xpl-communities" aria-label="Communities">
        <div className="xpl-section-head">
          <div className="xpl-eyebrow">Communities</div>
          <h2 className="xpl-section-title">Find your people</h2>
          <Link to="/communities" className="xpl-pitch-cta">
            See all →
          </Link>
        </div>
        {communities.length > 0 ? (
          <ul className="xpl-comm-list">
            {communities.map((c, i) => (
              <li key={c.id} className="xpl-comm-card-wrap">
                <Link to={`/communities/${c.id}`} className="xpl-comm-card">
                  {c.coverImage ? (
                    <img src={c.coverImage} alt="" loading="lazy" />
                  ) : (
                    <div className="xpl-comm-cover-fallback" aria-hidden="true" />
                  )}
                  <div className="xpl-comm-overlay" aria-hidden="true" />
                  <div className="xpl-comm-body">
                    <span className="xpl-comm-num">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <div className="xpl-comm-name">
                        {c.name}
                        {c.isFounding ? <span className="xpl-comm-founding">Founding</span> : null}
                      </div>
                      <div className="xpl-comm-sub">
                        {COMMUNITY_CATEGORY_LABELS[c.category]} · {c.memberCount}{" "}
                        {c.memberCount === 1 ? "member" : "members"}
                      </div>
                    </div>
                  </div>
                  <ChevronIcon />
                </Link>
              </li>
            ))}
          </ul>
        ) : loadedComm ? (
          <div className="xpl-comm-empty">
            <p>No communities yet — be the first to start one.</p>
            <Link to="/communities/new" className="xpl-pitch-cta">
              Start a community →
            </Link>
          </div>
        ) : null}
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
