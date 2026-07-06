import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { LoadingScreen } from "../components/LoadingScreen";
import { formatRelative } from "../lib/format";
import type { ConversationSummaryDTO } from "../types/shared";

const ROLE_LABEL: Record<ConversationSummaryDTO["myRole"], string> = {
  hosting: "Hosting",
  going: "Going",
  interested: "Interested",
};

export function MessagesPage() {
  const [items, setItems] = useState<ConversationSummaryDTO[] | null>(null);

  useEffect(() => {
    void api<ConversationSummaryDTO[]>("/api/conversations")
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  if (items === null) return <LoadingScreen tagline="Loading messages" />;

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <h1 className="brand" style={{ marginBottom: 4 }}>
        Messages
      </h1>
      <p className="brand-tagline" style={{ marginBottom: 20 }}>
        Group chats from plans you're hosting, going to, or interested in
      </p>

      {items.length === 0 ? (
        <div className="empty-state">
          <p style={{ margin: 0 }}>No chats yet — join a plan and its group chat shows up here.</p>
          <Link to="/explore" className="btn-primary" style={{ marginTop: 14, display: "inline-block" }}>
            Find plans
          </Link>
        </div>
      ) : (
        <div className="messages-list">
          {items.map((c) => (
            <Link
              key={c.planId}
              to={`/plans/${c.planId}/chat`}
              state={{ from: "inbox" }}
              className="messages-row"
            >
              <span className="messages-row-emoji" aria-hidden="true">
                {c.hostEmoji}
              </span>
              <div className="messages-row-body">
                <div className="messages-row-top">
                  <span className="messages-row-title">{c.planTitle}</span>
                  {c.lastMessageAt && (
                    <span className="messages-row-time">{formatRelative(c.lastMessageAt)}</span>
                  )}
                </div>
                <div className="messages-row-preview">
                  {c.lastMessagePreview ?? "No messages yet — say hi 👋"}
                </div>
                <div className="messages-row-meta">
                  {ROLE_LABEL[c.myRole]} · {c.participantCount}{" "}
                  {c.participantCount === 1 ? "person" : "people"}
                </div>
              </div>
              {c.unreadCount > 0 && (
                <span className="messages-row-unread" aria-label={`${c.unreadCount} unread`}>
                  {c.unreadCount}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
