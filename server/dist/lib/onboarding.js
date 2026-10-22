export function isOnboardingFinished(user) {
    return Boolean(user.onboardingComplete && user.firstName?.trim() && user.avatarPhotoDataUrl?.trim());
}
