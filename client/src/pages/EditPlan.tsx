import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ban, Check, Hand } from "lucide-react";
import { api, parseApiError } from "../api/http";
import { Avatar } from "../components/Avatar";
import { NumberPicker } from "../components/NumberPicker";
import { ScreenTitle } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { interestVisual } from "../lib/interestIcons";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import { formatPlanDate, formatPlanTime } from "../lib/format";
import {
  INTEREST_LABELS,
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

type InstantSection = "basics" | "where" | "who" | "cover";

const EDIT_JUMP = [
  { id: "edit-basics", label: "Basics" },
  { id: "edit-when", label: "Where & When" },
  { id: "edit-invited", label: "Who's Invited" },
  { id: "edit-cover", label: "Cover Photo" },
] as const;

// Pick the smallest set of fields the user is likely to touch — title,
// description, vibes, capacity/joinType, visibility, flyer (image + link), and
// neighborhood/location flex. Date/time uses the same inline rows as New Plan;
// applying still notifies participants before the change sticks.
export function EditPlanPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  return <EditForm plan={plan} setPlan={setPlan} neighborhoods={neighborhoods} saving={saving} setSaving={setSaving} />;
}

function EditForm({
  plan,
  setPlan,
  neighborhoods,
  saving,
  setSaving,
}: {
  plan: PlanDTO;
  setPlan: (p: PlanDTO) => void;
  neighborhoods: NeighborhoodDTO[];
  saving: boolean;
  setSaving: (v: boolean) => void;
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
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState<{ section: InstantSection; label: string } | null>(null);
  const skipInstant = useRef(true);
  const lastInstantGroup = useRef<Exclude<InstantSection, "cover">>("basics");
  const instantTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    lastInstantGroup.current = "basics";
    setForm((prev) => ({
      ...prev,
      vibes: prev.vibes.includes(vid)
        ? prev.vibes.filter((v) => v !== vid)
        : [...prev.vibes, vid],
    }));
  }

  function jumpTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const resolvedTags = useMemo<InterestTag[]>(() => {
    const set = new Set<InterestTag>();
    for (const id of form.vibes) {
      const opt = VIBE_OPTIONS.find((o) => o.id === id);
      if (opt) set.add(opt.tag);
    }
    return Array.from(set);
  }, [form.vibes]);

  function flashSaved(section: InstantSection, label = "Saved") {
    setSavedFlash({ section, label });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(null), 1800);
  }

  async function saveInstant(): Promise<void> {
    if (!form.title.trim()) return;
    const capacityNum = form.capacityOn ? Number(form.capacity) : null;
    if (capacityNum !== null && (!Number.isFinite(capacityNum) || capacityNum < 1)) return;
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
        }),
      });
      setPlan(updated);
      flashSaved(lastInstantGroup.current);
      setSubmitErr(null);
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Couldn't save.");
    }
  }

  useEffect(() => {
    if (skipInstant.current) {
      skipInstant.current = false;
      return;
    }
    if (instantTimer.current) clearTimeout(instantTimer.current);
    instantTimer.current = setTimeout(() => {
      void saveInstant();
    }, 700);
    return () => {
      if (instantTimer.current) clearTimeout(instantTimer.current);
    };
    // Instant-save Basics, Where (neighborhood), and Who's Invited — not cover or date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.title,
    form.description,
    form.vibes,
    form.neighborhoodId,
    form.isFlexibleLocation,
    form.capacityOn,
    form.capacity,
    form.joinType,
    form.visibility,
  ]);

  async function saveCover(): Promise<void> {
    setSubmitErr(null);
    setSaving(true);
    try {
      const updated = await api<PlanDTO>(`/api/plans/${plan.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          flyerDataUrl: form.flyerDataUrl ?? null,
          flyerLinkUrl: form.flyerLinkUrl.trim() || null,
          flyerLinkPreview: form.flyerLinkPreview ?? null,
        }),
      });
      setPlan(updated);
      flashSaved("cover", "Cover photo saved");
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Couldn't save cover photo.");
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

  const timeUnchanged =
    proposeDate === plan.date.slice(0, 10) &&
    proposeFlexTime === plan.isFlexibleTime &&
    (proposeFlexTime || proposeTime === (plan.time || "19:00"));

  return (
    <main className="app-shell app-shell--mid edit-plan-page">
      <header className="app-header app-header--minimal app-header--sticky edit-plan-top">
        <Link to={`/plans/${plan.id}`} className="detail-back">
          <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" /> Back to plan
        </Link>
        {savedFlash && (
          <span className="edit-saved-flash" role="status">
            <Check size={14} strokeWidth={2.4} aria-hidden="true" />
            {savedFlash.label}
          </span>
        )}
      </header>
      <ScreenTitle
        title="Edit plan"
        subtitle="Most edits save as you go. Date and time go through a proposal."
      />
      <nav className="edit-jump" aria-label="Jump to section">
        {EDIT_JUMP.map((s) => (
          <button key={s.id} type="button" className="edit-jump-btn" onClick={() => jumpTo(s.id)}>
            {s.label}
          </button>
        ))}
      </nav>

      <div className="form-card">
        <section className="edit-section">
          <SectionHead id="edit-basics" label="Basics" saved={savedFlash?.section === "basics"} />
          <p className="form-help" style={{ marginTop: 0 }}>Saves as you type.</p>
          <label className="form-question">Category</label>
          <div className="edit-cat-row">
            {resolvedTags.length > 0 ? (
              <div className="edit-cat-chips">
                {resolvedTags.map((t) => (
                  <span key={t} className="edit-cat-chip">{INTEREST_LABELS[t]}</span>
                ))}
              </div>
            ) : (
              <span className="form-help" style={{ margin: 0 }}>No categories yet</span>
            )}
            <button
              type="button"
              className="btn-link"
              onClick={() => setCategoriesOpen((v) => !v)}
            >
              {categoriesOpen ? "Done" : "Edit"}
            </button>
          </div>
          {categoriesOpen && (
            <div className="vibe-grid" style={{ marginTop: 10 }}>
              {VIBE_OPTIONS.map((opt) => {
                const selected = form.vibes.includes(opt.id);
                const { Icon, iconColor, tint } = interestVisual(opt.tag);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`vibe-tile ${selected ? "is-selected" : ""}`}
                    onClick={() => toggleVibe(opt.id)}
                    aria-pressed={selected}
                  >
                    {selected && <span className="vibe-tile-dot" aria-hidden="true" />}
                    <span
                      className="vibe-tile-icon"
                      style={{ background: tint, color: iconColor }}
                      aria-hidden="true"
                    >
                      <Icon size={18} strokeWidth={1.8} />
                    </span>
                    <span className="vibe-tile-label">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          <label className="form-question" htmlFor="title">Title</label>
          <input
            id="title"
            value={form.title}
            onChange={(e) => {
              lastInstantGroup.current = "basics";
              setForm((f) => ({ ...f, title: e.target.value }));
            }}
          />
          <label className="form-question" htmlFor="description">Details</label>
          <textarea
            id="description"
            value={form.description}
            onChange={(e) => {
              lastInstantGroup.current = "basics";
              setForm((f) => ({ ...f, description: e.target.value }));
            }}
          />
        </section>

        <section className="edit-section">
          <SectionHead id="edit-when" label="Where & when" saved={savedFlash?.section === "where"} />
          <label className="form-question" htmlFor="neighborhood">Neighborhood</label>
          <select
            id="neighborhood"
            value={form.neighborhoodId}
            onChange={(e) => {
              lastInstantGroup.current = "where";
              setForm((f) => ({ ...f, neighborhoodId: e.target.value }));
            }}
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
              onChange={(e) => {
                lastInstantGroup.current = "where";
                setForm((f) => ({ ...f, isFlexibleLocation: e.target.checked }));
              }}
            />
            Flexible location
          </label>

          <div className="edit-proposal">
            <p className="edit-proposal-note">
              Changes here go through a proposal, not an instant save.
            </p>
            <p className="edit-proposal-current">
              Current: {formatPlanDate(plan.date)} · {formatPlanTime(plan.time, plan.isFlexibleTime)}
            </p>
            {plan.pendingTimeProposal ? (
              <div className="coordination-banner coordination-banner--expanded" role="note">
                <p>
                  Pending update:{" "}
                  <strong>
                    {formatPlanDate(plan.pendingTimeProposal.date)} ·{" "}
                    {formatPlanTime(plan.pendingTimeProposal.time, plan.pendingTimeProposal.isFlexibleTime)}
                  </strong>
                  . People have been notified — apply when you&apos;re ready.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={proposeBusy}
                    onClick={() => void applyProposal()}
                  >
                    {proposeBusy ? "Working…" : "Apply new time"}
                  </button>
                  <button
                    type="button"
                    className="btn-link"
                    disabled={proposeBusy}
                    onClick={() => void cancelProposal()}
                  >
                    Keep current time
                  </button>
                </div>
                {proposeErr && <p className="error-text">{proposeErr}</p>}
              </div>
            ) : (
              <>
                <div className="luma-card">
                  <div className="luma-row">
                    <span className="luma-label">Date</span>
                    <div className="luma-value">
                      <input
                        id="propose-date"
                        type="date"
                        className="luma-input"
                        value={proposeDate}
                        onChange={(e) => setProposeDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="luma-row">
                    <span className="luma-label">Time</span>
                    <div className="luma-value">
                      {!proposeFlexTime ? (
                        <input
                          id="propose-time"
                          type="time"
                          className="luma-input"
                          value={proposeTime}
                          onChange={(e) => setProposeTime(e.target.value)}
                        />
                      ) : (
                        <span className="luma-flex-text">Flexible time</span>
                      )}
                      <button
                        type="button"
                        className={`flex-toggle-btn ${proposeFlexTime ? "is-active" : ""}`}
                        aria-pressed={proposeFlexTime}
                        onClick={() => setProposeFlexTime((v) => !v)}
                      >
                        Flexible
                      </button>
                    </div>
                  </div>
                </div>
                {proposeErr && <p className="error-text">{proposeErr}</p>}
                <button
                  type="button"
                  className="btn-primary btn-block"
                  disabled={proposeBusy || timeUnchanged}
                  onClick={() => void proposeChange()}
                >
                  {proposeBusy ? "Updating…" : "Propose change"}
                </button>
              </>
            )}
          </div>
        </section>

        <section className="edit-section">
          <SectionHead id="edit-invited" label="Who's invited" saved={savedFlash?.section === "who"} />
          <label className="form-question">Who can see this?</label>
          <div className="visibility-options">
            <button
              type="button"
              className={`visibility-option ${form.visibility === "everyone" ? "is-active" : ""}`}
              onClick={() => {
                lastInstantGroup.current = "who";
                setForm((f) => ({ ...f, visibility: "everyone" }));
              }}
            >
              <span className="visibility-option-title">Everyone on COMMONS</span>
            </button>
            <button
              type="button"
              className={`visibility-option ${form.visibility === "network" ? "is-active" : ""}`}
              onClick={() => {
                lastInstantGroup.current = "who";
                setForm((f) => ({ ...f, visibility: "network" as PlanVisibility }));
              }}
            >
              <span className="visibility-option-title">Your Network</span>
            </button>
          </div>
          <div className="form-row-flex" style={{ marginTop: 12 }}>
            <div className="form-row-flex-main">
              <label className="form-question">Cap the spots</label>
              {form.capacityOn && (
                <NumberPicker
                  value={Number(form.capacity) || 0}
                  onChange={(n) => {
                    lastInstantGroup.current = "who";
                    setForm((f) => ({ ...f, capacity: String(n) }));
                  }}
                  ariaLabel="Number of spots"
                />
              )}
            </div>
            <button
              type="button"
              className={`flex-toggle-btn ${form.capacityOn ? "is-active" : ""}`}
              onClick={() => {
                lastInstantGroup.current = "who";
                setForm((f) => ({ ...f, capacityOn: !f.capacityOn }));
              }}
              aria-pressed={form.capacityOn}
              title="Set limit"
            >
              <span>Set limit</span>
            </button>
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
                  onClick={() => {
                    lastInstantGroup.current = "who";
                    setForm((f) => ({ ...f, joinType: "open" as JoinType }));
                  }}
                >
                  First come
                </button>
                <button
                  type="button"
                  className={form.joinType === "approve" ? "is-active" : ""}
                  onClick={() => {
                    lastInstantGroup.current = "who";
                    setForm((f) => ({ ...f, joinType: "approve" as JoinType }));
                  }}
                >
                  Approve
                </button>
              </div>
            </>
          )}
        </section>

        <section className="edit-section">
          <SectionHead id="edit-cover" label="Cover photo" saved={savedFlash?.section === "cover"} />
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
              >Upload photo</button>
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
          {submitErr && <p className="error-text">{submitErr}</p>}
          <button
            type="button"
            className="btn-secondary btn-block"
            style={{ marginTop: 12 }}
            disabled={saving}
            onClick={() => void saveCover()}
          >
            {saving ? "Saving…" : "Save cover photo"}
          </button>
        </section>
      </div>

      <section className="edit-plan-actions" aria-label="Plan actions">
        <h2 className="edit-section-label">Plan actions</h2>
        <p className="form-help" style={{ marginTop: 0 }}>
          These aren&apos;t edits — they change who hosts or whether the plan stays on.
        </p>
        {!plan.upForGrabsAt && !plan.cancelledAt && (
          <PutUpForGrabsControl
            plan={plan}
            onDone={() => navigate(`/plans/${plan.id}`)}
          />
        )}
        {!plan.cancelledAt && (
          <CancelPlanControl
            plan={plan}
            onDone={() => navigate(`/plans/${plan.id}`)}
          />
        )}
        <PassItOnControl
          plan={plan}
          onTransferred={() => navigate(`/plans/${plan.id}`)}
        />
      </section>
    </main>
  );
}

function SectionHead({ id, label, saved }: { id: string; label: string; saved: boolean }) {
  return (
    <h2 id={id} className="edit-section-label">
      {label}
      {saved && (
        <span className="edit-section-saved" role="status">
          <Check size={12} strokeWidth={2.4} aria-hidden="true" />
          Saved
        </span>
      )}
    </h2>
  );
}

function PutUpForGrabsControl({
  plan,
  onDone,
}: {
  plan: PlanDTO;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmPutUpForGrabs() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/plans/${plan.id}/up-for-grabs`, { method: "POST" });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't put this plan up for grabs.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="edit-plan-grabs-btn"
        onClick={() => setOpen(true)}
      >
        <Hand size={14} strokeWidth={1.8} aria-hidden="true" />
        Can&apos;t make it — put up for grabs
      </button>
    );
  }

  return (
    <div className="plan-grabs-confirm" style={{ marginTop: 16 }} role="group">
      <p className="plan-grabs-confirm-copy">
        Put &ldquo;{plan.title}&rdquo; up for grabs? Anyone who&rsquo;s in can take over hosting
        instead of cancelling.
      </p>
      {error && <p className="luma-inline-error">{error}</p>}
      <div className="plan-grabs-confirm-actions">
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setError(null);
          }}
        >
          Keep hosting
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void confirmPutUpForGrabs();
          }}
        >
          {busy ? "Saving…" : "Put up for grabs"}
        </button>
      </div>
    </div>
  );
}

