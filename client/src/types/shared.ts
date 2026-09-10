// Commons v2 shared types — kept in sync between client/src/types/shared.ts
// and server/src/types/shared.ts. Edit both when changing.

// Community interest filters — final launch set (~16).
// NOTE: internal tag ids stay stable for data compatibility. `events` is
// relabeled "Local events" rather than renamed; `clubs` was removed.
export type InterestTag =
  | "coffee"
  | "food"
  | "drinks"
  | "events"
  | "night_out"
  | "music"
  | "books"
  | "walks"
  | "workouts"
  | "wellness"
  | "creative"
  | "games"
  | "cowork"
  | "moms"
  | "new_to_philly"
  | "sober";

export const INTEREST_LABELS: Record<InterestTag, string> = {
  coffee: "Coffee",
  food: "Food",
  drinks: "Drinks",
  events: "Local events",
  night_out: "Night Out",
  music: "Music",
  books: "Books",
  walks: "Walks & Outdoors",
  workouts: "Workouts",
  wellness: "Wellness",
  creative: "Creative",
  games: "Games",
  cowork: "Co-Work",
  moms: "Moms",
  new_to_philly: "New to Philly",
  sober: "Sober",
};

export const INTEREST_EMOJI: Record<InterestTag, string> = {
  coffee: "☕",
  food: "🍔",
  drinks: "🍸",
  events: "🎉",
  night_out: "🌙",
  music: "🎵",
  books: "📚",
  walks: "🌳",
  workouts: "💪",
  wellness: "🧘",
  creative: "🎨",
  games: "🎲",
  cowork: "💻",
  moms: "👩‍👧",
  new_to_philly: "🗽",
  sober: "🌱",
};

export const ALL_INTERESTS: InterestTag[] = [
  "coffee",
  "food",
  "drinks",
  "events",
  "night_out",
  "music",
  "books",
  "walks",
  "workouts",
  "wellness",
  "creative",
  "games",
  "cowork",
  "moms",
  "new_to_philly",
  "sober",
];

// 2.6 — forums only launch for the highest-density interests; everything
// else stays a feed filter. Keep this in sync with server/src/store.ts.
export const FORUM_INTERESTS: InterestTag[] = [
  "coffee",
  "food",
  "drinks",
  "events",
  "night_out",
  "music",
  "books",
  "walks",
  "workouts",
  "new_to_philly",
];

/** Same set as interests — used in create-plan vibe picker. */
export const VIBE_TAGS = ALL_INTERESTS;

/**
 * Vibe picker for post-time. Each option resolves to one of the underlying
 * InterestTag values so the feed/algorithm still operates on the existing tag
 * set.
 */
export type VibeIcon = InterestTag;

export interface VibeOption {
  id: VibeIcon;
  emoji: string;
  label: string;
  tag: InterestTag;
}

export const VIBE_OPTIONS: VibeOption[] = ALL_INTERESTS.map((tag) => ({
  id: tag,
  emoji: INTEREST_EMOJI[tag],
  label: INTEREST_LABELS[tag],
  tag,
}));

export type PlanKind = "standard" | "looking_for";

/** User-selected age bracket for filters and onboarding. */
export type AgeRange = "18_24" | "25_35" | "35_50" | "50_plus";

// NOTE: ids stay stable for data compatibility; only labels changed
// (non-overlapping brackets per final-pass copy fix).
export const AGE_RANGE_LABELS: Record<AgeRange, string> = {
  "18_24": "18–24",
  "25_35": "25–34",
  "35_50": "35–49",
  "50_plus": "50+",
};

export const ALL_AGE_RANGES: AgeRange[] = ["18_24", "25_35", "35_50", "50_plus"];

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
  lastName?: string;
  bio?: string;
  /** Coarse age bracket, exposed so the feed can filter plans by host age. */
  ageRange?: AgeRange | null;
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

/**
 * Minimal, unauthenticated event payload for the public web landing shown when a
 * logged-out visitor opens a shared plan link. No participant identities — just
 * the essentials and live counts. Served by GET /api/plans/:id/public.
 */
