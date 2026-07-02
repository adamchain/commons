// Commons v2 shared types — kept in sync between client/src/types/shared.ts
// and server/src/types/shared.ts. Edit both when changing.

/** Community interest filters — launch set. */
export type InterestTag =
  | "coffee"
  | "cowork"
  | "events"
  | "drinks"
  | "food"
  | "music"
  | "clubs"
  | "creative"
  | "games"
  | "night_out"
  | "workouts"
  | "moms";

export const INTEREST_LABELS: Record<InterestTag, string> = {
  coffee: "Coffee",
  cowork: "Co-Work",
  events: "Events",
  drinks: "Drinks",
  food: "Food",
  music: "Music",
  clubs: "Clubs",
  creative: "Creative",
  games: "Games",
  night_out: "Night Out",
  workouts: "Workouts",
  moms: "Moms",
};

export const INTEREST_EMOJI: Record<InterestTag, string> = {
  coffee: "☕",
  cowork: "💻",
  events: "🎉",
  drinks: "🍸",
  food: "🍔",
  music: "🎵",
  clubs: "🪩",
  creative: "🎨",
  games: "🎲",
  night_out: "🌙",
  workouts: "💪",
  moms: "👩‍👧",
};

export const ALL_INTERESTS: InterestTag[] = [
  "coffee",
  "cowork",
  "events",
  "drinks",
  "food",
  "music",
  "clubs",
  "creative",
  "games",
  "night_out",
  "workouts",
  "moms",
];

export const VIBE_TAGS = ALL_INTERESTS;

export type PlanKind = "standard" | "looking_for";

export type AgeRange = "18_24" | "25_35" | "35_50" | "50_plus";

export const AGE_RANGE_LABELS: Record<AgeRange, string> = {
  "18_24": "18–24",
  "25_35": "25–35",
  "35_50": "35–50",
  "50_plus": "50+",
};

export const ALL_AGE_RANGES: AgeRange[] = ["18_24", "25_35", "35_50", "50_plus"];

export type PlanVisibility = "everyone" | "community" | "network";

export type JoinType = "open" | "approve";

export type ParticipationState = "interested" | "going";

export interface PublicUser {
  id: string;
  firstName: string;
  lastName?: string;
  bio?: string;
  /** Coarse age bracket, exposed so the feed can filter plans by host age. */
  ageRange?: AgeRange | null;
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

/** One option in a poll, with the ids of everyone who picked it. */
export interface PollOptionDTO {
  id: string;
  text: string;
  voterIds: string[];
}

export interface PollDTO {
  question: string;
  options: PollOptionDTO[];
  closed: boolean;
  /** Distinct voters across all options. */
  totalVotes: number;
  /** The option the viewer chose, or null. */
  myVote: string | null;
  /** Viewer may close this poll (its author or the plan host). */
  canClose: boolean;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  /** Defaults to `user` when omitted (legacy rows). */
  kind?: "user" | "system" | "poll";
  /** Present for user + poll messages; omitted for system lines. */
  sender?: PublicUser;
  body: string;
  createdAt: string;
  /** Emoji → userIds who reacted. Only ❤️ is offered in the UI for now. */
  reactions?: Record<string, string[]>;
  /** Present only on `poll` messages. */
  poll?: PollDTO;
}

export interface FeedbackDTO {
  id: string;
  planId: string;
  fromUserId: string;
  toHostId: string;
  thumb: "up" | "down";
  note?: string;
  createdAt: string;
}

export interface SocialLinks {
  /** Instagram handle without the @, e.g. "jamie.philly" */
  instagram?: string;
  /** TikTok handle without the @, e.g. "jamie.philly" */
  tiktok?: string;
}

export interface MeDTO {
  id: string;
  phoneNumber: string;
  firstName: string;
  lastName?: string;
  bio?: string;
  ageRange?: AgeRange | null;
  ageConfirmedAt?: string | null;
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
  /** ISO timestamp the user scrolled through and accepted the Terms of Service. */
  termsAcceptedAt?: string | null;
  /** ISO timestamp the user scrolled through and accepted the Privacy Policy. */
  privacyAcceptedAt?: string | null;
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
