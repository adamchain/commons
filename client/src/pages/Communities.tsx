import { useEffect, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { CommunityCover } from "../components/CommunityCover";
import { JoinConfirmPopup } from "../components/JoinConfirmPopup";
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
  const [joinConfirm, setJoinConfirm] = useState(false);

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
  const catLabel = category === "all" ? null : COMMUNITY_CATEGORY_LABELS[category];
  const showBrowseEmpty = loaded && browse.length === 0 && mineFiltered.length === 0;
  const showBrowse = browse.length > 0 || showBrowseEmpty;

  function absorbJoin(updated: CommunityCardDTO) {
    setAll((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    if (updated.myMembershipStatus === "active") {
      setMine((prev) => (prev.some((p) => p.id === updated.id) ? prev : [...prev, updated]));
      setJoinConfirm(true);
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

      {mineFiltered.length > 0 && (
        <section className="cmy-list-section">
          <h2 className="cmy-list-section-title">Your communities</h2>
          <div className="cmy-feed-grid">
            {mineFiltered.map((c) => (
              <CommunityFeedCard key={c.id} c={c} />
            ))}
          </div>
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
          <div className="cmy-feed-grid">
            {browse.map((c) => (
              <CommunityFeedCard key={c.id} c={c} onJoined={absorbJoin} />
            ))}
          </div>
        )}
      </section>
      )}
      {joinConfirm && <JoinConfirmPopup kind="community" onClose={() => setJoinConfirm(false)} />}
    </main>
  );
}

function memberCountLabel(c: CommunityCardDTO) {
  return `${c.memberCount} ${c.memberCount === 1 ? "member" : "members"}`;
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

function CommunityFeedCard({
  c,
  onJoined,
}: {
  c: CommunityCardDTO;
  onJoined?: (updated: CommunityCardDTO) => void;
}) {
  const joined = c.myMembershipStatus === "active";
  return (
    <div className="cmy-feed-card">
      <Link to={`/communities/${c.id}`} className="cmy-feed-card-link">
        <div className="cmy-feed-cover">
          <CommunityCover
            coverImage={c.coverImage}
            category={c.category}
            className="cmy-feed-cover-fill"
            iconSize={40}
          />
        </div>
        <div className="cmy-feed-body">
          <header className="cmy-feed-poster">
            <OrganizerAvatar user={c.organizer} />
            <span className="cmy-feed-posted-by">{c.organizer.firstName}</span>
            {c.isFounding ? <span className="cmy-feed-founding">Founding</span> : null}
            {joined ? <span className="cmy-joined-pill cmy-joined-pill--quiet">Joined</span> : null}
          </header>
          <h3 className="cmy-feed-title">{c.name}</h3>
          <p className="cmy-feed-meta">{COMMUNITY_CATEGORY_LABELS[c.category]}</p>
          <footer className="cmy-feed-footer">
            <span className="cmy-feed-count">{memberCountLabel(c)}</span>
            {!joined && onJoined ? <CommunityJoinLink c={c} onJoined={onJoined} /> : null}
          </footer>
        </div>
      </Link>
    </div>
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
      <span
        className="cmy-feed-join cmy-feed-join--pending"
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
    <button type="button" className="cmy-feed-join" disabled={busy} onClick={handleClick}>
      {busy ? "…" : c.hasScreening ? "Request" : "Join"}
    </button>
  );
}
