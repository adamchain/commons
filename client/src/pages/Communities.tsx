import { useEffect, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
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
  communityCategoryLine,
  communityRequiresJoinApproval,
  type CommunityCardDTO,
  type CommunityCategory,
  type CommunityDTO,
  type PublicUser,
} from "../types/shared";
import "./Communities.css";

const COMMUNITY_PAGE = 10;

export function CommunitiesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [all, setAll] = useState<CommunityCardDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [category, setCategory] = useState<CommunityCategory | "all">("all");
  const [joinConfirm, setJoinConfirm] = useState(false);
  const [shown, setShown] = useState(COMMUNITY_PAGE);

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

  const matchesCat = (c: CommunityCardDTO) =>
    category === "all" || communityCategoriesOf(c).includes(category);
  const browse = all.filter(matchesCat);
  const visible = browse.slice(0, shown);
  const hero = visible[0] ?? null;
  const rest = visible.slice(1);
  const hasMore = browse.length > shown;
  const catLabel = category === "all" ? null : COMMUNITY_CATEGORY_LABELS[category];
  const showBrowseEmpty = loaded && browse.length === 0;

  function absorbJoin(updated: CommunityCardDTO) {
    setAll((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    if (updated.myMembershipStatus === "active") setJoinConfirm(true);
  }

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar cmy-list">
      <header className="cmy-list-masthead">
        <div className="cmy-list-masthead-copy">
          <h1 className="cmy-list-title">Communities</h1>
        </div>
        <button
          type="button"
          className="cmy-btn cmy-btn--primary cmy-list-create"
          onClick={() => navigate("/communities/new")}
        >
          Create a Community
        </button>
      </header>
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
          onClick={() => {
            setCategory("all");
            setShown(COMMUNITY_PAGE);
          }}
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
            onClick={() => {
              setCategory(cat);
              setShown(COMMUNITY_PAGE);
            }}
          >
            {COMMUNITY_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <section className="cmy-list-section">
        {hero && <CommunityHeroCard c={hero} onJoined={absorbJoin} />}
        <h2 className="cmy-list-section-title">
          {catLabel ? `Browse · ${catLabel}` : "Browse"}
        </h2>
        {showBrowseEmpty && (
          <EmptyCard
            icon={<Users size={22} strokeWidth={1.6} color="#3A6A3A" />}
            tint="#C8DDC8"
            title={
              catLabel
                ? `Quiet on ${catLabel.toLowerCase()}.`
                : "Nobody's started one yet."
            }
            body={
              catLabel
                ? "Try another category, or start this scene."
                : "Run clubs, book clubs, the regulars — go first."
            }
            cta={{ to: "/communities/new", label: "Create a community" }}
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
          <button
            type="button"
            className="cmy-btn cmy-btn--ghost cmy-list-more"
            onClick={() => setShown((n) => n + COMMUNITY_PAGE)}
          >
            Keep scrolling
          </button>
        )}
      </section>
      {joinConfirm && <JoinConfirmPopup kind="community" onClose={() => setJoinConfirm(false)} />}
    </main>
  );
}

function memberCountLabel(c: CommunityCardDTO) {
  return `${c.memberCount} ${c.memberCount === 1 ? "member" : "members"}`;
}

function categoryLine(c: CommunityCardDTO): string {
  return communityCategoryLine(c);
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
          <p className="cmy-hero-cats">{categoryLine(c)}</p>
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
        <span className="cmy-compact-cats">{categoryLine(c)}</span>
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
