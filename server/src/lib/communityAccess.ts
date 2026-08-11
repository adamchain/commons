import { store, type CommunityRecord } from "../store.js";

/** True only for the community's actual organizer — not COMMONS admins. */
export function isCommunityOrganizer(
  community: Pick<CommunityRecord, "organizerId">,
  userId: string,
): boolean {
  return community.organizerId === userId;
}

export function isActiveCommunityMember(communityId: string, userId: string): boolean {
  return store.findCommunityMembership(communityId, userId)?.status === "active";
}

/**
 * Board view (bulletin / events / members) stays open for instant-join /
 * "Everyone" communities. Locked when the community requires a join request
 * (screening question) or the organizer set visibility to members_only.
 */
export function canViewCommunityBoard(
  community: Pick<
    CommunityRecord,
    "id" | "organizerId" | "screeningQuestion" | "visibility"
  >,
  userId: string,
): boolean {
  const restricted =
    !!community.screeningQuestion || (community.visibility ?? "everyone") === "members_only";
  if (!restricted) return true;
  return (
    isCommunityOrganizer(community, userId) || isActiveCommunityMember(community.id, userId)
  );
}

/**
 * Inside actions (posting, chat, manage) require an active membership or being
 * the real organizer. COMMONS admins are not treated as members — they use the
 * Admin panel for ops, and Join like everyone else.
 */
export function canAccessCommunityInside(
  community: Pick<CommunityRecord, "id" | "organizerId">,
  userId: string,
): boolean {
  return (
    isCommunityOrganizer(community, userId) || isActiveCommunityMember(community.id, userId)
  );
}

/** Block reason for community write actions; null means allowed. */
export function communityMembershipBlockReason(
  community: Pick<CommunityRecord, "id" | "organizerId"> | null | undefined,
  userId: string,
  action = "post here",
): string | null {
  if (!community) return "Community not found";
  if (canAccessCommunityInside(community, userId)) return null;
  return `Join the community to ${action}`;
}

/**
 * Pending-review / offline gate shared by bulletin, chat, and plan tagging.
 * Organizers may act while their community is pending review; everyone else
 * gets a clear error. Rejected/offline communities block all member writes.
 * Returns an error string, or null if creation status allows the write.
 */
export function communityCreationBlockReason(
  community: Pick<CommunityRecord, "organizerId" | "creationStatus"> | null | undefined,
  userId: string,
): string | null {
  if (!community) return "Community not found";
  if (community.creationStatus === "pending") {
    if (!isCommunityOrganizer(community, userId)) {
      return "This community is pending review";
    }
    return null;
  }
  if (community.creationStatus !== "approved") {
    return "Community not found";
  }
  return null;
}
