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
import { planHasEnded } from "../lib/planTime";
import { useCardImages, pickCoverImage } from "../lib/cardImages";
import { formatPlaceAddress, formatPlanDate, formatPlanTime, sentenceCaseTitle } from "../lib/format";
import { type ParticipationState, type PlanDTO, type PublicUser } from "../types/shared";

/** Same "set parts + · flexible" convention as the feed card — never show a
 *  specific time/date next to a field that's still open. */
function formatWhen(date: string, time: string, isFlexibleTime: boolean): string {
  return isFlexibleTime
    ? `${formatPlanDate(date)} · flexible`
    : `${formatPlanDate(date)} · ${formatPlanTime(time, false)}`;
}

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
  const [showAllGoing, setShowAllGoing] = useState(false);
  const [showAllInterested, setShowAllInterested] = useState(false);
  const lockFormRef = useRef<HTMLDivElement | null>(null);
  const coverPool = useCardImages();

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
    // plan.date is stored as a plain "YYYY-MM-DD" string (never a full
    // timestamp) — slice defensively but don't round-trip it through `new
    // Date()`, which parses bare date strings as UTC and can shift the day
    // by one depending on the viewer's timezone.
    setLockDate(plan.date.slice(0, 10));
    // Flexible time means genuinely empty — not a "19:00" placeholder — so
    // the field reads correctly if the host un-flexes it.
    setLockTime(plan.time && !plan.isFlexibleTime ? plan.time : "");
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
  // Past events become a record: no RSVP / host coordination — just "Do it
  // again" (which carries the crew + chat forward) and the group chat.
  const isPast = planHasEnded(plan);
  // Looking-For lifecycle: only the original poster can lock the plan in.
  // Other interested folks coordinate via the group chat until the host
  // commits to a venue + day.
  const canLock = !plan.lockedAt && isHosting;
  // Prompt fires when the thread has at least 2 people committing (interested
  // or going). The host sees the actionable lock-in form; non-hosts see a
  // softer nudge so they know the group can self-organize.
  const groupSize = plan.participants.interested.length + plan.participants.going.length;
  const groupAtThreshold = isLookingFor && !plan.lockedAt && groupSize >= 2;
  const showGroupPrompt = groupAtThreshold && isHosting;
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

  async function putUpForGrabs() {
    if (!plan) return;
    if (!confirm(`Put "${plan.title}" up for grabs? Anyone who's in can take over hosting instead of it being cancelled.`)) return;
    try {
      await api(`/api/plans/${plan.id}/up-for-grabs`, { method: "POST" });
      await load();
    } catch {
      /* surface via reload */
    }
  }

  async function claimHost() {
    if (!plan) return;
    try {
      await api(`/api/plans/${plan.id}/claim-host`, { method: "POST" });
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
      await api<PlanDTO>(`/api/plans/${id}/lock`, {
        method: "POST",
        body: JSON.stringify({
          location: {
            name: lockVenue.trim(),
            address: lockVenueAddr.trim() || lockVenue.trim(),
            lat: lockLat,
            lng: lockLng,
          },
          date: lockDate,
          time: lockFlexTime ? "" : lockTime || "19:00",
          isFlexibleTime: lockFlexTime,
        }),
      });
      // Reload rather than trust the response shape — the group chat also
      // gets an automatic "locked in" system line server-side, so a full
      // refetch keeps the chat entry count and everything else in sync.
      await load();
    } finally {
      setLockBusy(false);
    }
  }

  // Uploaded flyer/photo, or a stable stock cover from the admin library —
  // same treatment as the feed card so the hero matches its thumbnail.
  const coverSrc = plan.flyerDataUrl ?? pickCoverImage(coverPool, plan.id);
  const prettyAddress = formatPlaceAddress(plan.location.address);
  const showAddressLine = prettyAddress && prettyAddress !== plan.location.name;
  const mapsQuery = encodeURIComponent(
    [plan.location.name, plan.location.address].filter(Boolean).join(" "),
  );
  const mapsHref =
    plan.location.lat !== undefined && plan.location.lng !== undefined
      ? `https://www.google.com/maps/search/?api=1&query=${plan.location.lat},${plan.location.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  return (
    <main className="app-shell app-shell--wide app-shell--with-nav plan-detail-page">
      <div className="plan-detail-safe-scrim" aria-hidden="true" />
      <div className="plan-detail-hero">
        {coverSrc && <img src={coverSrc} alt="" loading="lazy" />}
        <div className="plan-detail-hero-overlay" aria-hidden="true" />
        <Link to="/" className="plan-detail-back" aria-label="Back">
          ←
        </Link>
        <div className="plan-detail-hero-text">
          <div className="plan-detail-hero-when">
            {formatWhen(plan.date, plan.time, plan.isFlexibleTime)}
          </div>
          <h1>{sentenceCaseTitle(plan.title)}</h1>
        </div>
      </div>

      <div className="plan-detail-body">
        <button
          type="button"
          className="host-row plan-detail-card"
          onClick={() => navigate(`/profile/${plan.creator.id}`)}
        >
          <Avatar seed={plan.creator.avatarSeed} style={plan.creator.avatarStyle} photoDataUrl={plan.creator.avatarPhotoDataUrl} params={plan.creator.avatarParams} size="md" />
          <span className="host-row-text">
            Started by <strong>{isHosting ? "you" : plan.creator.firstName}</strong>
            {plan.coHosts && plan.coHosts.length > 0 && (
              <> &amp; <strong>{plan.coHosts.map((h) => (h.id === user.id ? "you" : h.firstName)).join(" & ")}</strong></>
            )}
          </span>
          <span className="host-row-chevron" aria-hidden="true">›</span>
        </button>

        {plan.description && (
          <div className="plan-detail-card">
            {plan.planKind === "looking_for" ? (
              <p className="plan-description plan-description-quote" style={{ margin: 0 }}>&ldquo;{plan.description}&rdquo;</p>
            ) : (
              <p className="plan-description" style={{ margin: 0 }}>{plan.description}</p>
            )}
          </div>
        )}

        {isPast && (
          <div className="plan-past-actions">
            <p className="plan-past-note">This one's a wrap. Want to run it back?</p>
            {isHosting && !plan.happenedOutcome && (
              <div className="did-happen-card" role="group" aria-label="Did this happen?">
                <p className="did-happen-q">Did this happen?</p>
                <div className="did-happen-actions">
                  {(["yes", "no"] as const).map((outcome) => (
                    <button
                      key={outcome}
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        void api(`/api/plans/${plan.id}/happened-outcome`, {
                          method: "POST",
                          body: JSON.stringify({ outcome }),
                        }).then(() => load());
                      }}
                    >
                      {outcome === "yes" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isHosting && plan.happenedOutcome && (
              <p className="did-happen-saved">
                Saved: {plan.happenedOutcome === "yes" ? "Yes, it happened" : "No"}
              </p>
            )}
            <button
              type="button"
              className="btn-primary btn-block plan-past-action-btn"
              onClick={() =>
                navigate(`/plans/new`, { state: { hostAgainFrom: plan.id } })
              }
            >
              <RepeatIcon />
              Do it again
            </button>
            <Link to={`/plans/${plan.id}/chat`} className="btn-secondary btn-block plan-past-action-btn">
              <ChatBubbleIcon />
              Open group chat
            </Link>
          </div>
        )}

        {!isPast && showGroupPrompt && (
          <div className="lock-prompt" role="note">
            <p className="lock-prompt-headline">
              Looks like you've got a group. Ready to lock it in?
            </p>
            <p className="lock-prompt-soft">
              Plans work best when someone locks it in early.
            </p>
            <button
              type="button"
              className="btn-secondary btn-block lock-prompt-claim"
              onClick={() => {
                setTimeout(() => {
                  lockFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 50);
              }}
            >
              I'll take it from here
            </button>
          </div>
        )}

        {/* The "looks like you've got a group" nudge is intentionally
            host-only (showGroupPrompt above). When viewing someone else's
            idea you don't see it — they own the lock-in decision. */}

        {!isPast && canLock && (plan.isFlexibleTime || plan.isFlexibleLocation || isLookingFor) && (
          <div
            ref={lockFormRef}
            className="coordination-banner coordination-banner--expanded"
            role="note"
          >
            <p>
              {isLookingFor
                ? "You can lock this in anytime — or wait to see who's interested."
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
            <label className="form-question" htmlFor="lock-time">
              Time
            </label>
            <div className="lock-time-row">
              {!lockFlexTime ? (
                <input
                  id="lock-time"
                  className="onboarding-input"
                  type="time"
                  value={lockTime}
                  onChange={(e) => setLockTime(e.target.value)}
                />
              ) : (
                <span className="lock-flex-text">Flexible time</span>
              )}
              <FlexChip active={lockFlexTime} onClick={() => setLockFlexTime((v) => !v)} />
            </div>
            <button type="button" className="btn-primary btn-block" disabled={lockBusy || !lockVenue.trim() || !lockDate} onClick={() => void lockIn()}>
              {lockBusy ? "Saving…" : "Lock it in"}
            </button>
          </div>
        )}

        {!isPast && !(isHosting && isLookingFor) && !isHosting && (
          <div className="plan-participation-slot">
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
          </div>
        )}

        {!isPast && canChat && (
          <Link
            to={`/plans/${plan.id}/chat`}
            state={{ from: "plan" }}
            className="chat-entry chat-entry--prominent plan-detail-card"
          >
            <span className="chat-entry-icon" aria-hidden="true"><ChatBubbleIcon /></span>
            <span className="chat-entry-text">
              Group chat ({plan.participants.going.length + plan.participants.interested.length})
            </span>
            <span className="chat-entry-arrow">›</span>
          </Link>
        )}

        <div className="plan-meta-card">
          <div className="plan-meta-row">
            <span className="plan-meta-icon" aria-hidden="true"><ClockIcon /></span>
            <div className="plan-meta-text">
              <span className="plan-meta-label">Date &amp; time</span>
              <span className="plan-meta-value">
                {formatWhen(plan.date, plan.time, plan.isFlexibleTime)}
              </span>
            </div>
          </div>
          {plan.isFlexibleLocation ? (
            <div className="plan-meta-row">
              <span className="plan-meta-icon" aria-hidden="true"><PinIcon /></span>
              <div className="plan-meta-text">
                <span className="plan-meta-label">Location</span>
                <span className="plan-meta-value">Flexible</span>
              </div>
            </div>
          ) : (
            <a
              className="plan-meta-row plan-meta-row--link"
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${plan.location.name} in Google Maps`}
            >
              <span className="plan-meta-icon" aria-hidden="true"><PinIcon /></span>
              <div className="plan-meta-text">
                <span className="plan-meta-label">Location</span>
                <span className="plan-meta-value">{plan.location.name}</span>
                {showAddressLine && <span className="plan-meta-sub">{prettyAddress}</span>}
                <span className="plan-meta-maps">Tap to open maps ↗</span>
              </div>
            </a>
          )}
        </div>

        {/* Full action toolkit on every plan — Get there, Invite, and Share
            appear whether or not you're the host. Hidden once the event is over. */}
        {!isPast && (
        <div className="plan-actions-row plan-actions-row--triple">
          <button type="button" className="action-btn action-btn--stack" onClick={() => setShowGetThere(true)}>
            <span className="action-btn-icon" aria-hidden="true"><NavIcon /></span>
            <span className="action-btn-label">Get there</span>
          </button>
          <button type="button" className="action-btn action-btn--stack" onClick={() => setShowInvite(true)}>
            <span className="action-btn-icon" aria-hidden="true"><PlusIcon /></span>
            <span className="action-btn-label">Invite</span>
          </button>
          <button type="button" className="action-btn action-btn--stack" onClick={() => setShowShare(true)}>
            <span className="action-btn-icon" aria-hidden="true"><ShareIcon /></span>
            <span className="action-btn-label">Share</span>
          </button>
        </div>
        )}

        {plan.cancelledAt && (
          <div className="plan-cancelled-banner" role="alert">
            This plan was cancelled by the host.
          </div>
        )}

        {!isPast && plan.upForGrabsAt && !plan.cancelledAt && (
          <div className="coordination-banner" role="note">
            <strong>This plan needs a new host.</strong>{" "}
            {isHosting
              ? "You put it up for grabs — someone who's in can take over."
              : "The original host can't make it."}
            {!isHosting && (plan.myState === "going" || plan.myState === "interested") && (
              <button
                type="button"
                className="btn-primary btn-block"
                style={{ marginTop: 10 }}
                onClick={() => void claimHost()}
              >
                Take over hosting
              </button>
            )}
          </div>
        )}

        {!isPast && plan.pendingTimeProposal && !plan.cancelledAt && (
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

        {!isPast && isHosting && !plan.cancelledAt && (
          <div className="plan-host-actions">
            <Link to={`/plans/${plan.id}/edit`} className="btn-secondary plan-host-action-btn">
              Edit plan
            </Link>
            <button
              type="button"
              className="btn-secondary plan-host-action-btn plan-host-action-btn--danger"
              onClick={() => void cancelPlan()}
            >
              Cancel plan
            </button>
            {!plan.upForGrabsAt && (
              <button
                type="button"
                className="btn-secondary plan-host-action-btn plan-host-action-btn--full"
                onClick={() => void putUpForGrabs()}
              >
                Can't make it — put up for grabs
              </button>
            )}
            <HostTransferControl
              candidates={plan.participants.going.filter((p) => p.id !== user.id)}
              onTransfer={(id, name) => void transferHost(id, name)}
            />
          </div>
        )}
      </div>

      <section className="who-block plan-detail-card" style={{ margin: "0 14px 32px" }}>
        <div className="who-row">
          <h3 className="who-block-heading">Going · {plan.participants.going.length}</h3>
          {plan.participants.going.length === 0 ? (
            <p className="subtle" style={{ margin: 0 }}>Be the first to say "I'm in."</p>
          ) : (
            <ParticipantsRow
              people={plan.participants.going}
              expanded={showAllGoing}
              onToggle={() => setShowAllGoing((v) => !v)}
              countLabel={`${plan.participants.going.length} going`}
            />
          )}
        </div>

        {plan.participants.interested.length > 0 && (
          <div className="who-row" style={{ marginTop: 14 }}>
            <h3 className="who-block-heading">
              {plan.joinType === "approve" && isHosting ? "Applications" : "Interested"} · {plan.participants.interested.length}
            </h3>
            {plan.joinType === "approve" && isHosting ? (
              // Host approval flow keeps the per-person rows so the host can
              // tap "Let them in" without leaving the page.
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
              <ParticipantsRow
                people={plan.participants.interested}
                expanded={showAllInterested}
                onToggle={() => setShowAllInterested((v) => !v)}
                countLabel={`${plan.participants.interested.length} interested`}
              />
            )}
          </div>
        )}
      </section>

      {showShare && <ShareSheet plan={plan} isOwn={isHosting} onClose={() => setShowShare(false)} />}
      {showGetThere && <GetThereSheet plan={plan} onClose={() => setShowGetThere(false)} />}
      {showInvite && (
        <InviteSheet planId={plan.id} planTitle={plan.title} onClose={() => setShowInvite(false)} />
      )}
    </main>
  );
}

