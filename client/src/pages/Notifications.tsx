import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlarmClock,
  ArrowLeft,
  Bell,
  Calendar,
  CheckCircle2,
  Handshake,
  Lightbulb,
  Mail,
  MessageCircle,
  Newspaper,
  PartyPopper,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Unlock,
  UserPlus,
  UserRound,
  Users,
  AlertTriangle,
  Frown,
  Pin,
  Hand,
  Clock,
} from "lucide-react";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { EmptyCard } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { formatRelative } from "../lib/format";
import type { NavFromState } from "../lib/navState";
import type { NotificationDTO, NotificationKind, PlanDTO } from "../types/shared";

/**
 * In-app notification feed. Backed by /api/notifications — server emits events
 * gated by each user's NotificationPrefs. Tap a row to deep-link to the
 * relevant plan or chat. Hitting this page marks everything read.
 */
export function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationDTO[] | null>(null);
  const [tab, setTab] = useState<"activity" | "requests">("activity");
  const [openedUnread, setOpenedUnread] = useState(0);
  const [openedRequestUnread, setOpenedRequestUnread] = useState(false);
  // F.8 — the empty state reads differently once you're actually plugged
  // into a plan; find out before deciding which warm line to show.
  const [hasPlans, setHasPlans] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await api<{ notifications: NotificationDTO[] }>("/api/notifications");
        if (!alive) return;
        const seenAt = new Date().toISOString();
        setOpenedUnread(r.notifications.filter((n) => n.readAt === null).length);
        setOpenedRequestUnread(
          r.notifications.some((n) => n.readAt === null && REQUEST_KINDS.has(n.kind)),
        );
        setItems(r.notifications.map((n) => ({ ...n, readAt: n.readAt ?? seenAt })));
        if (r.notifications.some((n) => n.readAt === null)) {
          await api("/api/notifications/read", { method: "POST" });
          window.dispatchEvent(new CustomEvent("commons:notifications-changed"));
        }
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    void api<PlanDTO[]>("/api/plans")
      .then((plans) => setHasPlans(plans.some((p) => p.creator.id === user.id || p.myState !== null)))
      .catch(() => setHasPlans(false));
  }, [user]);

  const sorted = useMemo(() => {
    if (!items) return [];
    // Keep "needs a new host" pings easy to find — unread up-for-grabs float first.
    return [...items].sort((a, b) => {
      const aGrab = a.kind === "planUpForGrabs" && a.readAt === null ? 1 : 0;
      const bGrab = b.kind === "planUpForGrabs" && b.readAt === null ? 1 : 0;
      if (aGrab !== bGrab) return bGrab - aGrab;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [items]);

  const unreadCount = useMemo(
    () => (items ?? []).filter((n) => n.readAt === null).length,
    [items],
  );

  const requests = sorted.filter((n) => REQUEST_KINDS.has(n.kind));
  const activity = sorted.filter((n) => !REQUEST_KINDS.has(n.kind));
  const visible = tab === "requests" ? requests : activity;

  function markAllRead() {
    setOpenedUnread(0);
    setOpenedRequestUnread(false);
    setItems((prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? prev);
    void api("/api/notifications/read", { method: "POST" })
      .then(() => window.dispatchEvent(new CustomEvent("commons:notifications-changed")))
      .catch(() => undefined);
  }

  function clearAll() {
    setOpenedUnread(0);
    setOpenedRequestUnread(false);
    setItems([]);
    void api("/api/notifications/clear", { method: "POST" })
      .then(() => window.dispatchEvent(new CustomEvent("commons:notifications-changed")))
      .catch(() => undefined);
  }

  function dismiss(id: string) {
    setItems((prev) => (prev ?? []).filter((n) => n.id !== id));
    void api(`/api/notifications/${id}`, { method: "DELETE" })
      .then(() => window.dispatchEvent(new CustomEvent("commons:notifications-changed")))
      .catch(() => undefined);
  }

  if (items === null) {
    return (
      <main className="app-shell app-shell--mid app-shell--with-nav app-shell--with-topbar notif-page">
        <div className="notif-header">
          <button
            type="button"
            className="back-circle"
            aria-label="Back"
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate("/");
            }}
          >
            <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
          </button>
          <h1 className="notif-title">Notifications</h1>
        </div>
        <div className="feed-skeleton" aria-busy="true" aria-label="Loading notifications">
          <div className="feed-skeleton-card" />
          <div className="feed-skeleton-card" />
          <div className="feed-skeleton-card" />
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell app-shell--mid app-shell--with-nav app-shell--with-topbar notif-page">
      <div className="notif-header">
        <button
          type="button"
          className="back-circle"
          aria-label="Back"
          onClick={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate("/");
          }}
        >
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <h1 className="notif-title">Notifications</h1>
        {openedUnread > 0 && (
          <span className="notif-count-badge">{openedUnread > 9 ? "9+" : openedUnread}</span>
        )}
      </div>

      {sorted.length > 0 && (
        <div className="notif-tabs" role="tablist" aria-label="Notification sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "activity"}
            className={`notif-tab${tab === "activity" ? " is-active" : ""}`}
            onClick={() => setTab("activity")}
          >
            Activity
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "requests"}
            className={`notif-tab${tab === "requests" ? " is-active" : ""}`}
            onClick={() => setTab("requests")}
          >
            Requests
            {openedRequestUnread && <span className="notif-tab-dot" aria-label="Unread requests" />}
          </button>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="notif-toolbar">
          <span className="notif-toolbar-count">
            {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
          </span>
          <div className="notif-toolbar-actions">
            <button
              type="button"
              className="notif-toolbar-link"
              disabled={unreadCount === 0}
              onClick={markAllRead}
            >
              Mark all as read
            </button>
            <button
              type="button"
              className="notif-toolbar-link notif-toolbar-link--accent"
              onClick={clearAll}
            >
              <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" /> Clear all
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyCard
          icon={<Bell size={22} strokeWidth={1.6} color="#6B5AA0" />}
          tint="#D8D0F0"
          title="It's quiet in here."
          body={
            hasPlans
              ? "We'll nudge you when something stirs."
              : "Go get into something — then we'll have news."
          }
          cta={hasPlans ? undefined : { to: "/", label: "See what's happening" }}
        />
      ) : visible.length === 0 ? (
        <p className="notif-tab-empty">
          {tab === "requests" ? "No requests right now." : "Nothing new in activity."}
        </p>
      ) : (
        <section className="notif-section">
          <div className="notif-list">
            {visible.map((n) => (
              <NotifRow key={n.id} item={n} onDismiss={() => dismiss(n.id)} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function NotifRow({ item, onDismiss }: { item: NotificationDTO; onDismiss: () => void }) {
  const href = hrefFor(item);
  const isGrabs = item.kind === "planUpForGrabs";
  const isNetworkAdd =
    item.kind === "networkRequest" &&
    Boolean(item.profileUserId) &&
    /added you|wants to add you|accept to connect/i.test(item.body);
  const inner = (
    <>
      {item.actor ? (
        <Avatar
          seed={item.actor.avatarSeed}
          style={item.actor.avatarStyle}
          photoDataUrl={item.actor.avatarPhotoDataUrl}
          params={item.actor.avatarParams}
          name={item.actor.firstName}
          size="sm"
        />
      ) : (
        <span className="notif-row-icon" aria-hidden="true">
          {iconFor(item.kind)}
        </span>
      )}
      <div className="notif-row-body">
        <div className="notif-row-title">{item.body}</div>
        {isGrabs && <span className="notif-row-cta">Take over hosting</span>}
        {isNetworkAdd && item.profileUserId && <NetworkRespond userId={item.profileUserId} />}
        <div className="notif-row-sub">{formatRelative(item.createdAt)}</div>
      </div>
      {item.readAt === null && <span className="notif-row-unread" aria-label="Unread" />}
      <button
        type="button"
        className="notif-row-dismiss"
        aria-label="Dismiss notification"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
        }}
      >
        ×
      </button>
    </>
  );
  if (href) {
    const linkState: NavFromState = { from: "notifications" };
    return (
      <Link to={href} state={linkState} className={`notif-row${isGrabs ? " notif-row--grabs" : ""}`}>
        {inner}
      </Link>
    );
  }
  return <div className={`notif-row${isGrabs ? " notif-row--grabs" : ""}`}>{inner}</div>;
}

function hrefFor(n: NotificationDTO): string | null {
  if (n.kind === "newGroupChatMessage" && n.communityId && !n.planId) {
    return n.conversationId ? `/communities/${n.communityId}/chat` : `/communities/${n.communityId}`;
  }
  if (n.kind === "newGroupChatMessage" && n.profileUserId && !n.planId) return `/dm/${n.profileUserId}`;
  if (n.kind === "newGroupChatMessage" && n.planId) return `/plans/${n.planId}/chat`;
  if (n.kind === "welcome") return "/settings/interests";
  if (n.kind === "helpReply") return "/helpchat";
  // Network request/accept link to the other person's profile, where the
  // Accept / connected state lives.
  if ((n.kind === "networkRequest" || n.kind === "networkAccepted") && n.profileUserId) {
    return `/profile/${n.profileUserId}`;
  }
  // A new community waiting on COMMONS admin review opens the review queue.
  if (n.kind === "communityReview") return "/admin?page=communities#communities-review";
  // Join requests and posts waiting on the organizer open the dashboard queue.
  if (n.kind === "communityJoinRequest" && n.communityId) {
    return `/communities/${n.communityId}/dashboard?section=requests`;
  }
  if (n.kind === "communityPostPending" && n.communityId) {
    return `/communities/${n.communityId}/dashboard?section=bulletin`;
  }
  if (
    n.communityId &&
    (n.kind === "communityRequestApproved" ||
      n.kind === "communityRequestDeclined" ||
      n.kind === "communityPlanPosted")
  ) {
    return `/communities/${n.communityId}`;
  }
  // A join or interested ping on a community plan still opens the plan.
  if (n.planId) return `/plans/${n.planId}`;
  if (n.communityId) return `/communities/${n.communityId}`;
  return null;
}

const REQUEST_KINDS = new Set<NotificationKind>([
  "networkRequest",
  "communityJoinRequest",
  "communityPostPending",
]);

function NetworkRespond({ userId }: { userId: string }) {
  const [state, setState] = useState<"idle" | "ok" | "no" | "err">("idle");
  async function respond(
    path: "network-accept" | "network-decline",
    e: { preventDefault(): void; stopPropagation(): void },
  ) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api(`/api/auth/${path}`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      setState(path === "network-accept" ? "ok" : "no");
    } catch {
      setState("err");
    }
  }
  if (state === "ok") return <span className="notif-row-cta">You're connected</span>;
  if (state === "no") return <span className="notif-row-cta">Declined</span>;
  return (
    <span className="notif-row-actions">
      <button type="button" className="notif-row-cta notif-row-accept" onClick={(e) => void respond("network-accept", e)}>
        {state === "err" ? "Try again" : "Accept"}
      </button>
      <button type="button" className="notif-row-cta notif-row-decline" onClick={(e) => void respond("network-decline", e)}>
        Decline
      </button>
    </span>
  );
}

function iconFor(kind: NotificationKind): ReactNode {
  const props = { size: 16 as const, strokeWidth: 1.6 as const, color: "var(--muted)" };
  switch (kind) {
    case "someoneJoinedYourPlan":
      return <UserRound {...props} />;
    case "planTomorrow":
    case "planDayOf":
      return <Calendar {...props} />;
    case "planInTwoHours":
      return <AlarmClock {...props} />;
    case "interestedNudge":
      return <Lightbulb {...props} />;
    case "didThisHappen":
      return <CheckCircle2 {...props} />;
    case "planSpotReopen":
      return <Unlock {...props} />;
    case "newGroupChatMessage":
      return <MessageCircle {...props} />;
    case "postPlanNetworkNudge":
      return <Handshake {...props} />;
    case "planCancellation":
      return <AlertTriangle {...props} />;
    case "weeklyFridayDigest":
      return <Newspaper {...props} />;
    case "lookingForRecovery":
      return <Search {...props} />;
    case "planTimeProposed":
      return <Clock {...props} />;
    case "planTimeChanged":
      return <RefreshCw {...props} />;
    case "planInvite":
      return <Mail {...props} />;
    case "planUpForGrabs":
      return <Hand {...props} color="var(--red)" />;
    case "networkRequest":
      return <UserPlus {...props} />;
    case "networkAccepted":
      return <Handshake {...props} />;
    case "communityJoinRequest":
      return <UserPlus {...props} />;
    case "communityPostPending":
      return <MessageCircle {...props} />;
    case "communityRequestApproved":
      return <PartyPopper {...props} />;
    case "communityRequestDeclined":
      return <Frown {...props} />;
    case "communityPlanPosted":
      return <Pin {...props} />;
    case "welcome":
      return <Users {...props} />;
    case "communityReview":
      return <Shield {...props} />;
    case "helpReply":
      return <MessageCircle {...props} />;
  }
}
