import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/http";
import {
  COMMUNITY_CATEGORY_LABELS,
  type CommunityCardDTO,
} from "../types/shared";
import "./Communities.css";

export function CommunitiesPage() {
  const navigate = useNavigate();
  const [mine, setMine] = useState<CommunityCardDTO[]>([]);
  const [all, setAll] = useState<CommunityCardDTO[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [m, a] = await Promise.all([
          api<{ communities: CommunityCardDTO[] }>("/api/communities/mine"),
          api<{ communities: CommunityCardDTO[] }>("/api/communities"),
        ]);
        if (!live) return;
        setMine(m.communities);
        setAll(a.communities);
      } finally {
        if (live) setLoaded(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const mineIds = new Set(mine.map((c) => c.id));
  const browse = all.filter((c) => !mineIds.has(c.id));

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar cmy-list">
      <header className="cmy-list-masthead">
        <div>
          <div className="cmy-list-eyebrow">Philadelphia</div>
          <h1 className="cmy-list-title">Communities</h1>
          <p className="cmy-list-sub">Run clubs, book clubs, and the regulars — find your people.</p>
        </div>
        <button type="button" className="cmy-btn cmy-btn--primary" onClick={() => navigate("/communities/new")}>
          Start one
        </button>
      </header>

      {mine.length > 0 && (
        <section className="cmy-list-section">
          <h2 className="cmy-list-section-title">Your communities</h2>
          <div className="cmy-card-grid">
            {mine.map((c) => (
              <CommunityCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      <section className="cmy-list-section">
        <h2 className="cmy-list-section-title">Browse</h2>
        {loaded && browse.length === 0 && (
          <p className="cmy-muted">No communities to browse yet. Be the first to start one.</p>
        )}
        <div className="cmy-card-grid">
          {browse.map((c) => (
            <CommunityCard key={c.id} c={c} />
          ))}
        </div>
      </section>
    </main>
  );
}

function CommunityCard({ c }: { c: CommunityCardDTO }) {
  return (
    <Link to={`/communities/${c.id}`} className="cmy-card">
      <div
        className="cmy-card-cover"
        data-cat={c.category}
        style={c.coverImage ? { backgroundImage: `url(${c.coverImage})` } : undefined}
      >
        {c.isFounding && <span className="cmy-card-founding">★ Founding</span>}
      </div>
      <div className="cmy-card-body">
        <div className="cmy-card-name">{c.name}</div>
        <div className="cmy-card-meta">
          {COMMUNITY_CATEGORY_LABELS[c.category]} · {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
        </div>
        {c.myRole === "organizer" && <span className="cmy-card-tag">Organizer</span>}
      </div>
    </Link>
  );
}
