import type { MeDTO } from "../types/shared";

export function hasOnboardingPhoto(user: Pick<MeDTO, "avatarPhotoDataUrl">): boolean {
  return Boolean(user.avatarPhotoDataUrl?.trim());
}

/** True when this account shouldn't have the full app yet (flag, name, or photo). */
export function needsOnboarding(user: MeDTO | null | undefined): boolean {
  if (!user) return true;
  return !user.onboardingComplete || !user.firstName?.trim() || !hasOnboardingPhoto(user);
}

/**
 * After OTP, send people home unless they came from a shared plan.
 * Never dump a fresh login onto compose (`/plans/new`).
 */
export function safePostAuthPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  if (path === "/plans/new" || path.startsWith("/plans/new?")) return "/";
  return path;
}
