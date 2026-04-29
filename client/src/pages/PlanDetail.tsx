import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/http";
import { ParticipationButtons } from "../components/ParticipationButtons";
import { Avatar } from "../components/Avatar";
import { ThemeToggle } from "../components/ThemeToggle";
import { LoadingScreen } from "../components/LoadingScreen";
import type { ParticipationState, PlanDTO } from "../types/shared";
import { formatPlanDate, formatPlanTime, formatRelative } from "../lib/format";
import { useAuth } from "../context/AuthContext";

type CommentDTO = {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; displayName: string };
};

type PlanDetail = PlanDTO & { comments: CommentDTO[] };

export function PlanDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);

  const load = async () => {
    const data = await api<PlanDetail>(`/api/plans/${id}`);
    setPlan(data);
  };

  useEffect(() => {
    void load();
  }, [id]);

  const postComment = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = comment.trim();
    if (!trimmed) return;
    setPosting(true);
    try {
      await api(`/api/plans/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: trimmed }),
      });
      setComment("");
      await load();
    } finally {
      setPosting(false);
    }
  };

  if (!plan) {
    return <LoadingScreen tagline="Loading plan" />;
  }

  const onStateChange = (next: ParticipationState | null) => {
    setPlan((prev) => {
      if (!prev || !user) return prev;
      const goingFiltered = prev.participants.going.filter((u) => u.id !== user.id);
      const interestedFiltered = prev.participants.interested.filter((u) => u.id !== user.id);
      const me = { id: user.id, displayName: user.displayName };
      const going = next === "going" ? [...goingFiltered, me] : goingFiltered;
      const interested = next === "interested" ? [...interestedFiltered, me] : interestedFiltered;
      return {
        ...prev,
        myState: next,
        participants: { going, interested },
      };
    });
  };

  const isCreator = user && plan.creator.id === user.id;

  return (
    <main className="app-shell app-shell--wide">
      <header className="app-header">
        <Link to="/" className="detail-back" style={{ marginBottom: 0 }}>
          ← Back
        </Link>
        <div className="app-header-actions">
          <ThemeToggle />
        </div>
      </header>

      <div className="detail-layout">
        <section className="plan-hero">
          <div className="row-between">
            <h1>{plan.title}</h1>
            {isCreator ? <span className="badge">Hosting</span> : null}
          </div>

          <div className="plan-meta-row">
            <span className="icon">📍</span>
            <div>
              <div>
                <strong>{plan.location.name}</strong>
              </div>
              {plan.location.address && plan.location.address !== plan.location.name ? (
                <div className="meta-secondary">{plan.location.address}</div>
              ) : null}
              <a
                className="maps-link"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  plan.location.address || plan.location.name
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in Maps ↗
              </a>
            </div>
          </div>

          <div className="plan-meta-row">
            <span className="icon">📅</span>
            <div>
              <div>
                <strong>{formatPlanDate(plan.date)}</strong>
              </div>
              <div className="meta-secondary">
                {formatPlanTime(plan.time, plan.isFlexibleTime)}
              </div>
            </div>
          </div>

          <div className="plan-meta-row">
            <span className="icon">👤</span>
            <div>
              <div>
                Hosted by <strong>{plan.creator.displayName}</strong>
              </div>
            </div>
          </div>

          {plan.tags.length > 0 ? (
            <div className="tag-chip-row">
              {plan.tags.map((tag) => (
                <span key={tag} className="tag-chip">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {plan.description ? (
            <p style={{ margin: 0, color: "var(--text-muted)" }}>{plan.description}</p>
          ) : null}

          <ParticipationButtons
            planId={plan.id}
            initialState={plan.myState}
            onChange={onStateChange}
          />
        </section>

        <div className="detail-secondary">
          <section className="who-block">
            <h3 className="who-block-heading">
              Going · {plan.participants.going.length}
            </h3>
            {plan.participants.going.length === 0 ? (
              <p className="subtle" style={{ margin: "8px 0 0" }}>
                No one's locked in yet. Be the first to say "I'm in."
              </p>
            ) : (
              <div className="participant-list-going">
                {plan.participants.going.map((person) => (
                  <div key={person.id} className="participant-row">
                    <Avatar name={person.displayName} size="lg" />
                    <div>
                      <div className="participant-name">
                        {person.displayName}
                        {user && person.id === user.id ? (
                          <span className="you-pill">You</span>
                        ) : null}
                      </div>
                      {person.id === plan.creator.id ? (
                        <div className="participant-role">Host</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {plan.participants.interested.length > 0 ? (
              <>
                <h3 className="who-block-heading" style={{ marginTop: 18 }}>
                  Interested · {plan.participants.interested.length}
                </h3>
                <div className="participant-list-interested">
                  {plan.participants.interested.map((person) => (
                    <div key={person.id} className="participant-row">
                      <Avatar name={person.displayName} size="sm" />
                      <div>
                        <div className="participant-name">
                          {person.displayName}
                          {user && person.id === user.id ? (
                            <span className="you-pill">You</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <section className="who-block">
            <h3 className="who-block-heading">Coordination</h3>
            <div className="stack-tight" style={{ marginTop: 4 }}>
              {plan.comments.length === 0 ? (
                <p className="subtle" style={{ margin: "8px 0 0" }}>
                  No messages yet. Drop a quick note for the group.
                </p>
              ) : (
                plan.comments.map((c) => (
                  <div key={c.id} className="comment">
                    <Avatar name={c.user.displayName} size="sm" />
                    <div>
                      <div>
                        <span className="comment-author">{c.user.displayName}</span>
                        <span className="comment-when">{formatRelative(c.createdAt)}</span>
                      </div>
                      <div className="comment-body">{c.body}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={(event) => void postComment(event)}
              className="stack"
              style={{ marginTop: 12 }}
            >
              <textarea
                placeholder="Say something to the group…"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
              <button
                type="submit"
                className="btn btn-secondary btn-block"
                disabled={posting || !comment.trim()}
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
