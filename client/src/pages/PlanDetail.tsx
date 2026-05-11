import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { GetThereSheet } from "../components/GetThereSheet";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { LoadingScreen } from "../components/LoadingScreen";
import { ParticipationButtons } from "../components/ParticipationButtons";
import { ShareSheet } from "../components/ShareSheet";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { formatPlanDate, formatPlanTime, sentenceCaseTitle } from "../lib/format";
import { INTEREST_LABELS, type ParticipationState, type PlanDTO, type PublicUser } from "../types/shared";

export function PlanDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showGetThere, setShowGetThere] = useState(false);
  const [lockVenue, setLockVenue] = useState("");
  const [lockVenueAddr, setLockVenueAddr] = useState("");
  const [lockLat, setLockLat] = useState<number | undefined>();
  const [lockLng, setLockLng] = useState<number | undefined>();
  const [lockDate, setLockDate] = useState("");
  const [lockTime, setLockTime] = useState("19:00");
  const [lockFlexTime, setLockFlexTime] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);

  const load = async () => {
    const data = await api<PlanDTO>(`/api/plans/${id}`);
    setPlan(data);
  };

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (!plan) return;
    const locName = plan.location.name;
    setLockVenue(locName === "Flexible location" ? "" : locName);
    setLockVenueAddr(plan.location.address ?? "");
    setLockLat(plan.location.lat);
    setLockLng(plan.location.lng);
    setLockDate(plan.date.slice(0, 10));
    setLockTime(plan.time && !plan.isFlexibleTime ? plan.time : "19:00");
    setLockFlexTime(plan.isFlexibleTime);
  }, [plan?.id, plan?.date, plan?.lockedAt, plan?.isFlexibleTime, plan?.isFlexibleLocation]);

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
  const canChat =
    isHosting ||
    plan.myState === "going" ||
    (plan.planKind === "looking_for" && plan.myState === "interested");

  async function lockIn() {
    if (!lockVenue.trim() || !lockDate) return;
    setLockBusy(true);
    try {
      const updated = await api<PlanDTO>(`/api/plans/${id}/lock`, {
        method: "POST",
        body: JSON.stringify({
          location: {
            name: lockVenue.trim(),
            address: lockVenueAddr.trim() || lockVenue.trim(),
            lat: lockLat,
            lng: lockLng,
          },
          date: lockDate,
          time: lockFlexTime ? "" : lockTime,
          isFlexibleTime: lockFlexTime,
        }),
      });
      setPlan(updated);
    } finally {
      setLockBusy(false);
    }
  }

  return (
    <main className="app-shell app-shell--wide">
      <header className="app-header">
        <Link to="/" className="detail-back">← Back</Link>
        <ThemeToggle />
      </header>

      <section className="plan-hero">
        <div className="plan-title-row">
          <span className="plan-title-emoji">{plan.hostEmoji}</span>
          <h1>{sentenceCaseTitle(plan.title)}</h1>
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
          <Avatar seed={plan.creator.avatarSeed} style={plan.creator.avatarStyle} photoDataUrl={plan.creator.avatarPhotoDataUrl} params={plan.creator.avatarParams} size="md" />
          <span>
            Hosted by <strong>{plan.creator.firstName}</strong>
          </span>
        </button>

        {plan.description && <p className="plan-description plan-description-quote">&ldquo;{plan.description}&rdquo;</p>}

        {plan.tags.length > 0 && (
          <div className="tag-chip-row">
            {plan.tags.map((tag) => (
              <span key={tag} className="tag-chip">{INTEREST_LABELS[tag] ?? tag}</span>
            ))}
          </div>
        )}

        {(plan.isFlexibleTime || plan.isFlexibleLocation) && isHosting && (
          <div className="coordination-banner coordination-banner--expanded" role="note">
            <p>Still working out the details? Fill in venue &amp; time when you’re ready and lock it in.</p>
            <label className="form-question">Venue</label>
            <LocationAutocomplete
              name={lockVenue}
              address={lockVenueAddr}
              onChange={(v) => {
                setLockVenue(v.name);
                setLockVenueAddr(v.address);
                setLockLat(v.lat);
                setLockLng(v.lng);
              }}
            />
            <label className="form-question" htmlFor="lock-date">
              Day
            </label>
            <input
              id="lock-date"
              className="onboarding-input"
              type="date"
              value={lockDate}
              onChange={(e) => setLockDate(e.target.value)}
            />
            <label className="flex-toggle">
              <input
                type="checkbox"
                checked={lockFlexTime}
                onChange={(e) => setLockFlexTime(e.target.checked)}
              />
              Flexible time
            </label>
            {!lockFlexTime && (
              <>
                <label className="form-question" htmlFor="lock-time">
                  Time
                </label>
                <input
                  id="lock-time"
                  className="onboarding-input"
                  type="time"
                  value={lockTime}
                  onChange={(e) => setLockTime(e.target.value)}
                />
              </>
            )}
            <button type="button" className="btn-primary btn-block" disabled={lockBusy || !lockVenue.trim() || !lockDate} onClick={() => void lockIn()}>
              {lockBusy ? "Saving…" : "Lock it in"}
            </button>
          </div>
        )}

        <ParticipationButtons
          planId={plan.id}
          initialState={plan.myState}
          onChange={onStateChange}
          planKind={plan.planKind}
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
                <Avatar seed={person.avatarSeed} style={person.avatarStyle} photoDataUrl={person.avatarPhotoDataUrl} params={person.avatarParams} size="lg" />
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
                  <Avatar seed={person.avatarSeed} style={person.avatarStyle} photoDataUrl={person.avatarPhotoDataUrl} params={person.avatarParams} size="sm" />
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

      {canChat && (
        <Link to={`/plans/${plan.id}/chat`} className="chat-entry">
          💬 Group chat ({plan.participants.going.length + plan.participants.interested.length})
          <span className="chat-entry-arrow">→</span>
        </Link>
      )}

      {showShare && <ShareSheet plan={plan} onClose={() => setShowShare(false)} />}
      {showGetThere && <GetThereSheet plan={plan} onClose={() => setShowGetThere(false)} />}
    </main>
  );
}
