import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlarmClock,
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
import { LoadingScreen } from "../components/LoadingScreen";
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
  // F.8 — the empty state reads differently once you're actually plugged
  // into a plan; find out before deciding which warm line to show.
  const [hasPlans, setHasPlans] = useState(false);

  useEffect(() => {
    void api<{ notifications: NotificationDTO[] }>("/api/notifications")
      .then((r) => setItems(r.notifications))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    void api<PlanDTO[]>("/api/plans")
      .then((plans) => setHasPlans(plans.some((p) => p.creator.id === user.id || p.myState !== null)))
      .catch(() => setHasPlans(false));
  }, [user]);

  const sorted = useMemo(() => {
    if (!items) return [];
    return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [items]);

  const unreadCount = useMemo(
    () => (items ?? []).filter((n) => n.readAt === null).length,
    [items],
  );

  function markAllRead() {
    setItems((prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? prev);
    void api("/api/notifications/read", { method: "POST" }).catch(() => undefined);
  }

  function clearAll() {
    setItems([]);
    void api("/api/notifications/clear", { method: "POST" }).catch(() => undefined);
  }

  function dismiss(id: string) {
    setItems((prev) => (prev ?? []).filter((n) => n.id !== id));
    void api(`/api/notifications/${id}`, { method: "DELETE" }).catch(() => undefined);
  }

  if (items === null) return <LoadingScreen tagline="Catching up" />;

  return (
    <main className="app-shell app-shell--mid app-shell--with-nav app-shell--with-topbar notif-page">
      <div className="notif-header">
        <h1 className="notif-title">Notifications</h1>
        <button
          type="button"
          className="notif-close"
          aria-label="Close notifications"
          onClick={() => navigate("/")}
        >
          ×
        </button>
      </div>

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
              Mark all read
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
        <div className="notif-empty" role="status">
          <div className="notif-empty-glyph" aria-hidden="true">
            <Bell size={28} strokeWidth={1.5} color="#6B5AA0" />
          </div>
          <h2 className="notif-empty-title">{hasPlans ? "All quiet." : "Nothing yet."}</h2>
          <p className="notif-empty-body">
            {hasPlans
              ? "We'll ping you when someone joins or a plan updates."
              : "Join a plan and this is where you'll hear about it."}
          </p>
          {!hasPlans && (
            <div className="feed-empty-actions">
              <Link to="/" className="btn-primary">See what's happening</Link>
            </div>
          )}
        </div>
      ) : (
        <section className="notif-section">
          <div className="notif-list">
            {sorted.map((n) => (
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
  const inner = (
    <>
      <span className="notif-row-icon" aria-hidden="true">
        {iconFor(item.kind)}
      </span>
      <div className="notif-row-body">
        <div className="notif-row-title">{item.body}</div>
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
      <Link to={href} state={linkState} className="notif-row">
        {inner}
      </Link>
    );
  }
  return <div className="notif-row">{inner}</div>;
}

function hrefFor(n: NotificationDTO): string | null {
  if (n.kind === "newGroupChatMessage" && n.planId) return `/plans/${n.planId}/chat`;
  if (n.kind === "welcome") return "/settings/interests";
  // Network request/accept link to the other person's profile, where the
  // Accept / connected state lives.
  if ((n.kind === "networkRequest" || n.kind === "networkAccepted") && n.profileUserId) {
    return `/profile/${n.profileUserId}`;
  }
  // Join requests land in Settings so the organizer can approve/decline.
  if (n.kind === "communityJoinRequest" && n.communityId) {
    return `/communities/${n.communityId}?tab=settings`;
  }
  // Other community pings route to the community page.
  if (n.communityId) return `/communities/${n.communityId}`;
  if (n.planId) return `/plans/${n.planId}`;
  return null;
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
      return <Hand {...props} />;
    case "networkRequest":
      return <Hand {...props} />;
    case "networkAccepted":
      return <Handshake {...props} />;
    case "communityJoinRequest":
      return <UserPlus {...props} />;
    case "communityRequestApproved":
      return <PartyPopper {...props} />;
    case "communityRequestDeclined":
      return <Frown {...props} />;
    case "communityPlanPosted":
      return <Pin {...props} />;
    case "welcome":
      return <Users {...props} />;
  }
}
