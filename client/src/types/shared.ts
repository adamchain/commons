export type PlanTag = "coffee" | "workout" | "social" | "outdoors" | "events";
export type ParticipationState = "interested" | "going";

export interface PlanDTO {
  id: string;
  title: string;
  creator: { id: string; displayName: string };
  location: { name: string; address: string };
  date: string;
  time: string;
  isFlexibleTime: boolean;
  tags: PlanTag[];
  description?: string;
  participants: {
    going: Array<{ id: string; displayName: string }>;
    interested: Array<{ id: string; displayName: string }>;
  };
  myState: ParticipationState | null;
}

// ---------- Explore: nearby places & communities ----------
// Venues are fetched live from OpenStreetMap (Overpass) on the client.
// Communities are curated/seeded on the server (they don't exist in OSM).

export type VenueCategory =
  | "cafe"
  | "bar"
  | "restaurant"
  | "gym"
  | "park"
  | "market"
  | "culture";

export type CommunityCategory =
  | "running"
  | "coffee"
  | "books"
  | "music"
  | "food"
  | "cycling"
  | "art"
  | "social";

export interface VenueDTO {
  id: string;
  name: string;
  category: VenueCategory;
  address: string;
  lat: number;
  lng: number;
  blurb: string;
  tags: string[];
  hours?: string;
  distanceKm: number | null;
}

export interface CommunityDTO {
  id: string;
  name: string;
  category: CommunityCategory;
  neighborhood: string;
  blurb: string;
  cadence: string;
  memberCount: number;
  tags: string[];
  link?: string;
  distanceKm: number | null;
}
