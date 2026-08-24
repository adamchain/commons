import type { UserRecord } from "../store.js";

export function isOnboardingFinished(user: UserRecord): boolean {
  return Boolean(
    user.onboardingComplete && user.firstName?.trim() && user.avatarPhotoDataUrl?.trim(),
  );
}
