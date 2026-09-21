import { normalizePhone } from "./phone.js";

/** Built-in ops number — extend via `ADMIN_PHONE_NUMBERS` env (comma-separated). */
const BUILTIN_ADMIN_E164 = new Set<string>(["+14845712062", "+16103484589"]);

/**
 * E.164 numbers allowed to call `/api/admin/*` after the same Twilio Verify (or dev SMS)
 * flow used for normal sign-in.
 */
export function isAdminPhone(e164: string): boolean {
  return listAdminPhones().includes(e164);
}

/** Built-in ops numbers plus `ADMIN_PHONE_NUMBERS`. */
export function listAdminPhones(): string[] {
  const out = new Set<string>(BUILTIN_ADMIN_E164);
  const raw = process.env.ADMIN_PHONE_NUMBERS?.trim();
  if (!raw) return [...out];
  for (const part of raw.split(/[,;\s]+/)) {
    const p = part.trim();
    if (!p) continue;
    const n = normalizePhone(p);
    if (n) out.add(n);
  }
  return [...out];
}
