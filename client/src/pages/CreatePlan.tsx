import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import { useCardImages } from "../lib/cardImages";
import {
  VIBE_OPTIONS,
  type InterestTag,
  type JoinType,
  type PlanVisibility,
  type PublicUser,
  type VibeIcon,
} from "../types/shared";

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Recurrence cadence for the "Repeats" dropdown (Zoom-style). Maps to the
// existing `isRecurring` boolean on the plan; finer cadence is sent as
// `recurrence` for forward-compat.
type Recurrence = "none" | "weekly" | "biweekly" | "monthly";

// Single-letter labels for the weekly day picker, indexed Sun..Sat to match
// Date.getDay().
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Day-of-week (0=Sun) for a YYYY-MM-DD string, parsed in local time to avoid
// the UTC-midnight off-by-one that `new Date("2026-06-23")` produces.
const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
};

export function CreatePlanPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const prefillName = searchParams.get("name") ?? "";
  const prefillAddress = searchParams.get("address") ?? "";
  // "Do it again" seeds the title from a past plan, and carries that plan's
  // crew + group chat forward via fromPlanId (handled server-side on create).
  const prefillTitle = searchParams.get("title") ?? "";
  const fromPlanId = searchParams.get("fromPlanId");
  const prefillTagParam = searchParams.get("tag");
  const inviteUserId = searchParams.get("inviteUser");
  const inviteUserName = searchParams.get("inviteName");
  // Plural variant from the chat-to-plan re-plan flow — seeds multiple
  // invitees at once. inviteNames is parallel to inviteUserIds.
  const inviteUserIdsParam = searchParams.get("inviteUserIds") ?? "";
  const inviteUserIds = useMemo(
    () => inviteUserIdsParam.split(",").map((s) => s.trim()).filter(Boolean),
    [inviteUserIdsParam],
  );
  const inviteNamesParam = searchParams.get("inviteNames") ?? "";
  const inviteNames = useMemo(
    () => inviteNamesParam.split(",").map((s) => s.trim()).filter(Boolean),
    [inviteNamesParam],
  );
  const prefillVibe: VibeIcon | null = useMemo(() => {
    if (!prefillTagParam) return null;
    const opt = VIBE_OPTIONS.find((o) => o.tag === prefillTagParam);
    return opt?.id ?? null;
  }, [prefillTagParam]);

  // Interests start empty so the host consciously tags the plan — pre-checking
  // their onboarding interests led to mis-tagged plans. A prefill from Explore
  // (e.g. a venue's vibe) still seeds a single tag.
  const defaultVibes = useMemo<VibeIcon[]>(() => {
    if (prefillVibe) return [prefillVibe];
    return [];
  }, [prefillVibe]);

  const [form, setForm] = useState({
    title: prefillTitle,
    locationName: prefillName,
    locationAddress: prefillAddress,
    locationLat: undefined as number | undefined,
    locationLng: undefined as number | undefined,
    locationPlaceId: undefined as string | undefined,
    neighborhoodId: user?.neighborhoodIds?.[0] ?? user?.neighborhoodId ?? "",
    date: today(),
    time: "19:00",
    isFlexibleTime: false,
    isFlexibleLocation: false,
    isFlexibleDate: false,
    vibes: defaultVibes,
    description: "",
    visibility: (inviteUserId || inviteUserIds.length > 0 ? "network" : "everyone") as PlanVisibility,
    capacityOn: false,
    capacity: "6",
    joinType: "open" as JoinType,
    recurrence: "none" as Recurrence,
    // Weekdays (0=Sun) the plan repeats on, Zoom-style. Seeded from the start
    // date; only used when recurrence is weekly/biweekly.
    repeatDays: [weekdayOf(today())] as number[],
    flyerDataUrl: null as string | null,
    flyerLinkUrl: "",
    flyerLinkPreview: null as null | {
      title?: string;
      description?: string;
      image?: string;
      siteName?: string;
    },
  });
  const [submitting, setSubmitting] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Step 1 — user picks Make a plan (full form) vs Just an idea (loose, looking_for).
  // Skipped automatically when arriving with an invite seed.
  type Path = "choose" | "plan" | "idea";
  const [path, setPath] = useState<Path>(
    inviteUserId || inviteUserIds.length > 0 || prefillTitle || prefillName ? "plan" : "choose",
  );
  // The path selector now requires an explicit pick + Continue rather than
  // navigating on the first tap.
  const [pendingPath, setPendingPath] = useState<"plan" | "idea" | null>(null);
  const [network, setNetwork] = useState<PublicUser[] | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(() => {
    const seed = new Set<string>();
    if (inviteUserId) seed.add(inviteUserId);
    for (const id of inviteUserIds) seed.add(id);
    return seed;
  });
  const navigate = useNavigate();
  const flyerRef = useRef<HTMLInputElement>(null);
  const coverPool = useCardImages();
  const [showCoverLib, setShowCoverLib] = useState(false);

  useEffect(() => {
    // Always load the user's network once — needed for both the
    // "Inviting [name]" seeded flow and the hand-pick picker inside the
    // Your Network visibility option.
    void api<{ users: PublicUser[] }>("/api/auth/network")
      .then((r) => setNetwork(r.users))
      .catch(() => setNetwork([]));
  }, []);

  const seededOutsideNetwork = useMemo(() => {
    if (!inviteUserId || !inviteUserName || !network) return null;
    if (network.some((u) => u.id === inviteUserId)) return null;
    return { id: inviteUserId, firstName: inviteUserName };
  }, [inviteUserId, inviteUserName, network]);

  const toggleInvited = (id: string) => {
    setInvitedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const first = user?.neighborhoodIds?.[0] ?? user?.neighborhoodId;
    if (first && !form.neighborhoodId) {
      setForm((f) => ({ ...f, neighborhoodId: first }));
    }
  }, [user, form.neighborhoodId]);

  const resolvedTags = useMemo<InterestTag[]>(() => {
    const set = new Set<InterestTag>();
    for (const id of form.vibes) {
      const opt = VIBE_OPTIONS.find((o) => o.id === id);
      if (opt) set.add(opt.tag);
    }
    return Array.from(set);
  }, [form.vibes]);

  // A "looking for" plan = at least one of date/time/location is flexible.
  // We derive planKind from the flex toggles rather than asking up-front.
  const planKind = form.isFlexibleDate || form.isFlexibleTime || form.isFlexibleLocation
    ? "looking_for"
    : "standard";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError("Give your plan a title.");
      return;
    }
    if (!form.neighborhoodId && !form.isFlexibleLocation) {
      setError("Pick a neighborhood or toggle flexible.");
      return;
    }
    if (!form.isFlexibleDate && !form.date) {
      setError("Pick a day or toggle date flexible.");
      return;
    }

    const capacityNum = form.capacityOn ? Number(form.capacity) : null;
    if (capacityNum !== null && (!Number.isFinite(capacityNum) || capacityNum < 1)) {
      setError("Spots must be a positive number, or leave open.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await api<{ id: string }>("/api/plans", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          neighborhoodId: form.neighborhoodId,
          location: {
            name: form.locationName.trim(),
            address: form.locationAddress.trim() || form.locationName.trim(),
            lat: form.locationLat,
            lng: form.locationLng,
            placeId: form.locationPlaceId,
          },
          date: form.isFlexibleDate ? today() : form.date,
          time: form.isFlexibleTime ? "" : form.time,
          isFlexibleTime: form.isFlexibleTime || form.isFlexibleDate,
          isFlexibleLocation: form.isFlexibleLocation,
          tags: resolvedTags,
          description: form.description.trim() || undefined,
          hostEmoji: VIBE_OPTIONS.find((o) => o.id === form.vibes[0])?.emoji ?? "✨",
          planKind,
          // "Make a plan with X" (single seeded person) co-creates — they show
          // as a co-host rather than just getting an invite.
          coHostIds: inviteUserId ? [inviteUserId] : undefined,
          visibility: form.visibility,
          capacity: capacityNum,
          joinType: form.joinType,
          isRecurring: form.recurrence !== "none",
          recurrence: form.recurrence,
          repeatDays:
            form.recurrence === "weekly" || form.recurrence === "biweekly"
              ? form.repeatDays
              : undefined,
          flyerDataUrl: form.flyerDataUrl ?? undefined,
          flyerLinkUrl: form.flyerLinkUrl.trim() || undefined,
          flyerLinkPreview: form.flyerLinkPreview ?? undefined,
          fromPlanId: fromPlanId ?? undefined,
        }),
      });
      // The co-host (seeded inviteUser) is already added server-side — don't
      // also fire a plain invite at them.
      const inviteList = [...invitedIds].filter((id) => id !== inviteUserId);
      if (inviteList.length > 0) {
        try {
          await api(`/api/plans/${created.id}/invite`, {
            method: "POST",
            body: JSON.stringify({ userIds: inviteList }),
          });
        } catch {
          /* best-effort — user can invite again from the plan */
        }
      }
      navigate("/", { state: { justPostedId: created.id, openInviteForPlanId: created.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleVibe = (id: VibeIcon) => {
    setForm((prev) => ({
      ...prev,
      vibes: prev.vibes.includes(id) ? prev.vibes.filter((v) => v !== id) : [...prev.vibes, id],
    }));
  };

  const onFlyerPick = (file: File) => {
    fileToResizedDataUrl(file)
      .then((dataUrl) => setForm((f) => ({ ...f, flyerDataUrl: dataUrl })))
      .catch(() => setError("Couldn't read that image. Try another."));
  };

  const openFlyerPicker = async () => {
    if (isNative()) {
      try {
        const dataUrl = await pickPhotoNative({ maxPx: 1024, quality: 0.85 });
        if (dataUrl) setForm((f) => ({ ...f, flyerDataUrl: dataUrl }));
      } catch {
        /* user canceled */
      }
      return;
    }
    flyerRef.current?.click();
  };

  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const fetchLinkPreview = async (rawUrl: string) => {
    setLinkError(null);
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      setForm((f) => ({ ...f, flyerLinkUrl: "", flyerLinkPreview: null }));
      return;
    }
    // Tolerate "example.com" without a scheme.
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    setLinkBusy(true);
    try {
      const preview = await api<{
        url: string;
        title?: string;
        description?: string;
        image?: string;
        siteName?: string;
      }>("/api/link-preview", {
        method: "POST",
        body: JSON.stringify({ url: withScheme }),
      });
      setForm((f) => ({
        ...f,
        flyerLinkUrl: preview.url,
        flyerLinkPreview: {
          title: preview.title,
          description: preview.description,
          image: preview.image,
          siteName: preview.siteName,
        },
      }));
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Couldn't load preview");
      // Keep the URL string so the user can still post even if the preview
      // failed (some sites block scrapers).
      setForm((f) => ({ ...f, flyerLinkUrl: withScheme, flyerLinkPreview: null }));
    } finally {
      setLinkBusy(false);
    }
  };

  if (path === "choose") {
    const firstName = user?.firstName || "there";
    return (
      <main className="app-shell app-shell--mid">
        <header className="app-header app-header--minimal">
          <Link to="/" className="detail-back">
            ← Back
          </Link>
        </header>
        <h1 className="path-picker-intent-head">
          Hey {firstName},<br />what&apos;s on your mind?
        </h1>
        <p className="path-picker-intent-sub">
          Drop something in, you never know who&apos;s down.
        </p>
        <div className="path-picker-divider" />
        <div className="path-picker">
          <button
            type="button"
            className={`path-picker-card ${pendingPath === "idea" ? "is-selected" : ""}`}
            onClick={() => setPendingPath("idea")}
            aria-pressed={pendingPath === "idea"}
          >
            <span className="path-picker-title">Just an idea</span>
            <span className="path-picker-sub">
              A casual thought — see who&apos;s down before committing to anything.
            </span>
          </button>
          <button
            type="button"
            className={`path-picker-card ${pendingPath === "plan" ? "is-selected" : ""}`}
            onClick={() => setPendingPath("plan")}
            aria-pressed={pendingPath === "plan"}
          >
            <span className="path-picker-title">Make a plan</span>
            <span className="path-picker-sub">
              Know what you want to do. Set the details, post it, and see who&apos;s in.
            </span>
          </button>
        </div>
        <div className="path-picker-divider" />
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!pendingPath}
          onClick={() => {
            if (pendingPath === "idea") {
              setForm((f) => ({
                ...f,
                isFlexibleLocation: true,
                isFlexibleTime: true,
                isFlexibleDate: true,
              }));
              setPath("idea");
            } else if (pendingPath === "plan") {
              setPath("plan");
            }
          }}
        >
          Continue
        </button>
      </main>
    );
  }

  const isIdea = path === "idea";

  // Idea path renders a stripped-down form (single text input + a couple of
  // collapsed optional disclosures). The full-form path below is the standard
  // "Make a plan" experience.
  if (isIdea) {
    return (
      <IdeaForm
        form={form}
        setForm={setForm}
        submit={submit}
        submitting={submitting}
        error={error}
        onBack={() => setPath("choose")}
      />
    );
  }

  return (
    <main className="app-shell app-shell--mid create-plan">
      <header className="app-header create-header">
        <button type="button" className="detail-back" onClick={() => setPath("choose")}>
          ← Back
        </button>
        <span className="create-header-title">New plan</span>
        <button
          type="submit"
          form="create-plan-form"
          className="create-header-post"
          disabled={submitting}
        >
          {submitting ? "Posting…" : "Post it"}
        </button>
      </header>

      {(inviteUserId && inviteUserName) || inviteNames.length > 0 ? (
        <div className="create-plan-invite-banner" role="note">
          Inviting{" "}
          <strong>
            {inviteUserName ?? inviteNames[0]}
          </strong>
          {(() => {
            const total = invitedIds.size;
            const extras = total - 1;
            return extras > 0 ? ` + ${extras} more` : "";
          })()}{" "}
          once you post ·{" "}
          {form.visibility === "network"
            ? "Visible to your network"
            : "Visible to everyone on COMMONS"}
        </div>
      ) : null}

      <form id="create-plan-form" onSubmit={(event) => void submit(event)} className="create-form">
        {/* Cover image — prominent at the top, per New Plan handoff. */}
        {form.flyerDataUrl ? (
          <div className="cover-picker cover-picker--filled">
            <img src={form.flyerDataUrl} alt="" className="cover-picker-img" />
            <div className="cover-picker-overlay">
              <button type="button" className="cover-chip" onClick={() => setShowCoverLib(true)}>
                Change
              </button>
              <button
                type="button"
                className="cover-chip"
                onClick={() => setForm((f) => ({ ...f, flyerDataUrl: null }))}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="cover-picker">
            <span className="cover-picker-title">Add a cover image</span>
            <span className="cover-picker-sub">Make your plan stand out</span>
            <div className="cover-picker-buttons">
              <button type="button" className="cover-btn" onClick={() => setShowCoverLib(true)}>
                <LibraryIcon />
                Choose from library
              </button>
              <button type="button" className="cover-btn" onClick={() => void openFlyerPicker()}>
                <UploadIcon />
                Upload
              </button>
            </div>
          </div>
        )}
        <input
          ref={flyerRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFlyerPick(f);
            if (flyerRef.current) flyerRef.current.value = "";
          }}
        />

        {/* Plan name */}
        <input
          id="title"
          className="create-title-input"
          placeholder="Plan name"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />

        {/* When — Date + Time as Luma-style rows, each with its own Flexible
            pill. Borderless rows on the card, hairline-divided. */}
        <div className="luma-card">
          <div className="luma-row">
            <span className="luma-label">Date</span>
            <div className="luma-value">
              {!form.isFlexibleDate ? (
                <input
                  id="date"
                  type="date"
                  className="luma-input"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              ) : (
                <span className="luma-flex-text">Flexible day</span>
              )}
              <FlexToggle
                active={form.isFlexibleDate}
                onClick={() => setForm((f) => ({ ...f, isFlexibleDate: !f.isFlexibleDate }))}
                label="Flexible"
              />
            </div>
          </div>
          <div className="luma-row">
            <span className="luma-label">Time</span>
            <div className="luma-value">
              {!form.isFlexibleTime ? (
                <input
                  id="time"
                  type="time"
                  className="luma-input"
                  value={form.time}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                />
              ) : (
                <span className="luma-flex-text">Flexible time</span>
              )}
              <FlexToggle
                active={form.isFlexibleTime}
                onClick={() => setForm((f) => ({ ...f, isFlexibleTime: !f.isFlexibleTime }))}
                label="Flexible"
              />
            </div>
          </div>
        </div>

        {/* Location — single row, Google-Places-backed, flexible toggle inline.
            Neighborhood is kept from the user's default when a place is picked;
            isFlexibleLocation supersedes. */}
        <div className="luma-card">
          <div className="location-row">
            <div className="location-row-main">
              <PlacePicker
                value={form.locationName}
                address={form.locationAddress}
                placeholder="Choose location"
                onChange={(name) =>
                  setForm((f) => ({
                    ...f,
                    locationName: name,
                    locationLat: undefined,
                    locationLng: undefined,
                    locationPlaceId: undefined,
                  }))
                }
                onSelect={(p) =>
                  setForm((f) => ({
                    ...f,
                    locationName: p.name,
                    locationAddress: p.address,
                    locationLat: p.lat,
                    locationLng: p.lng,
                    locationPlaceId: p.placeId,
                  }))
                }
                onClear={() =>
                  setForm((f) => ({
                    ...f,
                    locationName: "",
                    locationAddress: "",
                    locationLat: undefined,
                    locationLng: undefined,
                    locationPlaceId: undefined,
                  }))
                }
              />
            </div>
            <FlexToggle
              active={form.isFlexibleLocation}
              onClick={() => setForm((f) => ({ ...f, isFlexibleLocation: !f.isFlexibleLocation }))}
              label="Flexible"
            />
          </div>
        </div>

        {/* Description */}
        <textarea
          id="description"
          className="create-desc-input"
          placeholder="Add a description — vibes, what to bring, who it's for…"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />

        {/* Interests — wrapping pills. */}
        <p className="form-eyebrow">Interests</p>
        <div className="vibe-grid">
          {VIBE_OPTIONS.map((opt) => {
            const selected = form.vibes.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                className={`vibe-tile ${selected ? "is-selected" : ""}`}
                onClick={() => toggleVibe(opt.id)}
                aria-pressed={selected}
              >
                <span className="vibe-tile-emoji" aria-hidden="true">{opt.emoji}</span>
                <span className="vibe-tile-label">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Settings — visibility segmented toggle + optional extras. */}
        <p className="form-eyebrow">Settings</p>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-row-label">Visibility</span>
            <div className="seg-toggle" role="group" aria-label="Visibility">
              <button
                type="button"
                className={`seg-toggle-btn ${form.visibility === "everyone" ? "is-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, visibility: "everyone" }))}
                aria-pressed={form.visibility === "everyone"}
              >
                Everyone
              </button>
              <button
                type="button"
                className={`seg-toggle-btn ${form.visibility === "network" ? "is-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, visibility: "network" }))}
                aria-pressed={form.visibility === "network"}
              >
                Network
              </button>
            </div>
          </div>

          {/* Granular hand-pick inside Your Network. Empty list = full network. */}
          {form.visibility === "network" && (
            <div className="settings-handpick">
              <NetworkHandPick
                network={network}
                invitedIds={invitedIds}
                onToggle={toggleInvited}
              />
            </div>
          )}

          {/* Options — spots, repeats, link. Collapsed to keep the form short. */}
          <button
            type="button"
            className="settings-options-toggle"
            onClick={() => setShowMore((s) => !s)}
            aria-expanded={showMore}
          >
            <span className="settings-row-label">Options</span>
            <span className="settings-options-hint">Spots, repeats, link</span>
            <ChevronIcon open={showMore} />
          </button>

        {showMore && (
          <div className="create-more">
            {/* Spots — toggle for open vs capped */}
            <section className="form-section">
              <div className="form-row-flex">
                <div className="form-row-flex-main">
                  <label className="form-question">Spots available</label>
                  {!form.capacityOn ? (
                    <p className="form-help" style={{ marginTop: 4 }}>
                      Open — no cap on who can join
                    </p>
                  ) : (
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      placeholder="e.g. 6"
                      value={form.capacity}
                      onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                    />
                  )}
                </div>
                <FlexToggle
                  active={form.capacityOn}
                  onClick={() => setForm((f) => ({ ...f, capacityOn: !f.capacityOn }))}
                  label="Set cap"
                />
              </div>

              {form.capacityOn && (
                <>
                  <label className="form-question" style={{ marginTop: 12 }}>
                    How do people get in?
                  </label>
                  <div className="segmented">
                    <button
                      type="button"
                      className={form.joinType === "open" ? "is-active" : ""}
                      onClick={() => setForm((f) => ({ ...f, joinType: "open" }))}
                    >
                      First come
                    </button>
                    <button
                      type="button"
                      className={form.joinType === "approve" ? "is-active" : ""}
                      onClick={() => setForm((f) => ({ ...f, joinType: "approve" }))}
                    >
                      Approve
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* Repeats — Zoom-style cadence dropdown */}
            <section className="form-section">
              <label className="form-question" htmlFor="repeats">Repeats</label>
              <select
                id="repeats"
                className="form-select"
                value={form.recurrence}
                onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as Recurrence }))}
              >
                <option value="none">Doesn't repeat</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
              {(form.recurrence === "weekly" || form.recurrence === "biweekly") && (
                <div className="repeat-days" role="group" aria-label="Repeats on">
                  {DAY_LABELS.map((label, i) => {
                    const on = form.repeatDays.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        className={on ? "repeat-day is-active" : "repeat-day"}
                        aria-pressed={on}
                        aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            repeatDays: f.repeatDays.includes(i)
                              ? f.repeatDays.filter((d) => d !== i)
                              : [...f.repeatDays, i].sort((a, b) => a - b),
                          }))
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Link — paste a URL to show a preview on the card. The cover
                image at the top of the form handles uploads. */}
            <section className="form-section">
              <label className="form-question" htmlFor="flyer-link">
                Add a link
              </label>
              <p className="form-help">Paste a link — it'll show as a preview on the card.</p>
          <input
            id="flyer-link"
            type="url"
            placeholder="https://…"
            value={form.flyerLinkUrl}
            onChange={(e) => setForm((f) => ({ ...f, flyerLinkUrl: e.target.value }))}
            onBlur={(e) => void fetchLinkPreview(e.target.value)}
            disabled={linkBusy}
          />
          {linkBusy && <p className="form-help">Loading preview…</p>}
          {linkError && <p className="form-help" style={{ color: "var(--color-danger, #c0392b)" }}>{linkError}</p>}
          {form.flyerLinkPreview && (
            <div className="link-preview" style={{ marginTop: 8 }}>
              {form.flyerLinkPreview.image && (
                <img src={form.flyerLinkPreview.image} alt="" className="link-preview-image" />
              )}
              <div className="link-preview-body">
                {form.flyerLinkPreview.siteName && (
                  <div className="link-preview-site">{form.flyerLinkPreview.siteName}</div>
                )}
                {form.flyerLinkPreview.title && (
                  <div className="link-preview-title">{form.flyerLinkPreview.title}</div>
                )}
                {form.flyerLinkPreview.description && (
                  <div className="link-preview-desc">{form.flyerLinkPreview.description}</div>
                )}
              </div>
              <button
                type="button"
                className="btn-link"
                onClick={() => setForm((f) => ({ ...f, flyerLinkUrl: "", flyerLinkPreview: null }))}
              >
                Remove
              </button>
            </div>
          )}
            </section>
          </div>
        )}
        </div>

        {inviteUserId && (
          <section className="form-section">
            <label className="form-question">Invite from your network</label>
            <p className="form-help">
              {inviteUserName ? <><strong>{inviteUserName}</strong> is already added. </> : null}
              Pick anyone else you want in on this.
            </p>
            {network === null && <p className="form-help">Loading…</p>}
            {network !== null && network.length === 0 && !seededOutsideNetwork && (
              <p className="form-help">No one in your network yet — you can still post.</p>
            )}
            {(network && network.length > 0) || seededOutsideNetwork ? (
              <div className="invite-people-list">
                {seededOutsideNetwork && (
                  <button
                    type="button"
                    className="invite-person is-picked"
                    disabled
                    aria-pressed
                  >
                    <Avatar seed={seededOutsideNetwork.id} style="avataaars" name={seededOutsideNetwork.firstName} size="sm" />
                    <span className="invite-person-name">{seededOutsideNetwork.firstName}</span>
                    <span className="invite-person-check">✓</span>
                  </button>
                )}
                {network?.map((u) => {
                  const picked = invitedIds.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={`invite-person ${picked ? "is-picked" : ""}`}
                      onClick={() => toggleInvited(u.id)}
                      aria-pressed={picked}
                    >
                      <Avatar
                        seed={u.avatarSeed}
                        style={u.avatarStyle}
                        photoDataUrl={u.avatarPhotoDataUrl}
                        params={u.avatarParams}
                        name={u.firstName}
                        size="sm"
                      />
                      <span className="invite-person-name">{u.firstName}</span>
                      {picked && <span className="invite-person-check">✓</span>}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>
        )}

        {error && <p className="error-text">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Posting…" : "Post it"}
        </button>

        <p className="create-communities-footer">
          <strong>Communities</strong> <span className="visibility-option-pill">Coming soon</span>
          <br />
          Run clubs, book clubs, recurring crews.
        </p>
      </form>

      {showCoverLib && (
        <div
          className="cover-lib-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Choose a cover image"
          onClick={() => setShowCoverLib(false)}
        >
          <div className="cover-lib" onClick={(e) => e.stopPropagation()}>
            <div className="cover-lib-head">
              <span className="cover-lib-title">Choose a cover</span>
              <button
                type="button"
                className="cover-lib-close"
                onClick={() => setShowCoverLib(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="cover-lib-grid">
              {coverPool.map((url) => (
                <button
                  key={url}
                  type="button"
                  className="cover-lib-tile"
                  onClick={() => {
                    setForm((f) => ({ ...f, flyerDataUrl: url }));
                    setShowCoverLib(false);
                  }}
                >
                  <img src={url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

type FormShape = {
  title: string;
  locationName: string;
  locationAddress: string;
  locationLat: number | undefined;
  locationLng: number | undefined;
  locationPlaceId: string | undefined;
  neighborhoodId: string;
  date: string;
  time: string;
  isFlexibleTime: boolean;
  isFlexibleLocation: boolean;
  isFlexibleDate: boolean;
  vibes: VibeIcon[];
  description: string;
  visibility: PlanVisibility;
  capacityOn: boolean;
  capacity: string;
  joinType: JoinType;
  recurrence: Recurrence;
  repeatDays: number[];
  flyerDataUrl: string | null;
  flyerLinkUrl: string;
  flyerLinkPreview: null | {
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
  };
};

/**
 * Just an Idea form — single open text field, everything else collapsed.
 * Title doubles as the "what's on your mind" body since the server requires
 * a title; on submit we set every flexibility flag so the resulting plan
 * lives as a looking_for entry on the feed.
 */
function IdeaForm({
  form,
  setForm,
  submit,
  submitting,
  error,
  onBack,
}: {
  form: FormShape;
  setForm: (updater: (f: FormShape) => FormShape) => void;
  submit: (event: FormEvent) => void;
  submitting: boolean;
  error: string | null;
  onBack: () => void;
}) {
  // Both "a little context" and visibility now live behind one optional
  // disclosure, hidden by default so the field is just the open text box.
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <main className="app-shell app-shell--mid">
      <header className="app-header app-header--minimal">
        <button type="button" className="detail-back" onClick={onBack}>
          ← Back
        </button>
      </header>
      <h1 className="brand" style={{ marginBottom: 8 }}>Just an idea</h1>
      <p className="brand-tagline" style={{ marginBottom: 24 }}>
        Just a thought. See who&apos;s down.
      </p>

      <form onSubmit={submit} className="form-card">
        <section className="form-section">
          <textarea
            className="idea-textarea"
            placeholder="What's on your mind?"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            rows={3}
            autoFocus
          />
        </section>

        <button
          type="button"
          className="idea-disclosure"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((v) => !v)}
        >
          <span>Add details</span>
          <span className={`idea-disclosure-chevron ${detailsOpen ? "is-open" : ""}`}>›</span>
        </button>
        {detailsOpen && (
          <div className="idea-details">
            <label className="form-question" htmlFor="idea-context">A little context</label>
            <textarea
              id="idea-context"
              className="idea-context"
              placeholder="Anything else worth knowing? (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
            />
            <label className="form-question" style={{ marginTop: 12 }}>Visibility</label>
            <div className="visibility-options" style={{ marginTop: 6 }}>
              <button
                type="button"
                className={`visibility-option ${form.visibility === "everyone" ? "is-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, visibility: "everyone" }))}
                aria-pressed={form.visibility === "everyone"}
              >
                <span className="visibility-option-title">Everyone on COMMONS</span>
              </button>
              <button
                type="button"
                className={`visibility-option ${form.visibility === "network" ? "is-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, visibility: "network" }))}
                aria-pressed={form.visibility === "network"}
              >
                <span className="visibility-option-title">Your Network</span>
              </button>
            </div>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting || !form.title.trim()}>
          {submitting ? "Posting…" : "Put it out there"}
        </button>

        <p className="create-communities-footer">
          <strong>Communities</strong> <span className="visibility-option-pill">Coming soon</span>
          <br />
          Run clubs, book clubs, recurring crews.
        </p>
      </form>
    </main>
  );
}

/**
 * Hand-pick a subset of the user's network. Empty selection means the plan
 * still lands on the user's full network (we don't want a footgun where the
 * host posts to no one). Once any chip is picked, the audience is narrowed
 * to that explicit list via the existing invitedIds flow.
 */
function NetworkHandPick({
  network,
  invitedIds,
  onToggle,
}: {
  network: PublicUser[] | null;
  invitedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (network === null) {
    return <p className="form-help" style={{ marginTop: 8 }}>Loading your network…</p>;
  }
  if (network.length === 0) {
    return (
      <p className="form-help" style={{ marginTop: 8 }}>
        No one in your network yet — your plan will still post to your network as it grows.
      </p>
    );
  }
  return (
    <div style={{ marginTop: 10 }}>
      <p className="form-help" style={{ marginTop: 0 }}>
        Want to narrow it down? Pick specific people — leave blank to share with everyone in your network.
      </p>
      <div className="invite-people-list">
        {network.map((u) => {
          const picked = invitedIds.has(u.id);
          return (
            <button
              key={u.id}
              type="button"
              className={`invite-person ${picked ? "is-picked" : ""}`}
              onClick={() => onToggle(u.id)}
              aria-pressed={picked}
            >
              <Avatar
                seed={u.avatarSeed}
                style={u.avatarStyle}
                photoDataUrl={u.avatarPhotoDataUrl}
                params={u.avatarParams}
                name={u.firstName}
                size="sm"
              />
              <span className="invite-person-name">{u.firstName}</span>
              {picked && <span className="invite-person-check">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FlexToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`flex-toggle-btn ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
      title={label}
    >
      <FlexIcon />
      <span>{label}</span>
    </button>
  );
}

function FlexIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
      <path d="m12 5-7 7 7 7" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`create-more-chevron ${open ? "is-open" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

interface PlaceHit {
  placeId: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
}

/**
 * Google-Places-backed venue picker. Free-text typing is kept as a custom
 * venue name (onChange); choosing a suggestion fills name + address + coords
 * (onSelect). Falls back gracefully to plain text when Places isn't configured.
 */
function PlacePicker({
  value,
  address,
  onChange,
  onSelect,
  onClear,
  placeholder,
}: {
  value: string;
  address: string;
  onChange: (name: string) => void;
  onSelect: (p: { name: string; address: string; lat?: number; lng?: number; placeId?: string }) => void;
  onClear: () => void;
  placeholder?: string;
}) {
  const [results, setResults] = useState<PlaceHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errored, setErrored] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Seed true when a venue is already filled (e.g. prefilled from Explore) so
  // we don't auto-search and pop the dropdown on mount.
  const skipNextSearch = useRef(value.trim().length >= 2);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setErrored(false);
      void api<{ results: PlaceHit[] }>(`/api/places/search?q=${encodeURIComponent(q)}`)
        .then((r) => setResults(r.results ?? []))
        .catch(() => {
          setResults([]);
          setErrored(true);
        })
        .finally(() => {
          setLoading(false);
          setSearched(true);
        });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  // Clean up the blur timer on unmount.
  useEffect(() => () => {
    if (blurRef.current) clearTimeout(blurRef.current);
  }, []);

  const choose = (p: PlaceHit) => {
    skipNextSearch.current = true;
    onSelect({ name: p.name, address: p.address, lat: p.lat, lng: p.lng, placeId: p.placeId });
    setResults([]);
    setSearched(false);
    setFocused(false);
  };

  const hasPickedAddress = Boolean(address && address !== value);
  // Visibility is gated on focus (not a separate flag that can desync), so the
  // list stays put while you read it instead of flickering on every keystroke.
  const showDropdown = focused && value.trim().length >= 2;

  return (
    <div className="place-picker">
      <div className="place-picker-field">
        <PinIcon />
        <input
          type="text"
          placeholder={placeholder ?? "Search a venue, or type your own"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Delay so a result tap (mousedown) registers before we hide.
            blurRef.current = setTimeout(() => setFocused(false), 150);
          }}
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            className="place-picker-clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onClear();
              setResults([]);
              setSearched(false);
            }}
            aria-label="Clear place"
          >
            ×
          </button>
        )}
      </div>
      {hasPickedAddress && !showDropdown && <p className="place-picker-chosen">📍 {address}</p>}
      {showDropdown && (
        <ul className="place-picker-results" role="listbox">
          {loading && results.length === 0 && <li className="place-picker-empty">Searching…</li>}
          {!loading && errored && (
            <li className="place-picker-empty">
              Venue search is unavailable — we'll use "{value.trim()}" as the venue.
            </li>
          )}
          {!loading && !errored && searched && results.length === 0 && (
            <li className="place-picker-empty">No matches — we'll use "{value.trim()}" as the venue.</li>
          )}
          {results.map((p) => (
            <li key={p.placeId}>
              <button
                type="button"
                className="place-picker-result"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
              >
                <span className="place-picker-result-name">{p.name}</span>
                {p.address && <span className="place-picker-result-addr">{p.address}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}
