import { useEffect, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Users } from "lucide-react";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { CommunityCover } from "../components/CommunityCover";
import { JoinConfirmPopup } from "../components/JoinConfirmPopup";
import { PhotoHero } from "../components/PhotoHero";
import { EmptyCard, Label } from "../components/ui";
import { HERO_PHOTO, PLACE_CATEGORIES, PLACE_TILES } from "../lib/placePhotos";
import { communityCategoryLine, communityRequiresJoinApproval, type CommunityCardDTO, type CommunityDTO } from "../types/shared";

export function ExplorePage() {
  const navigate = useNavigate();
  const [communities, setCommunities] = useState<CommunityCardDTO[]>([]);
  const [loadedComm, setLoadedComm] = useState(false);
  const [activeCat, setActiveCat] = useState<string>(PLACE_CATEGORIES[0]);
  const [joinConfirm, setJoinConfirm] = useState(false);

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
    <main className="app-shell app-shell--wide app-shell--with-nav xpl">
      <PhotoHero
        photo={HERO_PHOTO}
        eyebrow="Philadelphia"
        title="Explore"
        topRight={
          <Link to="/search" className="xpl-hero-search">
            <Search size={11} strokeWidth={2} aria-hidden="true" />
            <span>Search</span>
          </Link>
        }
      />

      {/* Communities — the one live Explore element at launch */}
      <section className="xpl-communities" aria-label="Communities">
        <div className="xpl-section-head">
          <div className="xpl-section-head-text">
            <Label>Communities</Label>
            <h2 className="xpl-section-title">Find your people</h2>
          </div>
          <Link to="/communities" className="xpl-see-all">
            See all →
          </Link>
        </div>
        {communities.length > 0 ? (
          <ul className="xpl-comm-list">
            {communities.slice(0, 5).map((c, i) => (
              <li key={c.id} className="xpl-comm-row-wrap">
                <Link to={`/communities/${c.id}`} state={{ from: "explore" }} className="xpl-comm-row">
                  <span className="xpl-comm-num">{String(i + 1).padStart(2, "0")}</span>
                  <div className="xpl-comm-thumb">
                    <CommunityCover coverImage={c.coverImage} category={c.category} iconSize={18} />
                    <span className="xpl-comm-avatar">
                      <Avatar
                        seed={c.organizer.avatarSeed}
                        style={c.organizer.avatarStyle}
                        photoDataUrl={c.organizer.avatarPhotoDataUrl}
                        params={c.organizer.avatarParams}
                        name={c.organizer.firstName}
                        size="xs"
                      />
                    </span>
                  </div>
                  <div className="xpl-comm-info">
                    <div className="xpl-comm-name">
                      {c.name}
                      {c.isFounding ? <span className="xpl-comm-founding">Founding</span> : null}
                    </div>
                    <div className="xpl-comm-sub">
                      {communityCategoryLine(c)} · {c.memberCount}{" "}
                      {c.memberCount === 1 ? "member" : "members"}
                    </div>
                  </div>
                  <CommunityJoinCta
                    community={c}
                    onJoined={(updated) => {
                      setCommunities((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                      if (updated.myMembershipStatus === "active") setJoinConfirm(true);
                    }}
                    onRequest={() => navigate(`/communities/${c.id}`, { state: { from: "explore" } })}
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : loadedComm ? (
          <EmptyCard
            className="xpl-comm-empty-card"
            icon={<Users size={22} strokeWidth={1.6} color="#3A6A3A" />}
            tint="#C8DDC8"
            title="It's quiet in here."
            body="Start a community and see who shows."
            cta={{ to: "/communities/new", label: "Create a community" }}
          />
        ) : null}
      </section>

      {/* Places — coming soon editorial grid */}
      <section className="xpl-places" aria-label="Places">
        <div className="xpl-section-head">
          <div className="xpl-section-head-text">
            <Label>
              Places <span className="xpl-coming-soon">COMING SOON</span>
            </Label>
            <h2 className="xpl-section-title">
              Browse spots.
              <br />
              Make plans there.
            </h2>
          </div>
        </div>

        <div className="xpl-cat-pills" role="tablist" aria-label="Place categories">
          {PLACE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={activeCat === cat}
              className={`xpl-cat-pill ${activeCat === cat ? "is-active" : ""}`}
              onClick={() => setActiveCat(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="xpl-photo-grid" aria-label="Browse by category">
          {PLACE_TILES.map((tile) => (
            <div
              key={tile.label}
              className={`xpl-photo-tile ${activeCat === tile.label ? "is-active" : ""}`}
            >
              <img src={tile.photo} alt="" loading="lazy" />
              <div className="xpl-photo-tile-overlay" aria-hidden="true" />
              <span className="xpl-photo-tile-label">{tile.label}</span>
            </div>
          ))}
        </div>

        <Link to="/plans/new" className="xpl-places-cta">
          Post a plan now
        </Link>
      </section>
      {joinConfirm && <JoinConfirmPopup kind="community" onClose={() => setJoinConfirm(false)} />}
    </main>
  );
}

/** Compact join CTA — auto-joins instantly-joinable communities inline;
 *  screened ones route through to the full request flow. */
function CommunityJoinCta({
  community,
  onJoined,
  onRequest,
}: {
  community: CommunityCardDTO;
  onJoined: (updated: CommunityCardDTO) => void;
  onRequest: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const status = community.myMembershipStatus;

  if (status === "active") {
    return <span className="xpl-comm-tag xpl-comm-joined">Joined</span>;
  }
  if (status === "pending") {
    return (
      <span
        className="xpl-comm-tag xpl-comm-join--pending"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        Requested
      </span>
    );
  }

  async function handleClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (community.hasScreening) {
      onRequest();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const updated = await api<CommunityDTO>(`/api/communities/${community.id}/join`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const nextStatus = updated.myMembership?.status ?? "active";
      onJoined({
        ...community,
        myMembershipStatus: nextStatus,
        memberCount: nextStatus === "active" ? community.memberCount + 1 : community.memberCount,
      });
    } catch {
      /* rail CTA fails quietly — the full community page has the real error state */
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="xpl-comm-tag xpl-comm-join" disabled={busy} onClick={handleClick}>
      {busy ? "…" : communityRequiresJoinApproval(community) ? "Request" : "Join"}
    </button>
  );
}
