// Commons v2 shared types — kept in sync between client/src/types/shared.ts
// and server/src/types/shared.ts. Edit both when changing.

export type InterestTag =
  | "coffee"
  | "yoga"
  | "running"
  | "hiking"
  | "biking"
  | "lifting"
  | "brunch"
  | "drinks"
  | "music"
  | "art"
  | "books"
  | "games";

export const ALL_INTERESTS: InterestTag[] = [
  "coffee",
  "yoga",
  "running",
  "hiking",
  "biking",
  "lifting",
  "brunch",
  "drinks",
  "music",
  "art",
  "books",
  "games",
];

export const INTEREST_EMOJI: Record<InterestTag, string> = {
  coffee: "☕",
  yoga: "🧘",
  running: "🏃",
  hiking: "🥾",
  biking: "🚴",
  lifting: "🏋️",
  brunch: "🥞",
  drinks: "🍻",
  music: "🎶",
  art: "🎨",
  books: "📚",
  games: "🎲",
};

export type ParticipationState = "interested" | "going";

export interface PublicUser {
  id: string;
  firstName: string;
  neighborhoodId: string | null;
  avatarSeed: string;
  avatarStyle: AvatarStyle;
}

export type AvatarStyle = "avataaars" | "big-smile" | "fun-emoji";

export interface NeighborhoodDTO {
  id: string;
  name: string;
  metro: string;
  adjacent: string[]; // neighborhood ids
}

export interface PlanDTO {
  id: string;
  title: string;
  creator: PublicUser;
  neighborhoodId: string;
  location: { name: string; address: string; lat?: number; lng?: number };
  date: string; // ISO date "2026-05-04"
  time: string; // "09:00" or "" if flexible
  isFlexibleTime: boolean;
  endTime?: string; // optional ISO datetime, used for post-event feedback timing
  tags: InterestTag[];
  description?: string;
  hostEmoji: string; // single emoji shown next to first name
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
  sender: PublicUser;
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
  interests: InterestTag[];
  avatarSeed: string;
  avatarStyle: AvatarStyle;
  onboardingComplete: boolean;
  createdAt: string;
}