/**
 * Avatar stack + count + inline View all toggle. Default shows up to 5
 * avatars; "View all" expands the row into a name list so users don't have
 * to leave the plan to see who's coming.
 */
function ParticipantsRow({
  people,
  expanded,
  onToggle,
  countLabel,
}: {
  people: PublicUser[];
  expanded: boolean;
  onToggle: () => void;
  countLabel: string;
}) {
  const visible = expanded ? people : people.slice(0, 5);
  return (
    <>
      <div className="who-row-body">
        <div className="avatar-stack avatar-stack--md">
          {visible.map((person) => (
            <Link
              key={person.id}
              to={`/profile/${person.id}`}
              className="avatar-stack-link"
              aria-label={person.firstName}
            >
              <Avatar
                seed={person.avatarSeed}
                style={person.avatarStyle}
                photoDataUrl={person.avatarPhotoDataUrl}
                params={person.avatarParams}
                size="sm"
              />
            </Link>
          ))}
          {!expanded && people.length > 5 && (
            <span className="avatar-stack-more">+{people.length - 5}</span>
          )}
        </div>
        <span className="who-row-count">{countLabel}</span>
        {people.length > 5 && (
          <button type="button" className="who-row-view-all" onClick={onToggle}>
            {expanded ? "Hide" : "View all"}
          </button>
        )}
      </div>
      {expanded && (
        <ul className="who-row-name-list">
          {people.map((person) => (
            <li key={person.id}>
              <Link to={`/profile/${person.id}`} className="who-row-name">
                {person.firstName}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Tan chip Flexible toggle — same pattern as CreatePlan's FlexToggle. */
function FlexChip({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`flex-toggle-btn ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
      title="Flexible"
    >
      <FlexIcon />
      <span>Flexible</span>
    </button>
  );
}

function FlexIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function NavIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" x2="12" y1="2" y2="15" />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
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
