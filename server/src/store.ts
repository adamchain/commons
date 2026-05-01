import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  AvatarStyle,
  HostTag,
  InterestTag,
  ParticipationState,
} from "./types/shared.js";

export interface UserRecord {
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

export interface NeighborhoodRecord {
  id: string;
  name: string;
  metro: string;
  adjacent: string[];
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
  endTime?: string;
  tags: InterestTag[];
  description?: string;
  hostEmoji: string;
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
  reset(next: Snapshot): void {
    snapshot = next;
    persist();
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
  createUser(phoneNumber: string): UserRecord {
    const user: UserRecord = {
      id: randomUUID(),
      phoneNumber,
      firstName: "",
      neighborhoodId: null,
      interests: [],
      avatarSeed: randomUUID(),
      avatarStyle: "avataaars",
      onboardingComplete: false,
      createdAt: new Date().toISOString(),
    };
    snapshot.users.push(user);
    persist();
    return user;
  },
  updateUser(id: string, patch: Partial<Omit<UserRecord, "id" | "createdAt">>): UserRecord | undefined {
    const user = snapshot.users.find((u) => u.id === id);
    if (!user) return undefined;
    Object.assign(user, patch);
    persist();
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
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    };
    snapshot.plans.push(plan);
    persist();
    return plan;
  },

  // Participations
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
    return record;
  },
  deleteParticipation(planId: string, userId: string): void {
    snapshot.participations = snapshot.participations.filter(
      (p) => !(p.planId === planId && p.userId === userId)
    );
    persist();
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
    };
    snapshot.messages.push(message);
    const conv = snapshot.conversations.find((c) => c.id === conversationId);
    if (conv) conv.lastMessageAt = message.createdAt;
    persist();
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
    snapshot.declines.push({
      id: randomUUID(),
      userId,
      planId,
      createdAt: new Date().toISOString(),
    });
    persist();
  },
  recentDeclinesForUser(userId: string, sinceIso: string): DeclineRecord[] {
    return snapshot.declines.filter((d) => d.userId === userId && d.createdAt >= sinceIso);
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
    snapshot.logs.push({
      id: randomUUID(),
      event,
      payload,
      createdAt: new Date().toISOString(),
    });
    persist();
  },
};
