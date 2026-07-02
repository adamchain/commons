import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { formatRelative } from "../lib/format";
import type { ConversationSummaryDTO } from "../types/shared";

const ROLE_LABEL: Record<ConversationSummaryDTO["myRole"], string> = {
  hosting: "Started",
  going: "Going",
  interested: "Interested",
};

export function MessagesPage() {
  const [items, setItems] = useState<ConversationSummaryDTO[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void api<ConversationSummaryDTO[]>("/api/conversations")
      .then((rows) => {
        setItems(
          [...rows].sort((a, b) => {
            const at = a.lastMessageAt ?? a.planDate;
            const bt = b.lastMessageAt ?? b.planDate;
            return at.localeCompare(bt);
          }),
        );
        setReady(true);
      })
      .catch(() => {
        setItems([]);
        setReady(true);
      });
  }, []);

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar app-shell--messages-lock">
      <h1 className="messages-page-title">Messages</h1>
      <p className="messages-page-sub">
        Group chats from plans you&apos;ve started, are going to, or are interested in.
      </p>

      {!ready ? (
        <div className="feed-skeleton" aria-hidden="true">
          <div className="feed-skeleton-card" />
          <div className="feed-skeleton-card" />
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p style={{ margin: 0 }}>No chats yet — join a plan and its group chat shows up here.</p>
          <Link to="/explore" className="btn-primary" style={{ marginTop: 14, display: "inline-block" }}>
            Find plans
          </Link>
        </div>
      ) : (
        <div className="messages-card">
          <div className="messages-list">
            {items.map((c) => (
              <Link key={c.planId} to={`/plans/${c.planId}/chat`} className="messages-row">
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
        </div>
      )}
    </main>
  );
}
