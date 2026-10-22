// Write-through mirror to Mongo. Every store mutation calls into here so the
// in-memory snapshot stays fast for sync reads while Mongo stays durable.
//
// All functions are fire-and-forget — they swallow errors and log them. The
// reasoning: routes are sync and shouldn't fail because of a transient Mongo
// hiccup. The snapshot is still correct; on next restart, hydration pulls the
// authoritative state back from Mongo, so a missed write reconciles itself
// only if it persisted to data.json. In production where data.json is
// ephemeral, a swallowed write is a real data loss — so we log loudly.
//
// When Mongo isn't connected (local dev with no MONGODB_URI), every function
// is a no-op and the local `data.json` is the only persistence.
import { isMongoConnected } from "./lib/db.js";
import { CardImageModel, CommunityMemberModel, CommunityModel, CommunityPostLikeModel, CommunityPostModel, ConversationModel, DeclineModel, DropoutModel, FeedbackModel, ForumMembershipModel, ForumPostLikeModel, ForumPostModel, ForumReplyModel, InterestForumModel, HelpTicketModel, LogModel, MessageModel, NeighborhoodModel, ParticipationModel, PlanModel, PlanSuggestionModel, ReportModel, } from "./models/index.js";
import { DeviceModel } from "./models/Device.js";
import { InviteCodeModel } from "./models/InviteCode.js";
import { NotificationModel } from "./models/Notification.js";
import { RelationshipModel } from "./models/Relationship.js";
import { UserModel } from "./models/User.js";
function fail(tag, err) {
    console.error(`[mongoMirror] ${tag} failed`, err);
}
// Track in-flight writes so callers (notably one-shot scripts) can wait for
// them to drain before disconnecting. In the running server we never call
// flush — writes proceed in the background and Mongo stays connected.
const pending = new Set();
function track(p) {
    pending.add(p);
    void p.finally(() => pending.delete(p));
    return p;
}
// Each upsert keys on our `id` field. We use $set so partial documents update
// cleanly, and `upsert: true` so write-through doubles as create-if-absent.
function upsert(model, record, tag) {
    if (!isMongoConnected())
        return;
    const p = model
        .updateOne({ id: record.id }, { $set: record }, { upsert: true })
        .exec()
        .catch((err) => fail(tag, err));
    track(p);
}
function removeById(model, id, tag) {
    if (!isMongoConnected())
        return;
    const p = model
        .deleteOne({ id })
        .exec()
        .catch((err) => fail(tag, err));
    track(p);
}
/** Upsert keyed on an arbitrary unique filter (composite keys without a UUID `id`). */
function upsertByFilter(model, filter, record, tag) {
    if (!isMongoConnected())
        return;
    const p = model
        .updateOne(filter, { $set: record }, { upsert: true })
        .exec()
        .catch((err) => fail(tag, err));
    track(p);
}
export const mongoMirror = {
    // Users
    upsertUser(u) {
        upsert(UserModel, u, `upsertUser ${u.id}`);
    },
    deleteUser(id) {
        removeById(UserModel, id, `deleteUser ${id}`);
    },
    deleteParticipationsByUser(userId) {
        if (!isMongoConnected())
            return;
        const p = ParticipationModel.deleteMany({ userId })
            .exec()
            .catch((err) => fail(`deleteParticipationsByUser ${userId}`, err));
        track(p);
    },
    deleteNotificationsByUser(userId) {
        if (!isMongoConnected())
            return;
        const p = NotificationModel.deleteMany({ userId })
            .exec()
            .catch((err) => fail(`deleteNotificationsByUser ${userId}`, err));
        track(p);
    },
    deleteNotification(id) {
        removeById(NotificationModel, id, `deleteNotification ${id}`);
    },
    deleteInviteCodesByOwner(ownerUserId) {
        if (!isMongoConnected())
            return;
        const p = InviteCodeModel.deleteMany({ ownerUserId })
            .exec()
            .catch((err) => fail(`deleteInviteCodesByOwner ${ownerUserId}`, err));
        track(p);
    },
    deleteRelationshipsTouching(userId) {
        if (!isMongoConnected())
            return;
        const p = RelationshipModel.deleteMany({ $or: [{ userId }, { targetId: userId }] })
            .exec()
            .catch((err) => fail(`deleteRelationshipsTouching ${userId}`, err));
        track(p);
    },
    // Card images (admin-managed event-card art)
    upsertCardImage(c) {
        upsert(CardImageModel, c, `upsertCardImage ${c.id}`);
    },
    deleteCardImage(id) {
        removeById(CardImageModel, id, `deleteCardImage ${id}`);
    },
    // Neighborhoods
    upsertNeighborhood(n) {
        upsert(NeighborhoodModel, n, `upsertNeighborhood ${n.id}`);
    },
    replaceAllNeighborhoods(list) {
        if (!isMongoConnected())
            return;
        const p = (async () => {
            try {
                await NeighborhoodModel.deleteMany({}).exec();
                if (list.length > 0)
                    await NeighborhoodModel.insertMany(list, { ordered: false });
            }
            catch (err) {
                fail("replaceAllNeighborhoods", err);
            }
        })();
        track(p);
    },
    // Plans
    upsertPlan(p) {
        upsert(PlanModel, p, `upsertPlan ${p.id}`);
    },
    deletePlan(id) {
        removeById(PlanModel, id, `deletePlan ${id}`);
    },
    // Participations — keyed by id (UUID), unique on (planId, userId).
    upsertParticipation(row) {
        upsert(ParticipationModel, row, `upsertParticipation ${row.id}`);
    },
    deleteParticipation(planId, userId) {
        if (!isMongoConnected())
            return;
        const p = ParticipationModel.deleteOne({ planId, userId })
            .exec()
            .catch((err) => fail(`deleteParticipation ${planId}/${userId}`, err));
        track(p);
    },
    /**
     * Await all in-flight mirror writes. Used by one-shot scripts before they
     * disconnect. In the long-running server we don't call this — writes drain
     * naturally as the server keeps Mongo connected.
     */
    async flushPending() {
        while (pending.size > 0) {
            await Promise.allSettled([...pending]);
        }
    },
    // Conversations + Messages
    upsertConversation(c) {
        upsert(ConversationModel, c, `upsertConversation ${c.id}`);
    },
    upsertMessage(m) {
        upsert(MessageModel, m, `upsertMessage ${m.id}`);
    },
    // Plan suggestions
    upsertPlanSuggestion(s) {
        upsert(PlanSuggestionModel, s, `upsertPlanSuggestion ${s.id}`);
    },
    // Feedback
    upsertFeedback(f) {
        upsert(FeedbackModel, f, `upsertFeedback ${f.id}`);
    },
    // Declines
    upsertDecline(d) {
        upsert(DeclineModel, d, `upsertDecline ${d.id}`);
    },
    // Dropouts
    upsertDropout(d) {
        upsert(DropoutModel, d, `upsertDropout ${d.id}`);
    },
    deleteDropoutsByUser(userId) {
        if (!isMongoConnected())
            return;
        const p = DropoutModel.deleteMany({ userId })
            .exec()
            .catch((err) => fail(`deleteDropoutsByUser ${userId}`, err));
        track(p);
    },
    // Logs
    upsertLog(l) {
        upsert(LogModel, l, `upsertLog ${l.id}`);
    },
    upsertReport(r) {
        upsert(ReportModel, r, `upsertReport ${r.id}`);
    },
    upsertHelpTicket(t) {
        upsert(HelpTicketModel, t, `upsertHelpTicket ${t.id}`);
    },
    // Notifications
    upsertNotification(n) {
        upsert(NotificationModel, n, `upsertNotification ${n.id}`);
    },
    // Relationships
    upsertRelationship(r) {
        upsert(RelationshipModel, r, `upsertRelationship ${r.id}`);
    },
    deleteRelationship(userId, targetId, kind) {
        if (!isMongoConnected())
            return;
        const p = RelationshipModel.deleteOne({ userId, targetId, kind })
            .exec()
            .catch((err) => fail(`deleteRelationship ${userId}/${targetId}/${kind}`, err));
        track(p);
    },
    // Invite codes
    upsertInviteCode(c) {
        upsert(InviteCodeModel, c, `upsertInviteCode ${c.id}`);
    },
    // Communities
    upsertCommunity(c) {
        upsert(CommunityModel, c, `upsertCommunity ${c.id}`);
    },
    deleteCommunity(id) {
        removeById(CommunityModel, id, `deleteCommunity ${id}`);
    },
    upsertCommunityMember(m) {
        upsert(CommunityMemberModel, m, `upsertCommunityMember ${m.id}`);
    },
    deleteCommunityMember(communityId, userId) {
        if (!isMongoConnected())
            return;
        const p = CommunityMemberModel.deleteOne({ communityId, userId })
            .exec()
            .catch((err) => fail(`deleteCommunityMember ${communityId}/${userId}`, err));
        track(p);
    },
    deleteCommunityMembersByUser(userId) {
        if (!isMongoConnected())
            return;
        const p = CommunityMemberModel.deleteMany({ userId })
            .exec()
            .catch((err) => fail(`deleteCommunityMembersByUser ${userId}`, err));
        track(p);
    },
    deleteCommunityMembersByCommunity(communityId) {
        if (!isMongoConnected())
            return;
        const p = CommunityMemberModel.deleteMany({ communityId })
            .exec()
            .catch((err) => fail(`deleteCommunityMembersByCommunity ${communityId}`, err));
        track(p);
    },
    upsertCommunityPost(p) {
        upsert(CommunityPostModel, p, `upsertCommunityPost ${p.id}`);
    },
    upsertCommunityPostLike(l) {
        upsertByFilter(CommunityPostLikeModel, { postId: l.postId, userId: l.userId }, l, `upsertCommunityPostLike ${l.postId}/${l.userId}`);
    },
    deleteCommunityPostLike(postId, userId) {
        if (!isMongoConnected())
            return;
        const p = CommunityPostLikeModel.deleteOne({ postId, userId })
            .exec()
            .catch((err) => fail(`deleteCommunityPostLike ${postId}/${userId}`, err));
        track(p);
    },
    deleteCommunityPostLikesByPost(postId) {
        if (!isMongoConnected())
            return;
        const p = CommunityPostLikeModel.deleteMany({ postId })
            .exec()
            .catch((err) => fail(`deleteCommunityPostLikesByPost ${postId}`, err));
        track(p);
    },
    deleteCommunityPostsByCommunity(communityId) {
        if (!isMongoConnected())
            return;
        const p = CommunityPostModel.deleteMany({ communityId })
            .exec()
            .catch((err) => fail(`deleteCommunityPostsByCommunity ${communityId}`, err));
        track(p);
    },
    deleteConversation(id) {
        removeById(ConversationModel, id, `deleteConversation ${id}`);
    },
    deleteMessagesByConversation(conversationId) {
        if (!isMongoConnected())
            return;
        const p = MessageModel.deleteMany({ conversationId })
            .exec()
            .catch((err) => fail(`deleteMessagesByConversation ${conversationId}`, err));
        track(p);
    },
    deleteMessage(id) {
        removeById(MessageModel, id, `deleteMessage ${id}`);
    },
    // Interest Forums
    upsertInterestForum(f) {
        upsert(InterestForumModel, f, `upsertInterestForum ${f.id}`);
    },
    upsertForumMembership(m) {
        upsertByFilter(ForumMembershipModel, { userId: m.userId, interestTag: m.interestTag }, m, `upsertForumMembership ${m.userId}/${m.interestTag}`);
    },
    upsertForumPost(p) {
        upsert(ForumPostModel, p, `upsertForumPost ${p.id}`);
    },
    deleteForumPost(id) {
        removeById(ForumPostModel, id, `deleteForumPost ${id}`);
    },
    upsertForumReply(r) {
        upsert(ForumReplyModel, r, `upsertForumReply ${r.id}`);
    },
    deleteForumRepliesByPost(postId) {
        if (!isMongoConnected())
            return;
        const p = ForumReplyModel.deleteMany({ postId })
            .exec()
            .catch((err) => fail(`deleteForumRepliesByPost ${postId}`, err));
        track(p);
    },
    upsertForumPostLike(l) {
        upsertByFilter(ForumPostLikeModel, { postId: l.postId, userId: l.userId }, l, `upsertForumPostLike ${l.postId}/${l.userId}`);
    },
    deleteForumPostLike(postId, userId) {
        if (!isMongoConnected())
            return;
        const p = ForumPostLikeModel.deleteOne({ postId, userId })
            .exec()
            .catch((err) => fail(`deleteForumPostLike ${postId}/${userId}`, err));
        track(p);
    },
    deleteForumPostLikesByPost(postId) {
        if (!isMongoConnected())
            return;
        const p = ForumPostLikeModel.deleteMany({ postId })
            .exec()
            .catch((err) => fail(`deleteForumPostLikesByPost ${postId}`, err));
        track(p);
    },
    // Devices (push notification tokens)
    upsertDevice(d) {
        upsert(DeviceModel, d, `upsertDevice ${d.id}`);
    },
    deleteDeviceByToken(token) {
        if (!isMongoConnected())
            return;
        const p = DeviceModel.deleteOne({ token })
            .exec()
            .catch((err) => fail(`deleteDeviceByToken ${token}`, err));
        track(p);
    },
    deleteDevicesByUser(userId) {
        if (!isMongoConnected())
            return;
        const p = DeviceModel.deleteMany({ userId })
            .exec()
            .catch((err) => fail(`deleteDevicesByUser ${userId}`, err));
        track(p);
    },
};