function CancelPlanControl({
  plan,
  onDone,
}: {
  plan: PlanDTO;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmCancel() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/plans/${plan.id}/cancel`, { method: "POST" });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel this plan.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="edit-plan-cancel-btn"
        onClick={() => setOpen(true)}
      >
        <Ban size={14} strokeWidth={1.8} aria-hidden="true" />
        Cancel plan
      </button>
    );
  }

  return (
    <div className="plan-grabs-confirm" style={{ marginTop: 16 }} role="group">
      <p className="plan-grabs-confirm-copy">
        Cancel &ldquo;{plan.title}&rdquo;? Everyone who RSVP&apos;d will be notified.
      </p>
      {error && <p className="luma-inline-error">{error}</p>}
      <div className="plan-grabs-confirm-actions">
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Keep plan
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => void confirmCancel()}
          style={{ background: "var(--danger)" }}
        >
          {busy ? "Cancelling…" : "Cancel plan"}
        </button>
      </div>
    </div>
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
  const [pending, setPending] = useState<PublicUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (candidates.length === 0) return null;

  async function handOff(c: PublicUser) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/plans/${plan.id}/transfer-host`, {
        method: "POST",
        body: JSON.stringify({ newHostId: c.id }),
      });
      setPending(null);
      setOpen(false);
      onTransferred();
    } catch (e) {
      setError(parseApiError(e));
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <div className="plan-grabs-confirm" role="group">
        <p className="plan-grabs-confirm-copy">
          Hand off hosting of &ldquo;{plan.title}&rdquo; to {pending.firstName}? You&apos;ll drop off the going list.
        </p>
        {error && <p className="luma-inline-error">{error}</p>}
        <div className="plan-grabs-confirm-actions">
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => setPending(null)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void handOff(pending)}>
            {busy ? "Handing off…" : `Hand off to ${pending.firstName}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="form-help" style={{ marginTop: 0 }}>
        Transfer hosting to someone who&apos;s going.
      </p>
      {!open ? (
        <button
          type="button"
          className="btn-secondary btn-block"
          onClick={() => setOpen(true)}
        >
          Transfer hosting
        </button>
      ) : (
        <div className="plan-transfer-picker-list" style={{ marginTop: 8 }}>
          {candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              className="plan-transfer-pick"
              disabled={busy}
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
      )}
    </div>
  );
}