export interface PublicPlanDTO {
  id: string;
  title: string;
  date: string;
  time: string;
  isFlexibleTime: boolean;
  isFlexibleLocation: boolean;
  locationName: string;
  hostFirstName: string;
  hostEmoji: string;
  coverImage: string;
  description?: string;
  tags: InterestTag[];
  goingCount: number;
  interestedCount: number;
  cancelled: boolean;
}

export interface PlanDTO {
  id: string;
  title: string;
  creator: PublicUser;
  coHosts?: PublicUser[];
  neighborhoodId: string;
  location: {
    name: string;
    address: string;
    lat?: number;
    lng?: number;
    /** Google Places ID when the host picked a known venue. Used to group
     *  plans by venue for the (post-launch) Spots grid + venue history. */
    placeId?: string;
  };
  /** ISO timestamp when the plan was posted — drives recency sort for ideas. */
  createdAt: string;
  date: string;
  time: string;
  isFlexibleTime: boolean;
  /** True when the host picked "Anytime" — date is a far-future placeholder until lock-in. */
  isFlexibleDate: boolean;
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
  /** Community name for the card pill — null unless communityId is set. */
  communityName: string | null;
  /**
   * Per-plan visibility within a community (public / community_only). Null unless
   * the plan is tagged to a community. `community_only` plans are only served to
   * that community's active members.
   */
  communityVisibility: CommunityVisibility | null;
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
  upForGrabsAt?: string | null;
  /** Host answer to "Did this happen?" */
  happenedOutcome?: "yes" | "no" | "rescheduled" | null;
  /** Optional flyer/cover — uploaded data URL or library https URL. */
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
  /** True when the viewer has muted this conversation — chat still works, notifications go quiet. */
  muted: boolean;
  /** True when the viewer hosts the underlying plan — drives the "Block host" chat menu option. */
  isHost: boolean;
  hostId: string;
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
  /**
   * Set when this row is a community group chat rather than a plan chat. The
   * client links to /communities/:communityId and shows communityName as title.
   */
  communityId?: string;
  communityName?: string;
  /** Plan flyer / community cover when one exists. */
  coverImage?: string | null;
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
  kind?: "user" | "system" | "poll";
  sender?: PublicUser;
  body: string;
  createdAt: string;
  /** Emoji → userIds who reacted. UI only offers ❤️ today. */
  reactions?: Record<string, string[]>;
  /** Present only on `poll` messages. */
  poll?: PollDTO;
  /** Optional image on a user message (data URL or https). */
  imageUrl?: string | null;
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
  instagram?: string;
  tiktok?: string;
}

