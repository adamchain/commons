import { isMongoConnected } from "./db.js";
import { AccessCodeModel } from "../models/AccessCode.js";
import { normalizeInviteCode } from "../store.js";

/** Shared signup codes. Many people can use the same one. */
export const LAUNCH_ACCESS_CODES = [
  "COMMONSPHL",
  "COMMONSCOMMUNITY",
  "COMMONSDAY1",
  "PLANSONCOMMONS",
] as const;

/** Insert any missing launch codes. Existing rows are left alone. */
export async function ensureLaunchAccessCodes(): Promise<void> {
  if (!isMongoConnected()) return;
  const now = new Date().toISOString();
  await Promise.all(
    LAUNCH_ACCESS_CODES.map((code) =>
      AccessCodeModel.updateOne(
        { code },
        { $setOnInsert: { code, createdAt: now } },
        { upsert: true },
      ).exec(),
    ),
  );
  console.log(`[access-codes] ready: ${LAUNCH_ACCESS_CODES.join(", ")}`);
}

/** True when this string is a reusable access code stored in Mongo. */
export async function isLaunchAccessCode(raw: string): Promise<boolean> {
  const code = normalizeInviteCode(raw);
  if (!code) return false;
  if (!isMongoConnected()) {
    return (LAUNCH_ACCESS_CODES as readonly string[]).includes(code);
  }
  const row = await AccessCodeModel.findOne({ code }).select("code").lean();
  return Boolean(row);
}
