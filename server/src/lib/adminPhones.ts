import { normalizePhone } from "./phone.js";

/**
 * E.164 numbers allowed to call `/api/admin/*` after the same Twilio Verify (or dev SMS)
 * flow used for normal sign-in. Comes only from `ADMIN_PHONE_NUMBERS`
 * (comma-, semicolon-, or whitespace-separated). Nothing is built into the source.
 */
export function isAdminPhone(e164: string): boolean {
  return listAdminPhones().includes(e164);
}

export function listAdminPhones(): string[] {
  const raw = process.env.ADMIN_PHONE_NUMBERS?.trim();
  if (!raw) return [];
  const out = new Set<string>();
  for (const part of raw.split(/[,;\s]+/)) {
    const p = part.trim();
    if (!p) continue;
    const n = normalizePhone(p);
    if (n) out.add(n);
  }
  return [...out];
}
