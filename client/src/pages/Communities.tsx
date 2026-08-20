import { useEffect, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { CommunityCover } from "../components/CommunityCover";
import { EmptyCard } from "../components/ui";
import {
  ALL_COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LABELS,
  type CommunityCardDTO,
  type CommunityCategory,
  type CommunityDTO,
  type PublicUser,
} from "../types/shared";
import "./Communities.css";

export function CommunitiesPage() {
  const navigate = useNavigate();
  const [mine, setMine] = useState<CommunityCardDTO[]>([]);
  const [all, setAll] = useState<CommunityCardDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [category, setCategory] = useState<CommunityCategory | "all">("all");

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
  const matchesCat = (c: CommunityCardDTO) => category === "all" || c.category === category;
  const mineFiltered = mine.filter(matchesCat);
  const browse = all.filter((c) => !mineIds.has(c.id)).filter(matchesCat);
  const [hero, ...restMine] = mineFiltered;
  const catLabel = category === "all" ? null : COMMUNITY_CATEGORY_LABELS[category];
  const showBrowseEmpty = loaded && browse.length === 0 && mineFiltered.length === 0;
  const showBrowse = browse.length > 0 || showBrowseEmpty;

  function absorbJoin(updated: CommunityCardDTO) {
    setAll((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    if (updated.myMembershipStatus === "active") {
      setMine((prev) => (prev.some((p) => p.id === updated.id) ? prev : [...prev, updated]));
    }
  }

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar cmy-list">
      <header className="cmy-list-masthead">
        <div className="cmy-list-masthead-copy">
          <div className="cmy-list-eyebrow">Philadelphia</div>
          <h1 className="cmy-list-title">Communities</h1>
          <p className="cmy-list-sub">Run clubs, book clubs, and the regulars — find your people.</p>
        </div>
        <button
          type="button"
          className="cmy-btn cmy-btn--primary cmy-list-create"
          onClick={() => navigate("/communities/new")}
        >
          Create a community
        </button>
      </header>

      <div className="cmy-cat-pills" role="tablist" aria-label="Filter by category">
        <button
          type="button"
          role="tab"
          aria-selected={category === "all"}
          className={`cmy-cat-pill ${category === "all" ? "is-active" : ""}`}
          onClick={() => setCategory("all")}
        >
          All
        </button>
        {ALL_COMMUNITY_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={category === cat}
            className={`cmy-cat-pill ${category === cat ? "is-active" : ""}`}
            onClick={() => setCategory(cat)}
          >
            {COMMUNITY_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {hero && (
        <section className="cmy-list-section">
          <h2 className="cmy-list-section-title">Your communities</h2>
          <CommunityHeroCard c={hero} />
          {restMine.length > 0 && (
            <ul className="cmy-row-list">
              {restMine.map((c) => (
                <li key={c.id}>
                  <CommunityRowCard c={c} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {showBrowse && (
      <section className="cmy-list-section">
        <h2 className="cmy-list-section-title">
          {catLabel ? `Browse · ${catLabel}` : "Browse"}
        </h2>
        {showBrowseEmpty && (
          <EmptyCard
            icon={<Users size={22} strokeWidth={1.6} color="#3A6A3A" />}
            tint="#C8DDC8"
            title={
              catLabel
                ? `No ${catLabel.toLowerCase()} communities yet.`
                : "No communities to browse yet."
            }
            body={
              catLabel
                ? "Try another category, or create one for this scene."
                : "Be the first to create a community — run clubs, book clubs, and the regulars."
            }
            cta={{ to: "/communities/new", label: "Create a community" }}
          />
        )}
        {browse.length > 0 && (
          <ul className="cmy-browse-list">
            {browse.map((c) => (
              <li key={c.id}>
                <CommunityBrowseRow c={c} onJoined={absorbJoin} />
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
    </main>
  );
}

function memberMeta(c: CommunityCardDTO) {
  return `${COMMUNITY_CATEGORY_LABELS[c.category]} · ${c.memberCount} ${c.memberCount === 1 ? "member" : "members"}`;
}

function OrganizerAvatar({ user, size = "xs" }: { user: PublicUser; size?: "xs" | "sm" }) {
  return (
    <Avatar
      seed={user.avatarSeed}
      style={user.avatarStyle}
      photoDataUrl={user.avatarPhotoDataUrl}
      params={user.avatarParams}
      name={user.firstName}
      size={size}
    />
  );
}

function CommunityHeroCard({ c }: { c: CommunityCardDTO }) {
  return (
    <Link to={`/communities/${c.id}`} className="cmy-hero">
      <CommunityCover coverImage={c.coverImage} category={c.category} className="cmy-hero-cover" iconSize={40} />
      <div className="cmy-hero-shade" aria-hidden="true" />
      <span className="cmy-joined-pill">Joined</span>
      <div className="cmy-hero-foot">
        <span className="cmy-hero-avatar">
          <OrganizerAvatar user={c.organizer} size="sm" />
        </span>
        <div className="cmy-hero-copy">
          <div className="cmy-hero-name">
            {c.name}
            {c.isFounding ? <span className="cmy-hero-founding">Founding</span> : null}
          </div>
          <div className="cmy-hero-meta">{memberMeta(c)}</div>
        </div>
      </div>
    </Link>
  );
}

function CommunityRowCard({ c }: { c: CommunityCardDTO }) {
  return (
    <Link to={`/communities/${c.id}`} className="cmy-row">
      <span className="cmy-row-thumb">
        <CommunityCover coverImage={c.coverImage} category={c.category} iconSize={20} />
        <span className="cmy-row-avatar">
          <OrganizerAvatar user={c.organizer} />
        </span>
      </span>
      <span className="cmy-row-info">
        <span className="cmy-row-name">{c.name}</span>
        <span className="cmy-row-meta">{memberMeta(c)}</span>
      </span>
      <span className="cmy-joined-pill cmy-joined-pill--quiet">Joined</span>
    </Link>
  );
}

function CommunityBrowseRow({
  c,
  onJoined,
}: {
  c: CommunityCardDTO;
  onJoined: (updated: CommunityCardDTO) => void;
}) {
  return (
    <Link to={`/communities/${c.id}`} className="cmy-browse">
      <span className="cmy-browse-thumb">
        <CommunityCover coverImage={c.coverImage} category={c.category} iconSize={18} />
        <span className="cmy-row-avatar">
          <OrganizerAvatar user={c.organizer} />
        </span>
      </span>
      <span className="cmy-row-info">
        <span className="cmy-row-name">{c.name}</span>
        <span className="cmy-row-meta">{memberMeta(c)}</span>
      </span>
      <CommunityJoinLink c={c} onJoined={onJoined} />
    </Link>
  );
}

/** Plain red “Join →” text — auto-joins instantly-joinable communities;
 *  screened ones route through to the full request flow. */
function CommunityJoinLink({ c, onJoined }: { c: CommunityCardDTO; onJoined: (updated: CommunityCardDTO) => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const status = c.myMembershipStatus;

  if (status === "active") return <span className="cmy-joined-pill cmy-joined-pill--quiet">Joined</span>;
  if (status === "pending") {
    return (
      <span className="cmy-browse-join cmy-browse-join--pending" onClick={(e) => e.preventDefault()}>
        Requested
      </span>
    );
  }

  async function handleClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (c.hasScreening) {
      navigate(`/communities/${c.id}`);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const updated = await api<CommunityDTO>(`/api/communities/${c.id}/join`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const nextStatus = updated.myMembership?.status ?? "active";
      onJoined({
        ...c,
        myMembershipStatus: nextStatus,
        myRole: nextStatus === "active" ? "member" : c.myRole,
        memberCount: nextStatus === "active" ? c.memberCount + 1 : c.memberCount,
      });
    } catch {
      /* card CTA fails quietly — the full community page has the real error state */
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="cmy-browse-join" disabled={busy} onClick={handleClick}>
      {busy ? "…" : c.hasScreening ? "Request →" : "Join →"}
    </button>
  );
}
