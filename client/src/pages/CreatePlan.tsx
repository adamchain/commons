import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import {
  ALL_INTERESTS,
  INTEREST_LABELS,
  type InterestTag,
  type NeighborhoodDTO,
  type PlanKind,
  type PlanVisibility,
} from "../types/shared";

const HOST_EMOJIS = ["✨", "🧘", "🏃", "☕", "🍻", "🎶", "🎨", "🥞", "🚴", "🥾", "🎲", "📚", "🏋️"];

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
    tags: [] as InterestTag[],
    description: "",
    hostEmoji: "✨",
    planKind: "standard" as PlanKind,
    visibility: "everyone" as PlanVisibility,
    visibilityCommunityTag: "" as InterestTag | "",
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
    if (form.visibility === "community" && !form.visibilityCommunityTag && form.tags.length === 0) {
      setError("Pick a vibe tag for community visibility.");
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
          tags: form.tags,
          description: form.description.trim() || undefined,
          hostEmoji: form.hostEmoji,
          planKind: form.planKind,
          visibility: form.visibility,
          visibilityCommunityTag:
            form.visibility === "community"
              ? form.visibilityCommunityTag || form.tags[0]
              : undefined,
          isRecurring: form.isRecurring,
        }),
      });
      navigate(`/plans/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTag = (tag: InterestTag) => {
    setForm((prev) => {
      if (prev.tags.includes(tag)) return { ...prev, tags: prev.tags.filter((t) => t !== tag) };
      if (prev.tags.length >= 3) return prev;
      return { ...prev, tags: [...prev.tags, tag] };
    });
  };

  const tagsAtMax = form.tags.length >= 3;

  return (
    <main className="app-shell app-shell--mid">
      <header className="app-header">
        <Link to="/" className="detail-back">
          ← Back
        </Link>
        <ThemeToggle />
      </header>
      <h1 className="brand" style={{ marginBottom: 8 }}>
        What&apos;s the plan?
      </h1>
      <p className="brand-tagline" style={{ marginBottom: 24 }}>
        Like texting a friend — fill what you know, skip what you don&apos;t.
      </p>

      <form onSubmit={(event) => void submit(event)} className="form-card">
        <section className="form-section">
          <label className="form-question" htmlFor="title">
            What&apos;s the plan?
          </label>
          <input
            id="title"
            placeholder="Trivia at National Mechanics"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />

          <label className="form-question">Format</label>
          <div className="segmented">
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
              onClick={() => setForm((f) => ({ ...f, planKind: "looking_for" }))}
            >
              Looking for…
            </button>
          </div>

          <label className="form-question">Vibe emoji</label>
          <div className="emoji-row">
            {HOST_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className={`emoji-pill ${form.hostEmoji === e ? "is-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, hostEmoji: e }))}
              >
                {e}
              </button>
            ))}
          </div>

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
          <label className="form-question">Where</label>
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
          <label className="form-question">When</label>
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
        </section>

        <section className="form-section">
          <label className="form-question">Vibe · pick up to 3</label>
          <div className="create-tag-chips">
            {ALL_INTERESTS.map((tag) => {
              const selected = form.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={`create-tag-chip ${selected ? "is-selected" : ""}`}
                  onClick={() => toggleTag(tag)}
                  disabled={!selected && tagsAtMax}
                >
                  {INTEREST_LABELS[tag]}
                </button>
              );
            })}
          </div>
        </section>

        <section className="form-section">
          <label className="form-question">Who sees this?</label>
          <select
            value={form.visibility}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                visibility: e.target.value as PlanVisibility,
              }))
            }
          >
            <option value="everyone">Everyone on COMMONS</option>
            <option value="community">A community (matches one of your vibe tags)</option>
            <option value="network" disabled>
              Your network — coming soon
            </option>
          </select>
          {form.visibility === "community" && (
            <select
              value={form.visibilityCommunityTag}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  visibilityCommunityTag: e.target.value as InterestTag,
                }))
              }
            >
              <option value="">Match tag…</option>
              {form.tags.map((t) => (
                <option key={t} value={t}>
                  {INTEREST_LABELS[t]}
                </option>
              ))}
            </select>
          )}
        </section>

        {error && <p className="error-text">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Posting…" : "Post it"}
        </button>
      </form>
    </main>
  );
}
