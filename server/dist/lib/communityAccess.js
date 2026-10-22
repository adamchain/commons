import { store } from "../store.js";
/** True only for the community's actual organizer — not COMMONS admins. */
export function isCommunityOrganizer(community, userId) {
    return community.organizerId === userId;
}
export function isActiveCommunityMember(communityId, userId) {
    return store.findCommunityMembership(communityId, userId)?.status === "active";
}
/**
 * Private communities and communities with a screening question both need the
 * organizer to approve. Network connections do not skip this.
 */
export function communityRequiresJoinApproval(community) {
    return (!!community.screeningQuestion || (community.visibility ?? "everyone") === "members_only");
}
/**
 * Board view (bulletin / events / members) stays open for instant-join /
 * "Everyone" communities. Locked when the community requires a join request.
 */
export function canViewCommunityBoard(community, userId) {
    if (!communityRequiresJoinApproval(community))
        return true;
    return (isCommunityOrganizer(community, userId) || isActiveCommunityMember(community.id, userId));
}
/**
 * Inside actions (posting, chat, manage) require an active membership or being
 * the real organizer. COMMONS admins are not treated as members — they use the
 * Admin panel for ops, and Join like everyone else.
 */
export function canAccessCommunityInside(community, userId) {
    return (isCommunityOrganizer(community, userId) || isActiveCommunityMember(community.id, userId));
}
/** Block reason for community write actions; null means allowed. */
export function communityMembershipBlockReason(community, userId, action = "post here") {
    if (!community)
        return "Community not found";
    if (canAccessCommunityInside(community, userId))
        return null;
    return `Join the community to ${action}`;
}
/**
 * Pending-review / offline gate shared by bulletin, chat, and plan tagging.
 * Organizers may act while their community is pending review; everyone else
 * gets a clear error. Rejected/offline communities block all member writes.
 * Returns an error string, or null if creation status allows the write.
 */
export function communityCreationBlockReason(community, userId) {
    if (!community)
        return "Community not found";
    if (community.hiddenAt)
        return "Community not found";
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
