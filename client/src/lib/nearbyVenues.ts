import type { VenueCategory, VenueDTO } from "../types/shared";
import { haversineKm, type Coords } from "./geo";

// Live venue discovery via the OpenStreetMap Overpass API. This mirrors the
// app's existing approach of querying OSM (Nominatim) directly from the
// browser — no API key, no server round-trip.

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

export interface VenueCategoryMeta {
  key: VenueCategory;
  label: string;
  icon: string;
}

export const VENUE_CATEGORIES: VenueCategoryMeta[] = [
  { key: "cafe", label: "Cafés", icon: "☕" },
  { key: "restaurant", label: "Eats", icon: "🍽️" },
  { key: "bar", label: "Bars", icon: "🍻" },
  { key: "gym", label: "Fitness", icon: "🏋️" },
  { key: "park", label: "Parks", icon: "🌳" },
  { key: "market", label: "Markets", icon: "🛒" },
  { key: "culture", label: "Culture", icon: "🎭" },
];

// OSM tag selectors that make up each of our categories. Order matters for
// categorize(): the first match wins.
const CATEGORY_SELECTORS: Array<{ category: VenueCategory; selector: string }> = [
  { category: "cafe", selector: '["amenity"="cafe"]' },
  { category: "bar", selector: '["amenity"~"^(bar|pub|biergarten)$"]' },
  { category: "restaurant", selector: '["amenity"~"^(restaurant|fast_food)$"]' },
  { category: "gym", selector: '["leisure"~"^(fitness_centre|sports_centre)$"]' },
  { category: "park", selector: '["leisure"~"^(park|garden)$"]' },
  { category: "market", selector: '["shop"="supermarket"]' },
  { category: "market", selector: '["amenity"="marketplace"]' },
  {
    category: "culture",
    selector: '["amenity"~"^(theatre|cinema|arts_centre|library|community_centre)$"]',
  },
  { category: "culture", selector: '["tourism"="museum"]' },
];

interface OverpassTags {
  [key: string]: string | undefined;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OverpassTags;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

function buildQuery(origin: Coords, radiusM: number): string {
  const around = `(around:${radiusM},${origin.lat},${origin.lng})`;
  const parts = CATEGORY_SELECTORS.map((c) => `nwr${c.selector}${around};`).join("\n  ");
  return `[out:json][timeout:25];\n(\n  ${parts}\n);\nout center tags 120;`;
}

function categorize(tags: OverpassTags): VenueCategory | null {
  const amenity = tags.amenity ?? "";
  const leisure = tags.leisure ?? "";
  if (amenity === "cafe") return "cafe";
  if (/^(bar|pub|biergarten)$/.test(amenity)) return "bar";
  if (/^(restaurant|fast_food)$/.test(amenity)) return "restaurant";
  if (/^(fitness_centre|sports_centre)$/.test(leisure)) return "gym";
  if (/^(park|garden)$/.test(leisure)) return "park";
  if (tags.shop === "supermarket" || amenity === "marketplace") return "market";
  if (/^(theatre|cinema|arts_centre|library|community_centre)$/.test(amenity)) return "culture";
  if (tags.tourism === "museum") return "culture";
  return null;
}

function titleCase(value: string): string {
  return value
    .replace(/[_;]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function buildAddress(tags: OverpassTags): string {
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const parts = [street, tags["addr:city"], tags["addr:state"]].filter(Boolean);
  return parts.join(", ");
}

function buildBlurb(category: VenueCategory, tags: OverpassTags): string {
  const cuisine = tags.cuisine ? titleCase(tags.cuisine.split(";")[0]!) : "";
  switch (category) {
    case "cafe":
      return cuisine ? `${cuisine} café & coffee` : "Local coffee spot";
    case "restaurant":
      return cuisine ? `${cuisine} restaurant` : "Restaurant nearby";
    case "bar":
      return tags.amenity === "pub" ? "Neighborhood pub" : "Bar & drinks";
    case "gym":
      return "Fitness & training";
    case "park":
      return "Green space to gather";
    case "market":
      return tags.amenity === "marketplace" ? "Open-air market" : "Grocery & market";
    case "culture": {
      const kind = tags.tourism === "museum" ? "museum" : tags.amenity ?? "venue";
      return `Cultural spot · ${titleCase(kind)}`;
    }
    default:
      return "Spot nearby";
  }
}

function extractTags(tags: OverpassTags): string[] {
  const out: string[] = [];
  if (tags.cuisine) {
    tags.cuisine
      .split(";")
      .slice(0, 2)
      .forEach((c) => out.push(titleCase(c)));
  }
  if (tags.outdoor_seating === "yes") out.push("outdoor seating");
  if (tags.internet_access === "wlan" || tags.internet_access === "yes") out.push("wifi");
  if (tags.takeaway === "yes") out.push("takeout");
  if (tags.dog === "yes" || tags.dog === "leashed") out.push("dog-friendly");
  if (tags.organic === "yes" || tags.organic === "only") out.push("organic");
  if (tags.wheelchair === "yes") out.push("accessible");
  return [...new Set(out)].slice(0, 3);
}

/**
 * Fetch named venues around a point from OpenStreetMap, mapped to VenueDTOs
 * and sorted nearest-first. Unnamed and uncategorizable elements are dropped.
 */
export async function fetchNearbyVenues(
  origin: Coords,
  radiusM = 1500,
  signal?: AbortSignal
): Promise<VenueDTO[]> {
  const body = `data=${encodeURIComponent(buildQuery(origin, radiusM))}`;
  const response = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal,
  });
  if (!response.ok) {
    throw new Error(`Overpass request failed (${response.status})`);
  }
  const data = (await response.json()) as OverpassResponse;

  const seen = new Set<string>();
  const venues: VenueDTO[] = [];

  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    if (!name) continue;

    const category = categorize(tags);
    if (!category) continue;

    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") continue;

    // De-duplicate places that appear under multiple selectors / by name+spot.
    const dedupeKey = `${name.toLowerCase()}|${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    venues.push({
      id: `${el.type}/${el.id}`,
      name,
      category,
      address: buildAddress(tags),
      lat,
      lng,
      blurb: buildBlurb(category, tags),
      tags: extractTags(tags),
      hours: tags.opening_hours,
      distanceKm: haversineKm(origin, { lat, lng }),
    });
  }

  venues.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  return venues;
}