export interface MeDTO {
  id: string;
  phoneNumber: string;
  firstName: string;
  lastName?: string;
  email?: string | null;
  bio?: string;
  ageRange?: AgeRange | null;
  /** ISO timestamp when the user confirmed they are 18+. */
  ageConfirmedAt?: string | null;
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
  /** ISO timestamp the user scrolled through and accepted the Terms of Service. */
  termsAcceptedAt?: string | null;
  /** ISO timestamp the user scrolled through and accepted the Privacy Policy. */
  privacyAcceptedAt?: string | null;
  /** Notification toggles. Missing keys fall back to DEFAULT_NOTIFICATION_PREFS. */
  notificationPrefs?: NotificationPrefs;
  /** UserIds this person has blocked. */
  blockedUserIds?: string[];
  /** Whether this user's name surfaces in People search results. Defaults to true. */
  discoverableBySearch: boolean;
  /** Conversation ids this user has muted. */
  mutedConversationIds?: string[];
  /** Conversations the user explicitly left / removed from inbox. */
  leftConversationIds?: string[];
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
  | "planTimeChanged"
  | "planInvite"
  | "planUpForGrabs"
  | "networkRequest"
  | "networkAccepted"
  | "communityJoinRequest"
  | "communityRequestApproved"
  | "communityRequestDeclined"
  | "communityPlanPosted"
  | "planDayOf"
  | "interestedNudge"
  | "didThisHappen"
  | "planSpotReopen"
  | "welcome";

export interface NotificationDTO {
  id: string;
  kind: NotificationKind;
  body: string;
  /** Optional plan link — clients route to /plans/:planId on tap. */
  planId?: string;
  /** Optional conversation link — chat-message events route here. */
  conversationId?: string;
  /** Optional profile link — network request/accept route here. */
  profileUserId?: string;
  /** Present on community notifications — links to the community page. */
  communityId?: string;
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

// ---- Communities (V1) ----
// A community is a named group with a bulletin, events board, member list, and
// optional group chat. Created by an organizer, approved by COMMONS admin before
// going live, joined by members. All V1 communities are public.

// Communities share the master InterestTag taxonomy — a community tagged
// "Food" is the same value as the interest / plan tag. Aliases kept so
// existing community call sites don't have to rename.
export type CommunityCategory = InterestTag;

export const COMMUNITY_CATEGORY_LABELS: Record<CommunityCategory, string> = INTEREST_LABELS;

export const ALL_COMMUNITY_CATEGORIES: CommunityCategory[] = ALL_INTERESTS;

/** Pre-unification community category slugs → nearest InterestTag. */
export const LEGACY_COMMUNITY_CATEGORY_MAP: Record<string, InterestTag> = {
  run_club: "walks",
  book_club: "books",
  fitness: "workouts",
  food_drink: "food",
  arts: "creative",
  social: "events",
  wellness: "wellness",
  other: "events",
};

/** Normalize a stored/posted category to a current InterestTag. */
export function normalizeCommunityCategory(raw: string): InterestTag {
  if (ALL_INTERESTS.includes(raw as InterestTag)) return raw as InterestTag;
  return LEGACY_COMMUNITY_CATEGORY_MAP[raw] ?? "events";
}

export type CommunityCreationStatus = "pending" | "approved" | "rejected";
/** Who may post to a given surface — organizer-controlled toggle. */
export type CommunityPostingPermission = "organizer_only" | "members";
export type CommunityMemberRole = "organizer" | "member";
export type CommunityMemberStatus = "pending" | "active";
/** Per-plan visibility within a community. Required when a plan has a communityId. */
export type CommunityVisibility = "public" | "community_only";
/** Who can see inside a community (bulletin/events/members). Discovery info
 *  (name, cover, description, member count) is always visible regardless. */
export type CommunityAccessLevel = "everyone" | "members_only";

/** The viewer's membership relative to a community (null = not a member). */
export interface CommunityMembershipView {
  role: CommunityMemberRole;
  status: CommunityMemberStatus;
}

export interface CommunityDTO {
  id: string;
  name: string;
  description: string;
  coverImage: string | null;
  category: CommunityCategory;
  organizer: PublicUser;
  memberCount: number;
  isFounding: boolean;
  creationStatus: CommunityCreationStatus;
  bulletinPermission: CommunityPostingPermission;
  planPostingPermission: CommunityPostingPermission;
  chatEnabled: boolean;
  /** When false, the bulletin is turned off for this community. */
  bulletinEnabled: boolean;
  /** When true, member posts wait for organizer approval before going live. */
  bulletinRequiresApproval: boolean;
  /** Who can see inside (bulletin/events/members) — discovery info is always public. */
  visibility: CommunityAccessLevel;
  /** Only exposed to the real organizer (others get null). */
  screeningQuestion: string | null;
  /** True when a screening question is set (all viewers, so Join can branch). */
  hasScreening: boolean;
  createdAt: string;
  /** The viewer's membership, or null if they're a visitor. */
  myMembership: CommunityMembershipView | null;
  /** True when the viewer is this community's organizer (not COMMONS admin). */
  isOrganizer: boolean;
  /** Viewer may post to the bulletin (permission + active membership). */
  canPostBulletin: boolean;
  /** Viewer may post a plan tagged to this community. */
  canPostPlan: boolean;
  /** Count of pending join requests — organizer only (0 otherwise). */
  pendingRequestCount: number;
  /** Count of bulletin posts awaiting approval — organizer only (0 otherwise). */
  pendingBulletinCount: number;
}

export interface CommunityMemberDTO {
  user: PublicUser;
  role: CommunityMemberRole;
  status: CommunityMemberStatus;
  /** Screening answer — only populated for the organizer viewing requests. */
  screeningAnswer: string | null;
  joinedAt: string;
}

export interface CommunityPostDTO {
  id: string;
  author: PublicUser;
  authorIsOrganizer: boolean;
  content: string;
  image: string | null;
  pinned: boolean;
  /** pending = awaiting organizer approval; approved = live on the bulletin. */
  approvalStatus: "pending" | "approved";
  createdAt: string;
  /** Viewer may delete this post (own post, or organizer/admin on any). */
  canDelete: boolean;
  replies: CommunityPostDTO[];
}

/** Compact card for the Explore rail + profile "Communities" list. */
export interface CommunityCardDTO {
  id: string;
  name: string;
  coverImage: string | null;
  category: CommunityCategory;
  memberCount: number;
  isFounding: boolean;
  /** Organizer identity — avatar on list/explore cards. */
  organizer: PublicUser;
  /** The viewer's role, when they belong — drives the "Organizer" label on profile. */
  myRole: CommunityMemberRole | null;
  /** The viewer's membership status, or null if they're a visitor — drives the Explore rail join CTA. */
  myMembershipStatus: CommunityMemberStatus | null;
  /** True when a screening question is set (join CTA reads "Request" instead of "Join"). */
  hasScreening: boolean;
}

/** Row in the admin "Pending communities" review queue. */
export interface PendingCommunityDTO {
  id: string;
  name: string;
  description: string;
  category: CommunityCategory;
  organizer: PublicUser;
  submittedAt: string;
  creationStatus: CommunityCreationStatus;
}

// ---- Interest Forums (V1) ----
// A citywide, topic-based discussion board per interest category — structurally
// separate from plan group chats. Forum-style (posts + flat replies), not
// real-time chat. Every InterestTag gets exactly one forum; users auto-join the
// forums matching their onboarding/settings interests but can leave without
// dropping the underlying interest (membership is decoupled from profile tags).

export type ForumSort = "recent" | "popular";
export type ForumPostApprovalStatus = "pending" | "approved" | "rejected";

/** Row in the Messages → Interests tab — one per forum the viewer has joined. */
export interface ForumSummaryDTO {
  interestTag: InterestTag;
  label: string;
  emoji: string;
  latestPost: {
    authorName: string;
    preview: string;
    createdAt: string;
  } | null;
  /** Stub for future unread tracking — always false in V1. */
  hasUnread: boolean;
}

export interface ForumPostDTO {
  id: string;
  interestTag: InterestTag;
  author: PublicUser;
  content: string;
  imageUrl: string | null;
  isSponsored: boolean;
  sponsorName: string | null;
  createdAt: string;
  replyCount: number;
  likeCount: number;
  /** Whether the viewer has liked this post. */
  likedByMe: boolean;
  /** Viewer may delete this post (own post, or COMMONS admin). */
  canDelete: boolean;
}

export interface ForumReplyDTO {
  id: string;
  postId: string;
  author: PublicUser;
  content: string;
  imageUrl: string | null;
  createdAt: string;
}

export interface ForumPostDetailDTO {
  post: ForumPostDTO;
  replies: ForumReplyDTO[];
}

/** Row in the admin review queue for pending sponsored forum posts. */
export interface AdminForumPostDTO {
  id: string;
  interestTag: InterestTag;
  label: string;
  content: string;
  imageUrl: string | null;
  sponsorName: string | null;
  createdAt: string;
}

// ---- Search ----

/** A person result on the /search page. */
export interface PersonSearchResultDTO {
  user: PublicUser;
  neighborhoodName: string | null;
  /** Count of plans the viewer and this person have both been part of (hosted or joined). */
  sharedPlansCount: number;
}

export interface SearchResultsDTO {
  plans: PlanDTO[];
  people: PersonSearchResultDTO[];
}

export type ReportReason = "harassment" | "spam" | "inappropriate" | "safety" | "other";

export const REPORT_REASON_OPTIONS: { id: ReportReason; label: string }[] = [
  { id: "harassment", label: "Harassment or bullying" },
  { id: "spam", label: "Spam or scam" },
  { id: "inappropriate", label: "Inappropriate content" },
  { id: "safety", label: "Safety concern" },
  { id: "other", label: "Something else" },
];
