import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { useAuth } from "../context/AuthContext";
import {
  VIBE_OPTIONS,
  type InterestTag,
  type JoinType,
  type NeighborhoodDTO,
  type PlanKind,
  type PlanVisibility,
  type VibeIcon,
} from "../types/shared";

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function CreatePlanPage() {
  const { user } = useAuth();
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodDTO[]>([]);
  const [form, setForm] = useState({
    title: "",
    locationName: "",
    locationAddress: "",
    locationLat: undefined as number | undefined,
    locationLng: undefined as number | undefined,
    neighborhoodId: user?.neighborhoodIds?.[0] ?? user?.neighborhoodId ?? "",
    date: today(),
    time: "19:00",
    isFlexibleTime: false,
    isFlexibleLocation: false,
    isFlexibleDate: false,
    vibes: [] as VibeIcon[],
    description: "",
    planKind: "standard" as PlanKind,
    visibility: "everyone" as PlanVisibility,
    capacity: "" as string, // text input — blank = open
    joinType: "open" as JoinType,
    isRecurring: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void api<NeighborhoodDTO[]>("/api/neighborhoods").then(setNeighborhoods).catch(() => undefined);
  }, []);

  useEffect(() => {
    const first = user?.neighborhoodIds?.[0] ?? user?.neighborhoodId;
    if (first && !form.neighborhoodId) {
      setForm((f) => ({ ...f, neighborhoodId: first }));
    }
  }, [user, form.neighborhoodId]);

  const isLooking = form.planKind === "looking_for";

  // Vibes resolve to underlying InterestTag values for the feed/algorithm.
  // Multiple emojis can collapse to the same tag — de-dupe before send.
  const resolvedTags = useMemo<InterestTag[]>(() => {
    const set = new Set<InterestTag>();
    for (const id of form.vibes) {
      const opt = VIBE_OPTIONS.find((o) => o.id === id);
      if (opt) set.add(opt.tag);
    }
    return Array.from(set);
  }, [form.vibes]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError("What's the plan?");
      return;
    }
    if (!form.neighborhoodId) {
      setError("Pick a neighborhood.");
      return;
    }
    if (!form.isFlexibleDate && !form.date) {
      setError("Pick a day or mark date flexible.");
      return;
    }
    if (!form.isFlexibleLocation && !form.locationName.trim()) {
      setError("Add a spot or toggle flexible location.");
      return;
    }

    const capacityNum = form.capacity.trim() === "" ? null : Number(form.capacity);
    if (capacityNum !== null && (!Number.isFinite(capacityNum) || capacityNum < 1)) {
      setError("Spots must be a positive number, or leave blank for open.");
      return;
    }

    setSubmitting(true);
    try {
      await api<{ id: string }>("/api/plans", {
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
          planKind: form.planKind,
          visibility: form.visibility,
          capacity: capacityNum,
          joinType: form.joinType,
          isRecurring: form.isRecurring,
        }),
      });
      // Direct to feed — the new plan card is the confirmation. No separate
      // confirm screen.
      navigate("/");
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

  return (
    <main className="app-shell app-shell--mid">
      <header className="app-header app-header--minimal">
        <Link to="/" className="detail-back">
          ← Back
        </Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 8 }}>
        What&apos;s the plan?
      </h1>
      <p className="brand-tagline" style={{ marginBottom: 24 }}>
        Like texting a friend — fill what you know, skip what you don&apos;t.
      </p>

      <form onSubmit={(event) => void submit(event)} className="form-card">
        <section className="form-section">
          <label className="form-question">Path</label>
          <div className="segmented segmented-kind">
            <button
              type="button"
              className={form.planKind === "standard" ? "is-active" : ""}
              onClick={() => setForm((f) => ({ ...f, planKind: "standard" }))}
            >
              Confirmed plan
            </button>
            <button
              type="button"
              className={form.planKind === "looking_for" ? "is-active" : ""}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  planKind: "looking_for",
                  // Looking For posts leave date/time/location flexible by default —
                  // user can lock in any of the three individually.
                  isFlexibleDate: true,
                  isFlexibleTime: true,
                  isFlexibleLocation: true,
                }))
              }
            >
              Looking for…
            </button>
          </div>
          <p className="form-help">
            {isLooking
              ? "Floating an idea — leave date, time, and location flexible (any combination)."
              : "Locked in — pick when and where."}
          </p>

          <label className="form-question" htmlFor="title">
            What&apos;s the plan?
          </label>
          <input
            id="title"
            placeholder={isLooking ? "Anyone want to play pickleball?" : "Trivia at National Mechanics"}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />

          <label className="form-question" htmlFor="description">
            Anything else?
          </label>
          <textarea
            id="description"
            placeholder="Sounds better when it sounds like you"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </section>

        <section className="form-section">
          <label className="form-question">Where should we meet?</label>
          <label className="flex-toggle">
            <input
              type="checkbox"
              checked={form.isFlexibleLocation}
              onChange={(e) => setForm((f) => ({ ...f, isFlexibleLocation: e.target.checked }))}
            />
            Flexible location — we&apos;ll figure it out
          </label>
          {!form.isFlexibleLocation && (
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
          )}
          <label className="form-question" htmlFor="neighborhood">
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

        <section className="form-section">
          <label className="form-question">When?</label>
          <label className="flex-toggle">
            <input
              type="checkbox"
              checked={form.isFlexibleDate}
              onChange={(e) => setForm((f) => ({ ...f, isFlexibleDate: e.target.checked }))}
            />
            Flexible date
          </label>
          {!form.isFlexibleDate && (
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          )}
          <label className="flex-toggle">
            <input
              type="checkbox"
              checked={form.isFlexibleTime}
              onChange={(e) => setForm((f) => ({ ...f, isFlexibleTime: e.target.checked }))}
            />
            Flexible time
          </label>
          {!form.isFlexibleTime && (
            <input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
          )}
          <label className="flex-toggle">
            <input
              type="checkbox"
              checked={form.isRecurring}
              onChange={(e) => setForm((f) => ({ ...f, isRecurring: e.target.checked }))}
            />
            Repeats weekly (same dot on your calendar)
          </label>

          <label className="form-question" htmlFor="capacity" style={{ marginTop: 14 }}>
            Spots available?
          </label>
          <p className="form-help">Leave blank for open.</p>
          <input
            id="capacity"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="e.g. 6"
            value={form.capacity}
            onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
          />

          {form.capacity.trim() !== "" && (
            <>
              <label className="form-question" style={{ marginTop: 12 }}>
                Join type
              </label>
              <div className="segmented">
                <button
                  type="button"
                  className={form.joinType === "open" ? "is-active" : ""}
                  onClick={() => setForm((f) => ({ ...f, joinType: "open" }))}
                >
                  Open · first come
                </button>
                <button
                  type="button"
                  className={form.joinType === "approve" ? "is-active" : ""}
                  onClick={() => setForm((f) => ({ ...f, joinType: "approve" }))}
                >
                  Approve each
                </button>
              </div>
            </>
          )}
        </section>

        <section className="form-section">
          <label className="form-question">Interests</label>
          <p className="form-help">This helps get your plan on the right feeds.</p>
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
          <label className="form-question">Who sees this?</label>
          <div className="segmented segmented-visibility">
            <button
              type="button"
              className={form.visibility === "everyone" ? "is-active" : ""}
              onClick={() => setForm((f) => ({ ...f, visibility: "everyone" }))}
            >
              Everyone on COMMONS
            </button>
            <button
              type="button"
              className={form.visibility === "network" ? "is-active" : ""}
              onClick={() => setForm((f) => ({ ...f, visibility: "network" }))}
            >
              Your Network
            </button>
            <button
              type="button"
              className="is-soon"
              disabled
              title="Communities — coming soon"
            >
              Communities · Coming Soon
            </button>
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
