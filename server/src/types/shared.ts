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

export const INTEREST_EMOJI: Record<InterestTag, string> = {
  fitness_outdoors: "💪",
  food_drinks: "🍔",
  arts_culture: "🎨",
  music_nightlife: "🎵",
  thrifting: "🛍️",
  local_events: "🎉",
  wellness: "🧘",
  coffee_cowork: "☕",
  dog_owners: "🐶",
  running: "🏃",
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

export type JoinType = "open" | "approve";

export type ParticipationState = "interested" | "going";

export interface PublicUser {
  id: string;
  firstName: string;
  lastName?: string;
  neighborhoodId: string | null;
  avatarSeed: string;
  avatarStyle: AvatarStyle;
  avatarPhotoDataUrl?: string;
  avatarParams?: string;
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
  /** Additional co-hosts beyond the primary creator. */
  coHosts?: PublicUser[];
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
  /**
   * Reserved for V1.5 communities (run clubs, book clubs, etc.). Always null on
   * current plans — present on every record so future community posts don't
   * need a migration. Coming Soon.
   */
  communityId: string | null;
  /** Total spots including host. Null means open / no cap. */
  capacity: number | null;
  /** How RSVPs are accepted when capacity is set. */
  joinType: JoinType;
  isRecurring: boolean;
  /** Series anchor — null for one-offs, shared across every instance of a recurring plan. */
  seriesId: string | null;
  lockedAt: string | null;
  /** ISO timestamp when the host cancelled this plan, or null if active. */
  cancelledAt: string | null;
  /** ISO timestamp when hosting was put up for grabs, or null. */
  upForGrabsAt?: string | null;
  /** Optional flyer image stored as data URL. */
  flyerDataUrl?: string;
  /** Optional shareable link (event page, ticket page, etc.). */
  flyerLinkUrl?: string;
  /** Cached OG-style preview captured at create time. */
  flyerLinkPreview?: {
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
  };
  /** Host-proposed date/time waiting on the host to apply. Null/absent = none pending. */
  pendingTimeProposal?: {
    date: string;
    time: string;
    isFlexibleTime: boolean;
    proposedAt: string;
  } | null;
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

/** A row in the unified Messages inbox — one per accessible plan group chat. */
export interface ConversationSummaryDTO {
  planId: string;
  planTitle: string;
  hostEmoji: string;
  planDate: string;
  /** Null when no one has opened the plan's chat yet. */
  conversationId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  /** Host + everyone going/interested who could be in the thread. */
  participantCount: number;
  myRole: "hosting" | "going" | "interested";
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
  /** Emoji → userIds who reacted. Only ❤️ is offered in the UI for now. */
  reactions?: Record<string, string[]>;
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

export interface SocialLinks {
  /** Instagram handle without the @, e.g. "jamie.philly" */
  instagram?: string;
}

export interface MeDTO {
  id: string;
  phoneNumber: string;
  firstName: string;
  lastName?: string;
  neighborhoodId: string | null;
  neighborhoodIds?: string[];
  interests: InterestTag[];
  avatarSeed: string;
  avatarStyle: AvatarStyle;
  avatarPhotoDataUrl?: string;
  avatarParams?: string;
  onboardingComplete: boolean;
  createdAt: string;
  /** User ids in this person’s COMMONS network (one-way). */
  networkUserIds?: string[];
  /** Plan ids the user saved/pinned for the My Plans page. */
  savedPlanIds?: string[];
  /** Always present to self; only sent to others when visibility check passes. */
  socialLinks?: SocialLinks;
  /** True when this verified phone may use `/api/admin` and `/admin`. */
  canAccessAdmin?: boolean;
  /** ISO timestamp the user accepted the community guidelines, or null if not yet. */
  guidelinesAcknowledgedAt?: string | null;
  /** Notification toggles. Missing keys fall back to DEFAULT_NOTIFICATION_PREFS. */
  notificationPrefs?: NotificationPrefs;
}

export interface NotificationPrefs {
  someoneJoinedYourPlan: boolean;
  planTomorrow: boolean;
  planInTwoHours: boolean;
  newGroupChatMessage: boolean;
  postPlanNetworkNudge: boolean;
  planCancellation: boolean;
  weeklyFridayDigest: boolean;
  lookingForRecovery: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  someoneJoinedYourPlan: true,
  planTomorrow: true,
  planInTwoHours: true,
  newGroupChatMessage: true,
  postPlanNetworkNudge: true,
  planCancellation: true,
  weeklyFridayDigest: true,
  lookingForRecovery: true,
};

export interface NetworkPromptDTO {
  planId: string;
  planTitle: string;
  /** People you went with who aren’t in your network yet. */
  others: PublicUser[];
}

export type NotificationKind =
  | "someoneJoinedYourPlan"
  | "planTomorrow"
  | "planInTwoHours"
  | "newGroupChatMessage"
  | "postPlanNetworkNudge"
  | "planCancellation"
  | "weeklyFridayDigest"
  | "lookingForRecovery"
  | "planTimeProposed"
  | "planTimeChanged"
  | "planInvite"
  | "networkRequest"
  | "networkAccepted";

export interface NotificationDTO {
  id: string;
  kind: NotificationKind;
  body: string;
  planId?: string;
  conversationId?: string;
  profileUserId?: string;
  createdAt: string;
  readAt: string | null;
}

export interface InviteCodeDTO {
  code: string;
  redeemedAt: string | null;
  /** First name of the person who redeemed it — null until/unless redeemed. */
  redeemedByFirstName: string | null;
}
