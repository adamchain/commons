import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mongoMirror } from "./mongoMirror.js";
import type {
  AvatarStyle,
  HostTag,
  InterestTag,
  JoinType,
  ParticipationState,
  PlanKind,
  PlanVisibility,
} from "./types/shared.js";

export interface UserRecord {
  id: string;
  phoneNumber: string;
  /** `verify` = signed up via Twilio Verify; `seed` = demo data script only. */
  accountSource?: "verify" | "seed";
  firstName: string;
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
  /** Plan ids where the user dismissed the post-event network prompt. */
  dismissedNetworkPromptPlanIds?: string[];
  /** Social links — only surfaced to viewers who share a past plan or DM. */
  socialLinks?: { instagram?: string };
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
  title: string;
  neighborhoodId: string;
  location: { name: string; address: string; lat?: number; lng?: number };
  date: string;
  time: string;
  isFlexibleTime: boolean;
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
  /** Total spots including host. Null/undefined means open / no cap. */
  capacity?: number | null;
  /** How RSVPs are accepted; defaults to "open" if absent. */
  joinType?: JoinType;
  isRecurring?: boolean;
  lockedAt?: string | null;
  flyerDataUrl?: string;
  createdAt: string;
}

export interface ParticipationRecord {
  id: string;
  planId: string;
  userId: string;
  state: ParticipationState;
  updatedAt: string;
}

export interface ConversationRecord {
  id: string;
  planId: string;
  type: "group" | "dm";
  participantIds: string[];
  createdAt: string;
  lastMessageAt: string;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readBy: string[];
  kind?: "user" | "system";
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
  hostTags: HostTag[];
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

interface Snapshot {
  users: UserRecord[];
  neighborhoods: NeighborhoodRecord[];
  plans: PlanRecord[];
  participations: ParticipationRecord[];
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  feedback: FeedbackRecord[];
  declines: DeclineRecord[];
  smsCodes: SmsCodeRecord[];
  logs: LogRecord[];
  planSuggestions: PlanSuggestionRecord[];
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
    smsCodes: [],
    logs: [],
    planSuggestions: [],
  };
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

  // Neighborhoods
  listNeighborhoods(): NeighborhoodRecord[] {
    return [...snapshot.neighborhoods];
  },
  findNeighborhoodById(id: string): NeighborhoodRecord | undefined {
    return snapshot.neighborhoods.find((n) => n.id === id);
  },
  // returns the user's neighborhood + adjacent neighborhood ids
  neighborhoodScope(neighborhoodId: string): string[] {
    const root = this.findNeighborhoodById(neighborhoodId);
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
  createPlan(input: Omit<PlanRecord, "id" | "createdAt">): PlanRecord {
    const plan: PlanRecord = {
      isFlexibleLocation: false,
      planKind: "standard",
      visibility: "everyone",
      visibilityCommunityTag: null,
      communityId: null,
      capacity: null,
      joinType: "open",
      isRecurring: false,
      lockedAt: null,
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    snapshot.plans.push(plan);
    persist();
    mongoMirror.upsertPlan(plan);
    return plan;
  },

  updatePlan(id: string, patch: Partial<Omit<PlanRecord, "id" | "createdAt">>): PlanRecord | undefined {
    const plan = snapshot.plans.find((p) => p.id === id);
    if (!plan) return undefined;
    Object.assign(plan, patch);
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
      persist();
      mongoMirror.upsertParticipation(existing);
      return existing;
    }
    const record: ParticipationRecord = {
      id: randomUUID(),
      planId,
      userId,
      state,
      updatedAt: new Date().toISOString(),
    };
    snapshot.participations.push(record);
    persist();
    mongoMirror.upsertParticipation(record);
    return record;
  },
  deleteParticipation(planId: string, userId: string): void {
    snapshot.participations = snapshot.participations.filter(
      (p) => !(p.planId === planId && p.userId === userId)
    );
    persist();
    mongoMirror.deleteParticipation(planId, userId);
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
  ensureGroupConversation(planId: string, participantIds: string[]): ConversationRecord {
    const existing = this.findGroupConversationByPlan(planId);
    if (existing) {
      // make sure participants are up to date
      existing.participantIds = Array.from(new Set([...existing.participantIds, ...participantIds]));
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
  createMessage(conversationId: string, senderId: string, body: string): MessageRecord {
    const message: MessageRecord = {
      id: randomUUID(),
      conversationId,
      senderId,
      body,
      createdAt: new Date().toISOString(),
      readBy: [senderId],
      kind: "user",
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
};
