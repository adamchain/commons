import { api } from "../api/http";
import type { InviteCodeDTO } from "../types/shared";

/**
 * The current user's first unredeemed invite code, if any. Used to stamp
 * outgoing plan-share links with `?invite=CODE` so a recipient who isn't a
 * member yet lands on onboarding with credit to the sharer's code prefilled.
 * Returns null on error or once all codes are used up — callers should treat
 * that as "just share the plain link".
 */
export async function getActiveInviteCode(): Promise<string | null> {
  try {
    const { codes } = await api<{ codes: InviteCodeDTO[] }>("/api/auth/invite-codes");
    return codes.find((c) => c.redeemedAt === null)?.code ?? null;
  } catch {
    return null;
  }
}
