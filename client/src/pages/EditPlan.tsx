import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import { formatPlanDate, formatPlanTime } from "../lib/format";
import {
  VIBE_OPTIONS,
  type InterestTag,
  type JoinType,
  type NeighborhoodDTO,
  type PlanDTO,
  type PlanVisibility,
  type PublicUser,
  type VibeIcon,
} from "../types/shared";

type LinkPreview = {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

// Pick the smallest set of fields the user is likely to touch — title,
// description, vibes, capacity/joinType, visibility, flyer (image + link), and
// neighborhood/location flex. Date/time live in a separate "propose change"
// flow so participants get a chance to see a shift before it lands.
export function EditPlanPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    void api<PlanDTO>(`/api/plans/${id}`)
      .then(setPlan)
      .catch(() => setError("Couldn't load that plan."));
    void api<NeighborhoodDTO[]>("/api/neighborhoods").then(setNeighborhoods).catch(() => undefined);
  }, [id]);

  // Bounce non-hosts out — server enforces too but no point letting them sit
  // on an edit form they can't submit.
  useEffect(() => {
    if (plan && user && plan.creator.id !== user.id) {
      navigate(`/plans/${id}`, { replace: true });
    }
  }, [plan, user, id, navigate]);

  if (!plan) {
    return (
      <main className="app-shell app-shell--mid">
        <header className="app-header app-header--minimal app-header--sticky">
          <Link to={`/plans/${id}`} className="detail-back">← Back</Link>
        </header>
        {error ? <p className="error-text">{error}</p> : <p>Loading…</p>}
      </main>
    );
  }

  return <EditForm plan={plan} setPlan={setPlan} neighborhoods={neighborhoods} saving={saving} setSaving={setSaving} savedAt={savedAt} setSavedAt={setSavedAt} />;
}

