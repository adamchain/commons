import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { ThemeToggle } from "../components/ThemeToggle";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import type { PlanTag } from "../types/shared";

const TAGS: PlanTag[] = ["coffee", "workout", "social", "outdoors", "events"];

const today = (): string => {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
};

export function CreatePlanPage() {
  const [form, setForm] = useState({
    title: "",
    locationName: "",
    locationAddress: "",
    date: today(),
    time: "19:00",
    isFlexibleTime: false,
    tags: [] as PlanTag[],
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.title.trim() || !form.locationName.trim() || !form.date) {
      setError("Title, location, and date are required.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await api<{ id: string }>("/api/plans", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          location: {
            name: form.locationName.trim(),
            address: form.locationAddress.trim() || form.locationName.trim(),
          },
          date: form.date,
          time: form.isFlexibleTime ? "Flexible" : form.time,
          isFlexibleTime: form.isFlexibleTime,
          tags: form.tags,
          description: form.description.trim() || undefined,
        }),
      });
      navigate(`/plans/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post plan");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTag = (tag: PlanTag) => {
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
        <Link to="/" className="detail-back" style={{ marginBottom: 0 }}>← Back</Link>
        <div className="app-header-actions">
          <ThemeToggle />
        </div>
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
            <label htmlFor="locName">Search a spot</label>
            <LocationAutocomplete
              name={form.locationName}
              address={form.locationAddress}
              onChange={({ name, address }) =>
                setForm((f) => ({ ...f, locationName: name, locationAddress: address }))
              }
            />
            {form.locationAddress && form.locationAddress !== form.locationName ? (
              <p className="subtle" style={{ marginTop: 6 }}>
                {form.locationAddress}
              </p>
            ) : null}
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
          <label
            className="flex-toggle"
            style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "var(--text)" }}
          >
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
            {TAGS.map((tag) => {
              const selected = form.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={`create-tag-chip ${selected ? "is-selected" : ""}`}
                  onClick={() => toggleTag(tag)}
                  disabled={!selected && tagsAtMax}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </section>

        {error ? <p className="error-text">{error}</p> : null}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Posting…" : "Post plan"}
        </button>
      </form>
    </main>
  );
}
