import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import {
  ALL_INTERESTS,
  INTEREST_EMOJI,
  type InterestTag,
  type NeighborhoodDTO,
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
    neighborhoodId: user?.neighborhoodId ?? "",
    date: today(),
    time: "19:00",
    isFlexibleTime: false,
    tags: [] as InterestTag[],
    description: "",
    hostEmoji: "✨",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void api<NeighborhoodDTO[]>("/api/neighborhoods").then(setNeighborhoods).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (user?.neighborhoodId && !form.neighborhoodId) {
      setForm((f) => ({ ...f, neighborhoodId: user.neighborhoodId! }));
    }
  }, [user, form.neighborhoodId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.title.trim() || !form.locationName.trim() || !form.date || !form.neighborhoodId) {
      setError("Title, location, neighborhood, and date are required.");
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
          },
          date: form.date,
          time: form.isFlexibleTime ? "" : form.time,
          isFlexibleTime: form.isFlexibleTime,
          tags: form.tags,
          description: form.description.trim() || undefined,
          hostEmoji: form.hostEmoji,
        }),
      });
      navigate(`/plans/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post plan");
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
        <Link to="/" className="detail-back">← Back</Link>
        <ThemeToggle />
      </header>
      <h1 className="brand" style={{ marginBottom: 8 }}>Make a plan</h1>
      <p className="brand-tagline" style={{ marginBottom: 24 }}>
        Quick post — fill what matters, skip what doesn't
      </p>

      <form onSubmit={(event) => void submit(event)} className="form-card">
        <section className="form-section">
          <p className="form-section-title">The plan</p>
          <div>
            <label htmlFor="title">Title</label>
            <input
              id="title"
              placeholder="Trivia at National Mechanics"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="emoji">Vibe emoji</label>
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
          </div>
          <div>
            <label htmlFor="description">Description (optional)</label>
            <textarea
              id="description"
              placeholder="Tone, vibe, what to bring…"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </section>

        <section className="form-section">
          <p className="form-section-title">Where</p>
          <div>
            <label>Search a spot</label>
            <LocationAutocomplete
              name={form.locationName}
              address={form.locationAddress}
              onChange={({ name, address }) =>
                setForm((f) => ({ ...f, locationName: name, locationAddress: address }))
              }
            />
            {form.locationAddress && form.locationAddress !== form.locationName && (
              <p className="subtle" style={{ marginTop: 6 }}>{form.locationAddress}</p>
            )}
          </div>
          <div>
            <label htmlFor="neighborhood">Neighborhood</label>
            <select
              id="neighborhood"
              value={form.neighborhoodId}
              onChange={(e) => setForm((f) => ({ ...f, neighborhoodId: e.target.value }))}
            >
              <option value="">Pick one…</option>
              {neighborhoods.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>
        </section>

        <section className="form-section">
          <p className="form-section-title">When</p>
          <div className="form-grid-2">
            <div>
              <label htmlFor="date">Date</label>
              <input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="time">Time</label>
              <input
                id="time"
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                disabled={form.isFlexibleTime}
              />
            </div>
          </div>
          <label className="flex-toggle" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "var(--text)" }}>
            <input
              type="checkbox"
              checked={form.isFlexibleTime}
              onChange={(e) => setForm((f) => ({ ...f, isFlexibleTime: e.target.checked }))}
            />
            Flexible time — figure it out as a group
          </label>
        </section>

        <section className="form-section">
          <p className="form-section-title">Tags · pick up to 3</p>
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
                  {INTEREST_EMOJI[tag]} {tag}
                </button>
              );
            })}
          </div>
        </section>

        {error && <p className="error-text">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Posting…" : "Post plan"}
        </button>
      </form>
    </main>
  );
}