function EditForm({
  plan,
  setPlan,
  neighborhoods,
  saving,
  setSaving,
  savedAt,
  setSavedAt,
}: {
  plan: PlanDTO;
  setPlan: (p: PlanDTO) => void;
  neighborhoods: NeighborhoodDTO[];
  saving: boolean;
  setSaving: (v: boolean) => void;
  savedAt: number | null;
  setSavedAt: (v: number | null) => void;
}) {
  const navigate = useNavigate();
  const flyerRef = useRef<HTMLInputElement>(null);

  // Mirror current plan into editable form state.
  const initialVibes = useMemo<VibeIcon[]>(
    () => VIBE_OPTIONS.filter((o) => plan.tags.includes(o.tag)).map((o) => o.id),
    [plan.tags],
  );
  const [form, setForm] = useState({
    title: plan.title,
    description: plan.description ?? "",
    vibes: initialVibes,
    neighborhoodId: plan.neighborhoodId,
    isFlexibleLocation: plan.isFlexibleLocation,
    capacityOn: plan.capacity !== null,
    capacity: plan.capacity ? String(plan.capacity) : "6",
    joinType: plan.joinType,
    visibility: plan.visibility,
    flyerDataUrl: plan.flyerDataUrl ?? null,
    flyerLinkUrl: plan.flyerLinkUrl ?? "",
    flyerLinkPreview: (plan.flyerLinkPreview ?? null) as LinkPreview | null,
  });
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  // Time-proposal state.
  const [proposeDate, setProposeDate] = useState(plan.date.slice(0, 10));
  const [proposeTime, setProposeTime] = useState(plan.time || "19:00");
  const [proposeFlexTime, setProposeFlexTime] = useState(plan.isFlexibleTime);
  const [proposeBusy, setProposeBusy] = useState(false);
  const [proposeErr, setProposeErr] = useState<string | null>(null);

  // Link preview fetch.
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  async function fetchPreview(raw: string): Promise<void> {
    setLinkErr(null);
    const trimmed = raw.trim();
    if (!trimmed) {
      setForm((f) => ({ ...f, flyerLinkUrl: "", flyerLinkPreview: null }));
      return;
    }
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    setLinkBusy(true);
    try {
      const preview = await api<{ url: string } & LinkPreview>("/api/link-preview", {
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
      setLinkErr(err instanceof Error ? err.message : "Couldn't load preview");
      setForm((f) => ({ ...f, flyerLinkUrl: withScheme, flyerLinkPreview: null }));
    } finally {
      setLinkBusy(false);
    }
  }

  function onFlyerPick(file: File): void {
    fileToResizedDataUrl(file)
      .then((dataUrl) => setForm((f) => ({ ...f, flyerDataUrl: dataUrl })))
      .catch(() => setSubmitErr("Couldn't read that image. Try another."));
  }

  async function openFlyerPicker(): Promise<void> {
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
  }

  function toggleVibe(vid: VibeIcon): void {
    setForm((prev) => ({
      ...prev,
      vibes: prev.vibes.includes(vid)
        ? prev.vibes.filter((v) => v !== vid)
        : [...prev.vibes, vid],
    }));
  }

  const resolvedTags = useMemo<InterestTag[]>(() => {
    const set = new Set<InterestTag>();
    for (const id of form.vibes) {
      const opt = VIBE_OPTIONS.find((o) => o.id === id);
      if (opt) set.add(opt.tag);
    }
    return Array.from(set);
  }, [form.vibes]);

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitErr(null);
    if (!form.title.trim()) {
      setSubmitErr("Title can't be empty.");
      return;
    }
    if (!form.neighborhoodId && !form.isFlexibleLocation) {
      setSubmitErr("Pick a neighborhood or turn on flexible.");
      return;
    }
    const capacityNum = form.capacityOn ? Number(form.capacity) : null;
    if (capacityNum !== null && (!Number.isFinite(capacityNum) || capacityNum < 1)) {
      setSubmitErr("Spots must be a positive number, or leave open.");
      return;
    }
    setSaving(true);
    try {
      const updated = await api<PlanDTO>(`/api/plans/${plan.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          tags: resolvedTags,
          neighborhoodId: form.neighborhoodId || undefined,
          isFlexibleLocation: form.isFlexibleLocation,
          capacity: capacityNum,
          joinType: form.joinType,
          visibility: form.visibility,
          flyerDataUrl: form.flyerDataUrl ?? null,
          flyerLinkUrl: form.flyerLinkUrl.trim() || null,
          flyerLinkPreview: form.flyerLinkPreview ?? null,
        }),
      });
      setPlan(updated);
      setSavedAt(Date.now());
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function proposeChange(): Promise<void> {
    setProposeErr(null);
    if (!proposeDate) {
      setProposeErr("Pick a date.");
      return;
    }
    setProposeBusy(true);
    try {
      const updated = await api<PlanDTO>(`/api/plans/${plan.id}/propose-time`, {
        method: "POST",
        body: JSON.stringify({
          date: proposeDate,
          time: proposeFlexTime ? "" : proposeTime,
          isFlexibleTime: proposeFlexTime,
        }),
      });
      setPlan(updated);
    } catch (err) {
      setProposeErr(err instanceof Error ? err.message : "Couldn't propose change.");
    } finally {
      setProposeBusy(false);
    }
  }

  async function applyProposal(): Promise<void> {
    setProposeBusy(true);
    try {
      const updated = await api<PlanDTO>(`/api/plans/${plan.id}/apply-time`, { method: "POST" });
      setPlan(updated);
    } catch (err) {
      setProposeErr(err instanceof Error ? err.message : "Couldn't apply change.");
    } finally {
      setProposeBusy(false);
    }
  }

  async function cancelProposal(): Promise<void> {
    setProposeBusy(true);
    try {
      const updated = await api<PlanDTO>(`/api/plans/${plan.id}/propose-time`, {
        method: "DELETE",
      });
      setPlan(updated);
    } catch (err) {
      setProposeErr(err instanceof Error ? err.message : "Couldn't cancel proposal.");
    } finally {
      setProposeBusy(false);
    }
  }

  return (
    <main className="app-shell app-shell--mid">
      <header className="app-header app-header--minimal app-header--sticky">
        <Link to={`/plans/${plan.id}`} className="detail-back">← Back to plan</Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 8 }}>Edit plan</h1>
      <p className="brand-tagline" style={{ marginBottom: 24 }}>
        Most edits save instantly · date and time changes go through a proposal
      </p>

      <form onSubmit={(e) => void save(e)} className="form-card">
        <section className="form-section">
          <label className="form-question">Category</label>
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
          <label className="form-question" htmlFor="title">Title</label>
          <input
            id="title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <label className="form-question" htmlFor="description">Details</label>
          <textarea
            id="description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </section>

        <section className="form-section">
          <label className="form-question" htmlFor="neighborhood">Neighborhood</label>
          <select
            id="neighborhood"
            value={form.neighborhoodId}
            onChange={(e) => setForm((f) => ({ ...f, neighborhoodId: e.target.value }))}
          >
            <option value="">Whereabouts…</option>
            {neighborhoods.map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
          <label className="flex-toggle" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={form.isFlexibleLocation}
              onChange={(e) => setForm((f) => ({ ...f, isFlexibleLocation: e.target.checked }))}
            />
            Flexible location
          </label>
        </section>

        <section className="form-section">
          <label className="form-question">Who can see this?</label>
          <div className="visibility-options">
            <button
              type="button"
              className={`visibility-option ${form.visibility === "everyone" ? "is-active" : ""}`}
              onClick={() => setForm((f) => ({ ...f, visibility: "everyone" }))}
            >
              <span className="visibility-option-title">Everyone on COMMONS</span>
            </button>
            <button
              type="button"
              className={`visibility-option ${form.visibility === "network" ? "is-active" : ""}`}
              onClick={() => setForm((f) => ({ ...f, visibility: "network" as PlanVisibility }))}
            >
              <span className="visibility-option-title">Your Network</span>
            </button>
          </div>
        </section>

        <section className="form-section">
          <label className="flex-toggle">
            <input
              type="checkbox"
              checked={form.capacityOn}
              onChange={(e) => setForm((f) => ({ ...f, capacityOn: e.target.checked }))}
            />
            Cap the spots
          </label>
          {form.capacityOn && (
            <>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
              />
              <label className="form-question" style={{ marginTop: 8 }}>How do people get in?</label>
              <div className="segmented">
                <button
                  type="button"
                  className={form.joinType === "open" ? "is-active" : ""}
                  onClick={() => setForm((f) => ({ ...f, joinType: "open" as JoinType }))}
                >First come</button>
                <button
                  type="button"
                  className={form.joinType === "approve" ? "is-active" : ""}
                  onClick={() => setForm((f) => ({ ...f, joinType: "approve" as JoinType }))}
                >Pick from applicants</button>
              </div>
            </>
          )}
        </section>

        <section className="form-section">
          <label className="form-question">Flyer</label>
          <div className="flyer-uploader">
            {form.flyerDataUrl ? (
              <div className="flyer-preview">
                <img src={form.flyerDataUrl} alt="" />
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setForm((f) => ({ ...f, flyerDataUrl: null }))}
                >Remove</button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-secondary btn-block"
                onClick={() => void openFlyerPicker()}
              >Upload flyer</button>
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

          <label className="form-question" htmlFor="flyer-link" style={{ marginTop: 12 }}>
            Or paste a link
          </label>
          <input
            id="flyer-link"
            type="url"
            placeholder="https://…"
            value={form.flyerLinkUrl}
            onChange={(e) => setForm((f) => ({ ...f, flyerLinkUrl: e.target.value }))}
            onBlur={(e) => void fetchPreview(e.target.value)}
            disabled={linkBusy}
          />
          {linkBusy && <p className="form-help">Loading preview…</p>}
          {linkErr && <p className="form-help" style={{ color: "var(--accent)" }}>{linkErr}</p>}
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
              >Remove</button>
            </div>
          )}
        </section>

        {submitErr && <p className="error-text">{submitErr}</p>}
        <button type="submit" className="btn-primary btn-block" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {savedAt && !saving && (
          <p className="form-help" style={{ marginTop: 8 }}>Saved.</p>
        )}
      </form>

      <section className="form-card" style={{ marginTop: 16 }}>
        <h2 className="who-block-heading" style={{ marginTop: 0 }}>Move date/time</h2>
        <p className="form-help">
          Current: <strong>{formatPlanDate(plan.date)} · {formatPlanTime(plan.time, plan.isFlexibleTime)}</strong>
        </p>

        {plan.pendingTimeProposal ? (
          <div className="coordination-banner coordination-banner--expanded" role="note">
            <p>
              You proposed moving to{" "}
              <strong>{formatPlanDate(plan.pendingTimeProposal.date)} · {formatPlanTime(plan.pendingTimeProposal.time, plan.pendingTimeProposal.isFlexibleTime)}</strong>. Participants have been notified — apply when you're ready.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn-primary"
                disabled={proposeBusy}
                onClick={() => void applyProposal()}
              >
                {proposeBusy ? "Working…" : "Apply change"}
              </button>
              <button
                type="button"
                className="btn-link"
                disabled={proposeBusy}
                onClick={() => void cancelProposal()}
              >
                Cancel proposal
              </button>
            </div>
            {proposeErr && <p className="error-text">{proposeErr}</p>}
          </div>
        ) : (
          <>
            <label className="form-question" htmlFor="propose-date">New date</label>
            <input
              id="propose-date"
              type="date"
              value={proposeDate}
              onChange={(e) => setProposeDate(e.target.value)}
            />
            <label className="flex-toggle" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={proposeFlexTime}
                onChange={(e) => setProposeFlexTime(e.target.checked)}
              />
              Flexible time
            </label>
            {!proposeFlexTime && (
              <>
                <label className="form-question" htmlFor="propose-time">New time</label>
                <input
                  id="propose-time"
                  type="time"
                  value={proposeTime}
                  onChange={(e) => setProposeTime(e.target.value)}
                />
              </>
            )}
            {proposeErr && <p className="error-text">{proposeErr}</p>}
            <button
              type="button"
              className="btn-secondary btn-block"
              style={{ marginTop: 12 }}
              disabled={proposeBusy}
              onClick={() => void proposeChange()}
            >
              {proposeBusy ? "Working…" : "Propose change"}
            </button>
            <p className="form-help" style={{ marginTop: 8 }}>
              Participants get notified, but the plan stays put until you apply the change.
            </p>
          </>
        )}
      </section>

      <PassItOnControl
        plan={plan}
        onTransferred={() => navigate(`/plans/${plan.id}`)}
      />

      <button
        type="button"
        className="btn-secondary btn-block"
        style={{ marginTop: 16 }}
        onClick={() => navigate(`/plans/${plan.id}`)}
      >
        Done
      </button>
    </main>
  );
}

/**
 * "Pass it on" — host transfer surfaced from Edit so the host doesn't need
 * to bounce back to plan detail to hand off. The candidate list is whoever
 * is RSVP'd "going" minus the current host.
 */
function PassItOnControl({
  plan,
  onTransferred,
}: {
  plan: PlanDTO;
  onTransferred: () => void;
}) {
  const { user } = useAuth();
  const candidates: PublicUser[] = plan.participants.going.filter(
    (p) => user && p.id !== user.id,
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (candidates.length === 0) return null;

  async function handOff(c: PublicUser) {
    if (!confirm(`Transfer hosting of "${plan.title}" to ${c.firstName}? You'll drop off the going list.`)) return;
    setBusy(true);
    try {
      await api(`/api/plans/${plan.id}/transfer-host`, {
        method: "POST",
        body: JSON.stringify({ newHostId: c.id }),
      });
      onTransferred();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-card" style={{ marginTop: 16 }}>
      <h2 className="who-block-heading" style={{ marginTop: 0 }}>Pass it on</h2>
      <p className="form-help" style={{ marginTop: 0 }}>
        Hand off to someone who&apos;s going.
      </p>
      {!open ? (
        <button
          type="button"
          className="btn-secondary btn-block"
          onClick={() => setOpen(true)}
        >
          Pick a new host
        </button>
      ) : (
        <div className="plan-transfer-picker-list" style={{ marginTop: 8 }}>
          {candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              className="plan-transfer-pick"
              disabled={busy}
              onClick={() => void handOff(c)}
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
      )}
    </section>
  );
}
