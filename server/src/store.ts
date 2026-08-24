import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mongoMirror } from "./mongoMirror.js";
import type {
  AgeRange,
  AvatarStyle,
  CommunityAccessLevel,
  CommunityCategory,
  CommunityCreationStatus,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityPostingPermission,
  CommunityVisibility,
  ForumPostApprovalStatus,
  ForumSort,
  InterestTag,
  JoinType,
  ParticipationState,
  PlanKind,
  PlanVisibility,
} from "./types/shared.js";
import { ALL_INTERESTS, normalizeCommunityCategory } from "./types/shared.js";

export interface UserRecord {
  id: string;
  phoneNumber: string;
  /** `verify` = signed up via Twilio Verify; `seed` = demo data script only. */
  accountSource?: "verify" | "seed";
  firstName: string;
  lastName?: string;
  /** Optional digest email. Phone is still the login. */
  email?: string | null;
  bio?: string;
  ageRange?: AgeRange | null;
  ageConfirmedAt?: string | null;
  /** Primary hood — mirrors first of neighborhoodIds when set. */
  neighborhoodId: string | null;
  /** Optional on legacy rows. */
  neighborhoodIds?: string[];
  interests: InterestTag[];
  avatarSeed: string;
  avatarStyle: AvatarStyle;
  avatarPhotoDataUrl?: string;
  /** DiceBear URL overrides query string (e.g. "top=longHair&skinColor=614335"). */
  avatarParams?: string;
  onboardingComplete: boolean;
  createdAt: string;
  /** One-way network — people added after shared plans. */
  networkIds?: string[];
  /** UserIds who have requested to connect with this user (awaiting accept). */
  incomingNetworkRequests?: string[];
  /** Plan ids where the user dismissed the post-event network prompt. */
  dismissedNetworkPromptPlanIds?: string[];
  /** Social links — only surfaced to viewers who share a past plan or DM. */
  socialLinks?: { instagram?: string; tiktok?: string };
  /** ISO timestamp the user tapped through the community-guidelines acknowledgment. */
  guidelinesAcknowledgedAt?: string | null;
  /** ISO timestamp the user scrolled through and accepted the Terms of Service. */
  termsAcceptedAt?: string | null;
  /** ISO timestamp the user scrolled through and accepted the Privacy Policy. */
  privacyAcceptedAt?: string | null;
  /** Notification toggles. Stored as a partial — missing keys default to true at the boundary. */
  notificationPrefs?: Partial<{
    someoneJoinedYourPlan: boolean;
    planTomorrow: boolean;
    planInTwoHours: boolean;
    newGroupChatMessage: boolean;
    postPlanNetworkNudge: boolean;
    planCancellation: boolean;
    weeklyFridayDigest: boolean;
    lookingForRecovery: boolean;
  }>;
  /** UserIds this person has blocked. Blocking is one-directional but visibility checks treat it as mutual. */
  blockedUserIds?: string[];
  /** Whether this user's name surfaces in People search results. Missing/undefined defaults to true. */
  discoverableBySearch?: boolean;
  /** Conversation ids this user has muted — chat still works, notifications go quiet. */
  mutedConversationIds?: string[];
  /** Conversations the user explicitly left / removed from inbox. ensure* must
   *  not re-add them until they open the thread again (which clears this). */
  leftConversationIds?: string[];
}

export interface NeighborhoodRecord {
  id: string;
  name: string;
  metro: string;
  adjacent: string[];
  lat?: number;
  lng?: number;
}

export interface PlanRecord {
  id: string;
  creatorId: string;
  /** Additional hosts (e.g. "make a plan with X" co-creates). Optional. */
  coHostIds?: string[];
  title: string;
  neighborhoodId: string;
  /**
   * Inline venue snapshot. `placeId` is the Google Places ID when the host
   * picked a suggestion — it lets us group plans by venue (pin records,
   * frequency, "people who went to X" nudges) without needing a separate
   * Venue table on day one. Absent on flexible-location plans and on
   * user-typed custom venues.
   */
  location: {
    name: string;
    address: string;
    lat?: number;
    lng?: number;
    placeId?: string;
  };
  date: string;
  time: string;
  isFlexibleTime: boolean;
  /** True when the host picked "Anytime" — date is a far-future placeholder until lock-in. */
  isFlexibleDate?: boolean;
  /** Optional on legacy rows — normalized when serving. */
  isFlexibleLocation?: boolean;
  endTime?: string;
  tags: InterestTag[];
  description?: string;
  hostEmoji: string;
  planKind?: PlanKind;
  visibility?: PlanVisibility;
  visibilityCommunityTag?: InterestTag | null;
  /**
   * Real-community target. Reserved for the V1.5 communities feature (run clubs,
   * book clubs, etc.) — the field exists on every plan now so future community
   * posts don't need a schema migration. Null on every current plan.
   */
  communityId?: string | null;
  /**
   * Per-plan visibility within a community (public / community_only). Required
   * when `communityId` is set; null otherwise. `community_only` plans are only
   * served to that community's active members.
   */
  communityVisibility?: CommunityVisibility | null;
  /** Total spots including host. Null/undefined means open / no cap. */
  capacity?: number | null;
  /** How RSVPs are accepted; defaults to "open" if absent. */
  joinType?: JoinType;
  isRecurring?: boolean;
  /**
   * Series lineage for recurring plans. When `isRecurring` is true on the first
   * post, `seriesId` is set to that plan's own id; future instances spawned
   * from the series share the same `seriesId`. This is what lets us later
   * promote an active series into a Community (e.g. weekly run club) without
   * a migration — the membership lives in `participations` joined on
   * `seriesId`.
   */
  seriesId?: string | null;
  lockedAt?: string | null;
  flyerDataUrl?: string;
  /**
   * Host-proposed date/time change waiting to be applied. Set by
   * `propose-time`, cleared by `apply-time` / `delete propose-time`. The plan's
   * real `date`/`time` don't move until the host applies — until then the
   * proposal is just a banner participants see.
   */
  pendingTimeProposal?: {
    date: string;
    time: string;
    isFlexibleTime: boolean;
    proposedAt: string;
  } | null;
  /** Optional shareable link the host attached (event page, ticket page, etc.). */
  flyerLinkUrl?: string;
  /** Cached OG-style preview of `flyerLinkUrl` captured at create time. */
  flyerLinkPreview?: {
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
  };
  /** ISO timestamp when the host cancelled this plan. Null/absent = active. */
  cancelledAt?: string | null;
  /** ISO timestamp when the host put hosting up for grabs (anyone can claim). */
  upForGrabsAt?: string | null;
  /**
   * Host answer to "Did this happen?" ~2h after start.
   * yes | no | rescheduled — null/absent = unanswered.
   */
  happenedOutcome?: "yes" | "no" | "rescheduled" | null;
  createdAt: string;
}

export interface ParticipationRecord {
  id: string;
  planId: string;
  userId: string;
  state: ParticipationState;
  /** First-join timestamp. Preserved across state toggles. Absent on legacy rows. */
  createdAt?: string;
  updatedAt: string;
  /**
   * Post-plan attendance signal. `true` = confirmed they went (via the
   * post-plan prompt / feedback submission). `null` or absent = unanswered or
   * pre-event. We never set `false` automatically — silence is not a no-show.
   */
  attended?: boolean | null;
}

export interface ConversationRecord {
  id: string;
  /**
   * Owning plan. Empty string ("") for a community conversation, which is
   * anchored by `communityId` instead — this keeps `planId` a required non-null
   * string so plan-keyed lookups never have to guard for undefined.
   */
  planId: string;
  /** Set only on the persistent per-community group chat. */
  communityId?: string | null;
  type: "group" | "dm";
  participantIds: string[];
  createdAt: string;
  lastMessageAt: string;
}

export interface PollOption {
  id: string;
  text: string;
}

/** Poll attached to a message of kind "poll". Single-choice, named voters. */
export interface PollData {
  question: string;
  options: PollOption[];
  /** optionId → userIds who picked it. Single-choice: a user is in at most one. */
  votes: Record<string, string[]>;
  closed: boolean;
  closedAt?: string;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readBy: string[];
  kind?: "user" | "system" | "poll";
  /** Emoji → userIds who reacted (toggle). UI only offers ❤️ today. */
  reactions?: Record<string, string[]>;
  /** Present only on `poll` messages. */
  poll?: PollData;
  /** Optional image attached to a user message (data URL or https). */
  imageUrl?: string | null;
}

export interface PlanSuggestionRecord {
  id: string;
  planId: string;
  userId: string;
  body: string;
  createdAt: string;
}

export interface FeedbackRecord {
  id: string;
  planId: string;
  fromUserId: string;
  toHostId: string;
  thumb: "up" | "down";
  note?: string;
  createdAt: string;
}

export interface DeclineRecord {
  id: string;
  userId: string;
  planId: string;
  createdAt: string;
}

export interface SmsCodeRecord {
  phoneNumber: string;
  code: string;
  expiresAt: string;
}

export interface LogRecord {
  id: string;
  event: string;
  payload: unknown;
  createdAt: string;
}

/**
 * Foundation for both Your Network (V1) and Communities (V2). Each row is a
 * directed relationship from `userId` to `targetId`. `kind` distinguishes
 * one-way friend adds (V1) from community memberships (V2 — `targetId` is a
 * community id rather than a user id). `source` records the moment that
 * created the edge (post-plan modal, manual add from a profile, etc.) so we
 * can later weight "people you've actually shared time with" higher than
 * one-tap adds when surfacing suggestions.
 *
 * For V1 the embedded `UserRecord.networkIds` array is still the source of
 * truth at read time. Writes dual-mirror to this table so the graph is queryable
 * before the V2 communities work needs it.
 */
export type CommunityRole = "member" | "admin" | "owner";

export interface RelationshipRecord {
  id: string;
  userId: string;
  targetId: string;
  kind: "network" | "community";
  source: "post_plan_modal" | "profile_friend_add" | "seed" | "other";
  /**
   * Membership role within a community. Only meaningful when `kind = "community"`.
   * Absent or null for network edges. Legacy community rows are treated as
   * "member" at read time.
   */
  role?: CommunityRole | null;
  createdAt: string;
}

