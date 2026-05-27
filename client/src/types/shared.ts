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

/** Same set as interests — used in create-plan vibe picker. */
export const VIBE_TAGS = ALL_INTERESTS;

/**
 * Curated 8-emoji vibe picker for post-time. Each option resolves to one of the
 * underlying InterestTag values so the feed/algorithm still operates on the
 * existing tag set. Multiple emojis can collapse to the same tag (Martini and
 * Burger both → food_drinks); the resolved tag list de-duplicates.
 */
export type VibeIcon = "coffee" | "martini" | "burger" | "music" | "book" | "paint" | "dice" | "disco" | "workout";

export interface VibeOption {
  id: VibeIcon;
  emoji: string;
  label: string;
  tag: InterestTag;
}

export const VIBE_OPTIONS: VibeOption[] = [
  { id: "coffee",  emoji: "☕", label: "Coffee",  tag: "coffee_cowork" },
  { id: "martini", emoji: "🍸", label: "Drinks",  tag: "food_drinks" },
  { id: "burger",  emoji: "🍔", label: "Food",    tag: "food_drinks" },
  { id: "music",   emoji: "🎵", label: "Music",   tag: "music_nightlife" },
  { id: "book",    emoji: "📖", label: "Book",    tag: "arts_culture" },
  { id: "paint",   emoji: "🎨", label: "Paint",   tag: "arts_culture" },
  { id: "dice",    emoji: "🎲", label: "Dice",    tag: "local_events" },
  { id: "disco",   emoji: "💃", label: "Disco",   tag: "music_nightlife" },
  { id: "workout", emoji: "💪", label: "Workout", tag: "fitness_outdoors" },
];

export type PlanKind = "standard" | "looking_for";

export type PlanVisibility = "everyone" | "community" | "network";

/** How RSVPs work when capacity is set. `open` is first-come; `approve` is one-tap host confirmation. */
export type JoinType = "open" | "approve";

export type ParticipationState = "interested" | "going";

/**
 * Bitmoji-style presets. Each entry is a curated set of DiceBear `avataaars`
 * URL overrides that produces a recognizable look. Stored on the user as a
 * single query string (avatarParams), appended to the DiceBear request.
 */
export interface AvatarPreset {
  id: string;
  label: string;
  /** URL query string fragment WITHOUT leading `?`. */
  params: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  // Dark skin
  { id: "p01", label: "Dark skin · long curly black hair",
    params: "top=curly&hairColor=2c1b18&skinColor=614335&clothing=shirtCrewNeck&clothesColor=ff5c5c" },
  { id: "p02", label: "Dark skin · short curly black hair",
    params: "top=shortCurly&hairColor=2c1b18&skinColor=614335&clothing=hoodie&clothesColor=3c4f5c" },
  { id: "p03", label: "Dark skin · dreads",
    params: "top=dreads&hairColor=2c1b18&skinColor=614335&clothing=shirtCrewNeck&clothesColor=a7ffc4" },
  { id: "p04", label: "Dark skin · fro",
    params: "top=fro&hairColor=2c1b18&skinColor=614335&clothing=blazerAndShirt" },
  // Medium-dark skin
  { id: "p05", label: "Medium skin · long straight black hair",
    params: "top=straight01&hairColor=2c1b18&skinColor=ae5d29&clothing=shirtScoopNeck&clothesColor=ffafb9" },
  { id: "p06", label: "Medium skin · short black hair",
    params: "top=shortFlat&hairColor=2c1b18&skinColor=ae5d29&clothing=shirtCrewNeck&clothesColor=65c9ff" },
  { id: "p07", label: "Tan skin · long wavy brown hair",
    params: "top=curvy&hairColor=4a312c&skinColor=d08b5b&clothing=shirtVNeck&clothesColor=a7ffc4" },
  { id: "p08", label: "Tan skin · short brown hair",
    params: "top=shortWaved&hairColor=4a312c&skinColor=d08b5b&clothing=hoodie&clothesColor=929598" },
  { id: "p09", label: "Medium skin · hijab",
    params: "top=hijab&hatColor=2c1b18&skinColor=d08b5b&clothing=shirtScoopNeck&clothesColor=ffafb9" },
  // Light skin
  { id: "p10", label: "Light skin · long brunette",
    params: "top=straight02&hairColor=724133&skinColor=edb98a&clothing=shirtScoopNeck&clothesColor=ffafb9" },
  { id: "p11", label: "Light skin · long blonde",
    params: "top=straight01&hairColor=b58143&skinColor=edb98a&clothing=blazerAndSweater" },
  { id: "p12", label: "Light skin · short brunette",
    params: "top=shortFlat&hairColor=724133&skinColor=edb98a&clothing=shirtCrewNeck&clothesColor=3c4f5c" },
  { id: "p13", label: "Light skin · short blond",
    params: "top=shortRound&hairColor=b58143&skinColor=edb98a&clothing=hoodie&clothesColor=ff488e" },
  // Pale / red
  { id: "p14", label: "Pale skin · long red hair",
    params: "top=straightAndStrand&hairColor=c93305&skinColor=ffdbb4&clothing=shirtVNeck&clothesColor=a7ffc4" },
  { id: "p15", label: "Pale skin · short red hair",
    params: "top=shortWaved&hairColor=c93305&skinColor=ffdbb4&clothing=shirtCrewNeck&clothesColor=ff5c5c" },
  // Glasses / facial hair / hat
  { id: "p16", label: "Glasses · light skin · brown hair",
    params: "top=shortFlat&hairColor=4a312c&skinColor=edb98a&accessories=prescription02&accessoriesProbability=100&clothing=collarAndSweater" },
  { id: "p17", label: "Beard · medium skin · short black hair",
    params: "top=shortFlat&hairColor=2c1b18&skinColor=ae5d29&facialHair=beardMedium&facialHairProbability=100&clothing=shirtCrewNeck&clothesColor=545454" },
  { id: "p18", label: "Hat · tan skin",
    params: "top=hat&hatColor=3c4f5c&skinColor=d08b5b&clothing=hoodie&clothesColor=ffdeb5" },
];

