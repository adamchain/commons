import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, ChevronRight, Clock, Hand, ImagePlus, Pencil, Send, UserPlus, X } from "lucide-react";
import { api, parseApiError } from "../api/http";
import { Avatar } from "../components/Avatar";
import { CoverLibraryModal } from "../components/CoverLibraryModal";
import { GetThereSheet } from "../components/GetThereSheet";
import { InviteSheet } from "../components/InviteSheet";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { LoadingScreen } from "../components/LoadingScreen";
import { ParticipationButtons } from "../components/ParticipationButtons";
import { PlanSafetyMenu } from "../components/PlanSafetyMenu";
import { ShareSheet } from "../components/ShareSheet";
import { useAuth } from "../context/AuthContext";
import { planHasEnded } from "../lib/planTime";
import { useCardImages, pickCoverImage } from "../lib/cardImages";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { formatPlanDate, formatPlanTime, sentenceCaseTitle } from "../lib/format";
import { hrefForBack, type NavFromState } from "../lib/navState";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import { INTEREST_LABELS, type ConversationDTO, type MessageDTO, type ParticipationState, type PlanDTO, type PublicUser } from "../types/shared";

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
  const location = useLocation();
  const navFrom = (location.state as NavFromState | null) ?? null;
  const backHref = hrefForBack(navFrom);
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
  const [lockFlyer, setLockFlyer] = useState<string | null>(null);
  const [lockBusy, setLockBusy] = useState(false);
  const [showLockCoverLib, setShowLockCoverLib] = useState(false);
  const [lockCoverOpen, setLockCoverOpen] = useState(false);
  const [showGuestsModal, setShowGuestsModal] = useState(false);
  const [grabsError, setGrabsError] = useState<string | null>(null);
  const [grabsBusy, setGrabsBusy] = useState(false);
  const [showPassHosting, setShowPassHosting] = useState(false);
  const [showHostSheet, setShowHostSheet] = useState(false);
  const [chatPreview, setChatPreview] = useState<MessageDTO[] | null>(null);
  const [chatConvId, setChatConvId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const lockFormRef = useRef<HTMLDivElement | null>(null);
  const lockFlyerRef = useRef<HTMLInputElement | null>(null);
  const lockDateRef = useRef<HTMLInputElement | null>(null);
  const coverPool = useCardImages();

  const load = async () => {
    const data = await api<PlanDTO>(`/api/plans/${id}`);
    setPlan(data);
  };

  useEffect(() => {
    void load();
  }, [id]);

  // Deep-link from feed "X Going" into the guest list modal.
  useEffect(() => {
    if (!plan || location.hash !== "#guests") return;
    setShowGuestsModal(true);
  }, [plan?.id, location.hash]);

  useEffect(() => {
    if (!showGuestsModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setShowGuestsModal(false);
      if (location.hash === "#guests") {
        navigate(location.pathname, { replace: true, state: navFrom });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showGuestsModal, location.hash, location.pathname, navigate, navFrom]);

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
    setLockDate(
      plan.isFlexibleDate || plan.date.startsWith("2099-12-31") ? "" : plan.date.slice(0, 10),
    );
    // Flexible time means genuinely empty — not a "19:00" placeholder — so
    // the field reads correctly if the host un-flexes it.
    setLockTime(plan.time && !plan.isFlexibleTime ? plan.time : "");
    setLockFlexTime(plan.isFlexibleTime);
    setLockFlyer(plan.flyerDataUrl ?? null);
  }, [plan?.id, plan?.date, plan?.lockedAt, plan?.isFlexibleTime, plan?.isFlexibleLocation, plan?.flyerDataUrl]);

  // Fetch the last 2 user messages for the inline chat preview.
  useEffect(() => {
    if (!plan || !user) return;
    const hosting = plan.creator.id === user.id;
    const eligible = hosting || plan.myState === "going" || plan.myState === "interested";
    if (!eligible) { setChatPreview([]); return; }
    setChatPreview(null);
    void (async () => {
      try {
        const conv = await api<ConversationDTO>(`/api/plans/${plan.id}/conversation`);
        setChatConvId(conv.id);
        const msgs = await api<MessageDTO[]>(`/api/conversations/${conv.id}/messages`);
        setChatPreview(msgs.filter((m) => !m.kind || m.kind === "user").slice(-2));
      } catch {
        setChatPreview([]);
      }
    })();
  }, [plan?.id, plan?.myState, user?.id]);

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
  const lockingIn =
    !isPast && canLock && (plan.isFlexibleTime || plan.isFlexibleLocation || isLookingFor);
  const canChat =
    isHosting || plan.myState === "going" || plan.myState === "interested";

  async function cancelPlan() {
    if (!plan) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      await api(`/api/plans/${plan.id}/cancel`, { method: "POST" });
      setConfirmCancel(false);
      await load();
    } catch (e) {
      setCancelError(parseApiError(e));
    } finally {
      setCancelBusy(false);
    }
  }

  async function putUpForGrabs() {
    if (!plan) return;
    setGrabsBusy(true);
    setGrabsError(null);
    try {
      await api(`/api/plans/${plan.id}/up-for-grabs`, { method: "POST" });
      await load();
    } catch (e) {
      setGrabsError(e instanceof Error ? e.message : "Couldn't put this plan up for grabs.");
    } finally {
      setGrabsBusy(false);
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

  async function transferHost(newHostId: string) {
    if (!plan) return;
    try {
      await api(`/api/plans/${plan.id}/transfer-host`, {
        method: "POST",
        body: JSON.stringify({ newHostId }),
      });
      await load();
    } catch (e) {
      window.alert(parseApiError(e));
    }
  }

  async function openLockFlyerPicker() {
    if (isNative()) {
      try {
        const dataUrl = await pickPhotoNative({ maxPx: 1024, quality: 0.85 });
        if (dataUrl) setLockFlyer(dataUrl);
      } catch {
        /* user canceled */
      }
      return;
    }
    lockFlyerRef.current?.click();
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
          // Explicit null clears; a chosen upload/library URL persists.
          flyerDataUrl: lockFlyer,
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

  // Ideas stay image-free until the host picks one — never invent a stock
  // cover for looking_for. Standard plans still use the library pool.
  const coverSrc =
    (lockingIn ? lockFlyer : plan.flyerDataUrl) ??
    (plan.planKind === "looking_for" ? null : pickCoverImage(coverPool, plan.id));
  const mapsQuery = encodeURIComponent(
    [plan.location.name, plan.location.address].filter(Boolean).join(" "),
  );
  const mapsHref =
    plan.location.lat !== undefined && plan.location.lng !== undefined
      ? `https://www.google.com/maps/search/?api=1&query=${plan.location.lat},${plan.location.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
  const interestTags = plan.tags.filter((t) => INTEREST_LABELS[t]);
  const goingCount = plan.participants.going.length;
  const interestedCount = plan.participants.interested.length;
  const goingIds = new Set(plan.participants.going.map((u) => u.id));
  const planPeople = [
    ...plan.participants.going,
    ...plan.participants.interested.filter((u) => !goingIds.has(u.id)),
  ];
  const peoplePreviewMax = 4;
  const planPeoplePreview = planPeople.slice(0, peoplePreviewMax);
  const peopleOthers = Math.max(0, planPeople.length - peoplePreviewMax);

  const lockDisabled = lockBusy || !lockVenue.trim() || !lockDate;
  const lockHint = !lockVenue.trim()
    ? "Add a venue to continue"
    : !lockDate
      ? "Pick a day to continue"
      : null;

  const lockFlyerInput = (
    <input
      ref={lockFlyerRef}
      type="file"
      accept="image/*"
      style={{ display: "none" }}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) {
          void fileToResizedDataUrl(f)
            .then((dataUrl) => {
              setLockFlyer(dataUrl);
              setLockCoverOpen(true);
            })
            .catch(() => undefined);
        }
        if (lockFlyerRef.current) lockFlyerRef.current.value = "";
      }}
    />
  );

  function closeGuestsModal() {
    setShowGuestsModal(false);
    if (location.hash === "#guests") {
      navigate(location.pathname, { replace: true, state: navFrom });
    }
  }

  function goBackFromPlan() {
    if (location.hash === "#guests") {
      setShowGuestsModal(false);
      navigate(location.pathname, { replace: true, state: navFrom });
      return;
    }
    navigate(backHref);
  }

  return (
    <main className={`app-shell app-shell--wide app-shell--with-nav plan-detail-page${lockingIn ? " plan-detail-page--lock-in" : ""}`}>
      <div className="plan-detail-safe-scrim" aria-hidden="true" />
      <div className={`plan-detail-hero${coverSrc ? "" : " plan-detail-hero--empty"}`}>
        {coverSrc && <img src={coverSrc} alt="" loading="lazy" />}
        {lockingIn && (
          coverSrc ? (
            <div className="plan-detail-hero-cover-overlay">
              <button type="button" className="cover-chip" onClick={() => setShowLockCoverLib(true)}>
                Library
              </button>
              <button type="button" className="cover-chip" onClick={() => void openLockFlyerPicker()}>
                Upload
              </button>
              <button
                type="button"
                className="cover-chip"
                onClick={() => {
                  setLockFlyer(null);
                  setLockCoverOpen(false);
                }}
              >
                Remove
              </button>
            </div>
          ) : lockCoverOpen ? (
            <div className="plan-detail-hero-cover-empty">
              <span className="cover-picker-title">Add a cover photo</span>
              <span className="cover-picker-sub">Optional — library or upload</span>
              <div className="cover-picker-buttons">
                <button type="button" className="cover-btn" onClick={() => setShowLockCoverLib(true)}>
                  <ImagePlus size={16} strokeWidth={1.8} aria-hidden="true" />
                  Library
                </button>
                <button type="button" className="cover-btn" onClick={() => void openLockFlyerPicker()}>
                  Upload
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="plan-detail-hero-cover-cta" onClick={() => setLockCoverOpen(true)}>
              <Camera size={18} strokeWidth={1.8} aria-hidden="true" />
              Add a cover photo (optional)
            </button>
          )
        )}
        {lockingIn && lockFlyerInput}
        <div className="plan-detail-hero-bar">
          <button
            type="button"
            className="plan-detail-hero-btn"
            aria-label="Back"
            onClick={goBackFromPlan}
          >
            <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
          </button>
          {!isPast && (
            <div className="plan-detail-hero-bar-actions">
              <button
                type="button"
                className="plan-detail-hero-btn"
                aria-label="Invite"
                onClick={() => setShowInvite(true)}
              >
                <UserPlus size={18} strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="plan-detail-hero-btn"
                aria-label="Share"
                onClick={() => setShowShare(true)}
              >
                <Send size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="plan-detail-body">
        <header className="plan-detail-heading">
          {interestTags.length > 0 && (
            <div className="plan-detail-interests">
              {interestTags.map((t) => (
                <span key={t} className="plan-detail-interest">
                  {INTEREST_LABELS[t]}
                </span>
              ))}
            </div>
          )}
          <div className="plan-detail-title-row">
            <h1 className="plan-detail-title">{sentenceCaseTitle(plan.title)}</h1>
            {!isHosting && (
              <PlanSafetyMenu
                targetUserId={plan.creator.id}
                targetFirstName={plan.creator.firstName}
                planId={plan.id}
                planTitle={plan.title}
              />
            )}
          </div>
          {lockingIn ? (
            <div ref={lockFormRef} className="plan-meta-card plan-meta-card--edit">
              <div className="plan-meta-row plan-meta-row--edit">
                <span className="plan-meta-icon" aria-hidden="true"><PinIcon /></span>
                <div className="plan-meta-text">
                  <span className="plan-meta-label">Venue</span>
                  <LocationAutocomplete
                    name={lockVenue}
                    address={lockVenueAddr}
                    placeholder="Add a venue"
                    onChange={(v) => {
                      setLockVenue(v.name);
                      setLockVenueAddr(v.address);
                      setLockLat(v.lat);
                      setLockLng(v.lng);
                    }}
                  />
                </div>
              </div>
              <div
                className="plan-meta-row plan-meta-row--edit"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  const inp = lockDateRef.current;
                  if (!inp) return;
                  try { (inp as HTMLInputElement & { showPicker(): void }).showPicker(); }
                  catch { inp.focus(); }
                }}
              >
                <span className="plan-meta-icon" aria-hidden="true"><CalendarIcon /></span>
                <div className="plan-meta-text">
                  <span className="plan-meta-label">Day</span>
                  <span className={`plan-meta-value ${!lockDate ? "is-placeholder" : ""}`}>
                    {lockDate ? formatPlanDate(lockDate) : "Pick a day"}
                  </span>
                  <input
                    ref={lockDateRef}
                    id="lock-date"
                    className="plan-meta-native-input"
                    type="date"
                    value={lockDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setLockDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="plan-meta-row plan-meta-row--edit">
                <span className="plan-meta-icon" aria-hidden="true"><ClockIcon /></span>
                <div className="plan-meta-text plan-meta-text--time">
                  <span className="plan-meta-label">Time</span>
                  <div className="plan-meta-time-row">
                    {lockFlexTime ? (
                      <span className="plan-meta-value is-placeholder">Flexible time</span>
                    ) : (
                      <input
                        id="lock-time"
                        className="plan-meta-time-input"
                        type="time"
                        value={lockTime}
                        onChange={(e) => setLockTime(e.target.value)}
                      />
                    )}
                    <FlexChip active={lockFlexTime} onClick={() => setLockFlexTime((v) => !v)} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="plan-detail-whenwhere">
              {plan.isFlexibleLocation ? (
                <span className="plan-detail-meta">
                  <PlanDetailPinIcon />
                  <span className="plan-detail-meta-label">Flexible</span>
                </span>
              ) : (
                <a
                  className="plan-detail-meta"
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <PlanDetailPinIcon />
                  <span className="plan-detail-meta-label">{plan.location.name}</span>
                </a>
              )}
              <span className="plan-detail-meta">
                <Clock className="plan-detail-meta-icon" size={14} strokeWidth={2.2} aria-hidden="true" />
                <span className="plan-detail-meta-label">
                  {formatWhen(plan.date, plan.time, plan.isFlexibleTime)}
                </span>
              </span>
            </div>
          )}
          <button
            type="button"
            className="plan-detail-people"
            onClick={() => setShowGuestsModal(true)}
            aria-label={
              planPeople.length === 0
                ? "No one yet. View who's going"
                : `${goingCount} going${interestedCount > 0 ? `, ${interestedCount} interested` : ""}. View who's going`
            }
          >
            {planPeoplePreview.length > 0 && (
              <span className="avatar-stack">
                {planPeoplePreview.map((person) => (
                  <span key={person.id} className="avatar-stack-link">
                    <Avatar
                      seed={person.avatarSeed}
                      style={person.avatarStyle}
                      photoDataUrl={person.avatarPhotoDataUrl}
                      params={person.avatarParams}
                      name={person.firstName}
                      size="sm"
                    />
                  </span>
                ))}
              </span>
            )}
            <span className="plan-detail-people-count">
              {planPeople.length === 0
                ? "No one yet"
                : goingCount > 0
                  ? `${goingCount} going`
                  : `${interestedCount} interested`}
            </span>
          </button>
        </header>

        <button
          type="button"
          className="host-row plan-detail-card"
          onClick={() =>
            navigate(`/profile/${plan.creator.id}`, { state: { from: "plan", planId: plan.id } })
          }
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

        {!isPast && canChat && !lockingIn && (
          <ChatPreviewCard
            planId={plan.id}
            messages={chatPreview}
            convId={chatConvId}
            navState={{ from: "plan", planId: plan.id }}
            onSent={(msg) => {
              setChatPreview((prev) => {
                const list = prev ?? [];
                return [...list, msg].filter((m) => !m.kind || m.kind === "user").slice(-2);
              });
            }}
          />
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
                navigate(`/plans/new?fromPlanId=${plan.id}`, { state: { hostAgainFrom: plan.id } })
              }
            >
              <RepeatIcon />
              Do it again
            </button>
            <Link
              to={`/plans/${plan.id}/chat`}
              state={{ from: "plan", planId: plan.id }}
              className="btn-secondary btn-block plan-past-action-btn"
            >
              <ChatBubbleIcon />
              Chat
            </Link>
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
              onJustMarkedGoing={() => setShowInvite(true)}
            />
          </div>
        )}


        {plan.cancelledAt && (
          <div className="plan-cancelled-banner" role="alert">
            This plan was cancelled by the host.
          </div>
        )}

        {!isPast && plan.upForGrabsAt && !plan.cancelledAt && (
          <div className="coordination-banner coordination-banner--grabs" role="note">
            <strong>This plan needs a new host</strong>
            {isHosting
              ? "You put it up for grabs — someone who's in can take over."
              : "The original host can't make it. Take it over to keep the plan alive."}
            {!isHosting && (plan.myState === "going" || plan.myState === "interested") && (
              <button
                type="button"
                className="btn-primary btn-block coordination-banner-grabs-cta"
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

        {isHosting && !isPast && !lockingIn && !plan.cancelledAt && (
          <button
            type="button"
            className="plan-edit-row plan-detail-card"
            onClick={() => setShowHostSheet(true)}
          >
            <span className="plan-edit-row-label">
              <Pencil size={14} strokeWidth={1.8} aria-hidden="true" />
              Edit plan
            </span>
            <ChevronRight size={16} strokeWidth={1.8} color="var(--text-muted)" aria-hidden="true" />
          </button>
        )}

        {!isPast && isHosting && !plan.cancelledAt && showPassHosting &&
          createPortal(
            <div
              className="modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pass-hosting-title"
              onClick={() => setShowPassHosting(false)}
            >
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="plan-guests-modal-head">
                  <h2 id="pass-hosting-title">Pass hosting</h2>
                  <button
                    type="button"
                    className="plan-guests-modal-close"
                    aria-label="Close"
                    onClick={() => setShowPassHosting(false)}
                  >
                    <X size={18} strokeWidth={2} />
                  </button>
                </div>
                <PassHostingControl
                  planTitle={plan.title}
                  upForGrabs={Boolean(plan.upForGrabsAt)}
                  candidates={plan.participants.going.filter((p) => p.id !== user.id)}
                  grabsBusy={grabsBusy}
                  grabsError={grabsError}
                  panelOnly
                  onOpen={() => setConfirmCancel(false)}
                  onClearGrabsError={() => setGrabsError(null)}
                  onPutUpForGrabs={() => void putUpForGrabs()}
                  onTransfer={(id) => {
                    void transferHost(id);
                    setShowPassHosting(false);
                  }}
                  onClose={() => setShowPassHosting(false)}
                />
              </div>
            </div>,
            document.body,
          )}
      </div>

      {lockingIn && (
        <div className="lock-in-cta-bar">
          <button
            type="button"
            className="btn-primary btn-block"
            disabled={lockDisabled}
            onClick={() => void lockIn()}
          >
            {lockBusy ? "Saving…" : "Lock it in"}
          </button>
          {lockHint && <p className="lock-in-cta-hint">{lockHint}</p>}
        </div>
      )}

      {showShare && <ShareSheet plan={plan} isOwn={isHosting} onClose={() => setShowShare(false)} />}
      {showLockCoverLib && (
        <CoverLibraryModal
          onPick={(url) => {
            setLockFlyer(url);
            setLockCoverOpen(true);
            setShowLockCoverLib(false);
          }}
          onClose={() => setShowLockCoverLib(false)}
        />
      )}
      {showGetThere && <GetThereSheet plan={plan} onClose={() => setShowGetThere(false)} />}
      {showInvite && (
        <InviteSheet planId={plan.id} planTitle={plan.title} onClose={() => setShowInvite(false)} />
      )}
      {showGuestsModal &&
        createPortal(
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-guests-modal-title"
            onClick={closeGuestsModal}
          >
            <div className="modal-card plan-guests-modal" onClick={(e) => e.stopPropagation()}>
              <div className="plan-guests-modal-head">
                <h2 id="plan-guests-modal-title">People</h2>
                <button
                  type="button"
                  className="plan-guests-modal-close"
                  aria-label="Close"
                  onClick={closeGuestsModal}
                >
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
              <div className="plan-guests-modal-body">
                <PlanGuests
                  plan={plan}
                  userId={user.id}
                  isHosting={isHosting}
                  showAllGoing
                  showAllInterested
                  onToggleGoing={() => undefined}
                  onToggleInterested={() => undefined}
                  onApproved={() => void load()}
                  variant="modal"
                />
              </div>
            </div>
          </div>,
          document.body,
        )}

      {showHostSheet && (
        <div className="sheet-backdrop" onClick={() => setShowHostSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <button
              type="button"
              className="sheet-link"
              onClick={() => { setShowHostSheet(false); navigate(`/plans/${plan.id}/edit`); }}
            >
              Edit plan
            </button>
            {((!plan.upForGrabsAt && !plan.cancelledAt) || plan.participants.going.some((p) => p.id !== user.id)) && (
              <button
                type="button"
                className="sheet-link"
                onClick={() => {
                  setShowHostSheet(false);
                  setShowPassHosting(true);
                  setConfirmCancel(false);
                }}
              >
                Pass hosting
              </button>
            )}
            <button
              type="button"
              className="sheet-link sheet-link--danger"
              onClick={() => {
                setShowHostSheet(false);
                setConfirmCancel(true);
                setCancelError(null);
              }}
            >
              Cancel plan
            </button>
            <button type="button" className="btn-link sheet-cancel" onClick={() => setShowHostSheet(false)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {confirmCancel && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-plan-title"
          onClick={() => {
            if (!cancelBusy) {
              setConfirmCancel(false);
              setCancelError(null);
            }
          }}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h4 id="cancel-plan-title" style={{ marginTop: 0 }}>
              Cancel this plan?
            </h4>
            <p style={{ marginTop: 0 }}>
              Cancel &ldquo;{plan.title}&rdquo;? Everyone who RSVP&apos;d will be notified.
            </p>
            {cancelError && <p className="error-text">{cancelError}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn-link"
                disabled={cancelBusy}
                onClick={() => {
                  setConfirmCancel(false);
                  setCancelError(null);
                }}
              >
                Keep plan
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={cancelBusy}
                onClick={() => void cancelPlan()}
                style={{ background: "var(--danger)" }}
              >
                {cancelBusy ? "Cancelling…" : "Cancel plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * Avatar stack + count + inline View all toggle. Default shows up to 5
 * avatars; tapping the count (or "View all") expands into a name list so
 * users don't have to leave the plan to see who's coming.
 */
function ParticipantsRow({
  people,
  planId,
  expanded,
  onToggle,
  countLabel,
  listOnly = false,
}: {
  people: PublicUser[];
  planId: string;
  expanded: boolean;
  onToggle: () => void;
  countLabel: string;
  listOnly?: boolean;
}) {
  const profileFrom: NavFromState = { from: "plan", planId };
  const visible = expanded ? people : people.slice(0, 5);
  const canExpand = people.length > 0;
  const nameList = (
    <ul className="who-row-name-list">
      {people.map((person) => (
        <li key={person.id}>
          <Link to={`/profile/${person.id}`} state={profileFrom} className="who-row-name">
            <Avatar
              seed={person.avatarSeed}
              style={person.avatarStyle}
              photoDataUrl={person.avatarPhotoDataUrl}
              params={person.avatarParams}
              size="sm"
            />
            <span className="who-row-name-text">
              <span className="who-row-name-primary">{person.firstName}</span>
              {person.lastName ? (
                <span className="who-row-name-sub">{person.lastName}</span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
  if (listOnly) return nameList;
  return (
    <>
      <div className="who-row-body">
        <div className="avatar-stack avatar-stack--md">
          {visible.map((person) => (
            <Link
              key={person.id}
              to={`/profile/${person.id}`}
              state={profileFrom}
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
        {canExpand ? (
          <button
            type="button"
            className="who-row-count who-row-count--link"
            onClick={onToggle}
            aria-expanded={expanded}
          >
            {countLabel}
          </button>
        ) : (
          <span className="who-row-count">{countLabel}</span>
        )}
        {people.length > 5 && (
          <button type="button" className="who-row-view-all" onClick={onToggle}>
            {expanded ? "Hide" : "View all"}
          </button>
        )}
      </div>
      {expanded && nameList}
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

function PlanGuests({
  plan,
  userId,
  isHosting,
  showAllGoing,
  showAllInterested,
  onToggleGoing,
  onToggleInterested,
  onApproved,
  variant = "page",
}: {
  plan: PlanDTO;
  userId: string;
  isHosting: boolean;
  showAllGoing: boolean;
  showAllInterested: boolean;
  onToggleGoing: () => void;
  onToggleInterested: () => void;
  onApproved: () => void;
  variant?: "page" | "modal";
}) {
  const listOnly = variant === "modal";
  return (
    <section id={listOnly ? undefined : "guests"} className={listOnly ? "plan-guests-modal-list" : "who-block plan-detail-card"}>
      <div className="who-row">
        <h3 className="who-block-heading">Going · {plan.participants.going.length}</h3>
        {plan.participants.going.length === 0 ? (
          <p className="subtle" style={{ margin: 0 }}>Be the first to say &ldquo;I&apos;m in.&rdquo;</p>
        ) : (
          <ParticipantsRow
            people={plan.participants.going}
            planId={plan.id}
            expanded={listOnly || showAllGoing}
            onToggle={onToggleGoing}
            countLabel={`${plan.participants.going.length} going`}
            listOnly={listOnly}
          />
        )}
      </div>

      {plan.participants.interested.length > 0 && (
        <div className="who-row" style={{ marginTop: 14 }}>
          <h3 className="who-block-heading">
            {plan.joinType === "approve" && isHosting ? "Applications" : "Interested"} · {plan.participants.interested.length}
          </h3>
          {plan.joinType === "approve" && isHosting ? (
            <div className="participant-list-interested">
              {plan.participants.interested.map((person) => (
                <div key={person.id} className="participant-row participant-row--with-action">
                  <Link
                    to={`/profile/${person.id}`}
                    state={{ from: "plan", planId: plan.id }}
                    className="participant-row-link"
                  >
                    <Avatar seed={person.avatarSeed} style={person.avatarStyle} photoDataUrl={person.avatarPhotoDataUrl} params={person.avatarParams} size="sm" />
                    <span className="participant-name">
                      {person.firstName}
                      {person.id === userId && <span className="you-pill">You</span>}
                    </span>
                  </Link>
                  {person.id !== userId && (
                    <button
                      type="button"
                      className="btn-secondary participant-approve-btn"
                      onClick={() => {
                        void api(`/api/plans/${plan.id}/approve`, {
                          method: "POST",
                          body: JSON.stringify({ userId: person.id }),
                        })
                          .then(() => onApproved())
                          .catch(() => undefined);
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
              planId={plan.id}
              expanded={listOnly || showAllInterested}
              onToggle={onToggleInterested}
              countLabel={`${plan.participants.interested.length} interested`}
              listOnly={listOnly}
            />
          )}
        </div>
      )}
    </section>
  );
}

function PlanDetailPinIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      className="plan-detail-meta-icon"
      aria-hidden="true"
    >
      <path
        d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
        fill="currentColor"
      />
      <circle cx="12" cy="10" r="3" fill="#fff" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 9h18" />
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

function ChatBubbleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

function ChatPreviewCard({
  planId,
  messages,
  convId,
  navState,
  onSent,
}: {
  planId: string;
  messages: MessageDTO[] | null;
  convId: string | null;
  navState: { from: string; planId: string };
  onSent: (msg: MessageDTO) => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const hasMessages = messages && messages.length > 0;
  const placeholder = hasMessages ? "Add to the chat..." : "nothing yet — say hi 👋";

  async function send() {
    if (!convId || !body.trim() || sending) return;
    setSending(true);
    try {
      const msg = await api<MessageDTO>(`/api/conversations/${convId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: body.trim() }),
      });
      setBody("");
      onSent(msg);
    } catch {
      /* silent — user can open full chat */
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="plan-detail-card chat-preview-card">
      <Link
        to={`/plans/${planId}/chat`}
        state={navState}
        className="chat-preview-messages-link"
      >
        <div className="chat-preview-header">
          <span className="chat-preview-title">Chat</span>
          <ChevronRight size={16} strokeWidth={2} color="var(--text-muted)" aria-hidden="true" />
        </div>
        {messages === null ? (
          <span className="chat-preview-empty">Loading…</span>
        ) : hasMessages ? (
          <div className="chat-preview-messages">
            {messages.map((msg) => (
              <div key={msg.id} className="chat-preview-message">
                {msg.sender && (
                  <Avatar
                    seed={msg.sender.avatarSeed}
                    style={msg.sender.avatarStyle}
                    photoDataUrl={msg.sender.avatarPhotoDataUrl}
                    params={msg.sender.avatarParams}
                    name={msg.sender.firstName}
                    size="sm"
                  />
                )}
                <div className="chat-preview-message-body">
                  {msg.sender && (
                    <span className="chat-preview-message-sender">{msg.sender.firstName}</span>
                  )}
                  <span className="chat-preview-message-text">
                    {msg.imageUrl ? "📷 Photo" : msg.body}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Link>
      <div className={`chat-preview-compose${hasMessages ? " chat-preview-compose--below-msgs" : ""}`}>
        <input
          className="chat-preview-input"
          type="text"
          placeholder={placeholder}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
        />
        <button
          type="button"
          className={`chat-composer-send${body.trim() ? " is-ready" : ""}`}
          disabled={!body.trim() || sending || !convId}
          onClick={() => void send()}
          aria-label="Send"
        >
          <Send size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * Single host entry point for giving up the plan: put it up for grabs
 * (anyone going can claim) or transfer to a specific going guest.
 * Both existing APIs stay intact — this only folds the two buttons together.
 */
function PassHostingControl({
  planTitle,
  upForGrabs,
  candidates,
  grabsBusy,
  grabsError,
  onOpen,
  onClearGrabsError,
  onPutUpForGrabs,
  onTransfer,
  panelOnly = false,
  onClose,
}: {
  planTitle: string;
  upForGrabs: boolean;
  candidates: PublicUser[];
  grabsBusy: boolean;
  grabsError: string | null;
  onOpen: () => void;
  onClearGrabsError: () => void;
  onPutUpForGrabs: () => void;
  onTransfer: (id: string) => void;
  panelOnly?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(panelOnly);
  const [confirmGrabs, setConfirmGrabs] = useState(false);
  const [pending, setPending] = useState<PublicUser | null>(null);
  const canGrabs = !upForGrabs;
  const canTransfer = candidates.length > 0;

  if (!canGrabs && !canTransfer) return null;

  function closePanel() {
    setOpen(false);
    setConfirmGrabs(false);
    setPending(null);
    onClearGrabsError();
    onClose?.();
  }

  if (confirmGrabs && canGrabs) {
    return (
      <div className="plan-grabs-confirm" role="group" aria-label="Confirm put up for grabs">
        <p className="plan-grabs-confirm-copy">
          Put &ldquo;{planTitle}&rdquo; up for grabs? Anyone who&rsquo;s in can take over hosting
          instead of cancelling.
        </p>
        {grabsError && <p className="luma-inline-error">{grabsError}</p>}
        <div className="plan-grabs-confirm-actions">
          <button
            type="button"
            className="btn-secondary plan-host-action-btn"
            disabled={grabsBusy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirmGrabs(false);
              onClearGrabsError();
            }}
          >
            Keep hosting
          </button>
          <button
            type="button"
            className="btn-primary plan-host-action-btn"
            disabled={grabsBusy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPutUpForGrabs();
            }}
          >
            {grabsBusy ? "Saving…" : "Put up for grabs"}
          </button>
        </div>
      </div>
    );
  }

  if (pending) {
    return (
      <div className="plan-grabs-confirm" role="group" aria-label="Confirm host transfer">
        <p className="plan-grabs-confirm-copy">
          Hand off hosting to {pending.firstName}? You&apos;ll drop off the going list.
        </p>
        <div className="plan-grabs-confirm-actions">
          <button type="button" className="btn-secondary plan-host-action-btn" onClick={() => setPending(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary plan-host-action-btn"
            onClick={() => {
              onTransfer(pending.id);
              setPending(null);
              closePanel();
            }}
          >
            Hand off to {pending.firstName}
          </button>
        </div>
      </div>
    );
  }

  if (!open) {
    if (panelOnly) return null;
    return (
      <button
        type="button"
        className="btn-secondary plan-host-action-btn plan-host-action-btn--grabs"
        onClick={() => {
          onOpen();
          onClearGrabsError();
          setOpen(true);
        }}
      >
        <Hand size={14} strokeWidth={1.8} aria-hidden="true" />
        Pass hosting
      </button>
    );
  }

  return (
    <div className="plan-pass-hosting" role="group" aria-label="Pass hosting">
      {canGrabs && (
        <button
          type="button"
          className="plan-pass-hosting-option"
          onClick={() => {
            onClearGrabsError();
            setConfirmGrabs(true);
          }}
        >
          <span className="plan-pass-hosting-option-title">Put it up for grabs</span>
          <span className="plan-pass-hosting-option-sub">Anyone going can claim</span>
        </button>
      )}
      {canTransfer && (
        <div className="plan-pass-hosting-transfer">
          <div className="plan-transfer-picker-label">Transfer to a specific person</div>
          <div className="plan-transfer-picker-list" role="menu">
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                className="plan-transfer-pick"
                onClick={() => setPending(c)}
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
        </div>
      )}
      <button type="button" className="btn-link" onClick={closePanel}>
        Cancel
      </button>
    </div>
  );
}