/**
 * Explicit drop-out event log. Parallel to `DeclineRecord` (which is the rec-
 * algo's "feed dismissal" signal). A row lands here whenever a user with an
 * active participation explicitly drops their RSVP — DELETE /participation,
 * host transfer (outgoing host), etc. `fromState` records whether they were
 * committed ("going") or only interested at the moment of drop, so analytics
 * can distinguish a real ghost from a tentative un-tap.
 */
export interface DropoutRecord {
  id: string;
  userId: string;
  planId: string;
  fromState: ParticipationState;
  createdAt: string;
}

/**
 * Launch-mechanic invite codes. Every user gets `INVITE_CODES_PER_USER` codes
 * at signup. Codes are 6-char alphanumeric, case-insensitive. Each can be
 * redeemed once; we record who redeemed it so the inviter can see who joined
 * through them. Codes don't gate signup today — `redeemedByUserId` is purely
 * informational — but the schema is ready to flip on for a closed-beta launch.
 */
export interface InviteCodeRecord {
  id: string;
  code: string;
  ownerUserId: string;
  redeemedByUserId: string | null;
  redeemedAt: string | null;
  createdAt: string;
}

/**
 * A community — a named group with a bulletin, events board, member list, and
 * optional group chat. Owned by the organizer's normal user account. Goes live
 * once live (`creationStatus = approved`). V1 fields
 * only; V2 additions (monetization_*, verified) are additive later.
 */
export interface CommunityRecord {
  id: string;
  name: string;
  description: string;
  coverImage?: string | null;
  category: CommunityCategory;
  organizerId: string;
  /** Denormalized count of active members (organizer included). */
  memberCount: number;
  creationStatus: CommunityCreationStatus;
  isFounding: boolean;
  bulletinPermission: CommunityPostingPermission;
  planPostingPermission: CommunityPostingPermission;
  chatEnabled: boolean;
  /** When false, the bulletin tab/posts are hidden — organizer toggle. */
  bulletinEnabled: boolean;
  /** When true, member posts wait for organizer approval before going live. */
  bulletinRequiresApproval: boolean;
  /** Who can see inside (bulletin/events/members). Discovery info stays public either way. */
  visibility: CommunityAccessLevel;
  screeningQuestion?: string | null;
  /** Optional admin note captured on rejection, shown to the creator. */
  rejectionNote?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  createdAt: string;
}

/**
 * Community membership. Richer than a RelationshipRecord — carries approval
 * `status` and the free-text `screeningAnswer` captured at request time.
 * Unique on (communityId, userId).
 */
export interface CommunityMemberRecord {
  id: string;
  communityId: string;
  userId: string;
  role: CommunityMemberRole;
  status: CommunityMemberStatus;
  screeningAnswer?: string | null;
  joinedAt: string;
}

/** Bulletin-board post. Plans live on the plan model; chat lives on chat infra. */
export interface CommunityPostRecord {
  id: string;
  communityId: string;
  authorId: string;
  content: string;
  image?: string | null;
  pinned: boolean;
  /**
   * Approval gate when the community has bulletinRequiresApproval on.
   * Missing/undefined on legacy rows is treated as approved.
   */
  approvalStatus?: "pending" | "approved" | "rejected";
  createdAt: string;
  /** Soft delete — non-null means hidden. */
  deletedAt?: string | null;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  kind:
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
  body: string;
  planId?: string;
  conversationId?: string;
  /** For person-centric notifications (network request/accept) — links to a profile. */
  profileUserId?: string;
  /** For community notifications — links to the community page. */
  communityId?: string;
  /** Idempotency key — same key blocked on re-emit. */
  dedupKey: string;
  createdAt: string;
  readAt: string | null;
}

/**
 * Admin-curated cover image used on event cards. `url` is either an external
 * image URL or a self-contained data URL (admin-uploaded file). Admins manage
 * the library from the dashboard so the stand-in art can change without a code
 * deploy. `sortOrder` controls display/pick order (lower first).
 */
export interface CardImageRecord {
  id: string;
  url: string;
  label?: string;
  sortOrder: number;
  createdAt: string;
}

/**
 * Interest Forums (V1) — citywide, topic-based discussion boards, one per
 * InterestTag. Structurally separate from plan group chats: forum-style
 * (posts + flat replies), not real-time chat.
 */
export interface InterestForumRecord {
  id: string;
  interestTag: InterestTag;
  createdAt: string;
}

/**
 * Membership is intentionally decoupled from the user's profile `interests`
 * array — leaving a forum does NOT remove the interest from the profile, and
 * saving interests only ever adds forum memberships (never auto-leaves).
 * `leftAt` is set (not deleted) so re-joining is a clean toggle.
 */
export interface ForumMembershipRecord {
  userId: string;
  interestTag: InterestTag;
  joinedAt: string;
  leftAt: string | null;
}

export interface ForumPostRecord {
  id: string;
  interestTag: InterestTag;
  authorId: string;
  content: string;
  imageUrl?: string | null;
  isSponsored: boolean;
  sponsorName?: string | null;
  /** Non-sponsored posts are auto-approved; sponsored posts wait for admin review. */
  approvalStatus: ForumPostApprovalStatus;
  createdAt: string;
  /** Denormalized counts, kept in sync by createReply/toggleLike. */
  replyCount: number;
  likeCount: number;
}

export interface ForumReplyRecord {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: string;
}

export interface ForumPostLikeRecord {
  postId: string;
  userId: string;
  createdAt: string;
}

/**
 * A registered push-notification device token. Keyed unique on `token` — a
 * given installation belongs to whichever account most recently registered
 * it (re-registering under a new account reassigns `userId`, it doesn't
 * duplicate the row). `platform` gates which provider (APNs today; FCM would
 * key off "android") a token gets sent through.
 */
export interface DeviceRecord {
  id: string;
  userId: string;
  token: string;
  platform: "ios" | "android" | "web";
  updatedAt: string;
}

interface Snapshot {
  users: UserRecord[];
  neighborhoods: NeighborhoodRecord[];
  plans: PlanRecord[];
  participations: ParticipationRecord[];
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  feedback: FeedbackRecord[];
  declines: DeclineRecord[];
  dropouts: DropoutRecord[];
  smsCodes: SmsCodeRecord[];
  logs: LogRecord[];
  planSuggestions: PlanSuggestionRecord[];
  notifications: NotificationRecord[];
  relationships: RelationshipRecord[];
  inviteCodes: InviteCodeRecord[];
  cardImages: CardImageRecord[];
  communities: CommunityRecord[];
  communityMembers: CommunityMemberRecord[];
  communityPosts: CommunityPostRecord[];
  interestForums: InterestForumRecord[];
  forumMemberships: ForumMembershipRecord[];
  forumPosts: ForumPostRecord[];
  forumReplies: ForumReplyRecord[];
  forumPostLikes: ForumPostLikeRecord[];
  devices: DeviceRecord[];
}

const DATA_PATH = resolve(process.cwd(), "data.json");

function emptySnapshot(): Snapshot {
  return {
    users: [],
    neighborhoods: [],
    plans: [],
    participations: [],
    conversations: [],
    messages: [],
    feedback: [],
    declines: [],
    dropouts: [],
    smsCodes: [],
    logs: [],
    planSuggestions: [],
    notifications: [],
    relationships: [],
    inviteCodes: [],
    cardImages: [],
    communities: [],
    communityMembers: [],
    communityPosts: [],
    interestForums: [],
    forumMemberships: [],
    forumPosts: [],
    forumReplies: [],
    forumPostLikes: [],
    devices: [],
  };
}

// Crockford-style base32 alphabet — drops 0/O/I/L/U to keep codes legible when
// shared via text or read aloud at a launch event. 32^6 ≈ 1.07B values.
const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const INVITE_CODE_LENGTH = 6;
export const INVITE_CODES_PER_USER = 5;

// Launch forums only for the highest-density interests (2.6) — everything
// else stays a feed filter until it earns a dedicated forum. "Join more
// forums" in Settings still surfaces the full ALL_INTERESTS set; picking one
// outside this subset just filters the feed, it doesn't spin up a forum.
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

function generateInviteCode(): string {
  let s = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    s += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)];
  }
  return s;
}

/** Normalize user input — uppercase, strip whitespace + dashes. */
export function normalizeInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

function load(): Snapshot {
  if (!existsSync(DATA_PATH)) return emptySnapshot();
  try {
    const raw = readFileSync(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    return {
      ...emptySnapshot(),
      ...parsed,
      planSuggestions: parsed.planSuggestions ?? [],
      notifications: parsed.notifications ?? [],
      relationships: parsed.relationships ?? [],
      inviteCodes: parsed.inviteCodes ?? [],
      dropouts: parsed.dropouts ?? [],
      cardImages: parsed.cardImages ?? [],
      communities: parsed.communities ?? [],
      communityMembers: parsed.communityMembers ?? [],
      communityPosts: parsed.communityPosts ?? [],
      interestForums: parsed.interestForums ?? [],
      forumMemberships: parsed.forumMemberships ?? [],
      forumPosts: parsed.forumPosts ?? [],
      forumReplies: parsed.forumReplies ?? [],
      forumPostLikes: parsed.forumPostLikes ?? [],
      devices: parsed.devices ?? [],
    };
  } catch {
    return emptySnapshot();
  }
}

let snapshot: Snapshot = load();

function persist(): void {
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(snapshot, null, 2));
}

