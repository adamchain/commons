import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { isMongoConnected } from "./lib/db.js";
import { UserModel } from "./models/User.js";
import { store, type UserRecord } from "./store.js";

// A patch value of `null` for an optional field is treated as "clear it"
// (Mongo $unset, in-memory delete) — distinct from `undefined`, which means
// "leave it alone." We need this so toggling between photo and preset avatars
// actually removes the previous value.
export type UserPatch = Partial<Omit<UserRecord, "id" | "createdAt" | "avatarPhotoDataUrl" | "avatarParams">> & {
  avatarPhotoDataUrl?: string | null;
  avatarParams?: string | null;
};

export type CreateUserOptions = { accountSource?: "verify" | "seed" };

function newUserRecord(phoneNumber: string, opts?: CreateUserOptions): UserRecord {
  return {
    id: randomUUID(),
    phoneNumber,
    accountSource: opts?.accountSource ?? "verify",
    firstName: "",
    neighborhoodId: null,
    neighborhoodIds: [],
    interests: [],
    avatarSeed: randomUUID(),
    avatarStyle: "avataaars",
    avatarPhotoDataUrl: undefined,
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
    networkIds: [],
    dismissedNetworkPromptPlanIds: [],
  };
}

export async function findUserById(id: string): Promise<UserRecord | undefined> {
  if (isMongoConnected()) {
    const doc = await UserModel.findOne({ id }).lean();
    return doc ?? undefined;
  }
  return store.findUserById(id);
}

export async function findUserByPhone(phoneNumber: string): Promise<UserRecord | undefined> {
  if (isMongoConnected()) {
    const doc = await UserModel.findOne({ phoneNumber }).lean();
    return doc ?? undefined;
  }
  return store.findUserByPhone(phoneNumber);
}

export async function listAllUsers(): Promise<UserRecord[]> {
  if (isMongoConnected()) {
    const docs = await UserModel.find({}).sort({ createdAt: -1 }).lean();
    return docs;
  }
  return store.listUsers().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findUsersByIds(ids: string[]): Promise<Map<string, UserRecord>> {
  const unique = [...new Set(ids)];
  const map = new Map<string, UserRecord>();
  if (unique.length === 0) return map;

  if (isMongoConnected()) {
    const docs = await UserModel.find({ id: { $in: unique } }).lean();
    for (const doc of docs) {
      map.set(doc.id, doc);
    }
    return map;
  }
  for (const id of unique) {
    const u = store.findUserById(id);
    if (u) map.set(id, u);
  }
  return map;
}

export async function createUser(
  phoneNumber: string,
  opts?: CreateUserOptions,
): Promise<UserRecord> {
  const user = newUserRecord(phoneNumber, opts);
  if (isMongoConnected()) {
    await UserModel.create(user);
    return user;
  }
  return store.createUser(phoneNumber, opts);
}

export async function updateUser(id: string, patch: UserPatch): Promise<UserRecord | undefined> {
  if (isMongoConnected()) {
    const setFields: Record<string, unknown> = {};
    const unsetFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (v === null) unsetFields[k] = "";
      else setFields[k] = v;
    }
    const update: Record<string, unknown> = {};
    if (Object.keys(setFields).length > 0) update.$set = setFields;
    if (Object.keys(unsetFields).length > 0) update.$unset = unsetFields;
    const updated = await UserModel.findOneAndUpdate({ id }, update, {
      new: true,
      runValidators: true,
    }).lean();
    return updated ?? undefined;
  }
  // In-memory: null means clear the field outright.
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    cleaned[k] = v === null ? undefined : v;
  }
  return store.updateUser(id, cleaned as Partial<Omit<UserRecord, "id" | "createdAt">>);
}

/** Used when shutting down tests or scripts (optional). */
export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
