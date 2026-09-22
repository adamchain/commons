import { useEffect, useState, type MouseEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Search, Users } from "lucide-react";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { CommunityCover } from "../components/CommunityCover";
import { CommunityStatusPill } from "../components/CommunityStatusPill";
import { JoinConfirmPopup } from "../components/JoinConfirmPopup";
import { EmptyCard } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import {
  ALL_COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LABELS,
  communityCategoriesOf,
  communityRequiresJoinApproval,
  type CommunityCardDTO,
  type CommunityCategory,
  type CommunityDTO,
  type PublicUser,
} from "../types/shared";
import "./Communities.css";

const COMMUNITY_PAGE = 10;

function readCategory(raw: string | null): CommunityCategory | "all" {
  if (raw && (ALL_COMMUNITY_CATEGORIES as string[]).includes(raw)) return raw as CommunityCategory;
  return "all";
}

export function CommunitiesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const directory = searchParams.get("view") === "all";
  const [all, setAll] = useState<CommunityCardDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [category, setCategory] = useState<CommunityCategory | "all">(() =>
    readCategory(searchParams.get("category")),
  );
  const [joinConfirm, setJoinConfirm] = useState(false);
  const [shown, setShown] = useState(COMMUNITY_PAGE);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const a = await api<{ communities: CommunityCardDTO[] }>("/api/communities");
        if (!live) return;
        setAll(a.communities);
      } finally {
        if (live) setLoaded(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const matchesCat = (c: CommunityCardDTO) =>
    category === "all" || communityCategoriesOf(c).includes(category);
  const matchesQuery = (c: CommunityCardDTO) => {
    if (!q) return true;
    const hay = [
      c.name,
      c.organizer.firstName,
      ...communityCategoriesOf(c).map((cat) => COMMUNITY_CATEGORY_LABELS[cat]),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  };
  const browse = all.filter((c) => matchesCat(c) && matchesQuery(c));
  const visible = directory ? browse : browse.slice(0, shown);
  const hero = visible[0] ?? null;
  const rest = visible.slice(1);
  const hasMore = !directory && browse.length > shown;
  const catLabel = category === "all" ? null : COMMUNITY_CATEGORY_LABELS[category];
  const showBrowseEmpty = loaded && browse.length === 0;
  const searching = q.length > 0;
  const seeAllTo =
    category === "all" ? "/communities?view=all" : `/communities?view=all&category=${category}`;

  function selectCategory(next: CommunityCategory | "all") {
    setCategory(next);
    setShown(COMMUNITY_PAGE);
  }

  function absorbJoin(updated: CommunityCardDTO) {
    setAll((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    if (updated.myMembershipStatus === "active") setJoinConfirm(true);
  }

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar cmy-list">
      <header className="cmy-list-masthead">
        {directory && (
          <Link to="/communities" className="back-circle" aria-label="Back to communities">
            <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
        )}
        <div className="cmy-list-masthead-copy">
          <h1 className="cmy-list-title">{directory ? "All communities" : "Communities"}</h1>
        </div>
        <button
          type="button"
          className="cmy-btn cmy-btn--primary cmy-list-create"
          onClick={() => navigate("/communities/new")}
        >
          <Plus size={15} strokeWidth={2.4} aria-hidden="true" />
          Create
        </button>
      </header>
      <div className="network-search-wrap cmy-search">
        <Search size={16} strokeWidth={1.8} aria-hidden="true" />
        <input
          className="network-search-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(COMMUNITY_PAGE);
          }}
          placeholder="Search communities…"
          aria-label="Search communities"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          className={`network-search-clear${query ? " is-on" : ""}`}
          onClick={() => {
            setQuery("");
            setShown(COMMUNITY_PAGE);
          }}
          aria-label="Clear search"
          tabIndex={query ? 0 : -1}
        >
          ×
        </button>
      </div>
      <div className="cmy-cat-pills">
        {user && (
          <Link
            to={`/profile/${user.id}#communities`}
            className="cmy-cat-pill cmy-cat-pill--yours"
          >
            Your communities
          </Link>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={category === "all"}
          className={`cmy-cat-pill ${category === "all" ? "is-active" : ""}`}
          onClick={() => selectCategory("all")}
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
            onClick={() => selectCategory(cat)}
          >
            {COMMUNITY_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <section className="cmy-list-section">
        {hero && <CommunityHeroCard c={hero} onJoined={absorbJoin} />}
        {(searching || catLabel) && (
          <h2 className="cmy-list-section-title">
            {searching ? "Results" : `Browse · ${catLabel}`}
          </h2>
        )}
        {showBrowseEmpty && (
          <EmptyCard
            icon={<Users size={22} strokeWidth={1.6} color="#3A6A3A" />}
            tint="#C8DDC8"
            title={
              searching
                ? "No communities match."
                : catLabel
                  ? `Quiet on ${catLabel.toLowerCase()}.`
                  : "Nobody's started one yet."
            }
            body={
              searching
                ? "Try a different name."
                : catLabel
                  ? "Try another category, or start this scene."
                  : "Run clubs, book clubs, the regulars — go first."
            }
            cta={searching ? undefined : { to: "/communities/new", label: "Create a community" }}
          />
        )}
        {rest.length > 0 && (
          <div className="cmy-compact-list">
            {rest.map((c) => (
              <CommunityCompactCard key={c.id} c={c} onJoined={absorbJoin} />
            ))}
          </div>
        )}
        {hasMore && (
          <div className="cmy-list-gate">
            <p className="cmy-list-gate-copy">
              Showing {Math.min(shown, browse.length)} of {browse.length}.
            </p>
            <div className="cmy-list-gate-actions">
              <Link to={seeAllTo} className="cmy-btn cmy-btn--primary">
                {catLabel ? `See all ${catLabel}` : "See all communities"}
              </Link>
              <button
                type="button"
                className="cmy-btn cmy-btn--ghost cmy-list-more"
                onClick={() => setShown((n) => n + COMMUNITY_PAGE)}
              >
                Keep scrolling
              </button>
            </div>
          </div>
        )}
      </section>
      {joinConfirm && <JoinConfirmPopup kind="community" onClose={() => setJoinConfirm(false)} />}
    </main>
  );
}

function memberCountLabel(c: CommunityCardDTO) {
  return `${c.memberCount} ${c.memberCount === 1 ? "member" : "members"}`;
}

function MemberFacepile({ people }: { people: PublicUser[] }) {
  if (people.length === 0) return null;
  return (
    <span className="cmy-header-avatars">
      {people.slice(0, 3).map((u) => (
        <Avatar
          key={u.id}
          seed={u.avatarSeed}
          style={u.avatarStyle}
          photoDataUrl={u.avatarPhotoDataUrl}
          params={u.avatarParams}
          name={u.firstName}
          size="xs"
        />
      ))}
    </span>
  );
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

function CommunityHeroCard({
  c,
  onJoined,
}: {
  c: CommunityCardDTO;
  onJoined: (updated: CommunityCardDTO) => void;
}) {
  return (
    <Link to={`/communities/${c.id}`} className="cmy-hero">
      <CommunityCover
        coverImage={c.coverImage}
        category={c.category}
        className="cmy-hero-cover"
        iconSize={40}
      />
      <div className="cmy-hero-shade" aria-hidden="true" />
      {c.isFounding ? <span className="cmy-hero-founding">Founding</span> : null}
      <div className="cmy-hero-foot">
        <div className="cmy-hero-copy">
          <div className="cmy-hero-organizer">
            <span className="cmy-hero-avatar">
              <OrganizerAvatar user={c.organizer} size="sm" />
            </span>
            <span className="cmy-hero-org-name">{c.organizer.firstName}</span>
          </div>
          <h3 className="cmy-hero-name">{c.name}</h3>
          <div className="cmy-hero-members">
            <MemberFacepile people={c.memberPreview ?? []} />
            <span className="cmy-hero-count">{memberCountLabel(c)}</span>
            <CommunityJoinLink c={c} onJoined={onJoined} />
          </div>
        </div>
      </div>
    </Link>
  );
}

function CommunityCompactCard({
  c,
  onJoined,
}: {
  c: CommunityCardDTO;
  onJoined?: (updated: CommunityCardDTO) => void;
}) {
  return (
    <Link to={`/communities/${c.id}`} className="cmy-compact">
      <span className="cmy-compact-thumb">
        <CommunityCover coverImage={c.coverImage} category={c.category} iconSize={22} />
      </span>
      <span className="cmy-compact-body">
        <span className="cmy-compact-org">
          <span className="cmy-compact-org-avatar">
            <OrganizerAvatar user={c.organizer} />
          </span>
          <span className="cmy-compact-org-name">{c.organizer.firstName}</span>
        </span>
        <span className="cmy-compact-title">{c.name}</span>
        <span className="cmy-compact-footer">
          <span className="cmy-compact-members">
            <MemberFacepile people={c.memberPreview ?? []} />
            <span className="cmy-feed-count">{memberCountLabel(c)}</span>
          </span>
          {onJoined ? (
            <CommunityJoinLink c={c} onJoined={onJoined} />
          ) : (
            <CommunityStatusPill status={c.myMembershipStatus} />
          )}
        </span>
      </span>
    </Link>
  );
}

/** Instant-joins public communities. Private and screened ones request approval. */
function CommunityJoinLink({ c, onJoined }: { c: CommunityCardDTO; onJoined: (updated: CommunityCardDTO) => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const status = c.myMembershipStatus;

  if (status === "active" || status === "pending") {
    return <CommunityStatusPill status={status} />;
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
    <button type="button" className="cmy-joined-pill cmy-joined-pill--quiet cmy-compact-join" disabled={busy} onClick={handleClick}>
      {busy ? "…" : communityRequiresJoinApproval(c) ? "Request" : "Join"}
    </button>
  );
}
