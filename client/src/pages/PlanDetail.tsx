import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { GetThereSheet } from "../components/GetThereSheet";
import { InviteSheet } from "../components/InviteSheet";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { LoadingScreen } from "../components/LoadingScreen";
import { ParticipationButtons } from "../components/ParticipationButtons";
import { ShareSheet } from "../components/ShareSheet";
import { useAuth } from "../context/AuthContext";
import { formatPlaceAddress, formatPlanDate, formatPlanTime, sentenceCaseTitle } from "../lib/format";
import { INTEREST_LABELS, type ParticipationState, type PlanDTO, type PublicUser } from "../types/shared";

export function PlanDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showGetThere, setShowGetThere] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [lockVenue, setLockVenue] = useState("");
  const [lockVenueAddr, setLockVenueAddr] = useState("");
  const [lockLat, setLockLat] = useState<number | undefined>();
  const [lockLng, setLockLng] = useState<number | undefined>();
  const [lockDate, setLockDate] = useState("");
  const [lockTime, setLockTime] = useState("19:00");
  const [lockFlexTime, setLockFlexTime] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [claimedHost, setClaimedHost] = useState(false);
  const lockFormRef = useRef<HTMLDivElement | null>(null);

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
      const updated = { ...prev, myState: next, participants: { going, interested } };
      // Looking-For lifecycle: tapping Interested drops you into the group
      // chat — that's where coordination happens before anyone locks in.
      if (next === "interested" && prev.planKind === "looking_for" && prev.creator.id !== user.id) {
        // Defer navigation so the state update flushes first.
        setTimeout(() => navigate(`/plans/${prev.id}/chat`), 200);
      }
      return updated;
    });
  };

  const isHosting = plan.creator.id === user.id;
  const isLookingFor = plan.planKind === "looking_for";
  const inThread = isHosting || plan.myState === "going" || plan.myState === "interested";
  // Looking-For lifecycle: anyone in the thread can lock the plan in (spec is
  // explicit that the original poster isn't privileged). The locker becomes
  // the host server-side.
  const canLock = !plan.lockedAt && (isLookingFor ? inThread : isHosting);
  // Prompt fires when the thread has at least 2 people committing (interested
  // or going) — that's the signal there's a group.
  const groupSize = plan.participants.interested.length + plan.participants.going.length;
  const showGroupPrompt = isLookingFor && !plan.lockedAt && groupSize >= 2 && !isHosting;
  const canChat =
    isHosting || plan.myState === "going" || plan.myState === "interested";

  async function cancelPlan() {
    if (!plan) return;
    if (!confirm(`Cancel "${plan.title}"? Everyone who RSVP'd will be notified.`)) return;
    try {
      await api(`/api/plans/${plan.id}/cancel`, { method: "POST" });
      await load();
    } catch {
      /* surface via reload */
    }
  }

  async function transferHost(newHostId: string, newHostName: string) {
    if (!plan) return;
    if (!confirm(`Transfer hosting of "${plan.title}" to ${newHostName}? You'll drop off the going list.`)) return;
    try {
      await api(`/api/plans/${plan.id}/transfer-host`, {
        method: "POST",
        body: JSON.stringify({ newHostId }),
      });
      await load();
    } catch {
      /* surface via reload */
    }
  }

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
    <main className="app-shell app-shell--wide app-shell--with-nav">
      <header className="app-header app-header--minimal">
        <Link to="/" className="detail-back">← Back</Link>
      </header>

      <section className="plan-hero">
        <div className="plan-title-row">
          <span className="plan-title-emoji">{plan.hostEmoji}</span>
          <h1>{sentenceCaseTitle(plan.title)}</h1>
        </div>

        <div className="plan-when">
          {formatPlanDate(plan.date)} · {formatPlanTime(plan.time, plan.isFlexibleTime)}
        </div>
        {(() => {
          const pretty = formatPlaceAddress(plan.location.address);
          const showAddressLine = pretty && pretty !== plan.location.name;
          if (plan.isFlexibleLocation) {
            return (
              <div className="plan-where">
                <strong>{plan.location.name}</strong>
                {showAddressLine && <div className="meta-secondary">{pretty}</div>}
              </div>
            );
          }
          const query = encodeURIComponent(
            [plan.location.name, plan.location.address].filter(Boolean).join(" "),
          );
          const mapsHref = `https://www.google.com/maps/search/?api=1&query=${query}`;
          return (
            <a
              className="plan-where plan-where--link"
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${plan.location.name} in Google Maps`}
            >
              <strong>
                {plan.location.name}
                {!showAddressLine && <span className="plan-where-arrow" aria-hidden="true"> ↗</span>}
              </strong>
              {showAddressLine && (
                <div className="meta-secondary">
                  {pretty}
                  <span className="plan-where-arrow" aria-hidden="true"> ↗</span>
                </div>
              )}
            </a>
          );
        })()}

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

        {showGroupPrompt && (
          <div className="lock-prompt" role="note">
            <p className="lock-prompt-headline">
              Looks like you've got a group. Ready to lock something in?
            </p>
            <p className="lock-prompt-soft">
              Plans work best when someone locks it in early.
            </p>
            {canLock && !claimedHost && (
              <button
                type="button"
                className="btn-primary btn-block lock-prompt-claim"
                onClick={() => {
                  setClaimedHost(true);
                  // Defer scroll so the expanded form has mounted.
                  setTimeout(() => {
                    lockFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }, 50);
                }}
              >
                I'll take it from here
              </button>
            )}
            {canLock && claimedHost && (
              <p className="lock-prompt-claimed">
                <strong>You're hosting.</strong> Fill in venue + day below when you're ready.
              </p>
            )}
          </div>
        )}

        {canLock && (plan.isFlexibleTime || plan.isFlexibleLocation || isLookingFor) && (
          <div
            ref={lockFormRef}
            className="coordination-banner coordination-banner--expanded"
            role="note"
          >
            <p>
              {isHosting && isLookingFor
                ? "You can lock this in anytime — or wait to see who's interested."
                : claimedHost
                  ? `You're hosting — pick a venue and day to lock it in.`
                  : isLookingFor
                    ? "Whoever picks the spot becomes the host. Fill in venue and day to make it a plan."
                    : "Still working out the details? Fill in venue & time when you’re ready and lock it in."}
            </p>
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
              {lockBusy ? "Saving…" : isLookingFor ? "Make it a plan" : "Lock it in"}
            </button>
          </div>
        )}

        {!(isHosting && isLookingFor) && (
          <ParticipationButtons
            planId={plan.id}
            initialState={plan.myState}
            onChange={onStateChange}
            planKind={plan.planKind}
            capacity={plan.capacity}
            goingCount={plan.participants.going.length}
            joinType={plan.joinType}
            isHosting={isHosting}
            onJustMarkedInterested={() => setShowInvite(true)}
          />
        )}

        <div className="plan-actions-row">
          <button type="button" className="action-btn" onClick={() => setShowGetThere(true)}>
            🚗 Get there
          </button>
          <button type="button" className="action-btn" onClick={() => setShowShare(true)}>
            ↗ Share
          </button>
        </div>

        {plan.cancelledAt && (
          <div className="plan-cancelled-banner" role="alert">
            This plan was cancelled by the host.
          </div>
        )}

        {plan.pendingTimeProposal && !plan.cancelledAt && (
          <div className="coordination-banner" role="note">
            <strong>{isHosting ? "You proposed" : "Host proposed"} a new time:</strong>{" "}
            {formatPlanDate(plan.pendingTimeProposal.date)} ·{" "}
            {formatPlanTime(plan.pendingTimeProposal.time, plan.pendingTimeProposal.isFlexibleTime)}.
            {isHosting ? (
              <> Open <Link to={`/plans/${plan.id}/edit`}>edit</Link> to apply or cancel.</>
            ) : (
              <> The host will apply it shortly.</>
            )}
          </div>
        )}

        {isHosting && !plan.cancelledAt && (
          <div className="plan-host-actions">
            <Link to={`/plans/${plan.id}/edit`} className="btn-link">Edit plan</Link>
            <HostTransferControl
              candidates={plan.participants.going.filter((p) => p.id !== user.id)}
              onTransfer={(id, name) => void transferHost(id, name)}
            />
            <button
              type="button"
              className="btn-link plan-cancel-link"
              onClick={() => void cancelPlan()}
            >
              Cancel plan
            </button>
          </div>
        )}
      </section>

      <section className="who-block">
        <h3 className="who-block-heading">Going · {plan.participants.going.length}</h3>
        {plan.participants.going.length === 0 ? (
          <p className="subtle">No one's locked in yet. Be the first to say "I'm in."</p>
        ) : (
          <div className="roster">
            {plan.participants.going.map((person) => (
              <Link key={person.id} to={`/profile/${person.id}`} className="roster-tile">
                <Avatar seed={person.avatarSeed} style={person.avatarStyle} photoDataUrl={person.avatarPhotoDataUrl} params={person.avatarParams} size="md" />
                <span className="roster-name">
                  {person.firstName}
                  {person.id === user.id && <span className="you-pill">You</span>}
                </span>
                {person.id === plan.creator.id && <span className="roster-role">Host</span>}
              </Link>
            ))}
          </div>
        )}

        {plan.participants.interested.length > 0 && (
          <>
            <h3 className="who-block-heading" style={{ marginTop: 18 }}>
              {plan.joinType === "approve" && isHosting ? "Applications" : "Interested"} · {plan.participants.interested.length}
            </h3>
            {plan.joinType === "approve" && isHosting ? (
              // Host approval flow keeps the full row with a "Let them in" action.
              <div className="participant-list-interested">
                {plan.participants.interested.map((person) => (
                  <div key={person.id} className="participant-row participant-row--with-action">
                    <Link to={`/profile/${person.id}`} className="participant-row-link">
                      <Avatar seed={person.avatarSeed} style={person.avatarStyle} photoDataUrl={person.avatarPhotoDataUrl} params={person.avatarParams} size="sm" />
                      <span className="participant-name">
                        {person.firstName}
                        {person.id === user.id && <span className="you-pill">You</span>}
                      </span>
                    </Link>
                    {person.id !== user.id && (
                      <button
                        type="button"
                        className="btn-secondary participant-approve-btn"
                        onClick={async () => {
                          try {
                            await api(`/api/plans/${plan.id}/approve`, {
                              method: "POST",
                              body: JSON.stringify({ userId: person.id }),
                            });
                            await load();
                          } catch {
                            /* swallow */
                          }
                        }}
                      >
                        Let them in
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="roster roster--sm">
                {plan.participants.interested.map((person) => (
                  <Link key={person.id} to={`/profile/${person.id}`} className="roster-tile">
                    <Avatar seed={person.avatarSeed} style={person.avatarStyle} photoDataUrl={person.avatarPhotoDataUrl} params={person.avatarParams} size="sm" />
                    <span className="roster-name">
                      {person.firstName}
                      {person.id === user.id && <span className="you-pill">You</span>}
                    </span>
                  </Link>
                ))}
              </div>
            )}
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
      {showInvite && (
        <InviteSheet planId={plan.id} planTitle={plan.title} onClose={() => setShowInvite(false)} />
      )}
    </main>
  );
}

function HostTransferControl({
  candidates,
  onTransfer,
}: {
  candidates: PublicUser[];
  onTransfer: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (candidates.length === 0) return null;
  if (!open) {
    return (
      <button
        type="button"
        className="btn-link plan-transfer-link"
        onClick={() => setOpen(true)}
      >
        Transfer hosting
      </button>
    );
  }
  return (
    <div className="plan-transfer-picker" role="menu">
      <div className="plan-transfer-picker-label">Hand off to:</div>
      <div className="plan-transfer-picker-list">
        {candidates.map((c) => (
          <button
            key={c.id}
            type="button"
            className="plan-transfer-pick"
            onClick={() => onTransfer(c.id, c.firstName)}
          >
            <Avatar
              seed={c.avatarSeed}
              style={c.avatarStyle}
              photoDataUrl={c.avatarPhotoDataUrl}
              params={c.avatarParams}
              size="sm"
            />
            <span>{c.firstName}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn-link" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}
