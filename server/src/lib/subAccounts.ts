import { store, type CommunityRecord, type UserRecord } from "../store.js";

/** Personal account that owns this login. Sub accounts point at their owner. */
export function accountRootId(user: Pick<UserRecord, "id" | "ownerUserId">): string {
  return user.ownerUserId || user.id;
}

export function isCommunitySubAccount(user: Pick<UserRecord, "ownerUserId" | "managedCommunityId">): boolean {
  return Boolean(user.ownerUserId && user.managedCommunityId);
}

/** Not a real phone. Sign-in stays on the owner's number. */
export function subAccountPhone(communityId: string): string {
  return `sub:${communityId}`;
}

export function communityPersonaPhoto(name: string, cover?: string | null): string {
  const trimmed = cover?.trim();
  if (trimmed) return trimmed;
  const letter = (name.trim().charAt(0) || "C").toUpperCase().replace(/[^\w]/g, "") || "C";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">` +
    `<rect width="128" height="128" rx="28" fill="#8C3A34"/>` +
    `<text x="64" y="82" text-anchor="middle" font-size="64" font-family="Georgia,serif" fill="#F6F1E8">${letter}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function personaPatch(community: CommunityRecord, owner: UserRecord): Partial<UserRecord> {
  const now = new Date().toISOString();
  return {
    ownerUserId: owner.id,
    managedCommunityId: community.id,
    firstName: community.name.trim().slice(0, 80),
    lastName: "",
    bio: community.description.trim().slice(0, 160),
    avatarPhotoDataUrl: communityPersonaPhoto(community.name, community.coverImage),
    onboardingComplete: true,
    interests: owner.interests ?? [],
    neighborhoodId: owner.neighborhoodId,
    neighborhoodIds: owner.neighborhoodIds ?? [],
    ageConfirmedAt: owner.ageConfirmedAt ?? now,
    guidelinesAcknowledgedAt: owner.guidelinesAcknowledgedAt ?? now,
    termsAcceptedAt: owner.termsAcceptedAt ?? now,
    privacyAcceptedAt: owner.privacyAcceptedAt ?? now,
    locationPromptAnsweredAt: owner.locationPromptAnsweredAt ?? now,
    discoverableBySearch: true,
    locationLat: owner.locationLat ?? null,
    locationLng: owner.locationLng ?? null,
    locationLabel: owner.locationLabel ?? null,
  };
}

/** Create the community's profile, or return the one that already exists. */
export function ensureCommunitySubAccount(community: CommunityRecord, owner: UserRecord): UserRecord {
  const existing = store.findUserByManagedCommunity(community.id);
  if (existing) return existing;
  const created = store.createUser(subAccountPhone(community.id), { accountSource: "sub" });
  return store.updateUser(created.id, personaPatch(community, owner)) ?? created;
}

/** Keep the persona aligned with the community's name, bio, and cover. */
export function syncCommunitySubAccount(community: CommunityRecord): void {
  const existing = store.findUserByManagedCommunity(community.id);
  if (!existing) return;
  store.updateUser(existing.id, {
    firstName: community.name.trim().slice(0, 80),
    bio: community.description.trim().slice(0, 160),
    avatarPhotoDataUrl: communityPersonaPhoto(community.name, community.coverImage),
  });
}

/**
 * Hand the persona to a new organizer and kill any session currently using it,
 * so the previous organizer can't keep posting as the community.
 */
export function reassignCommunitySubAccount(communityId: string, newOwnerId: string): void {
  const existing = store.findUserByManagedCommunity(communityId);
  if (!existing) return;
  store.updateUser(existing.id, {
    ownerUserId: newOwnerId,
    sessionVersion: (existing.sessionVersion ?? 0) + 1,
  });
}
