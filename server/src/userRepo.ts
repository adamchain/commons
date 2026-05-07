import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { isMongoConnected } from "./lib/db.js";
import { UserModel } from "./models/User.js";
import { store, type UserRecord } from "./store.js";

export type UserPatch = Partial<Omit<UserRecord, "id" | "createdAt">>;

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
    const allowed = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ) as Record<string, unknown>;
    const updated = await UserModel.findOneAndUpdate({ id }, { $set: allowed }, {
      new: true,
      runValidators: true,
    }).lean();
    return updated ?? undefined;
  }
  return store.updateUser(id, patch);
}

/** Used when shutting down tests or scripts (optional). */
export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
