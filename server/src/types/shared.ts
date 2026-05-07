// Commons v2 shared types — kept in sync between client/src/types/shared.ts
// and server/src/types/shared.ts. Edit both when changing.

/** Community interest filters — Philly launch set (COMMONS-seeded). */
export type InterestTag =
  | "fitness_outdoors"
  | "food_drinks"
  | "arts_culture"
  | "music_nightlife"
  | "thrifting"
  | "local_events"
  | "wellness"
  | "coffee_cowork"
  | "dog_owners"
  | "running";

export const INTEREST_LABELS: Record<InterestTag, string> = {
  fitness_outdoors: "Fitness + Outdoors",
  food_drinks: "Food + Drinks",
  arts_culture: "Arts + Culture",
  music_nightlife: "Music + Nightlife",
  thrifting: "Thrifting",
  local_events: "Local Events",
  wellness: "Wellness",
  coffee_cowork: "Coffee + Co-working",
  dog_owners: "Dog owners",
  running: "Running",
};

export const ALL_INTERESTS: InterestTag[] = [
  "fitness_outdoors",
  "food_drinks",
  "arts_culture",
  "music_nightlife",
  "thrifting",
  "local_events",
  "wellness",
  "coffee_cowork",
  "dog_owners",
  "running",
];

export const VIBE_TAGS = ALL_INTERESTS;

export type PlanKind = "standard" | "looking_for";

export type PlanVisibility = "everyone" | "community" | "network";

export type ParticipationState = "interested" | "going";

export interface PublicUser {
  id: string;
  firstName: string;
  neighborhoodId: string | null;
  avatarSeed: string;
  avatarStyle: AvatarStyle;
  avatarPhotoDataUrl?: string;
}

export type AvatarStyle = "avataaars" | "big-smile" | "fun-emoji";

export interface NeighborhoodDTO {
  id: string;
  name: string;
  metro: string;
  adjacent: string[];
  lat?: number;
  lng?: number;
}

export interface PlanSuggestionDTO {
  id: string;
  author: PublicUser;
  body: string;
  createdAt: string;
}

export interface PlanDTO {
  id: string;
  title: string;
  creator: PublicUser;
  neighborhoodId: string;
  location: { name: string; address: string; lat?: number; lng?: number };
  date: string;
  time: string;
  isFlexibleTime: boolean;
  isFlexibleLocation: boolean;
  endTime?: string;
  tags: InterestTag[];
  description?: string;
  hostEmoji: string;
  planKind: PlanKind;
  visibility: PlanVisibility;
  visibilityCommunityTag: InterestTag | null;
  isRecurring: boolean;
  lockedAt: string | null;
  /** Inline replies on “looking for” plans (feed + detail). */
  suggestions: PlanSuggestionDTO[];
  participants: {
    going: PublicUser[];
    interested: PublicUser[];
  };
  myState: ParticipationState | null;
}

export interface ConversationDTO {
  id: string;
  planId: string;
  type: "group" | "dm";
  participants: PublicUser[];
  lastMessageAt: string;
  unreadCount: number;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  /** Defaults to `user` when omitted (legacy rows). */
  kind?: "user" | "system";
  /** Present for user messages; omitted for system lines. */
  sender?: PublicUser;
  body: string;
  createdAt: string;
}

export interface FeedbackDTO {
  id: string;
  planId: string;
  fromUserId: string;
  toHostId: string;
  thumb: "up" | "down";
  note?: string;
  hostTags: HostTag[];
  createdAt: string;
}

export type HostTag = "great_host" | "would_do_again" | "made_me_feel_welcome";

export const HOST_TAG_LABELS: Record<HostTag, string> = {
  great_host: "⭐ great host",
  would_do_again: "🔄 would do again",
  made_me_feel_welcome: "🤝 made me feel welcome",
};

export interface MeDTO {
  id: string;
  phoneNumber: string;
  firstName: string;
  neighborhoodId: string | null;
  neighborhoodIds?: string[];
  interests: InterestTag[];
  avatarSeed: string;
  avatarStyle: AvatarStyle;
  avatarPhotoDataUrl?: string;
  onboardingComplete: boolean;
  createdAt: string;
  /** User ids in this person’s COMMONS network (one-way). */
  networkUserIds?: string[];
}

export interface NetworkPromptDTO {
  planId: string;
  planTitle: string;
  /** People you went with who aren’t in your network yet. */
  others: PublicUser[];
}
