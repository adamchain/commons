import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { GetThereSheet } from "../components/GetThereSheet";
import { LoadingScreen } from "../components/LoadingScreen";
import { ParticipationButtons } from "../components/ParticipationButtons";
import { ShareSheet } from "../components/ShareSheet";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { formatPlanDate, formatPlanTime } from "../lib/format";
import type { ParticipationState, PlanDTO, PublicUser } from "../types/shared";

export function PlanDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showGetThere, setShowGetThere] = useState(false);

  const load = async () => {
    const data = await api<PlanDTO>(`/api/plans/${id}`);
    setPlan(data);
  };

  useEffect(() => {
    void load();
  }, [id]);

  if (!plan || !user) {
    return <LoadingScreen tagline="Loading plan" />;
  }

  const onStateChange = (next: ParticipationState | null) => {
    setPlan((prev) => {
      if (!prev) return prev;
      const me: PublicUser = {
        id: user.id,
        firstName: user.firstName,
        neighborhoodId: user.neighborhoodId,
        avatarSeed: user.avatarSeed,
        avatarStyle: user.avatarStyle,
      };
      const goingFiltered = prev.participants.going.filter((u) => u.id !== user.id);
      const interestedFiltered = prev.participants.interested.filter((u) => u.id !== user.id);
      const going = next === "going" ? [...goingFiltered, me] : goingFiltered;
      const interested = next === "interested" ? [...interestedFiltered, me] : interestedFiltered;
      return { ...prev, myState: next, participants: { going, interested } };
    });
  };

  const isHosting = plan.creator.id === user.id;
  const inPlan = isHosting || plan.myState === "going";

  return (
    <main className="app-shell app-shell--wide">
      <header className="app-header">
        <Link to="/" className="detail-back">← Back</Link>
        <ThemeToggle />
      </header>

      <section className="plan-hero">
        <div className="plan-title-row">
          <span className="plan-title-emoji">{plan.hostEmoji}</span>
          <h1>{plan.title}</h1>
        </div>

        <div className="plan-when">
          {formatPlanDate(plan.date)} · {formatPlanTime(plan.time, plan.isFlexibleTime)}
        </div>
        <div className="plan-where">
          <strong>{plan.location.name}</strong>
          {plan.location.address && plan.location.address !== plan.location.name && (
            <div className="meta-secondary">{plan.location.address}</div>
          )}
        </div>

        <button
          type="button"
          className="host-row"
          onClick={() => navigate(`/profile/${plan.creator.id}`)}
        >
          <Avatar seed={plan.creator.avatarSeed} style={plan.creator.avatarStyle} size="md" />
          <span>
            Hosted by <strong>{plan.creator.firstName}</strong>
          </span>
        </button>

        {plan.description && <p className="plan-description">{plan.description}</p>}

        {plan.tags.length > 0 && (
          <div className="tag-chip-row">
            {plan.tags.map((tag) => (
              <span key={tag} className="tag-chip">{tag}</span>
            ))}
          </div>
        )}

        <ParticipationButtons
          planId={plan.id}
          initialState={plan.myState}
          onChange={onStateChange}
        />

        <div className="plan-actions-row">
          <button type="button" className="action-btn" onClick={() => setShowGetThere(true)}>
            🚗 Get there
          </button>
          <button type="button" className="action-btn" onClick={() => setShowShare(true)}>
            ↗ Share
          </button>
        </div>
      </section>

      <section className="who-block">
        <h3 className="who-block-heading">Going · {plan.participants.going.length}</h3>
        {plan.participants.going.length === 0 ? (
          <p className="subtle">No one's locked in yet. Be the first to say "I'm in."</p>
        ) : (
          <div className="participant-list-going">
            {plan.participants.going.map((person) => (
              <Link key={person.id} to={`/profile/${person.id}`} className="participant-row">
                <Avatar seed={person.avatarSeed} style={person.avatarStyle} size="lg" />
                <div>
                  <div className="participant-name">
                    {person.firstName}
                    {person.id === user.id && <span className="you-pill">You</span>}
                  </div>
                  {person.id === plan.creator.id && <div className="participant-role">Host</div>}
                </div>
              </Link>
            ))}
          </div>
        )}

        {plan.participants.interested.length > 0 && (
          <>
            <h3 className="who-block-heading" style={{ marginTop: 18 }}>
              Interested · {plan.participants.interested.length}
            </h3>
            <div className="participant-list-interested">
              {plan.participants.interested.map((person) => (
                <Link key={person.id} to={`/profile/${person.id}`} className="participant-row">
                  <Avatar seed={person.avatarSeed} style={person.avatarStyle} size="sm" />
                  <span className="participant-name">
                    {person.firstName}
                    {person.id === user.id && <span className="you-pill">You</span>}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      {inPlan && (
        <Link to={`/plans/${plan.id}/chat`} className="chat-entry">
          💬 Group chat ({plan.participants.going.length})
          <span className="chat-entry-arrow">→</span>
        </Link>
      )}

      {showShare && <ShareSheet plan={plan} onClose={() => setShowShare(false)} />}
      {showGetThere && <GetThereSheet plan={plan} onClose={() => setShowGetThere(false)} />}
    </main>
  );
}
