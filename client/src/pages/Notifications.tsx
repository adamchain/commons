import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { LoadingScreen } from "../components/LoadingScreen";
import { formatRelative } from "../lib/format";
import type { NotificationDTO, NotificationKind } from "../types/shared";

/**
 * In-app notification feed. Backed by /api/notifications — server emits events
 * gated by each user's NotificationPrefs. Tap a row to deep-link to the
 * relevant plan or chat. Hitting this page marks everything read.
 */
export function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationDTO[] | null>(null);

  useEffect(() => {
    void api<{ notifications: NotificationDTO[] }>("/api/notifications")
      .then((r) => setItems(r.notifications))
      .catch(() => setItems([]));
    void api("/api/notifications/read", { method: "POST" }).catch(() => undefined);
  }, []);

  const sorted = useMemo(() => {
    if (!items) return [];
    return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [items]);

  if (items === null) return <LoadingScreen tagline="Catching up" />;

  return (
    <main className="app-shell app-shell--mid app-shell--with-nav app-shell--with-topbar">
      <div className="notif-header">
        <h1 className="brand" style={{ margin: 0 }}>
          Notifications
        </h1>
        <button
          type="button"
          className="notif-close"
          aria-label="Close notifications"
          onClick={() => navigate("/")}
        >
          ×
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="empty-state">Nothing new — you're all caught up.</p>
      ) : (
        <section className="notif-section">
          <div className="notif-list">
            {sorted.map((n) => (
              <NotifRow key={n.id} item={n} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function NotifRow({ item }: { item: NotificationDTO }) {
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
    </>
  );
  if (href) {
    return (
      <Link to={href} className="notif-row">
        {inner}
      </Link>
    );
  }
  return <div className="notif-row">{inner}</div>;
}

function hrefFor(n: NotificationDTO): string | null {
  if (n.kind === "newGroupChatMessage" && n.planId) return `/plans/${n.planId}/chat`;
  if (n.planId) return `/plans/${n.planId}`;
  return null;
}

function iconFor(kind: NotificationKind): string {
  switch (kind) {
    case "someoneJoinedYourPlan":
      return "👤";
    case "planTomorrow":
      return "📅";
    case "planInTwoHours":
      return "⏰";
    case "newGroupChatMessage":
      return "💬";
    case "postPlanNetworkNudge":
      return "🤝";
    case "planCancellation":
      return "⚠️";
    case "weeklyFridayDigest":
      return "📰";
    case "lookingForRecovery":
      return "🔓";
  }
}
