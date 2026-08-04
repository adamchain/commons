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

export const VIBE_TAGS = ALL_INTERESTS;

export type PlanKind = "standard" | "looking_for";

export type AgeRange = "18_24" | "25_35" | "35_50" | "50_plus";

// NOTE: ids stay stable for data compatibility; only labels changed.
export const AGE_RANGE_LABELS: Record<AgeRange, string> = {
  "18_24": "18–24",
  "25_35": "25–34",
  "35_50": "35–49",
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
  tags: InterestTag[];
  goingCount: number;
  interestedCount: number;
  cancelled: boolean;
}

export interface PlanDTO {
  id: string;
  title: string;
  creator: PublicUser;
  /** Additional co-hosts beyond the primary creator. */
  coHosts?: PublicUser[];
  neighborhoodId: string;
  location: { name: string; address: string; lat?: number; lng?: number };
  /** ISO timestamp when the plan was posted — drives recency sort for ideas. */
  createdAt: string;
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
  lockedAt: string | null;
  /** ISO timestamp when the host cancelled this plan, or null if active. */
  cancelledAt: string | null;
  /** ISO timestamp when hosting was put up for grabs, or null. */
  upForGrabsAt?: string | null;
  /** Host answer to "Did this happen?" */
  happenedOutcome?: "yes" | "no" | "rescheduled" | null;
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
  /** UserIds this person has blocked. */
  blockedUserIds?: string[];
  /** Whether this user's name surfaces in People search results. Defaults to true. */
  discoverableBySearch: boolean;
  /** Conversation ids this user has muted. */
  mutedConversationIds?: string[];
  /** Conversations the user explicitly left / removed from inbox. */
  leftConversationIds?: string[];
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
  planId?: string;
  conversationId?: string;
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

// ---- Communities (V1) ----
// A community is a named group with a bulletin, events board, member list, and
// optional group chat. Created by an organizer, approved by COMMONS admin before
// going live, joined by members. All V1 communities are public.

export type CommunityCategory =
  | "run_club"
  | "book_club"
  | "fitness"
  | "food_drink"
  | "arts"
  | "social"
  | "wellness"
  | "other";

export const COMMUNITY_CATEGORY_LABELS: Record<CommunityCategory, string> = {
  run_club: "Run Club",
  book_club: "Book Club",
  fitness: "Fitness",
  food_drink: "Food & Drink",
  arts: "Arts",
  social: "Social",
  wellness: "Wellness",
  other: "Other",
};

export const ALL_COMMUNITY_CATEGORIES: CommunityCategory[] = [
  "run_club",
  "book_club",
  "fitness",
  "food_drink",
  "arts",
  "social",
  "wellness",
  "other",
];

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
  /** Only exposed to the organizer/admin (others get null). */
  screeningQuestion: string | null;
  /** True when a screening question is set (all viewers, so Join can branch). */
  hasScreening: boolean;
  createdAt: string;
  /** The viewer's membership, or null if they're a visitor. */
  myMembership: CommunityMembershipView | null;
  /** True when the viewer created it (or is a COMMONS admin). */
  isOrganizer: boolean;
  /** Viewer may post to the bulletin (permission + active membership). */
  canPostBulletin: boolean;
  /** Viewer may post a plan tagged to this community. */
  canPostPlan: boolean;
  /** Count of pending join requests — only populated for the organizer/admin (0 otherwise). */
  pendingRequestCount: number;
  /** Count of bulletin posts awaiting approval — organizer/admin only (0 otherwise). */
  pendingBulletinCount: number;
}

export interface CommunityMemberDTO {
  user: PublicUser;
  role: CommunityMemberRole;
  status: CommunityMemberStatus;
  /** Screening answer — only populated for the organizer/admin viewing requests. */
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
}

/** Compact card for the Explore rail + profile "Communities" list. */
export interface CommunityCardDTO {
  id: string;
  name: string;
  coverImage: string | null;
  category: CommunityCategory;
  memberCount: number;
  isFounding: boolean;
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
