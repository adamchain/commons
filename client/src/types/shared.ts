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

export type PlanKind = "standard" | "looking_for";

export type PlanVisibility = "everyone" | "community" | "network";

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
  isRecurring: boolean;
  /** Host locked venue + time from coordination thread. */
  lockedAt: string | null;
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
}

export interface NetworkPromptDTO {
  planId: string;
  planTitle: string;
  others: PublicUser[];
}