export interface PublicUser {
  id: string;
  firstName: string;
  neighborhoodId: string | null;
  avatarSeed: string;
  avatarStyle: AvatarStyle;
  avatarPhotoDataUrl?: string;
  /** DiceBear URL overrides string (e.g. "top=longHair&skinColor=614335"). */
  avatarParams?: string;
}

export type AvatarStyle = "avataaars" | "big-smile" | "fun-emoji";

export interface NeighborhoodDTO {
  id: string;
  name: string;
  metro: string;
  adjacent: string[]; // neighborhood ids
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
  /** True when venue/time still open — card shows flexible tag. */
  isFlexibleLocation: boolean;
  endTime?: string;
  tags: InterestTag[];
  description?: string;
  hostEmoji: string;
  planKind: PlanKind;
  visibility: PlanVisibility;
  /** When visibility is `community`, plan is shown to users who picked this interest. */
  visibilityCommunityTag: InterestTag | null;
  /**
   * Reserved for V1.5 real-communities (run clubs, book clubs, etc.). Always
   * null on current plans — present on every record so future community posts
   * don't need a migration. Coming Soon.
   */
  communityId: string | null;
  /** Total spots including host. Null means open / no cap. */
  capacity: number | null;
  /** How RSVPs are accepted when capacity is set. */
  joinType: JoinType;
  isRecurring: boolean;
  /** Series anchor — null for one-offs, shared across every instance of a recurring plan. */
  seriesId: string | null;
  /** Host locked venue + time from coordination thread. */
  lockedAt: string | null;
  /** ISO timestamp when the host cancelled this plan, or null if active. */
  cancelledAt: string | null;
  /** Optional flyer image (data URL). People screenshot flyers — attach one. */
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
  kind?: "user" | "system";
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

export interface SocialLinks {
  instagram?: string;
}

export interface MeDTO {
  id: string;
  phoneNumber: string;
  firstName: string;
  /** @deprecated prefer neighborhoodIds — kept for older rows */
  neighborhoodId: string | null;
  /** Areas the user spends time in — feeds personalization. */
  neighborhoodIds?: string[];
  interests: InterestTag[];
  avatarSeed: string;
  avatarStyle: AvatarStyle;
  avatarPhotoDataUrl?: string;
  avatarParams?: string;
  onboardingComplete: boolean;
  createdAt: string;
  networkUserIds?: string[];
  socialLinks?: SocialLinks;
  /** True when this verified phone may use `/api/admin` and `/admin`. */
  canAccessAdmin?: boolean;
  /** ISO timestamp the user accepted the community guidelines, or null if not yet. */
  guidelinesAcknowledgedAt?: string | null;
  /** Notification toggles. Missing keys fall back to DEFAULT_NOTIFICATION_PREFS. */
  notificationPrefs?: NotificationPrefs;
}

export interface NetworkPromptDTO {
  planId: string;
  planTitle: string;
  others: PublicUser[];
}

/** Notification toggles — persisted on the user record, gate both in-app and push delivery. */
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
  | "planTimeChanged";

export interface NotificationDTO {
  id: string;
  kind: NotificationKind;
  body: string;
  /** Optional plan link — clients route to /plans/:planId on tap. */
  planId?: string;
  /** Optional conversation link — chat-message events route here. */
  conversationId?: string;
  createdAt: string;
  readAt: string | null;
}

export interface InviteCodeDTO {
  code: string;
  redeemedAt: string | null;
  /** First name of the person who redeemed it — null until/unless redeemed. */
  redeemedByFirstName: string | null;
}

export const NOTIFICATION_LABELS: Record<keyof NotificationPrefs, string> = {
  someoneJoinedYourPlan: "Someone joined your plan",
  planTomorrow: "Your plan is tomorrow",
  planInTwoHours: "Your plan is in 2 hours",
  newGroupChatMessage: "New message in group chat",
  postPlanNetworkNudge: "Add people you went out with to your network",
  planCancellation: "A plan you RSVP'd to was cancelled",
  weeklyFridayDigest: "Weekly Friday: what's happening in Philly",
  lookingForRecovery: "Reminder when a Looking For plan needs a host",
};