export const store = {
  /**
   * Replace the snapshot WITHOUT persisting or mirroring. Used exclusively by
   * `hydrateSnapshotFromMongo` — Mongo already holds this state, so writing
   * data.json or re-mirroring would be wasted IO / writeback noise.
   */
  resetLocalOnly(next: Snapshot): void {
    snapshot = next;
  },

  /**
   * Idempotent neighborhood bootstrap. Called from the seed when the static
   * neighborhood list isn't yet present. Replaces only the neighborhoods
   * collection — never touches users/plans/etc., so seeding on a partially
   * populated Mongo doesn't wipe real data.
   */
  seedNeighborhoods(list: NeighborhoodRecord[]): void {
    snapshot.neighborhoods = list;
    persist();
    mongoMirror.replaceAllNeighborhoods(list);
  },

  isEmpty(): boolean {
    return snapshot.users.length === 0 && snapshot.plans.length === 0;
  },

  // Users
  listUsers(): UserRecord[] {
    return [...snapshot.users];
  },
  findUserById(id: string): UserRecord | undefined {
    return snapshot.users.find((u) => u.id === id);
  },
  findUserByPhone(phoneNumber: string): UserRecord | undefined {
    return snapshot.users.find((u) => u.phoneNumber === phoneNumber);
  },
  createUser(
    phoneNumber: string,
    opts?: { accountSource?: "verify" | "seed" },
  ): UserRecord {
    const user: UserRecord = {
      id: randomUUID(),
      phoneNumber,
      accountSource: opts?.accountSource ?? "verify",
      firstName: "",
      neighborhoodId: null,
      neighborhoodIds: [] as string[],
      interests: [],
      avatarSeed: randomUUID(),
      avatarStyle: "avataaars",
      avatarPhotoDataUrl: undefined,
      onboardingComplete: false,
      createdAt: new Date().toISOString(),
      networkIds: [],
      dismissedNetworkPromptPlanIds: [],
    };
    snapshot.users.push(user);
    persist();
    mongoMirror.upsertUser(user);
    return user;
  },
  updateUser(id: string, patch: Partial<Omit<UserRecord, "id" | "createdAt">>): UserRecord | undefined {
    const user = snapshot.users.find((u) => u.id === id);
    if (!user) return undefined;
    Object.assign(user, patch);
    persist();
    mongoMirror.upsertUser(user);
    return user;
  },

  /**
   * Hard-delete a user and clean up everything that references them. Hosted
   * plans are cancelled (not deleted) so other participants' history doesn't
   * vanish. Messages and feedback authored by the user are intentionally
   * preserved — the chat UI tolerates missing senders.
   */
  deleteUserCascade(userId: string): boolean {
    const user = snapshot.users.find((u) => u.id === userId);
    if (!user) return false;
    const nowIso = new Date().toISOString();

    // Cancel active plans the user was hosting.
    for (const plan of snapshot.plans) {
      if (plan.creatorId === userId && !plan.cancelledAt) {
        plan.cancelledAt = nowIso;
        mongoMirror.upsertPlan(plan);
      }
    }

    // Drop the user from any conversation participantIds.
    for (const conv of snapshot.conversations) {
      if (conv.participantIds.includes(userId)) {
        conv.participantIds = conv.participantIds.filter((id) => id !== userId);
        mongoMirror.upsertConversation(conv);
      }
    }

    // Drop the user from other users' networkIds.
    for (const u of snapshot.users) {
      if (u.id === userId) continue;
      if (u.networkIds?.includes(userId)) {
        u.networkIds = u.networkIds.filter((id) => id !== userId);
        mongoMirror.upsertUser(u);
      }
    }

    // Remove participations, notifications, invite codes, relationships, dropouts.
    snapshot.participations = snapshot.participations.filter((p) => p.userId !== userId);
    snapshot.notifications = snapshot.notifications.filter((n) => n.userId !== userId);
    snapshot.inviteCodes = snapshot.inviteCodes.filter((c) => c.ownerUserId !== userId);
    snapshot.relationships = snapshot.relationships.filter(
      (r) => r.userId !== userId && r.targetId !== userId,
    );
    snapshot.dropouts = snapshot.dropouts.filter((d) => d.userId !== userId);
    snapshot.devices = snapshot.devices.filter((d) => d.userId !== userId);
    mongoMirror.deleteParticipationsByUser(userId);
    mongoMirror.deleteNotificationsByUser(userId);
    mongoMirror.deleteInviteCodesByOwner(userId);
    mongoMirror.deleteRelationshipsTouching(userId);
    mongoMirror.deleteDropoutsByUser(userId);
    mongoMirror.deleteDevicesByUser(userId);

    // Drop the user's community memberships and recount those communities.
    // Communities they organized are left in place (transfer/delete are
    // organizer actions on the community itself); bulletin posts are
    // preserved — the UI tolerates a missing author.
    const affectedCommunityIds = new Set(
      snapshot.communityMembers.filter((m) => m.userId === userId).map((m) => m.communityId),
    );
    snapshot.communityMembers = snapshot.communityMembers.filter((m) => m.userId !== userId);
    mongoMirror.deleteCommunityMembersByUser(userId);
    for (const cid of affectedCommunityIds) this.recountCommunityMembers(cid);

    // Finally the user record itself.
    snapshot.users = snapshot.users.filter((u) => u.id !== userId);
    mongoMirror.deleteUser(userId);

    persist();
    return true;
  },

  // ---- Blocking ----
  /**
   * Block `targetId` on behalf of `userId`. Best-effort cleanup: drops any
   * existing network connection both ways, and removes the blocked user from
   * any group chat `userId` hosts (their own plans' conversations) so the
   * block takes effect in chats immediately without touching chats hosted by
   * someone else.
   */
  blockUser(userId: string, targetId: string): UserRecord | undefined {
    const user = snapshot.users.find((u) => u.id === userId);
    if (!user) return undefined;
    const set = new Set(user.blockedUserIds ?? []);
    set.add(targetId);
    user.blockedUserIds = [...set];

    // Drop any existing mutual network connection.
    if (user.networkIds?.includes(targetId)) {
      user.networkIds = user.networkIds.filter((id) => id !== targetId);
    }
    const target = snapshot.users.find((u) => u.id === targetId);
    if (target?.networkIds?.includes(userId)) {
      target.networkIds = target.networkIds.filter((id) => id !== userId);
      mongoMirror.upsertUser(target);
    }
    this.deleteRelationship(userId, targetId, "network");
    this.deleteRelationship(targetId, userId, "network");

    // Remove the blocked user from any group chat this user hosts.
    for (const plan of snapshot.plans) {
      if (plan.creatorId !== userId) continue;
      const conv = snapshot.conversations.find((c) => c.planId === plan.id && c.type === "group");
      if (conv && conv.participantIds.includes(targetId)) {
        conv.participantIds = conv.participantIds.filter((id) => id !== targetId);
        mongoMirror.upsertConversation(conv);
      }
    }

    persist();
    mongoMirror.upsertUser(user);
    return user;
  },
  unblockUser(userId: string, targetId: string): UserRecord | undefined {
    const user = snapshot.users.find((u) => u.id === userId);
    if (!user) return undefined;
    if (!user.blockedUserIds?.includes(targetId)) return user;
    user.blockedUserIds = user.blockedUserIds.filter((id) => id !== targetId);
    persist();
    mongoMirror.upsertUser(user);
    return user;
  },
  listBlockedUserIds(userId: string): string[] {
    return snapshot.users.find((u) => u.id === userId)?.blockedUserIds ?? [];
  },
  /** True when either user has blocked the other — used to gate visibility both ways. */
  isBlockedEitherWay(aId: string, bId: string): boolean {
    const a = snapshot.users.find((u) => u.id === aId);
    const b = snapshot.users.find((u) => u.id === bId);
    if (a?.blockedUserIds?.includes(bId)) return true;
    if (b?.blockedUserIds?.includes(aId)) return true;
    return false;
  },

  // ---- Muted conversations ----
  setConversationMuted(userId: string, conversationId: string, muted: boolean): UserRecord | undefined {
    const user = snapshot.users.find((u) => u.id === userId);
    if (!user) return undefined;
    const set = new Set(user.mutedConversationIds ?? []);
    if (muted) set.add(conversationId);
    else set.delete(conversationId);
    user.mutedConversationIds = [...set];
    persist();
    mongoMirror.upsertUser(user);
    return user;
  },
  isConversationMuted(userId: string, conversationId: string): boolean {
    return (snapshot.users.find((u) => u.id === userId)?.mutedConversationIds ?? []).includes(conversationId);
  },

  // ---- Left / hidden-from-inbox conversations ----
  setConversationLeft(userId: string, conversationId: string, left: boolean): UserRecord | undefined {
    const user = snapshot.users.find((u) => u.id === userId);
    if (!user) return undefined;
    const set = new Set(user.leftConversationIds ?? []);
    if (left) set.add(conversationId);
    else set.delete(conversationId);
    user.leftConversationIds = [...set];
    persist();
    mongoMirror.upsertUser(user);
    return user;
  },
  hasLeftConversation(userId: string, conversationId: string): boolean {
    return (snapshot.users.find((u) => u.id === userId)?.leftConversationIds ?? []).includes(
      conversationId,
    );
  },
  /** Filter out users who explicitly left this conversation (unless force-included). */
  filterNotLeft(conversationId: string, userIds: string[], forceInclude: string[] = []): string[] {
    const force = new Set(forceInclude);
    return userIds.filter(
      (id) => force.has(id) || !this.hasLeftConversation(id, conversationId),
    );
  },

  // Neighborhoods
  listNeighborhoods(): NeighborhoodRecord[] {
    return [...snapshot.neighborhoods];
  },
  findNeighborhoodById(id: string): NeighborhoodRecord | undefined {
    return snapshot.neighborhoods.find((n) => n.id === id);
  },
  /**
   * Resolve a neighborhood reference to the canonical UUID `id`.
   * Accepts the UUID itself, or a leftover Mongo `_id` string from older
   * writes that stored ObjectId instead of our pinned neighborhood UUID.
   */
  resolveNeighborhoodId(raw: string | null | undefined): string | undefined {
    if (raw == null) return undefined;
    const trimmed = String(raw).trim();
    if (!trimmed) return undefined;
    if (this.findNeighborhoodById(trimmed)) return trimmed;
    for (const n of snapshot.neighborhoods) {
      const oid = (n as { _id?: { toString(): string } | string })._id;
      if (oid != null && String(oid) === trimmed) return n.id;
    }
    return undefined;
  },
  /** Upsert one neighborhood by UUID id (does not wipe the collection). */
  ensureNeighborhood(record: NeighborhoodRecord): void {
    const clean: NeighborhoodRecord = {
      id: record.id,
      name: record.name,
      metro: record.metro,
      adjacent: [...record.adjacent],
      lat: record.lat,
      lng: record.lng,
    };
    const idx = snapshot.neighborhoods.findIndex((n) => n.id === clean.id);
    if (idx >= 0) {
      // Object.assign keeps any hydrated Mongo `_id` so legacy ObjectId
      // neighborhood refs on users can still be remapped at runtime.
      Object.assign(snapshot.neighborhoods[idx]!, clean);
    } else {
      snapshot.neighborhoods.push({ ...clean });
    }
    persist();
    mongoMirror.upsertNeighborhood(clean);
  },
  /** Nearest hood with coords — used when a plan has a venue but no explicit neighborhood. */
  nearestNeighborhoodId(lat: number, lng: number): string | undefined {
    let bestId: string | undefined;
    let bestD = Infinity;
    for (const n of snapshot.neighborhoods) {
      if (typeof n.lat !== "number" || typeof n.lng !== "number") continue;
      const dLat = n.lat - lat;
      const dLng = n.lng - lng;
      const d = dLat * dLat + dLng * dLng;
      if (d < bestD) {
        bestD = d;
        bestId = n.id;
      }
    }
    return bestId;
  },
  // returns the user's neighborhood + adjacent neighborhood ids
  neighborhoodScope(neighborhoodId: string): string[] {
    const resolved = this.resolveNeighborhoodId(neighborhoodId) ?? neighborhoodId;
    const root = this.findNeighborhoodById(resolved);
    if (!root) return [];
    return [root.id, ...root.adjacent];
  },

  // Plans
  listPlans(): PlanRecord[] {
    return [...snapshot.plans].sort((a, b) => a.date.localeCompare(b.date));
  },
  listPlansByNeighborhoods(neighborhoodIds: string[]): PlanRecord[] {
    const set = new Set(neighborhoodIds);
    return this.listPlans().filter((p) => set.has(p.neighborhoodId));
  },
  listPlansByCreator(creatorId: string): PlanRecord[] {
    return this.listPlans().filter((p) => p.creatorId === creatorId);
  },
  findPlanById(id: string): PlanRecord | undefined {
    return snapshot.plans.find((p) => p.id === id);
  },
  /**
   * Plans-by-venue lookup keyed off the Google Places ID. Backs the
   * (post-launch) Spots grid + "people who went to X" venue history. Cheap
   * O(n) scan today — fine while the dataset is small, and the only callers
   * are admin/explore screens. Move to an index if it gets hot.
   */
  listPlansByPlaceId(placeId: string): PlanRecord[] {
    if (!placeId) return [];
    return snapshot.plans.filter((p) => p.location?.placeId === placeId);
  },
  /**
   * Aggregate plan counts per venue — feeds the Explore Spots grid when it
   * ships. Includes the latest venue snapshot (name/address/coords) so the
   * caller doesn't need to re-resolve from Google.
   */
  listVenueStats(): Array<{
    placeId: string;
    name: string;
    address: string;
    lat?: number;
    lng?: number;
    planCount: number;
    lastPlanAt: string;
  }> {
    const byPlace = new Map<
      string,
      {
        placeId: string;
        name: string;
        address: string;
        lat?: number;
        lng?: number;
        planCount: number;
        lastPlanAt: string;
      }
    >();
    for (const p of snapshot.plans) {
      const pid = p.location?.placeId;
      if (!pid) continue;
      const prev = byPlace.get(pid);
      if (prev) {
        prev.planCount += 1;
        if (p.createdAt > prev.lastPlanAt) {
          prev.lastPlanAt = p.createdAt;
          // Latest snapshot wins for the display fields so renames roll forward.
          prev.name = p.location.name;
          prev.address = p.location.address;
          prev.lat = p.location.lat;
          prev.lng = p.location.lng;
        }
      } else {
        byPlace.set(pid, {
          placeId: pid,
          name: p.location.name,
          address: p.location.address,
          lat: p.location.lat,
          lng: p.location.lng,
          planCount: 1,
          lastPlanAt: p.createdAt,
        });
      }
    }
    return Array.from(byPlace.values()).sort((a, b) => b.planCount - a.planCount);
  },
  createPlan(input: Omit<PlanRecord, "id" | "createdAt">): PlanRecord {
    const id = randomUUID();
    const plan: PlanRecord = {
      isFlexibleLocation: false,
      planKind: "standard",
      visibility: "everyone",
      visibilityCommunityTag: null,
      communityId: null,
      capacity: null,
      joinType: "open",
      isRecurring: false,
      seriesId: null,
      lockedAt: null,
      ...input,
      id,
      createdAt: new Date().toISOString(),
    };
    // Recurring posts get their own id as the series anchor unless the caller
    // explicitly passed a seriesId (future code that spawns child instances).
    if (plan.isRecurring && !plan.seriesId) {
      plan.seriesId = id;
    }
    snapshot.plans.push(plan);
    persist();
    mongoMirror.upsertPlan(plan);
    return plan;
  },

  updatePlan(id: string, patch: Partial<Omit<PlanRecord, "id" | "createdAt">>): PlanRecord | undefined {
    const plan = snapshot.plans.find((p) => p.id === id);
    if (!plan) return undefined;
    Object.assign(plan, patch);
    // Explicit undefined means "clear" — Object.assign leaves the key as
    // undefined, which JSON/Mongo would otherwise omit and leave stale.
    if ("flyerDataUrl" in patch && patch.flyerDataUrl === undefined) {
      delete plan.flyerDataUrl;
    }
    persist();
    mongoMirror.upsertPlan(plan);
    return plan;
  },

  // Plan suggestions (“looking for” replies)
  listPlanSuggestions(planId: string): PlanSuggestionRecord[] {
    return snapshot.planSuggestions.filter((s) => s.planId === planId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  createPlanSuggestion(planId: string, userId: string, body: string): PlanSuggestionRecord {
    const row: PlanSuggestionRecord = {
      id: randomUUID(),
      planId,
      userId,
      body,
      createdAt: new Date().toISOString(),
    };
    snapshot.planSuggestions.push(row);
    persist();
    mongoMirror.upsertPlanSuggestion(row);
    return row;
  },

  // Participations
  listAllParticipations(): ParticipationRecord[] {
    return [...snapshot.participations];
  },
  listAllMessages(): MessageRecord[] {
    return [...snapshot.messages];
  },
  listAllConversations(): ConversationRecord[] {
    return [...snapshot.conversations];
  },
  listAllFeedback(): FeedbackRecord[] {
    return [...snapshot.feedback];
  },
  listAllPlanSuggestions(): PlanSuggestionRecord[] {
    return [...snapshot.planSuggestions];
  },
  listLogsRecent(limit: number): LogRecord[] {
    return [...snapshot.logs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(0, limit));
  },
  listParticipationsForPlan(planId: string): ParticipationRecord[] {
    return snapshot.participations.filter((p) => p.planId === planId);
  },
  listParticipationsForUser(userId: string): ParticipationRecord[] {
    return snapshot.participations.filter((p) => p.userId === userId);
  },
  findParticipation(planId: string, userId: string): ParticipationRecord | undefined {
    return snapshot.participations.find((p) => p.planId === planId && p.userId === userId);
  },
  upsertParticipation(planId: string, userId: string, state: ParticipationState): ParticipationRecord {
    const existing = this.findParticipation(planId, userId);
    if (existing) {
      existing.state = state;
      existing.updatedAt = new Date().toISOString();
      // Backfill createdAt on legacy rows that never had one. After the
      // backfill the field is stable across future state changes.
      if (!existing.createdAt) existing.createdAt = existing.updatedAt;
      persist();
      mongoMirror.upsertParticipation(existing);
      return existing;
    }
    const now = new Date().toISOString();
    const record: ParticipationRecord = {
      id: randomUUID(),
      planId,
      userId,
      state,
      createdAt: now,
      updatedAt: now,
      attended: null,
    };
    snapshot.participations.push(record);
    persist();
    mongoMirror.upsertParticipation(record);
    return record;
  },
  /**
   * Set the post-plan attendance signal on a participation. Called from the
   * feedback POST — submitting feedback implicitly confirms you went. We never
   * write `false` from a flow (silence ≠ no-show), but callers can pass it
   * explicitly if a future "didn't go after all" path is added.
   */
  markAttended(planId: string, userId: string, attended: boolean): ParticipationRecord | undefined {
    const row = this.findParticipation(planId, userId);
    if (!row) return undefined;
    row.attended = attended;
    row.updatedAt = new Date().toISOString();
    persist();
    mongoMirror.upsertParticipation(row);
    return row;
  },
  deleteParticipation(planId: string, userId: string): void {
    snapshot.participations = snapshot.participations.filter(
      (p) => !(p.planId === planId && p.userId === userId)
    );
    persist();
    mongoMirror.deleteParticipation(planId, userId);
  },
  /**
   * Record an explicit drop-out event. Call from any endpoint that removes an
   * active RSVP (DELETE /participation, outgoing host on transfer). Cascade
   * deletes (account deletion) do NOT emit this — the user is gone.
   */
  recordDropOut(userId: string, planId: string, fromState: ParticipationState): DropoutRecord {
    const record: DropoutRecord = {
      id: randomUUID(),
      userId,
      planId,
      fromState,
      createdAt: new Date().toISOString(),
    };
    snapshot.dropouts.push(record);
    persist();
    mongoMirror.upsertDropout(record);
    return record;
  },
  listAllDropouts(): DropoutRecord[] {
    return [...snapshot.dropouts];
  },

  // Conversations + Messages
  findGroupConversationByPlan(planId: string): ConversationRecord | undefined {
    return snapshot.conversations.find((c) => c.planId === planId && c.type === "group");
  },
  findDmInPlan(planId: string, a: string, b: string): ConversationRecord | undefined {
    return snapshot.conversations.find(
      (c) =>
        c.planId === planId &&
        c.type === "dm" &&
        c.participantIds.length === 2 &&
        c.participantIds.includes(a) &&
        c.participantIds.includes(b)
    );
  },
  ensureGroupConversation(
    planId: string,
    participantIds: string[],
    opts?: { rejoinIds?: string[] },
  ): ConversationRecord {
    const existing = this.findGroupConversationByPlan(planId);
    if (existing) {
      const toAdd = this.filterNotLeft(existing.id, participantIds, opts?.rejoinIds ?? []);
      existing.participantIds = Array.from(new Set([...existing.participantIds, ...toAdd]));
      persist();
      mongoMirror.upsertConversation(existing);
      return existing;
    }
    const conv: ConversationRecord = {
      id: randomUUID(),
      planId,
      type: "group",
      participantIds: Array.from(new Set(participantIds)),
      createdAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    };
    snapshot.conversations.push(conv);
    persist();
    mongoMirror.upsertConversation(conv);
    return conv;
  },
  /** Remove a single participant from a group conversation (explicit "leave
   *  chat"). Returns the updated conversation, or undefined if not found. */
  removeConversationParticipant(convId: string, userId: string): ConversationRecord | undefined {
    const conv = snapshot.conversations.find((c) => c.id === convId);
    if (!conv) return undefined;
    if (!conv.participantIds.includes(userId)) {
      this.setConversationLeft(userId, convId, true);
      return conv;
    }
    conv.participantIds = conv.participantIds.filter((id) => id !== userId);
    this.setConversationLeft(userId, convId, true);
    persist();
    mongoMirror.upsertConversation(conv);
    return conv;
  },
  createDm(planId: string, a: string, b: string): ConversationRecord {
    const existing = this.findDmInPlan(planId, a, b);
    if (existing) return existing;
    const conv: ConversationRecord = {
      id: randomUUID(),
      planId,
      type: "dm",
      participantIds: [a, b],
      createdAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    };
    snapshot.conversations.push(conv);
    persist();
    mongoMirror.upsertConversation(conv);
    return conv;
  },
  findConversationById(id: string): ConversationRecord | undefined {
    return snapshot.conversations.find((c) => c.id === id);
  },
  listMessagesForConversation(conversationId: string): MessageRecord[] {
    return snapshot.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  findMessageById(messageId: string): MessageRecord | undefined {
    return snapshot.messages.find((m) => m.id === messageId);
  },
  createMessage(
    conversationId: string,
    senderId: string,
    body: string,
    imageUrl?: string | null,
  ): MessageRecord {
    const message: MessageRecord = {
      id: randomUUID(),
      conversationId,
      senderId,
      body,
      createdAt: new Date().toISOString(),
      readBy: [senderId],
      kind: "user",
      ...(imageUrl ? { imageUrl } : {}),
    };
    snapshot.messages.push(message);
    const conv = snapshot.conversations.find((c) => c.id === conversationId);
    if (conv) conv.lastMessageAt = message.createdAt;
    persist();
    mongoMirror.upsertMessage(message);
    if (conv) mongoMirror.upsertConversation(conv);
    return message;
  },

  createSystemMessage(conversationId: string, body: string): MessageRecord {
    const message: MessageRecord = {
      id: randomUUID(),
      conversationId,
      senderId: "__system__",
      body,
      createdAt: new Date().toISOString(),
      readBy: [],
      kind: "system",
    };
    snapshot.messages.push(message);
    const conv = snapshot.conversations.find((c) => c.id === conversationId);
    if (conv) conv.lastMessageAt = message.createdAt;
    persist();
    mongoMirror.upsertMessage(message);
    if (conv) mongoMirror.upsertConversation(conv);
    return message;
  },

  /**
   * Copy every message from one conversation into another (new ids, same
   * sender/body/timestamp/kind/reactions/poll). Used by "Do it again" so the
   * re-planned event's group chat carries the previous thread's history.
   * Returns how many messages were cloned.
   */
  cloneConversationMessages(fromConversationId: string, toConversationId: string): number {
    const src = snapshot.messages
      .filter((m) => m.conversationId === fromConversationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let lastAt = "";
    for (const m of src) {
      const copy: MessageRecord = { ...m, id: randomUUID(), conversationId: toConversationId };
      snapshot.messages.push(copy);
      mongoMirror.upsertMessage(copy);
      if (m.createdAt > lastAt) lastAt = m.createdAt;
    }
    if (src.length > 0) {
      const conv = snapshot.conversations.find((c) => c.id === toConversationId);
      if (conv && lastAt > (conv.lastMessageAt ?? "")) {
        conv.lastMessageAt = lastAt;
        mongoMirror.upsertConversation(conv);
      }
      persist();
    }
    return src.length;
  },

  /**
   * Post a poll into a conversation. The poll question doubles as the message
   * `body` so inbox previews and notifications work without poll-specific
   * branching. Options get stable ids so votes survive edits.
   */
  createPollMessage(
    conversationId: string,
    senderId: string,
    question: string,
    optionTexts: string[],
  ): MessageRecord {
    const message: MessageRecord = {
      id: randomUUID(),
      conversationId,
      senderId,
      body: question,
      createdAt: new Date().toISOString(),
      readBy: [senderId],
      kind: "poll",
      poll: {
        question,
        options: optionTexts.map((text) => ({ id: randomUUID(), text })),
        votes: {},
        closed: false,
      },
    };
    snapshot.messages.push(message);
    const conv = snapshot.conversations.find((c) => c.id === conversationId);
    if (conv) conv.lastMessageAt = message.createdAt;
    persist();
    mongoMirror.upsertMessage(message);
    if (conv) mongoMirror.upsertConversation(conv);
    return message;
  },

  /**
   * Cast (or change) a user's vote on a poll. Single-choice: the user is first
   * removed from every option, then added to `optionId` — unless they tapped the
   * option they already held, which clears their vote (toggle off). No-op on a
   * closed poll or unknown option. Returns the updated message, or undefined if
   * the message isn't a votable poll.
   */
  votePoll(messageId: string, userId: string, optionId: string): MessageRecord | undefined {
    const message = snapshot.messages.find((m) => m.id === messageId);
    if (!message || message.kind !== "poll" || !message.poll) return undefined;
    const poll = message.poll;
    if (poll.closed) return message;
    if (!poll.options.some((o) => o.id === optionId)) return undefined;

    const hadVote = (poll.votes[optionId] ?? []).includes(userId);
    const votes: Record<string, string[]> = {};
    for (const [oid, users] of Object.entries(poll.votes)) {
      const kept = users.filter((u) => u !== userId);
      if (kept.length) votes[oid] = kept;
    }
    if (!hadVote) votes[optionId] = [...(votes[optionId] ?? []), userId];
    poll.votes = votes;
    persist();
    mongoMirror.upsertMessage(message);
    return message;
  },

  /** Freeze a poll's results. Permission is enforced by the caller. */
  closePoll(messageId: string): MessageRecord | undefined {
    const message = snapshot.messages.find((m) => m.id === messageId);
    if (!message || message.kind !== "poll" || !message.poll) return undefined;
    message.poll.closed = true;
    message.poll.closedAt = new Date().toISOString();
    persist();
    mongoMirror.upsertMessage(message);
    return message;
  },

  /** Re-open a closed poll so voting resumes. Permission is enforced by the caller. */
  reopenPoll(messageId: string): MessageRecord | undefined {
    const message = snapshot.messages.find((m) => m.id === messageId);
    if (!message || message.kind !== "poll" || !message.poll) return undefined;
    message.poll.closed = false;
    delete message.poll.closedAt;
    persist();
    mongoMirror.upsertMessage(message);
    return message;
  },

  /**
   * Toggle a user's emoji reaction on a message. Adds the userId if absent,
   * removes it if present. Empty emoji buckets are pruned. Returns the updated
   * message (or undefined if not found).
   */
  toggleReaction(messageId: string, userId: string, emoji: string): MessageRecord | undefined {
    const message = snapshot.messages.find((m) => m.id === messageId);
    if (!message) return undefined;
    const reactions: Record<string, string[]> = { ...(message.reactions ?? {}) };
    const current = new Set(reactions[emoji] ?? []);
    if (current.has(userId)) current.delete(userId);
    else current.add(userId);
    if (current.size === 0) delete reactions[emoji];
    else reactions[emoji] = [...current];
    message.reactions = reactions;
    persist();
    mongoMirror.upsertMessage(message);
    return message;
  },

  // Feedback
  createFeedback(input: Omit<FeedbackRecord, "id" | "createdAt">): FeedbackRecord {
    const record: FeedbackRecord = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    };
    snapshot.feedback.push(record);
    persist();
    mongoMirror.upsertFeedback(record);
    return record;
  },
  listFeedbackForHost(hostId: string): FeedbackRecord[] {
    return snapshot.feedback.filter((f) => f.toHostId === hostId);
  },
  listFeedbackForPlan(planId: string): FeedbackRecord[] {
    return snapshot.feedback.filter((f) => f.planId === planId);
  },

  // Declines (used by recommendation algo)
  recordDecline(userId: string, planId: string): void {
    const record: DeclineRecord = {
      id: randomUUID(),
      userId,
      planId,
      createdAt: new Date().toISOString(),
    };
    snapshot.declines.push(record);
    persist();
    mongoMirror.upsertDecline(record);
  },
  recentDeclinesForUser(userId: string, sinceIso: string): DeclineRecord[] {
    return snapshot.declines.filter((d) => d.userId === userId && d.createdAt >= sinceIso);
  },
  listAllDeclines(): DeclineRecord[] {
    return [...snapshot.declines];
  },

  // SMS codes (mock Twilio)
  saveSmsCode(phoneNumber: string, code: string, ttlMs: number): SmsCodeRecord {
    snapshot.smsCodes = snapshot.smsCodes.filter((c) => c.phoneNumber !== phoneNumber);
    const record: SmsCodeRecord = {
      phoneNumber,
      code,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    };
    snapshot.smsCodes.push(record);
    persist();
    return record;
  },
  consumeSmsCode(phoneNumber: string, code: string): boolean {
    const record = snapshot.smsCodes.find((c) => c.phoneNumber === phoneNumber);
    if (!record) return false;
    if (record.code !== code) return false;
    if (new Date(record.expiresAt).getTime() < Date.now()) return false;
    snapshot.smsCodes = snapshot.smsCodes.filter((c) => c.phoneNumber !== phoneNumber);
    persist();
    return true;
  },

  // Comments — kept as messages on the group conversation in v2
  // (legacy `comments` collection removed)

  // Logs
  log(event: string, payload: unknown): void {
    const entry: LogRecord = {
      id: randomUUID(),
      event,
      payload,
      createdAt: new Date().toISOString(),
    };
    snapshot.logs.push(entry);
    persist();
    mongoMirror.upsertLog(entry);
  },

  // Invite codes
  listInviteCodesForOwner(ownerUserId: string): InviteCodeRecord[] {
    return snapshot.inviteCodes.filter((c) => c.ownerUserId === ownerUserId);
  },
  listAllInviteCodes(): InviteCodeRecord[] {
    return [...snapshot.inviteCodes];
  },
  findInviteCodeByCode(raw: string): InviteCodeRecord | undefined {
    const norm = normalizeInviteCode(raw);
    return snapshot.inviteCodes.find((c) => c.code === norm);
  },
  createInviteCodesForUser(ownerUserId: string, count: number): InviteCodeRecord[] {
    const created: InviteCodeRecord[] = [];
    while (created.length < count) {
      const code = generateInviteCode();
      // Skip if collision against existing — astronomically unlikely with the
      // 32^6 keyspace and ~hundreds of users, but cheap to guard.
      if (snapshot.inviteCodes.some((c) => c.code === code)) continue;
      const row: InviteCodeRecord = {
        id: randomUUID(),
        code,
        ownerUserId,
        redeemedByUserId: null,
        redeemedAt: null,
        createdAt: new Date().toISOString(),
      };
      snapshot.inviteCodes.push(row);
      created.push(row);
      mongoMirror.upsertInviteCode(row);
    }
    persist();
    return created;
  },
  redeemInviteCode(raw: string, redeemerUserId: string): InviteCodeRecord | null {
    const row = this.findInviteCodeByCode(raw);
    if (!row) return null;
    if (row.redeemedByUserId) return row; // idempotent — return prior state
    if (row.ownerUserId === redeemerUserId) return null; // can't redeem your own
    row.redeemedByUserId = redeemerUserId;
    row.redeemedAt = new Date().toISOString();
    persist();
    mongoMirror.upsertInviteCode(row);
    return row;
  },

  // Relationships
  listRelationshipsForUser(userId: string): RelationshipRecord[] {
    return snapshot.relationships.filter((r) => r.userId === userId);
  },
  listAllRelationships(): RelationshipRecord[] {
    return [...snapshot.relationships];
  },
  upsertRelationship(input: {
    userId: string;
    targetId: string;
    kind: "network" | "community";
    source?: RelationshipRecord["source"];
    role?: CommunityRole;
  }): RelationshipRecord {
    const existing = snapshot.relationships.find(
      (r) => r.userId === input.userId && r.targetId === input.targetId && r.kind === input.kind,
    );
    if (existing) return existing;
    const row: RelationshipRecord = {
      id: randomUUID(),
      userId: input.userId,
      targetId: input.targetId,
      kind: input.kind,
      source: input.source ?? "other",
      role: input.kind === "community" ? (input.role ?? "member") : null,
      createdAt: new Date().toISOString(),
    };
    snapshot.relationships.push(row);
    persist();
    mongoMirror.upsertRelationship(row);
    return row;
  },
  /**
   * Promote/demote a community member. No-op for `network` edges. Returns the
   * updated row, or undefined if the relationship doesn't exist.
   */
  setCommunityRole(userId: string, communityId: string, role: CommunityRole): RelationshipRecord | undefined {
    const row = snapshot.relationships.find(
      (r) => r.userId === userId && r.targetId === communityId && r.kind === "community",
    );
    if (!row) return undefined;
    row.role = role;
    persist();
    mongoMirror.upsertRelationship(row);
    return row;
  },
  deleteRelationship(userId: string, targetId: string, kind: "network" | "community"): void {
    const before = snapshot.relationships.length;
    snapshot.relationships = snapshot.relationships.filter(
      (r) => !(r.userId === userId && r.targetId === targetId && r.kind === kind),
    );
    if (snapshot.relationships.length !== before) {
      persist();
      mongoMirror.deleteRelationship(userId, targetId, kind);
    }
  },

  // Notifications
  listNotificationsForUser(userId: string, limit = 50): NotificationRecord[] {
    return snapshot.notifications
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(0, limit));
  },
  /** Insert a notification only if no record with the same dedupKey exists. */
  insertNotificationIfNew(input: Omit<NotificationRecord, "id" | "createdAt" | "readAt">): NotificationRecord | null {
    const existing = snapshot.notifications.find((n) => n.dedupKey === input.dedupKey);
    if (existing) return null;
    const row: NotificationRecord = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    snapshot.notifications.push(row);
    persist();
    mongoMirror.upsertNotification(row);
    return row;
  },
  markAllNotificationsRead(userId: string): number {
    const now = new Date().toISOString();
    let count = 0;
    for (const n of snapshot.notifications) {
      if (n.userId === userId && n.readAt === null) {
        n.readAt = now;
        mongoMirror.upsertNotification(n);
        count++;
      }
    }
    if (count > 0) persist();
    return count;
  },
  deleteNotification(userId: string, notificationId: string): boolean {
    const before = snapshot.notifications.length;
    snapshot.notifications = snapshot.notifications.filter(
      (n) => !(n.id === notificationId && n.userId === userId),
    );
    if (snapshot.notifications.length === before) return false;
    persist();
    mongoMirror.deleteNotification(notificationId);
    return true;
  },
  clearAllNotificationsForUser(userId: string): number {
    const before = snapshot.notifications.length;
    snapshot.notifications = snapshot.notifications.filter((n) => n.userId !== userId);
    const removed = before - snapshot.notifications.length;
    if (removed > 0) {
      persist();
      mongoMirror.deleteNotificationsByUser(userId);
    }
    return removed;
  },
  listAllNotifications(): NotificationRecord[] {
    return [...snapshot.notifications];
  },

  // ---- Event-card image library (admin-managed) ----
  listCardImages(): CardImageRecord[] {
    return [...snapshot.cardImages].sort((a, b) => a.sortOrder - b.sortOrder);
  },
  addCardImage(input: { url: string; label?: string }): CardImageRecord {
    const maxOrder = snapshot.cardImages.reduce((m, c) => Math.max(m, c.sortOrder), -1);
    const row: CardImageRecord = {
      id: randomUUID(),
      url: input.url,
      label: input.label?.trim() || undefined,
      sortOrder: maxOrder + 1,
      createdAt: new Date().toISOString(),
    };
    snapshot.cardImages.push(row);
    persist();
    mongoMirror.upsertCardImage(row);
    return row;
  },
  removeCardImage(id: string): boolean {
    const before = snapshot.cardImages.length;
    snapshot.cardImages = snapshot.cardImages.filter((c) => c.id !== id);
    if (snapshot.cardImages.length === before) return false;
    persist();
    mongoMirror.deleteCardImage(id);
    return true;
  },

  // ---- Communities ----
  listCommunities(): CommunityRecord[] {
    return [...snapshot.communities];
  },
  listApprovedCommunities(): CommunityRecord[] {
    return snapshot.communities.filter((c) => c.creationStatus === "approved");
  },
  listPendingCommunities(): CommunityRecord[] {
    return snapshot.communities
      .filter((c) => c.creationStatus === "pending")
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  },
  /** Promote legacy pending communities to live (review queue no longer gates go-live). */
  promotePendingCommunities(): number {
    const now = new Date().toISOString();
    let promoted = 0;
    for (const community of this.listPendingCommunities()) {
      this.updateCommunity(community.id, {
        creationStatus: "approved",
        reviewedAt: community.reviewedAt ?? now,
        rejectionNote: null,
      });
      promoted += 1;
    }
    return promoted;
  },
  /**
   * Rewrite legacy 8-option community categories (run_club, book_club, …) to
   * the master InterestTag taxonomy. Idempotent — returns how many rows changed.
   */
  migrateCommunityCategories(): number {
    let migrated = 0;
    for (const community of snapshot.communities) {
      const next = normalizeCommunityCategory(String(community.category ?? ""));
      if (community.category === next) continue;
      this.updateCommunity(community.id, { category: next });
      migrated += 1;
    }
    return migrated;
  },
  findCommunityById(id: string): CommunityRecord | undefined {
    return snapshot.communities.find((c) => c.id === id);
  },
  listCommunitiesForOrganizer(organizerId: string): CommunityRecord[] {
    return snapshot.communities.filter((c) => c.organizerId === organizerId);
  },
  /**
   * Create a community (default `approved` — live immediately) and seed the
   * organizer's active membership in one shot. `member_count` starts at 1.
   * Pass `creationStatus: "pending"` only for explicit review-queue cases.
   */
  createCommunity(input: {
    name: string;
    description: string;
    coverImage?: string | null;
    category: CommunityCategory;
    organizerId: string;
    isFounding?: boolean;
    creationStatus?: CommunityCreationStatus;
    screeningQuestion?: string | null;
    bulletinPermission?: CommunityPostingPermission;
    planPostingPermission?: CommunityPostingPermission;
    reviewedBy?: string | null;
  }): CommunityRecord {
    const now = new Date().toISOString();
    const creationStatus: CommunityCreationStatus = input.creationStatus ?? "approved";
    const approved = creationStatus === "approved";
    const community: CommunityRecord = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      coverImage: input.coverImage ?? null,
      category: normalizeCommunityCategory(String(input.category ?? "")),
      organizerId: input.organizerId,
      memberCount: 1,
      creationStatus,
      isFounding: input.isFounding ?? false,
      bulletinPermission: input.bulletinPermission ?? "members",
      planPostingPermission: input.planPostingPermission ?? "members",
      chatEnabled: true,
      bulletinEnabled: true,
      bulletinRequiresApproval: false,
      visibility: "everyone",
      screeningQuestion: input.screeningQuestion ?? null,
      rejectionNote: null,
      submittedAt: now,
      reviewedAt: approved ? now : null,
      reviewedBy: approved ? (input.reviewedBy ?? null) : null,
      createdAt: now,
    };
    snapshot.communities.push(community);
    const membership: CommunityMemberRecord = {
      id: randomUUID(),
      communityId: community.id,
      userId: input.organizerId,
      role: "organizer",
      status: "active",
      screeningAnswer: null,
      joinedAt: now,
    };
    snapshot.communityMembers.push(membership);
    persist();
    mongoMirror.upsertCommunity(community);
    mongoMirror.upsertCommunityMember(membership);
    return community;
  },
  updateCommunity(
    id: string,
    patch: Partial<Omit<CommunityRecord, "id" | "organizerId" | "createdAt">>,
  ): CommunityRecord | undefined {
    const community = snapshot.communities.find((c) => c.id === id);
    if (!community) return undefined;
    Object.assign(community, patch);
    persist();
    mongoMirror.upsertCommunity(community);
    return community;
  },

  /**
   * Hand organizer to an active member. Demotes the previous organizer's
   * membership to `member` (caller removes it separately when leaving).
   */
  transferCommunityOrganizer(
    communityId: string,
    newOrganizerId: string,
  ): CommunityRecord | undefined {
    const community = snapshot.communities.find((c) => c.id === communityId);
    if (!community) return undefined;
    const previousOrganizerId = community.organizerId;
    if (previousOrganizerId === newOrganizerId) return community;

    community.organizerId = newOrganizerId;
    mongoMirror.upsertCommunity(community);

    const incoming = this.findCommunityMembership(communityId, newOrganizerId);
    if (incoming) {
      incoming.role = "organizer";
      incoming.status = "active";
      mongoMirror.upsertCommunityMember(incoming);
    } else {
      this.upsertCommunityMembership({
        communityId,
        userId: newOrganizerId,
        role: "organizer",
        status: "active",
      });
    }

    const outgoing = this.findCommunityMembership(communityId, previousOrganizerId);
    if (outgoing && outgoing.userId !== newOrganizerId) {
      outgoing.role = "member";
      mongoMirror.upsertCommunityMember(outgoing);
    }

    persist();
    return community;
  },

  /**
   * Hard-delete a community and its memberships, bulletin posts, and group
   * chat. Cancels any still-active plans tagged with this communityId.
   * Returns cancelled plan ids so the route can notify participants.
   */
  deleteCommunity(communityId: string): { cancelledPlanIds: string[] } | undefined {
    const community = snapshot.communities.find((c) => c.id === communityId);
    if (!community) return undefined;

    const now = new Date().toISOString();
    const cancelledPlanIds: string[] = [];
    for (const plan of snapshot.plans) {
      if (plan.communityId === communityId && !plan.cancelledAt) {
        plan.cancelledAt = now;
        cancelledPlanIds.push(plan.id);
        mongoMirror.upsertPlan(plan);
      }
    }

    snapshot.communityMembers = snapshot.communityMembers.filter(
      (m) => m.communityId !== communityId,
    );
    mongoMirror.deleteCommunityMembersByCommunity(communityId);

    snapshot.communityPosts = snapshot.communityPosts.filter(
      (p) => p.communityId !== communityId,
    );
    mongoMirror.deleteCommunityPostsByCommunity(communityId);

    const conv = this.findCommunityConversation(communityId);
    if (conv) {
      snapshot.messages = snapshot.messages.filter((m) => m.conversationId !== conv.id);
      snapshot.conversations = snapshot.conversations.filter((c) => c.id !== conv.id);
      mongoMirror.deleteMessagesByConversation(conv.id);
      mongoMirror.deleteConversation(conv.id);
    }

    snapshot.communities = snapshot.communities.filter((c) => c.id !== communityId);
    mongoMirror.deleteCommunity(communityId);
    persist();
    return { cancelledPlanIds };
  },

  // ---- Community members ----
  listCommunityMembers(communityId: string): CommunityMemberRecord[] {
    return snapshot.communityMembers.filter((m) => m.communityId === communityId);
  },
  listActiveCommunityMembers(communityId: string): CommunityMemberRecord[] {
    return snapshot.communityMembers.filter(
      (m) => m.communityId === communityId && m.status === "active",
    );
  },
  listPendingCommunityMembers(communityId: string): CommunityMemberRecord[] {
    return snapshot.communityMembers
      .filter((m) => m.communityId === communityId && m.status === "pending")
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  },
  listCommunityMembershipsForUser(userId: string): CommunityMemberRecord[] {
    return snapshot.communityMembers.filter((m) => m.userId === userId);
  },
  findCommunityMembership(communityId: string, userId: string): CommunityMemberRecord | undefined {
    return snapshot.communityMembers.find(
      (m) => m.communityId === communityId && m.userId === userId,
    );
  },
  /** Recompute + persist a community's denormalized active member count. */
  recountCommunityMembers(communityId: string): void {
    const community = snapshot.communities.find((c) => c.id === communityId);
    if (!community) return;
    community.memberCount = snapshot.communityMembers.filter(
      (m) => m.communityId === communityId && m.status === "active",
    ).length;
    mongoMirror.upsertCommunity(community);
  },
  upsertCommunityMembership(input: {
    communityId: string;
    userId: string;
    role?: CommunityMemberRole;
    status: CommunityMemberStatus;
    screeningAnswer?: string | null;
  }): CommunityMemberRecord {
    const existing = this.findCommunityMembership(input.communityId, input.userId);
    if (existing) {
      existing.status = input.status;
      if (input.role) existing.role = input.role;
      if (input.screeningAnswer !== undefined) existing.screeningAnswer = input.screeningAnswer;
      persist();
      mongoMirror.upsertCommunityMember(existing);
      this.recountCommunityMembers(input.communityId);
      persist();
      return existing;
    }
    const row: CommunityMemberRecord = {
      id: randomUUID(),
      communityId: input.communityId,
      userId: input.userId,
      role: input.role ?? "member",
      status: input.status,
      screeningAnswer: input.screeningAnswer ?? null,
      joinedAt: new Date().toISOString(),
    };
    snapshot.communityMembers.push(row);
    persist();
    mongoMirror.upsertCommunityMember(row);
    this.recountCommunityMembers(input.communityId);
    persist();
    return row;
  },
  removeCommunityMembership(communityId: string, userId: string): boolean {
    const before = snapshot.communityMembers.length;
    snapshot.communityMembers = snapshot.communityMembers.filter(
      (m) => !(m.communityId === communityId && m.userId === userId),
    );
    if (snapshot.communityMembers.length === before) return false;
    // Drop them from the community chat too, if one exists.
    const conv = this.findCommunityConversation(communityId);
    if (conv && conv.participantIds.includes(userId)) {
      conv.participantIds = conv.participantIds.filter((id) => id !== userId);
      mongoMirror.upsertConversation(conv);
    }
    persist();
    mongoMirror.deleteCommunityMember(communityId, userId);
    this.recountCommunityMembers(communityId);
    persist();
    return true;
  },

  // ---- Community bulletin posts ----
  listCommunityPosts(communityId: string): CommunityPostRecord[] {
    return snapshot.communityPosts
      .filter(
        (p) =>
          p.communityId === communityId &&
          !p.deletedAt &&
          (p.approvalStatus ?? "approved") === "approved",
      )
      .sort((a, b) => {
        // Pinned first, then reverse-chron.
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  },
  listPendingCommunityPosts(communityId: string): CommunityPostRecord[] {
    return snapshot.communityPosts
      .filter(
        (p) =>
          p.communityId === communityId &&
          !p.deletedAt &&
          p.approvalStatus === "pending",
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  findCommunityPostById(id: string): CommunityPostRecord | undefined {
    return snapshot.communityPosts.find((p) => p.id === id && !p.deletedAt);
  },
  createCommunityPost(input: {
    communityId: string;
    authorId: string;
    content: string;
    image?: string | null;
    approvalStatus?: "pending" | "approved";
  }): CommunityPostRecord {
    const row: CommunityPostRecord = {
      id: randomUUID(),
      communityId: input.communityId,
      authorId: input.authorId,
      content: input.content,
      image: input.image ?? null,
      pinned: false,
      approvalStatus: input.approvalStatus ?? "approved",
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };
    snapshot.communityPosts.push(row);
    persist();
    mongoMirror.upsertCommunityPost(row);
    return row;
  },
  setCommunityPostApprovalStatus(
    id: string,
    status: "approved" | "rejected",
  ): CommunityPostRecord | undefined {
    const row = snapshot.communityPosts.find((p) => p.id === id && !p.deletedAt);
    if (!row) return undefined;
    if (status === "rejected") {
      row.approvalStatus = "rejected";
      row.deletedAt = new Date().toISOString();
    } else {
      row.approvalStatus = "approved";
    }
    persist();
    mongoMirror.upsertCommunityPost(row);
    return row;
  },
  setCommunityPostPinned(id: string, pinned: boolean): CommunityPostRecord | undefined {
    const row = snapshot.communityPosts.find((p) => p.id === id);
    if (!row) return undefined;
    row.pinned = pinned;
    persist();
    mongoMirror.upsertCommunityPost(row);
    return row;
  },
  softDeleteCommunityPost(id: string): CommunityPostRecord | undefined {
    const row = snapshot.communityPosts.find((p) => p.id === id);
    if (!row) return undefined;
    row.deletedAt = new Date().toISOString();
    persist();
    mongoMirror.upsertCommunityPost(row);
    return row;
  },

  // ---- Community chat (persistent group thread, not tied to a plan) ----
  findCommunityConversation(communityId: string): ConversationRecord | undefined {
    return snapshot.conversations.find(
      (c) => c.communityId === communityId && c.type === "group",
    );
  },
  ensureCommunityConversation(
    communityId: string,
    participantIds: string[],
    opts?: { rejoinIds?: string[] },
  ): ConversationRecord {
    const existing = this.findCommunityConversation(communityId);
    if (existing) {
      const toAdd = this.filterNotLeft(existing.id, participantIds, opts?.rejoinIds ?? []);
      existing.participantIds = Array.from(new Set([...existing.participantIds, ...toAdd]));
      persist();
      mongoMirror.upsertConversation(existing);
      return existing;
    }
    const now = new Date().toISOString();
    const conv: ConversationRecord = {
      id: randomUUID(),
      planId: "",
      communityId,
      type: "group",
      participantIds: Array.from(new Set(participantIds)),
      createdAt: now,
      lastMessageAt: now,
    };
    snapshot.conversations.push(conv);
    persist();
    mongoMirror.upsertConversation(conv);
    return conv;
  },

  // ---- Interest Forums (V1) ----

  listForums(): InterestForumRecord[] {
    return [...snapshot.interestForums];
  },
  findForumByTag(tag: InterestTag): InterestForumRecord | undefined {
    return snapshot.interestForums.find((f) => f.interestTag === tag);
  },
  /** Idempotent bootstrap — one forum row per launched interest, created on demand. */
  ensureForumsForInterests(): void {
    let changed = false;
    for (const tag of FORUM_INTERESTS) {
      if (this.findForumByTag(tag)) continue;
      const row: InterestForumRecord = {
        id: randomUUID(),
        interestTag: tag,
        createdAt: new Date().toISOString(),
      };
      snapshot.interestForums.push(row);
      mongoMirror.upsertInterestForum(row);
      changed = true;
    }
    if (changed) persist();
  },
  findForumMembership(userId: string, tag: InterestTag): ForumMembershipRecord | undefined {
    return snapshot.forumMemberships.find((m) => m.userId === userId && m.interestTag === tag);
  },
  /** Active (not-left) memberships for a user. */
  listActiveForumMemberships(userId: string): ForumMembershipRecord[] {
    return snapshot.forumMemberships.filter((m) => m.userId === userId && m.leftAt === null);
  },
  /** Join (or re-join) a forum. Idempotent — a no-op if already active. */
  joinForum(userId: string, tag: InterestTag): ForumMembershipRecord {
    const existing = this.findForumMembership(userId, tag);
    if (existing) {
      if (existing.leftAt !== null) {
        existing.leftAt = null;
        existing.joinedAt = new Date().toISOString();
        persist();
        mongoMirror.upsertForumMembership(existing);
      }
      return existing;
    }
    const row: ForumMembershipRecord = {
      userId,
      interestTag: tag,
      joinedAt: new Date().toISOString(),
      leftAt: null,
    };
    snapshot.forumMemberships.push(row);
    persist();
    mongoMirror.upsertForumMembership(row);
    return row;
  },
  /**
   * Leave a forum. Does NOT touch the user's profile `interests` — membership
   * is intentionally decoupled so leaving a forum isn't the same as dropping
   * the interest.
   */
  leaveForum(userId: string, tag: InterestTag): ForumMembershipRecord | undefined {
    const existing = this.findForumMembership(userId, tag);
    if (!existing || existing.leftAt !== null) return existing;
    existing.leftAt = new Date().toISOString();
    persist();
    mongoMirror.upsertForumMembership(existing);
    return existing;
  },
  /**
   * Auto-join every forum matching the user's current interests. Called from
   * onboarding completion and the interests settings save. Only ever adds
   * memberships — never auto-leaves when an interest is removed, since a user
   * may still want to follow a forum they no longer list as an interest.
   */
  syncForumMembershipsFromInterests(userId: string, interests: InterestTag[]): void {
    this.ensureForumsForInterests();
    for (const tag of interests) {
      if (!FORUM_INTERESTS.includes(tag)) continue;
      this.joinForum(userId, tag);
    }
  },
  /**
   * Active memberships for a user, each with a lightweight preview of the
   * forum's latest approved post (used by the Messages → Interests tab).
   */
  listForumsForUser(
    userId: string,
  ): Array<{
    interestTag: InterestTag;
    joinedAt: string;
    latestPost: { authorId: string; content: string; createdAt: string } | null;
  }> {
    return this.listActiveForumMemberships(userId)
      .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
      .map((m) => {
        const latest = this.listPosts(m.interestTag, "recent")[0];
        return {
          interestTag: m.interestTag,
          joinedAt: m.joinedAt,
          latestPost: latest
            ? { authorId: latest.authorId, content: latest.content, createdAt: latest.createdAt }
            : null,
        };
      });
  },
  /** Public feed for a forum — approved posts only, sponsored included once approved. */
  listPosts(tag: InterestTag, sort: ForumSort = "recent"): ForumPostRecord[] {
    const posts = snapshot.forumPosts.filter(
      (p) => p.interestTag === tag && p.approvalStatus === "approved",
    );
    if (sort === "popular") {
      // Recency-weighted like_count: likes decay with age so a fresh post
      // with a few likes can outrank a stale high-like post.
      const now = Date.now();
      const score = (p: ForumPostRecord) => {
        const ageHours = Math.max(0, (now - Date.parse(p.createdAt)) / 3_600_000);
        return p.likeCount / Math.pow(ageHours + 2, 1.5);
      };
      return posts.sort((a, b) => {
        const diff = score(b) - score(a);
        if (diff !== 0) return diff;
        return b.createdAt.localeCompare(a.createdAt);
      });
    }
    return posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  findForumPostById(id: string): ForumPostRecord | undefined {
    return snapshot.forumPosts.find((p) => p.id === id);
  },
  createPost(input: {
    interestTag: InterestTag;
    authorId: string;
    content: string;
    imageUrl?: string | null;
    isSponsored?: boolean;
    sponsorName?: string | null;
  }): ForumPostRecord {
    const isSponsored = input.isSponsored ?? false;
    const row: ForumPostRecord = {
      id: randomUUID(),
      interestTag: input.interestTag,
      authorId: input.authorId,
      content: input.content,
      imageUrl: input.imageUrl ?? null,
      isSponsored,
      sponsorName: isSponsored ? input.sponsorName ?? null : null,
      // Sponsored posts wait for admin approval; everything else is live immediately.
      approvalStatus: isSponsored ? "pending" : "approved",
      createdAt: new Date().toISOString(),
      replyCount: 0,
      likeCount: 0,
    };
    snapshot.forumPosts.push(row);
    persist();
    mongoMirror.upsertForumPost(row);
    return row;
  },
  deleteForumPost(id: string): boolean {
    const before = snapshot.forumPosts.length;
    snapshot.forumPosts = snapshot.forumPosts.filter((p) => p.id !== id);
    if (snapshot.forumPosts.length === before) return false;
    snapshot.forumReplies = snapshot.forumReplies.filter((r) => r.postId !== id);
    snapshot.forumPostLikes = snapshot.forumPostLikes.filter((l) => l.postId !== id);
    persist();
    mongoMirror.deleteForumPost(id);
    mongoMirror.deleteForumRepliesByPost(id);
    mongoMirror.deleteForumPostLikesByPost(id);
    return true;
  },
  listReplies(postId: string): ForumReplyRecord[] {
    return snapshot.forumReplies
      .filter((r) => r.postId === postId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  createReply(postId: string, authorId: string, content: string): ForumReplyRecord | undefined {
    const post = this.findForumPostById(postId);
    if (!post) return undefined;
    const row: ForumReplyRecord = {
      id: randomUUID(),
      postId,
      authorId,
      content,
      createdAt: new Date().toISOString(),
    };
    snapshot.forumReplies.push(row);
    post.replyCount += 1;
    persist();
    mongoMirror.upsertForumReply(row);
    mongoMirror.upsertForumPost(post);
    return row;
  },
  hasLikedPost(postId: string, userId: string): boolean {
    return snapshot.forumPostLikes.some((l) => l.postId === postId && l.userId === userId);
  },
  /** Toggle the viewer's like on a post. Returns the updated post, or undefined if not found. */
  toggleLike(postId: string, userId: string): ForumPostRecord | undefined {
    const post = this.findForumPostById(postId);
    if (!post) return undefined;
    const already = this.hasLikedPost(postId, userId);
    if (already) {
      snapshot.forumPostLikes = snapshot.forumPostLikes.filter(
        (l) => !(l.postId === postId && l.userId === userId),
      );
      post.likeCount = Math.max(0, post.likeCount - 1);
      mongoMirror.deleteForumPostLike(postId, userId);
    } else {
      const like: ForumPostLikeRecord = {
        postId,
        userId,
        createdAt: new Date().toISOString(),
      };
      snapshot.forumPostLikes.push(like);
      post.likeCount += 1;
      mongoMirror.upsertForumPostLike(like);
    }
    persist();
    mongoMirror.upsertForumPost(post);
    return post;
  },
  // ---- Admin: sponsored forum post review ----
  listPendingForumPosts(): ForumPostRecord[] {
    return snapshot.forumPosts
      .filter((p) => p.approvalStatus === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  setForumPostApprovalStatus(
    id: string,
    status: ForumPostApprovalStatus,
  ): ForumPostRecord | undefined {
    const post = this.findForumPostById(id);
    if (!post) return undefined;
    post.approvalStatus = status;
    persist();
    mongoMirror.upsertForumPost(post);
    return post;
  },

  // ---- Devices (push notification tokens) ----
  listDevicesForUser(userId: string): DeviceRecord[] {
    return snapshot.devices.filter((d) => d.userId === userId);
  },
  listAllDevices(): DeviceRecord[] {
    return [...snapshot.devices];
  },
  /**
   * Register (or reassign) a device token. Tokens are unique per
   * installation — re-registering under a different account (sign out/in on
   * the same device) moves the existing row rather than creating a duplicate.
   */
  registerDevice(
    userId: string,
    token: string,
    platform: DeviceRecord["platform"],
  ): DeviceRecord {
    const existing = snapshot.devices.find((d) => d.token === token);
    const now = new Date().toISOString();
    if (existing) {
      existing.userId = userId;
      existing.platform = platform;
      existing.updatedAt = now;
      persist();
      mongoMirror.upsertDevice(existing);
      return existing;
    }
    const row: DeviceRecord = { id: randomUUID(), userId, token, platform, updatedAt: now };
    snapshot.devices.push(row);
    persist();
    mongoMirror.upsertDevice(row);
    return row;
  },
  unregisterDevice(userId: string, token: string): boolean {
    const before = snapshot.devices.length;
    snapshot.devices = snapshot.devices.filter((d) => !(d.userId === userId && d.token === token));
    if (snapshot.devices.length === before) return false;
    persist();
    mongoMirror.deleteDeviceByToken(token);
    return true;
  },
  /** Drop a token regardless of owner — used when APNs reports it as dead (410). */
  unregisterDeviceByToken(token: string): boolean {
    const before = snapshot.devices.length;
    snapshot.devices = snapshot.devices.filter((d) => d.token !== token);
    if (snapshot.devices.length === before) return false;
    persist();
    mongoMirror.deleteDeviceByToken(token);
    return true;
  },
};
