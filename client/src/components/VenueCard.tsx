import { Link } from "react-router-dom";
import type { VenueDTO } from "../types/shared";
import { formatDistance } from "../lib/format";
import { VENUE_CATEGORIES } from "../lib/nearbyVenues";

const ICON_BY_CATEGORY = Object.fromEntries(
  VENUE_CATEGORIES.map((c) => [c.key, c.icon])
) as Record<string, string>;

const LABEL_BY_CATEGORY = Object.fromEntries(
  VENUE_CATEGORIES.map((c) => [c.key, c.label])
) as Record<string, string>;

export function VenueCard({ venue }: { venue: VenueDTO }) {
  const distance = formatDistance(venue.distanceKm);
  const mapUrl = `https://www.openstreetmap.org/?mlat=${venue.lat}&mlon=${venue.lng}#map=18/${venue.lat}/${venue.lng}`;

  return (
    <article className="place-card">
      <div className="place-card-top">
        <span className="place-icon" aria-hidden="true">
          {ICON_BY_CATEGORY[venue.category] ?? "📍"}
        </span>
        <div className="place-card-heading">
          <h3 className="place-card-title">{venue.name}</h3>
          <p className="place-card-kind">
            {LABEL_BY_CATEGORY[venue.category] ?? venue.category} · {venue.blurb}
          </p>
        </div>
        {distance ? <span className="distance-pill">{distance}</span> : null}
      </div>

      {venue.address ? <p className="place-card-address">{venue.address}</p> : null}
      {venue.hours ? <p className="place-card-hours">🕑 {venue.hours}</p> : null}

      {venue.tags.length > 0 ? (
        <div className="tag-chip-row">
          {venue.tags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="place-card-actions">
        <Link
          to="/plans/new"
          state={{ location: { name: venue.name, address: venue.address || venue.name } }}
          className="btn btn-primary btn-sm"
        >
          Plan something here
        </Link>
        <a className="place-card-maplink" href={mapUrl} target="_blank" rel="noreferrer">
          View map →
        </a>
      </div>
    </article>
  );
}
