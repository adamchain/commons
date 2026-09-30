import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, parseApiError } from "../api/http";
import { invalidateCardImages } from "../lib/cardImages";
import {
  ALL_COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LABELS,
  INTEREST_LABELS,
} from "../types/shared";
import "./Admin.css";

type CardImage = {
  id: string;
  url: string;
  label?: string;
  category?: string;
  sortOrder: number;
  createdAt: string;
};

type CoverCatalogImage = {
  url: string;
  label: string;
  category: string;
  libraryId?: string | null;
};

type CoverCatalogCategory = { id: string; label: string; images: CoverCatalogImage[] };

const COVER_CATEGORY_OPTIONS = [...new Set([...Object.values(INTEREST_LABELS), "Other", "Library"])];

/** Sets the image src only once the tile is near the viewport. */
function LazyCardImage({ src, alt }: { src: string; alt: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || active) return;
    if (typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);

  return (
    <div ref={frameRef} className="admin-cardimg-frame">
      {active ? <img src={src} alt={alt} title={alt} decoding="async" /> : null}
    </div>
  );
}

/**
 * Event-card image library — admins add/remove the cover art used on plan
 * cards (for plans without their own flyer) without touching the codebase.
 */
export function CardImagesManager() {
  const [catalog, setCatalog] = useState<CoverCatalogCategory[] | null>(null);
  const [gcsConfigured, setGcsConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("Other");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{
        images: CardImage[];
        catalog?: CoverCatalogCategory[];
        gcsConfigured?: boolean;
      }>("/api/admin/card-images");
      setCatalog(r.catalog ?? []);
      setGcsConfigured(r.gcsConfigured !== false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load images");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allImages = useMemo(() => catalog?.flatMap((c) => c.images) ?? [], [catalog]);
  const visible = useMemo(() => {
    if (filter === "all") return allImages;
    return allImages.filter((img) => img.category === filter || catalog?.find((c) => c.id === filter)?.label === img.category);
  }, [allImages, catalog, filter]);

  const categoryChoices = useMemo(() => {
    const extra = (catalog ?? []).map((c) => c.label);
    return [...new Set([...COVER_CATEGORY_OPTIONS, ...extra])];
  }, [catalog]);

  const submit = useCallback(
    async (payload: { url: string; label?: string; category?: string }) => {
      setBusy(true);
      setError(null);
      try {
        await api<{ image: CardImage }>("/api/admin/card-images", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setUrl("");
        setLabel("");
        if (fileRef.current) fileRef.current.value = "";
        await load();
        invalidateCardImages();
      } catch (e) {
        setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Could not add image");
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  async function addByUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;
    await submit({ url: trimmed, label: label.trim() || undefined, category });
  }

  async function addByFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      await api<{ image: CardImage }>("/api/admin/card-images/upload", {
        method: "POST",
        body: JSON.stringify({ dataUrl, label: label.trim() || file.name, category }),
      });
      setLabel("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
      invalidateCardImages();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Could not upload image");
    } finally {
      setBusy(false);
    }
  }

  async function seedDefaults() {
    setBusy(true);
    setError(null);
    try {
      await api<{ added: number }>("/api/admin/card-images/seed-defaults", { method: "POST" });
      await load();
      invalidateCardImages();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Could not load defaults");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api(`/api/admin/card-images/${id}`, { method: "DELETE" });
      await load();
      invalidateCardImages();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove image");
    } finally {
      setBusy(false);
    }
  }

  async function setImageCategory(img: CoverCatalogImage, next: string) {
    if (next === img.category) return;
    setBusy(true);
    setError(null);
    try {
      if (img.libraryId) {
        await api(`/api/admin/card-images/${img.libraryId}`, {
          method: "PATCH",
          body: JSON.stringify({ category: next }),
        });
      } else {
        await api<{ image: CardImage }>("/api/admin/card-images", {
          method: "POST",
          body: JSON.stringify({ url: img.url, label: img.label, category: next }),
        });
      }
      await load();
      invalidateCardImages();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Could not update category");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-section">
      <h2 className="admin-section-title">Event card images</h2>
      <div className="admin-card">
        <p className="admin-muted" style={{ margin: "0 0 0.85rem" }}>
          Cover art shown on event cards for plans without their own flyer. Add an image URL or
          upload a file{gcsConfigured ? " (uploads go to cloud storage)" : ""}; changes go live for
          everyone right away.
          {!gcsConfigured ? (
            <>
              {" "}
              <strong>Cloud storage isn't configured</strong> — uploads are stored inline (set{" "}
              <code>GCS_BUCKET</code> to enable GCS).
            </>
          ) : null}
        </p>

        <div className="admin-cardimg-form">
          <input
            className="admin-search"
            style={{ margin: 0, flex: "2 1 240px" }}
            placeholder="Image URL (https://…)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addByUrl();
            }}
          />
          <input
            className="admin-search"
            style={{ margin: 0, flex: "1 1 140px" }}
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <select
            className="admin-search"
            style={{ margin: 0, flex: "1 1 140px" }}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
          >
            {categoryChoices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button type="button" className="admin-btn" onClick={() => void addByUrl()} disabled={busy || !url.trim()}>
            Add URL
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            Upload…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void addByFile(f);
            }}
          />
        </div>

        {error ? (
          <p className="admin-err" style={{ margin: "0.75rem 0 0" }}>
            {error}
          </p>
        ) : null}

        {catalog === null ? (
          <p className="admin-muted" style={{ marginTop: "0.85rem" }}>
            Loading…
          </p>
        ) : allImages.length === 0 ? (
          <div style={{ marginTop: "0.85rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
            <p className="admin-muted" style={{ margin: 0 }}>
              No images yet — the app falls back to its built-in stand-ins until you add some.
            </p>
            <button type="button" className="admin-btn" onClick={() => void seedDefaults()} disabled={busy}>
              {gcsConfigured ? "Load standard library from storage" : "Load default images"}
            </button>
          </div>
        ) : (
          <>
            <div className="admin-chip-list" style={{ marginTop: "0.85rem" }}>
              <button
                type="button"
                className={`admin-chip admin-chip-btn ${filter === "all" ? "is-on" : ""}`}
                onClick={() => setFilter("all")}
              >
                All <strong>{allImages.length}</strong>
              </button>
              {(catalog ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`admin-chip admin-chip-btn ${filter === c.label ? "is-on" : ""}`}
                  onClick={() => setFilter(c.label)}
                >
                  {c.label} <strong>{c.images.length}</strong>
                </button>
              ))}
            </div>
            <div className="admin-cardimg-grid">
              {visible.map((img) => (
                <figure key={`${img.libraryId ?? "gcs"}:${img.url}`} className="admin-cardimg">
                  <LazyCardImage src={img.url} alt={img.label || "Card image"} />
                  <figcaption className="admin-cardimg-cap">
                    <select
                      className="admin-cardimg-cat"
                      value={categoryChoices.includes(img.category) ? img.category : img.category}
                      disabled={busy}
                      aria-label={`Category for ${img.label}`}
                      onChange={(e) => void setImageCategory(img, e.target.value)}
                    >
                      {categoryChoices.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      {!categoryChoices.includes(img.category) ? (
                        <option value={img.category}>{img.category}</option>
                      ) : null}
                    </select>
                  </figcaption>
                  {img.libraryId ? (
                    <button
                      type="button"
                      className="admin-cardimg-del"
                      onClick={() => void remove(img.libraryId as string)}
                      disabled={busy}
                      aria-label="Remove image"
                      title="Remove"
                    >
                      ✕
                    </button>
                  ) : null}
                </figure>
              ))}
            </div>
            {gcsConfigured ? (
              <p style={{ margin: "0.85rem 0 0" }}>
                <button type="button" className="admin-btn admin-btn--ghost" onClick={() => void seedDefaults()} disabled={busy}>
                  Sync storage library into admin list
                </button>
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

/** Downscale + re-encode an uploaded image so the stored data URL stays small. */
function fileToDataUrl(file: File, maxW = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load image"));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unsupported"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

type AdminUserDetail = {
  user: {
    id: string;
    firstName: string;
    lastName: string | null;
    phoneNumber: string;
    neighborhoodNames: string[];
    interests: string[];
    accountSource: string;
    onboardingComplete: boolean;
    createdAt: string;
    networkSize: number;
    guidelinesAcknowledgedAt: string | null;
    socialLinks: { instagram?: string } | null;
  };
  activity: {
    hostedCount: number;
    rsvpCount: number;
    goingCount: number;
    interestedCount: number;
    messagesCount: number;
    hosted: { id: string; title: string; date: string; cancelled: boolean; goingCount: number }[];
    participations: { planId: string; title: string; date: string; state: string }[];
  };
  behavior: {
    segment: string;
    flags: string[];
    lastActiveAt: string | null;
    daysSinceActive: number | null;
    feedUpcoming: number;
    feedMatchingInterests: number;
    suggestions: string[];
  };
};

const SEGMENT_LABELS: Record<string, string> = {
  stuck_onboarding: "Stuck onboarding",
  never_activated: "Never RSVP’d",
  early_falloff: "Early falloff",
  dormant: "Dormant",
  churn_risk: "Churn risk",
  slow_feed: "Slow feed",
  ghosting: "Ghosting",
  isolated: "Isolated",
  lonely_host: "Lonely host",
  feed_fatigue: "Feed fatigue",
  healthy: "Healthy",
  ejected: "Ejected",
};

/** Admin drill-down: a user's full profile details + activity. */
export function AdminUserDetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<AdminUserDetail>(`/api/admin/users/${userId}`)
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load"));
    return () => {
      active = false;
    };
  }, [userId]);

  const interestLabel = (t: string) => (INTEREST_LABELS as Record<string, string>)[t] ?? t;

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-head">
          <h2 className="admin-section-title" style={{ margin: 0 }}>User detail</h2>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {error ? (
          <p className="admin-err">{error}</p>
        ) : !data ? (
          <p className="admin-muted">Loading…</p>
        ) : (
          <>
            <div className="admin-user-head">
              <div>
                <div className="admin-user-name">
                  {data.user.firstName || "—"} {data.user.lastName ?? ""}
                </div>
                <div className="admin-muted">{data.user.phoneNumber}</div>
              </div>
              <Link className="admin-link" to={`/profile/${data.user.id}`}>
                View in app →
              </Link>
            </div>

            <div className="admin-kpis" style={{ marginTop: "0.75rem" }}>
              {[
                ["Hosted", data.activity.hostedCount],
                ["RSVPs", data.activity.rsvpCount],
                ["Going", data.activity.goingCount],
                ["Interested", data.activity.interestedCount],
                ["Messages", data.activity.messagesCount],
                ["Network", data.user.networkSize],
              ].map(([label, value]) => (
                <div key={label} className="admin-kpi">
                  <div className="admin-kpi-label">{label}</div>
                  <div className="admin-kpi-value">{value}</div>
                </div>
              ))}
            </div>

            <dl className="admin-user-meta">
              <div>
                <dt>Neighborhood</dt>
                <dd>{data.user.neighborhoodNames.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>Interests</dt>
                <dd>{data.user.interests.map(interestLabel).join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>Joined</dt>
                <dd>{new Date(data.user.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Onboarded</dt>
                <dd>{data.user.onboardingComplete ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{data.user.accountSource}</dd>
              </div>
              <div>
                <dt>Guidelines</dt>
                <dd>
                  {data.user.guidelinesAcknowledgedAt
                    ? new Date(data.user.guidelinesAcknowledgedAt).toLocaleDateString()
                    : "—"}
                </dd>
              </div>
              {data.user.socialLinks?.instagram ? (
                <div>
                  <dt>Instagram</dt>
                  <dd>@{data.user.socialLinks.instagram}</dd>
                </div>
              ) : null}
            </dl>

            {data.behavior ? (
              <div className="admin-card" style={{ marginBottom: "1rem" }}>
                <h3 className="admin-section-title" style={{ marginBottom: "0.4rem" }}>
                  Behavior
                </h3>
                <p style={{ margin: "0 0 0.5rem" }}>
                  <span className="admin-pill admin-pill--wait">
                    {SEGMENT_LABELS[data.behavior.segment] ?? data.behavior.segment}
                  </span>{" "}
                  <span className="admin-muted">
                    {data.behavior.feedUpcoming} upcoming in feed · {data.behavior.feedMatchingInterests}{" "}
                    match interests
                    {data.behavior.daysSinceActive != null
                      ? ` · last active ${data.behavior.daysSinceActive}d ago`
                      : ""}
                  </span>
                </p>
                {data.behavior.suggestions.length > 0 ? (
                  <ul className="admin-suggest-actions" style={{ margin: 0 }}>
                    {data.behavior.suggestions.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-muted" style={{ margin: 0 }}>
                    No intervention flagged.
                  </p>
                )}
              </div>
            ) : null}

            <h3 className="admin-section-title" style={{ marginBottom: "0.4rem" }}>
              Hosted · {data.activity.hosted.length}
            </h3>
            {data.activity.hosted.length === 0 ? (
              <p className="admin-muted">No plans hosted.</p>
            ) : (
              <ul className="admin-log-list">
                {data.activity.hosted.map((p) => (
                  <li key={p.id}>
                    <Link to={`/plans/${p.id}`} className="admin-link">
                      {p.title}
                    </Link>
                    <span className="admin-muted" style={{ marginLeft: "auto" }}>
                      {new Date(p.date).toLocaleDateString()} · {p.goingCount} going
                      {p.cancelled ? " · cancelled" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="admin-section-title" style={{ marginBottom: "0.4rem" }}>
              Attending / interested · {data.activity.participations.length}
            </h3>
            {data.activity.participations.length === 0 ? (
              <p className="admin-muted">No RSVPs to others' plans.</p>
            ) : (
              <ul className="admin-log-list">
                {data.activity.participations.map((p) => (
                  <li key={p.planId}>
                    <Link to={`/plans/${p.planId}`} className="admin-link">
                      {p.title}
                    </Link>
                    <span className="admin-muted" style={{ marginLeft: "auto" }}>
                      {new Date(p.date).toLocaleDateString()} · {p.state}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface AdminReportRow {
  id: string;
  reason: string;
  reasonLabel: string;
  details: string;
  status: "open" | "reviewed";
  createdAt: string;
  reviewedAt: string | null;
  source?: "report" | "block";
  contentKind?: string | null;
  reporter: { id: string; firstName: string; lastName: string };
  target: { id: string; firstName: string; lastName: string };
  plan: { id: string; title: string } | null;
}

export function ReportsReview() {
  const [rows, setRows] = useState<AdminReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ reports: AdminReportRow[] }>("/api/admin/reports");
      setRows(r.reports);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markReviewed(id: string) {
    setBusyId(id);
    try {
      await api(`/api/admin/reports/${id}/review`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Couldn't update");
    } finally {
      setBusyId(null);
    }
  }

  async function ejectFromReport(id: string) {
    if (!window.confirm("Remove this content and eject the user? They will not be able to sign in.")) return;
    setBusyId(id);
    try {
      await api(`/api/admin/reports/${id}/eject`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Couldn't eject");
    } finally {
      setBusyId(null);
    }
  }

  const openCount = rows?.filter((r) => r.status === "open").length ?? 0;

  return (
    <section className="admin-section" id="safety-reports">
      <h2 className="admin-section-title">
        Safety reports{rows ? ` · ${openCount} open` : ""}
      </h2>
      <p style={{ fontSize: 13, opacity: 0.75, margin: "0 0 12px" }}>
        Act on substantiated reports within 24 hours: remove the content and eject the user.
      </p>
      <div className="admin-card">
        {error && <p className="error-text">{error}</p>}
        {!rows ? (
          <p>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ opacity: 0.7, margin: 0 }}>No reports yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {rows.map((r) => (
              <div
                key={r.id}
                style={{
                  border: "1px solid rgba(0,0,0,0.1)",
                  borderRadius: 12,
                  padding: "0.75rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.3rem",
                  opacity: r.status === "reviewed" ? 0.65 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <strong>{r.reasonLabel}</strong>
                  <span style={{ fontSize: 12, opacity: 0.6 }}>
                    {r.source === "block" ? "Block · " : ""}
                    {r.status === "open" ? "Open" : "Reviewed"} ·{" "}
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: 13 }}>
                  <Link to={`/profile/${r.target.id}`} className="admin-link">
                    {r.target.firstName} {r.target.lastName}
                  </Link>{" "}
                  reported by {r.reporter.firstName} {r.reporter.lastName}
                  {r.plan ? (
                    <>
                      {" "}
                      on{" "}
                      <Link to={`/plans/${r.plan.id}`} className="admin-link">
                        {r.plan.title}
                      </Link>
                    </>
                  ) : null}
                </div>
                {r.details ? (
                  <div style={{ fontSize: 13, opacity: 0.85, whiteSpace: "pre-wrap" }}>{r.details}</div>
                ) : null}
                {r.status === "open" && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="admin-btn"
                      disabled={busyId === r.id}
                      onClick={() => void ejectFromReport(r.id)}
                    >
                      {busyId === r.id ? "Saving…" : "Remove content & eject"}
                    </button>
                    <button
                      type="button"
                      className="admin-btn"
                      disabled={busyId === r.id}
                      onClick={() => void markReviewed(r.id)}
                    >
                      Dismiss (no violation)
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

interface AdminCommunityRow {
  id: string;
  name: string;
  description: string;
  category: string;
  organizer: { id: string; firstName: string; lastName: string };
  memberCount: number;
  isFounding: boolean;
  hiddenAt: string | null;
  submittedAt: string;
  creationStatus: "pending" | "approved" | "rejected";
}

export function FoundingCommunityControls({
  id,
  name,
  hidden,
  hideClassName = "btn",
  deleteClassName = "btn",
  onDone,
}: {
  id: string;
  name: string;
  hidden: boolean;
  hideClassName?: string;
  deleteClassName?: string;
  onDone: (action: "hide" | "show" | "delete") => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(path: string, method: string, action: "hide" | "show" | "delete") {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method });
      await onDone(action);
    } catch (e) {
      setError(parseApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
      <button
        type="button"
        className={hideClassName}
        disabled={busy}
        onClick={() => void run(`/api/admin/communities/${id}/${hidden ? "show" : "hide"}`, "POST", hidden ? "show" : "hide")}
      >
        {busy ? "Saving…" : hidden ? "Show" : "Hide"}
      </button>
      <button
        type="button"
        className={deleteClassName}
        disabled={busy}
        onClick={() => {
          const ok = window.confirm(
            `Delete "${name}"? This removes the community, its members, chat, and bulletin, and cancels its plans. Hide it if you might want it back.`,
          );
          if (!ok) return;
          void run(`/api/admin/communities/${id}`, "DELETE", "delete");
        }}
      >
        Delete
      </button>
      {error ? <span className="error-text" style={{ fontSize: 12 }}>{error}</span> : null}
    </div>
  );
}

// Pending-communities review queue + Founding Community creation.
export function CommunitiesReview({ onChanged }: { onChanged?: () => void | Promise<void> }) {
  const [rows, setRows] = useState<AdminCommunityRow[] | null>(null);
  const [foundingRows, setFoundingRows] = useState<AdminCommunityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [founding, setFounding] = useState({ name: "", description: "", category: "events", organizer: "" });
  const [foundingBusy, setFoundingBusy] = useState(false);
  const [foundingMsg, setFoundingMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pending, foundingList] = await Promise.all([
        api<{ communities: AdminCommunityRow[] }>("/api/admin/communities?status=pending"),
        api<{ communities: AdminCommunityRow[] }>("/api/admin/communities?status=founding"),
      ]);
      setRows(pending.communities);
      setFoundingRows(foundingList.communities);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      const body =
        action === "reject"
          ? JSON.stringify({ note: window.prompt("Optional note to the creator:") ?? "" })
          : undefined;
      await api(`/api/admin/communities/${id}/${action}`, { method: "POST", body });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function createFounding() {
    if (!founding.name.trim() || !founding.description.trim() || !founding.organizer.trim()) {
      setFoundingMsg("Name, description, and organizer are required.");
      return;
    }
    setFoundingBusy(true);
    setFoundingMsg(null);
    try {
      await api("/api/admin/communities/founding", {
        method: "POST",
        body: JSON.stringify(founding),
      });
      setFounding({ name: "", description: "", category: "events", organizer: "" });
      setFoundingMsg("Founding community created and approved.");
      await load();
      await onChanged?.();
    } catch (e) {
      setFoundingMsg(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Could not create");
    } finally {
      setFoundingBusy(false);
    }
  }

  return (
    <section className="admin-section" id="communities-review">
      <h2 className="admin-section-title">Pending communities</h2>
      <div className="admin-card">
        {error && <p className="error-text">{error}</p>}
        {!rows ? (
          <p>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ opacity: 0.7, margin: 0 }}>No communities awaiting review. 🎉</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {rows.map((c) => (
              <div
                key={c.id}
                style={{
                  border: "1px solid rgba(0,0,0,0.1)",
                  borderRadius: 12,
                  padding: "0.75rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <strong>{c.name}</strong>
                  <span style={{ fontSize: 12, opacity: 0.6 }}>{c.category}</span>
                </div>
                <div style={{ fontSize: 13, opacity: 0.85 }}>{c.description}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  by {c.organizer.firstName} {c.organizer.lastName} · submitted{" "}
                  {new Date(c.submittedAt).toLocaleDateString()}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busyId === c.id}
                    onClick={() => void decide(c.id, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busyId === c.id}
                    onClick={() => void decide(c.id, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <h3 className="admin-section-title" style={{ marginTop: "1.25rem", marginBottom: "0.5rem" }}>
          Founding communities
        </h3>
        <p style={{ fontSize: 13, opacity: 0.7, margin: "0 0 0.75rem" }}>
          Hide takes a community off Explore, search, and messages. Show brings it back with members intact. Delete removes it and cancels its plans.
        </p>
        {!foundingRows ? (
          <p>Loading…</p>
        ) : foundingRows.length === 0 ? (
          <p style={{ opacity: 0.7, margin: 0 }}>No founding communities yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {foundingRows.map((c) => (
              <div
                key={c.id}
                style={{
                  border: "1px solid rgba(0,0,0,0.1)",
                  borderRadius: 12,
                  padding: "0.75rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                  opacity: c.hiddenAt ? 0.72 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <strong>
                    {c.name}
                    {c.hiddenAt ? <span style={{ fontWeight: 500, opacity: 0.7 }}> · Hidden</span> : null}
                  </strong>
                  <span style={{ fontSize: 12, opacity: 0.6 }}>{c.memberCount} members</span>
                </div>
                <div style={{ fontSize: 13, opacity: 0.85 }}>{c.description}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  by {c.organizer.firstName} {c.organizer.lastName}
                </div>
                <FoundingCommunityControls
                  id={c.id}
                  name={c.name}
                  hidden={Boolean(c.hiddenAt)}
                  onDone={async () => {
                    await load();
                    await onChanged?.();
                  }}
                />
              </div>
            ))}
          </div>
        )}

        <h3 className="admin-section-title" style={{ marginTop: "1.25rem", marginBottom: "0.5rem" }}>
          Create Founding Community
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <input
            placeholder="Name"
            value={founding.name}
            onChange={(e) => setFounding((f) => ({ ...f, name: e.target.value }))}
          />
          <textarea
            placeholder="Description"
            value={founding.description}
            onChange={(e) => setFounding((f) => ({ ...f, description: e.target.value }))}
            rows={2}
          />
          <select
            value={founding.category}
            onChange={(e) => setFounding((f) => ({ ...f, category: e.target.value }))}
          >
            {ALL_COMMUNITY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {COMMUNITY_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <input
            placeholder="Organizer user id or E.164 phone"
            value={founding.organizer}
            onChange={(e) => setFounding((f) => ({ ...f, organizer: e.target.value }))}
          />
          <button type="button" className="btn btn-primary" disabled={foundingBusy} onClick={() => void createFounding()}>
            {foundingBusy ? "Creating…" : "Create + approve"}
          </button>
          {foundingMsg && <p style={{ fontSize: 13, margin: 0 }}>{foundingMsg}</p>}
        </div>
      </div>
    </section>
  );
}

interface ReviewItem {
  id: string;
  href: string | null;
  title: string;
  meta: string;
  at: string;
}

export function ReviewInbox() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [communities, reports, posts] = await Promise.all([
        api<{
          communities: Array<{
            id: string;
            name: string;
            organizer: { firstName: string; lastName: string };
            submittedAt: string;
          }>;
        }>("/api/admin/communities?status=pending"),
        api<{ reports: AdminReportRow[] }>("/api/admin/reports"),
        api<{
          posts: Array<{
            id: string;
            content: string;
            sponsorName: string | null;
            interestTag: string;
            createdAt: string;
          }>;
        }>("/api/admin/forums/pending-posts"),
      ]);
      const rows: ReviewItem[] = [
        ...communities.communities.map((c) => ({
          id: `community-${c.id}`,
          href: "#communities-review",
          title: `${c.name} is waiting for review`,
          meta: `Community · ${c.organizer.firstName} ${c.organizer.lastName}`.trim(),
          at: c.submittedAt,
        })),
        ...reports.reports
          .filter((r) => r.status === "open")
          .map((r) => ({
            id: `report-${r.id}`,
            href: "#safety-reports",
            title: `${r.reasonLabel} · ${r.target.firstName} ${r.target.lastName}`.trim(),
            meta: `Safety report · ${r.reporter.firstName}`,
            at: r.createdAt,
          })),
        ...posts.posts.map((p) => ({
          id: `post-${p.id}`,
          href: null,
          title: p.content.trim().slice(0, 120) || "Sponsored post",
          meta: `Forum post · ${p.sponsorName || p.interestTag}`,
          at: p.createdAt,
        })),
      ];
      rows.sort((a, b) => b.at.localeCompare(a.at));
      setItems(rows);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="admin-section" id="review-inbox">
      <h2 className="admin-section-title">
        Needs review{items ? ` · ${items.length}` : ""}
      </h2>
      <div className="admin-card">
        {!items ? (
          <p className="admin-muted" style={{ margin: 0 }}>Loading…</p>
        ) : items.length === 0 ? (
          <p className="admin-muted" style={{ margin: 0 }}>Nothing waiting.</p>
        ) : (
          <ul className="admin-review-list">
            {items.map((item) => {
              const body = (
                <>
                  <span>
                    <strong>{item.title}</strong>
                    <span className="admin-muted admin-review-meta">{item.meta}</span>
                  </span>
                  <span className="admin-muted">{new Date(item.at).toLocaleDateString()}</span>
                </>
              );
              return (
                <li key={item.id}>
                  {item.href ? <a href={item.href}>{body}</a> : <div className="admin-review-row">{body}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
