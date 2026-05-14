import { normalizePhone } from "./phone.js";

/** Built-in ops number — extend via `ADMIN_PHONE_NUMBERS` env (comma-separated). */
const BUILTIN_ADMIN_E164 = new Set<string>(["+14845712062"]);

/**
 * E.164 numbers allowed to call `/api/admin/*` after the same Twilio Verify (or dev SMS)
 * flow used for normal sign-in.
 */
export function isAdminPhone(e164: string): boolean {
  if (BUILTIN_ADMIN_E164.has(e164)) return true;
  const raw = process.env.ADMIN_PHONE_NUMBERS?.trim();
  if (!raw) return false;
  for (const part of raw.split(/[,;\s]+/)) {
    const p = part.trim();
    if (!p) continue;
    const n = normalizePhone(p);
    if (n && n === e164) return true;
  }
  return false;
}
