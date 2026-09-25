import type { CommunityDTO } from "../types/shared";
import { formatDistance } from "../lib/format";

const ICON_BY_CATEGORY: Record<string, string> = {
  running: "🏃",
  coffee: "☕",
  books: "📚",
  music: "🎶",
  food: "🍳",
  cycling: "🚲",
  art: "🎨",
  social: "🎉",
};

export function CommunityCard({ community }: { community: CommunityDTO }) {
  const distance = formatDistance(community.distanceKm);

  return (
    <article className="place-card">
      <div className="place-card-top">
        <span className="place-icon" aria-hidden="true">
          {ICON_BY_CATEGORY[community.category] ?? "👥"}
        </span>
        <div className="place-card-heading">
          <h3 className="place-card-title">{community.name}</h3>
          <p className="place-card-kind">{community.neighborhood}</p>
        </div>
        {distance ? <span className="distance-pill">{distance}</span> : null}
      </div>

      <p className="place-card-blurb">{community.blurb}</p>

      {community.tags.length > 0 ? (
        <div className="tag-chip-row">
          {community.tags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="place-card-footer">
        <span className="community-meta">{community.cadence}</span>
        <span className="going-count">{community.memberCount.toLocaleString()} members</span>
      </div>
    </article>
  );
}
