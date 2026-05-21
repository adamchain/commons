import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/http";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { useAuth } from "../context/AuthContext";
import { fileToResizedDataUrl } from "../lib/imageResize";
import {
  VIBE_OPTIONS,
  type InterestTag,
  type JoinType,
  type NeighborhoodDTO,
  type PlanVisibility,
  type VibeIcon,
} from "../types/shared";

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function CreatePlanPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodDTO[]>([]);
  const prefillName = searchParams.get("name") ?? "";
  const prefillAddress = searchParams.get("address") ?? "";
  const prefillTagParam = searchParams.get("tag");
  const prefillVibe: VibeIcon | null = useMemo(() => {
    if (!prefillTagParam) return null;
    const opt = VIBE_OPTIONS.find((o) => o.tag === prefillTagParam);
    return opt?.id ?? null;
  }, [prefillTagParam]);

  // Default vibes to the user's onboarding interests so the feed map starts
  // pointed at the right communities.
  const defaultVibes = useMemo<VibeIcon[]>(() => {
    if (prefillVibe) return [prefillVibe];
    const userInterests = new Set(user?.interests ?? []);
    return VIBE_OPTIONS.filter((o) => userInterests.has(o.tag)).map((o) => o.id);
  }, [prefillVibe, user?.interests]);

  const [form, setForm] = useState({
    title: "",
    locationName: prefillName,
    locationAddress: prefillAddress,
    locationLat: undefined as number | undefined,
    locationLng: undefined as number | undefined,
    neighborhoodId: user?.neighborhoodIds?.[0] ?? user?.neighborhoodId ?? "",
    date: today(),
    time: "19:00",
    isFlexibleTime: false,
    isFlexibleLocation: false,
    isFlexibleDate: false,
    vibes: defaultVibes,
    description: "",
    visibility: "everyone" as PlanVisibility,
    capacityOn: false,
    capacity: "6",
    joinType: "open" as JoinType,
    isRecurring: false,
    flyerDataUrl: null as string | null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const flyerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api<NeighborhoodDTO[]>("/api/neighborhoods").then(setNeighborhoods).catch(() => undefined);
  }, []);

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
    if (!form.neighborhoodId) {
      setError("Pick a neighborhood.");
      return;
    }
    if (!form.isFlexibleDate && !form.date) {
      setError("Pick a day or toggle date flexible.");
      return;
    }
    if (!form.isFlexibleLocation && !form.locationName.trim()) {
      setError("Add a spot or toggle location flexible.");
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
          },
          date: form.isFlexibleDate ? today() : form.date,
          time: form.isFlexibleTime ? "" : form.time,
          isFlexibleTime: form.isFlexibleTime || form.isFlexibleDate,
          isFlexibleLocation: form.isFlexibleLocation,
          tags: resolvedTags,
          description: form.description.trim() || undefined,
          hostEmoji: VIBE_OPTIONS.find((o) => o.id === form.vibes[0])?.emoji ?? "✨",
          planKind,
          visibility: form.visibility,
          capacity: capacityNum,
          joinType: form.joinType,
          isRecurring: form.isRecurring,
          flyerDataUrl: form.flyerDataUrl ?? undefined,
        }),
      });
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

  return (
    <main className="app-shell app-shell--mid">
      <header className="app-header app-header--minimal">
        <Link to="/" className="detail-back">
          ← Back
        </Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 8 }}>
        New plan
      </h1>
      <p className="brand-tagline" style={{ marginBottom: 24 }}>
        Fill what you know · toggle what's flexible
      </p>

      <form onSubmit={(event) => void submit(event)} className="form-card">
        {/* Interests at top — defaults to user's selected interests so the feed map points there. */}
        <section className="form-section">
          <label className="form-question">Interests</label>
          <p className="form-help">Pre-selected from your interests. Add or remove anytime.</p>
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
        </section>

        <section className="form-section">
          <label className="form-question" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            placeholder="Trivia at National Mechanics"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />

          <label className="form-question" htmlFor="description">
            Details
          </label>
          <textarea
            id="description"
            placeholder="Anything else — vibes, dress code, who else is invited…"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </section>

        {/* Date + flex toggle inline */}
        <section className="form-section">
          <div className="form-row-flex">
            <div className="form-row-flex-main">
              <label className="form-question" htmlFor="date">
                Date
              </label>
              {!form.isFlexibleDate ? (
                <input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              ) : (
                <div className="form-flex-placeholder">Flexible — anyone can suggest a day</div>
              )}
            </div>
            <FlexToggle
              active={form.isFlexibleDate}
              onClick={() => setForm((f) => ({ ...f, isFlexibleDate: !f.isFlexibleDate }))}
              label="Flexible"
            />
          </div>

          {/* Time + flex toggle inline */}
          <div className="form-row-flex">
            <div className="form-row-flex-main">
              <label className="form-question" htmlFor="time">
                Time
              </label>
              {!form.isFlexibleTime ? (
                <input
                  id="time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                />
              ) : (
                <div className="form-flex-placeholder">Flexible — pick a time later</div>
              )}
            </div>
            <FlexToggle
              active={form.isFlexibleTime}
              onClick={() => setForm((f) => ({ ...f, isFlexibleTime: !f.isFlexibleTime }))}
              label="Flexible"
            />
          </div>

          <label className="flex-toggle">
            <input
              type="checkbox"
              checked={form.isRecurring}
              onChange={(e) => setForm((f) => ({ ...f, isRecurring: e.target.checked }))}
            />
            Repeats weekly
          </label>
        </section>

        {/* Location + flex toggle inline */}
        <section className="form-section">
          <div className="form-row-flex">
            <div className="form-row-flex-main">
              <label className="form-question">Where</label>
              {!form.isFlexibleLocation ? (
                <LocationAutocomplete
                  name={form.locationName}
                  address={form.locationAddress}
                  onChange={({ name, address, lat, lng }) =>
                    setForm((f) => ({
                      ...f,
                      locationName: name,
                      locationAddress: address,
                      locationLat: lat,
                      locationLng: lng,
                    }))
                  }
                />
              ) : (
                <div className="form-flex-placeholder">Flexible — we'll figure it out</div>
              )}
            </div>
            <FlexToggle
              active={form.isFlexibleLocation}
              onClick={() => setForm((f) => ({ ...f, isFlexibleLocation: !f.isFlexibleLocation }))}
              label="Flexible"
            />
          </div>
          <label className="form-question" htmlFor="neighborhood" style={{ marginTop: 8 }}>
            Neighborhood
          </label>
          <select
            id="neighborhood"
            value={form.neighborhoodId}
            onChange={(e) => setForm((f) => ({ ...f, neighborhoodId: e.target.value }))}
          >
            <option value="">Whereabouts…</option>
            {neighborhoods.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </section>

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
                  Pick from applicants
                </button>
              </div>
            </>
          )}
        </section>

        {/* Flyer upload */}
        <section className="form-section">
          <label className="form-question">Flyer (optional)</label>
          <p className="form-help">Got a flyer? Screenshot or upload — it'll show on the card.</p>
          <div className="flyer-uploader">
            {form.flyerDataUrl ? (
              <div className="flyer-preview">
                <img src={form.flyerDataUrl} alt="" />
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setForm((f) => ({ ...f, flyerDataUrl: null }))}
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-secondary btn-block"
                onClick={() => flyerRef.current?.click()}
              >
                Upload flyer
              </button>
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
          </div>
        </section>

        {error && <p className="error-text">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Posting…" : "Post it"}
        </button>
      </form>
    </main>
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
      <path d="M19 5l-7 7 7 7" />
    </svg>
  );
}
