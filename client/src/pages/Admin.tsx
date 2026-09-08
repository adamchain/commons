import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { invalidateCardImages } from "../lib/cardImages";
import {
  ALL_COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LABELS,
  INTEREST_LABELS,
  type InterestTag,
} from "../types/shared";
import "./Admin.css";

type AdminSummary = {
  generatedAt: string;
  kpis: {
    totalUsers: number;
    onboardedUsers: number;
    onboardingRatePct: number;
    seedUsers: number;
    totalPlans: number;
    uniqueHosts: number;
    avgPlansPerHost: number;
    goingRsvps: number;
    interestedRsvps: number;
    totalMessages: number;
    userMessages: number;
    groupChats: number;
    dms: number;
    planSuggestions: number;
    feedbackUp: number;
    feedbackDown: number;
    declines7d: number;
    wauProxy: number;
    usersWithRsvp: number;
  };
  ranges: {
    signups7d: number;
    signups14d: number;
    signups30d: number;
    plans7d: number;
    messages7d: number;
  };
  series14d: {
    signups: { date: string; count: number }[];
    plans: { date: string; count: number }[];
  };
  heatmap: { matrix: number[][]; max: number; label: string };
  neighborhoodsTop: { id: string; name: string; count: number }[];
  topInterests: { tag: string; count: number }[];
  recentLogs: { id: string; event: string; createdAt: string }[];
  recentUsers: {
    id: string;
    firstName: string;
    phoneNumber: string;
    neighborhoodId: string | null;
    neighborhoodName: string | null;
    onboardingComplete: boolean;
    accountSource: string;
    interestsCount: number;
    networkSize: number;
    createdAt: string;
  }[];
  userTable: {
    id: string;
    firstName: string;
    phoneNumber: string;
    neighborhoodId: string | null;
    neighborhoodName: string | null;
    onboardingComplete: boolean;
    accountSource: string;
    interests: InterestTag[];
    createdAt: string;
    plansHosted: number;
    rsvps: number;
  }[];
};

type BehaviorSeverity = "critical" | "high" | "medium" | "low";

type BehaviorSuggestion = {
  id: string;
  kind: string;
  severity: BehaviorSeverity;
  title: string;
  why: string;
  evidence: string[];
  actions: string[];
  neighborhoodName?: string;
  userIds: string[];
  sampleUsers: { id: string; firstName: string }[];
};

type FlaggedUser = {
  id: string;
  firstName: string;
  neighborhoodName: string | null;
  segment: string;
  flags: string[];
  daysSinceActive: number | null;
  feedUpcoming: number;
  feedMatchingInterests: number;
  rsvps: number;
  hosted: number;
  suggestions: string[];
};

type BehaviorReport = {
  generatedAt: string;
  brief: string;
  universe: { totalUsers: number; verifiedUsers: number; seedUsers: number };
  funnel: {
    signedUp: number;
    onboarded: number;
    fullyOnboarded: number;
    firstRsvp: number;
    firstGoing: number;
    firstHost: number;
    active7d: number;
    onboardPct: number;
    activationPct: number;
    goingPct: number;
  };
  falloff: {
    stuckOnboarding: number;
    neverActivated: number;
    earlyFalloff: number;
    churnRisk: number;
    dormant: number;
    slowFeed: number;
    ghosting: number;
    isolated: number;
  };
  feedHealth: {
    neighborhoodId: string;
    name: string;
    users: number;
    upcomingPlans: number;
    status: "barren" | "thin" | "ok" | "healthy";
  }[];
  interestGaps: { tag: string; label: string; users: number; upcomingPlans: number }[];
  cohorts: { weekStart: string; signups: number; stillActive7d: number; everRsvped: number }[];
  suggestions: BehaviorSuggestion[];
  flaggedUsers: FlaggedUser[];
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

function pillClassForSeverity(s: BehaviorSeverity): string {
  if (s === "critical") return "admin-pill admin-pill--crit";
  if (s === "high") return "admin-pill admin-pill--high";
  if (s === "medium") return "admin-pill admin-pill--wait";
  return "admin-pill admin-pill--ok";
}

function BehaviorAgentPanel({
  report,
  onSelectUser,
}: {
  report: BehaviorReport;
  onSelectUser: (id: string) => void;
}) {
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const flagged = useMemo(() => {
    if (segmentFilter === "all") return report.flaggedUsers;
    return report.flaggedUsers.filter((u) => u.segment === segmentFilter || u.flags.includes(segmentFilter));
  }, [report.flaggedUsers, segmentFilter]);

  const funnelSteps = [
    ["Signed up", report.funnel.signedUp],
    ["Onboarded", report.funnel.onboarded],
    ["First RSVP", report.funnel.firstRsvp],
    ["Going", report.funnel.firstGoing],
    ["Hosted", report.funnel.firstHost],
    ["Active 7d", report.funnel.active7d],
  ] as const;

  const falloffChips: [string, number][] = [
    ["stuck_onboarding", report.falloff.stuckOnboarding],
    ["never_activated", report.falloff.neverActivated],
    ["early_falloff", report.falloff.earlyFalloff],
    ["churn_risk", report.falloff.churnRisk],
    ["dormant", report.falloff.dormant],
    ["slow_feed", report.falloff.slowFeed],
    ["ghosting", report.falloff.ghosting],
    ["isolated", report.falloff.isolated],
  ];

  return (
    <section className="admin-section">
      <h2 className="admin-section-title">Behavior agent</h2>
      <p className="admin-brief">{report.brief}</p>
      <p className="admin-muted" style={{ margin: "0 0 0.85rem" }}>
        Rule agent over live members (excludes seed when real accounts exist). Scores slow feeds, funnel
        drop, and retention — then ranks what to do this week. Snapshot{" "}
        {new Date(report.generatedAt).toLocaleString()} · {report.universe.verifiedUsers} verified /{" "}
        {report.universe.seedUsers} seed.
      </p>

      <div className="admin-funnel">
        {funnelSteps.map(([label, value], i) => (
          <div key={label} className="admin-funnel-step">
            <div className="admin-kpi-label">{label}</div>
            <div className="admin-kpi-value">{value}</div>
            {i === 1 ? <div className="admin-kpi-hint">{report.funnel.onboardPct}% of signup</div> : null}
            {i === 2 ? <div className="admin-kpi-hint">{report.funnel.activationPct}% of finished profiles</div> : null}
            {i === 3 ? <div className="admin-kpi-hint">{report.funnel.goingPct}% of RSVPs</div> : null}
          </div>
        ))}
      </div>

      <div className="admin-chip-list" style={{ margin: "0.85rem 0 1rem" }}>
        {falloffChips.map(([key, n]) => (
          <button
            key={key}
            type="button"
            className={`admin-chip admin-chip-btn ${segmentFilter === key ? "is-on" : ""}`}
            onClick={() => setSegmentFilter(segmentFilter === key ? "all" : key)}
          >
            {SEGMENT_LABELS[key] ?? key} <strong>{n}</strong>
          </button>
        ))}
      </div>

      <div className="admin-grid-2" style={{ marginBottom: "1rem" }}>
        <div className="admin-card">
          <h3 className="admin-section-title" style={{ marginBottom: "0.5rem" }}>
            Feed health by neighborhood
          </h3>
          {report.feedHealth.length === 0 ? (
            <p className="admin-muted">No neighborhood membership yet.</p>
          ) : (
            <ul className="admin-log-list" style={{ maxHeight: 260 }}>
              {report.feedHealth.map((h) => (
                <li key={h.neighborhoodId}>
                  <span>
                    {h.name}{" "}
                    <span className={`admin-pill admin-pill--feed-${h.status}`}>{h.status}</span>
                  </span>
                  <span className="admin-muted" style={{ marginLeft: "auto" }}>
                    {h.upcomingPlans} upcoming · {h.users} members
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="admin-card">
          <h3 className="admin-section-title" style={{ marginBottom: "0.5rem" }}>
            Signup cohorts (6 weeks)
          </h3>
          <ul className="admin-log-list" style={{ maxHeight: 260 }}>
            {report.cohorts.map((c) => (
              <li key={c.weekStart}>
                <span>Week of {c.weekStart}</span>
                <span className="admin-muted" style={{ marginLeft: "auto" }}>
                  {c.signups} joined · {c.everRsvped} RSVP’d · {c.stillActive7d} active 7d
                </span>
              </li>
            ))}
          </ul>
          {report.interestGaps.length > 0 ? (
            <>
              <h3 className="admin-section-title" style={{ margin: "0.85rem 0 0.4rem" }}>
                Interest supply gaps
              </h3>
              <div className="admin-chip-list">
                {report.interestGaps.map((g) => (
                  <span key={g.tag} className="admin-chip">
                    {g.label} <strong>{g.users} people / {g.upcomingPlans} plans</strong>
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <h3 className="admin-section-title">Suggestions</h3>
      {report.suggestions.length === 0 ? (
        <p className="admin-muted">No concentrated problems in the current snapshot.</p>
      ) : (
        <div className="admin-suggest-list">
          {report.suggestions.map((s) => (
            <article key={s.id} className={`admin-suggest admin-suggest--${s.severity}`}>
              <header className="admin-suggest-head">
                <span className={pillClassForSeverity(s.severity)}>{s.severity}</span>
                <h4>{s.title}</h4>
                <span className="admin-muted">{s.userIds.length} people</span>
              </header>
              <p>{s.why}</p>
              {s.evidence.length > 0 ? (
                <ul className="admin-suggest-evidence">
                  {s.evidence.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
              <ol className="admin-suggest-actions">
                {s.actions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ol>
              {s.sampleUsers.length > 0 ? (
                <p className="admin-muted" style={{ margin: "0.5rem 0 0" }}>
                  e.g.{" "}
                  {s.sampleUsers.map((u, i) => (
                    <span key={u.id}>
                      {i > 0 ? ", " : ""}
                      <button type="button" className="admin-inline-link" onClick={() => onSelectUser(u.id)}>
                        {u.firstName}
                      </button>
                    </span>
                  ))}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <h3 className="admin-section-title" style={{ marginTop: "1.25rem" }}>
        Flagged members {segmentFilter !== "all" ? `· ${SEGMENT_LABELS[segmentFilter] ?? segmentFilter}` : ""}
      </h3>
      {flagged.length === 0 ? (
        <p className="admin-muted">Nobody in this slice.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Segment</th>
                <th>Idle</th>
                <th>Feed</th>
                <th>RSVPs</th>
                <th>Do next</th>
              </tr>
            </thead>
            <tbody>
              {flagged.map((u) => (
                <tr key={u.id} className="admin-row-clickable" onClick={() => onSelectUser(u.id)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{u.firstName}</div>
                    <div className="admin-muted" style={{ fontSize: "0.7rem" }}>
                      {u.neighborhoodName ?? "No hood"}
                    </div>
                  </td>
                  <td>
                    <span className="admin-pill admin-pill--wait">{SEGMENT_LABELS[u.segment] ?? u.segment}</span>
                  </td>
                  <td className="admin-muted">{u.daysSinceActive == null ? "—" : `${u.daysSinceActive}d`}</td>
                  <td>
                    {u.feedUpcoming} upcoming
                    <div className="admin-muted" style={{ fontSize: "0.7rem" }}>
                      {u.feedMatchingInterests} match interests
                    </div>
                  </td>
                  <td>{u.rsvps}</td>
                  <td className="admin-muted">{u.suggestions[0] ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length <= 4) return "••••";
  return `…${d.slice(-4)}`;
}

function Sparkline({ series, color }: { series: { date: string; count: number }[]; color: "accent" | "muted" }) {
  const max = Math.max(1, ...series.map((s) => s.count));
  return (
    <div className="admin-spark" title={series.map((s) => `${s.date}: ${s.count}`).join("\n")}>
      {series.map((s) => (
        <div
          key={s.date}
          className={`admin-spark-bar ${color === "accent" && s.count > 0 ? "is-accent" : ""}`}
          style={{ height: `${Math.max(8, (s.count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CardImage = { id: string; url: string; label?: string; sortOrder: number; createdAt: string };

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

/**
 * Event-card image library — admins add/remove the cover art used on plan
 * cards (for plans without their own flyer) without touching the codebase.
 */
function CardImagesManager() {
  const [images, setImages] = useState<CardImage[] | null>(null);
  const [gcsConfigured, setGcsConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ images: CardImage[]; gcsConfigured?: boolean }>("/api/admin/card-images");
      setImages(r.images);
      setGcsConfigured(r.gcsConfigured !== false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load images");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(
    async (payload: { url: string; label?: string }) => {
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
    await submit({ url: trimmed, label: label.trim() || undefined });
  }

  async function addByFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      await api<{ image: CardImage }>("/api/admin/card-images/upload", {
        method: "POST",
        body: JSON.stringify({ dataUrl, label: label.trim() || file.name }),
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

        {images === null ? (
          <p className="admin-muted" style={{ marginTop: "0.85rem" }}>
            Loading…
          </p>
        ) : images.length === 0 ? (
          <div style={{ marginTop: "0.85rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
            <p className="admin-muted" style={{ margin: 0 }}>
              No images yet — the app falls back to its built-in stand-ins until you add some.
            </p>
            <button type="button" className="admin-btn" onClick={() => void seedDefaults()} disabled={busy}>
              {gcsConfigured ? "Load standard library from storage" : "Load default images"}
            </button>
          </div>
        ) : (
          <div className="admin-cardimg-grid">
            {images.map((img) => (
              <figure key={img.id} className="admin-cardimg">
                <img src={img.url} alt={img.label ?? "Card image"} loading="lazy" />
                <figcaption className="admin-cardimg-cap">{img.label ?? "—"}</figcaption>
                <button
                  type="button"
                  className="admin-cardimg-del"
                  onClick={() => void remove(img.id)}
                  disabled={busy}
                  aria-label="Remove image"
                  title="Remove"
                >
                  ✕
                </button>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
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

/** Admin drill-down: a user's full profile details + activity. */
function AdminUserDetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
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

function ReportsReview() {
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
    <section className="admin-section">
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
  submittedAt: string;
  creationStatus: "pending" | "approved" | "rejected";
}

// Pending-communities review queue + Founding Community creation.
function CommunitiesReview() {
  const [rows, setRows] = useState<AdminCommunityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [founding, setFounding] = useState({ name: "", description: "", category: "events", organizer: "" });
  const [foundingBusy, setFoundingBusy] = useState(false);
  const [foundingMsg, setFoundingMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ communities: AdminCommunityRow[] }>("/api/admin/communities?status=pending");
      setRows(r.communities);
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
    } catch (e) {
      setFoundingMsg(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Could not create");
    } finally {
      setFoundingBusy(false);
    }
  }

  return (
    <section className="admin-section">
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

export function AdminPage() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [behavior, setBehavior] = useState<BehaviorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, agent] = await Promise.all([
        api<AdminSummary>("/api/admin/summary"),
        api<BehaviorReport>("/api/admin/behavior"),
      ]);
      setSummary(data);
      setBehavior(agent);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      if (msg.startsWith("401:")) {
        setError("Sign in with an admin phone via onboarding (Twilio Verify), then return here.");
      } else if (msg.startsWith("403:")) {
        setError("This account is not on the admin phone list.");
      } else {
        setError(msg);
      }
      setSummary(null);
      setBehavior(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredUsers = useMemo(() => {
    if (!summary) return [];
    const q = userQuery.trim().toLowerCase();
    if (!q) return summary.userTable;
    return summary.userTable.filter((u) => {
      return (
        u.id.toLowerCase().includes(q) ||
        u.firstName.toLowerCase().includes(q) ||
        u.phoneNumber.includes(q) ||
        (u.neighborhoodName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [summary, userQuery]);

  const heatLegend = useMemo(() => {
    if (!summary) return null;
    const { matrix, max } = summary.heatmap;
    return matrix.map((row, di) => (
      <div key={DOW[di]} style={{ display: "contents" }}>
        <div className="admin-heat-d">{DOW[di]}</div>
        {row.map((cell, hi) => {
          const intensity = max > 0 ? cell / max : 0;
          const alpha = 0.08 + intensity * 0.92;
          return (
            <div
              key={`${di}-${hi}`}
              className="admin-heat-cell"
              style={{ background: `rgba(255, 120, 73, ${alpha})` }}
              title={`${DOW[di]} ${hi}:00 UTC — ${cell} events`}
            />
          );
        })}
      </div>
    ));
  }, [summary]);

  return (
    <div className="admin-root">
      <div className="admin-shell">
        <header className="admin-top">
          <div>
            <h1 className="admin-title">Commons admin</h1>
            <p className="admin-sub">
              {summary
                ? `Snapshot ${new Date(summary.generatedAt).toLocaleString()} · WAU proxy ${summary.kpis.wauProxy}`
                : loading
                  ? "Loading analytics…"
                  : "Startup-style health dashboard"}
            </p>
          </div>
          <div className="admin-actions">
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => void load()} disabled={loading}>
              Refresh
            </button>
            <Link to="/onboarding" className="admin-link">
              Sign in
            </Link>
            {" · "}
            <Link to="/" className="admin-link">
              Open app
            </Link>
          </div>
        </header>

        {error ? (
          <div className="admin-card" style={{ marginBottom: "1rem" }}>
            <p className="admin-err" style={{ margin: 0 }}>
              {error}
            </p>
            <p className="admin-muted" style={{ margin: "0.75rem 0 0", fontSize: "0.8125rem" }}>
              Admin API accepts your member session cookie after the same SMS verification, or an optional{" "}
              <code>ADMIN_API_TOKEN</code> header for scripts.
            </p>
          </div>
        ) : null}

        {loading && !summary ? (
          <p className="admin-muted">Loading…</p>
        ) : summary ? (
          <>
            {behavior ? (
              <BehaviorAgentPanel report={behavior} onSelectUser={setSelectedUserId} />
            ) : null}

            <section className="admin-section">
              <h2 className="admin-section-title">North-star metrics</h2>
              <div className="admin-kpis">
                <div className="admin-kpi">
                  <div className="admin-kpi-label">Total users</div>
                  <div className="admin-kpi-value">{summary.kpis.totalUsers}</div>
                  <div className="admin-kpi-hint">+{summary.ranges.signups7d} last 7d</div>
                </div>
                <div className="admin-kpi">
                  <div className="admin-kpi-label">Onboarding</div>
                  <div className="admin-kpi-value">{summary.kpis.onboardingRatePct}%</div>
                  <div className="admin-kpi-hint">{summary.kpis.onboardedUsers} complete</div>
                </div>
                <div className="admin-kpi">
                  <div className="admin-kpi-label">Plans</div>
                  <div className="admin-kpi-value">{summary.kpis.totalPlans}</div>
                  <div className="admin-kpi-hint">+{summary.ranges.plans7d} last 7d</div>
                </div>
                <div className="admin-kpi">
                  <div className="admin-kpi-label">Unique hosts</div>
                  <div className="admin-kpi-value">{summary.kpis.uniqueHosts}</div>
                  <div className="admin-kpi-hint">{summary.kpis.avgPlansPerHost} plans / host</div>
                </div>
                <div className="admin-kpi">
                  <div className="admin-kpi-label">RSVPs</div>
                  <div className="admin-kpi-value">{summary.kpis.goingRsvps + summary.kpis.interestedRsvps}</div>
                  <div className="admin-kpi-hint">
                    {summary.kpis.goingRsvps} going · {summary.kpis.interestedRsvps} interested
                  </div>
                </div>
                <div className="admin-kpi">
                  <div className="admin-kpi-label">Messages (user)</div>
                  <div className="admin-kpi-value">{summary.kpis.userMessages}</div>
                  <div className="admin-kpi-hint">+{summary.ranges.messages7d} last 7d</div>
                </div>
                <div className="admin-kpi">
                  <div className="admin-kpi-label">Chats</div>
                  <div className="admin-kpi-value">{summary.kpis.groupChats + summary.kpis.dms}</div>
                  <div className="admin-kpi-hint">
                    {summary.kpis.groupChats} group · {summary.kpis.dms} DM threads
                  </div>
                </div>
                <div className="admin-kpi">
                  <div className="admin-kpi-label">Engaged users</div>
                  <div className="admin-kpi-value">{summary.kpis.usersWithRsvp}</div>
                  <div className="admin-kpi-hint">with at least one RSVP</div>
                </div>
                <div className="admin-kpi">
                  <div className="admin-kpi-label">Looking-for replies</div>
                  <div className="admin-kpi-value">{summary.kpis.planSuggestions}</div>
                  <div className="admin-kpi-hint">plan thread replies</div>
                </div>
                <div className="admin-kpi">
                  <div className="admin-kpi-label">Host feedback</div>
                  <div className="admin-kpi-value">{summary.kpis.feedbackUp + summary.kpis.feedbackDown}</div>
                  <div className="admin-kpi-hint">
                    {summary.kpis.feedbackUp} up · {summary.kpis.feedbackDown} down
                  </div>
                </div>
                <div className="admin-kpi">
                  <div className="admin-kpi-label">Plan declines (7d)</div>
                  <div className="admin-kpi-value">{summary.kpis.declines7d}</div>
                  <div className="admin-kpi-hint">reco tuning signal</div>
                </div>
                <div className="admin-kpi">
                  <div className="admin-kpi-label">Seed / demo</div>
                  <div className="admin-kpi-value">{summary.kpis.seedUsers}</div>
                  <div className="admin-kpi-hint">accountSource seed</div>
                </div>
              </div>
            </section>

            <section className="admin-section admin-grid-2">
              <div className="admin-card">
                <h3 className="admin-section-title" style={{ marginBottom: "0.5rem" }}>
                  Signups (14d)
                </h3>
                <Sparkline series={summary.series14d.signups} color="accent" />
              </div>
              <div className="admin-card">
                <h3 className="admin-section-title" style={{ marginBottom: "0.5rem" }}>
                  Plans created (14d)
                </h3>
                <Sparkline series={summary.series14d.plans} color="accent" />
              </div>
            </section>

            <section className="admin-section">
              <h2 className="admin-section-title">Activity heatmap</h2>
              <div className="admin-card">
                <p className="admin-muted" style={{ margin: "0 0 0.75rem" }}>
                  {summary.heatmap.label}
                </p>
                <div className="admin-heatmap-wrap">
                  <div className="admin-heatmap">
                    <div className="admin-heat-corner" />
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="admin-heat-h">
                        {h % 4 === 0 ? h : ""}
                      </div>
                    ))}
                    {heatLegend}
                  </div>
                </div>
              </div>
            </section>

            <section className="admin-section admin-grid-2">
              <div className="admin-card">
                <h3 className="admin-section-title" style={{ marginBottom: "0.5rem" }}>
                  Users by neighborhood
                </h3>
                {summary.neighborhoodsTop.length === 0 ? (
                  <p className="admin-muted">No neighborhood data yet.</p>
                ) : (
                  <ul className="admin-log-list" style={{ maxHeight: "none" }}>
                    {summary.neighborhoodsTop.map((n) => (
                      <li key={n.id}>
                        <span>
                          {n.name} <span className="admin-muted">({n.id})</span>
                        </span>
                        <span style={{ marginLeft: "auto", fontWeight: 600 }}>{n.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="admin-card">
                <h3 className="admin-section-title" style={{ marginBottom: "0.5rem" }}>
                  Interest mix (onboarding)
                </h3>
                {summary.topInterests.length === 0 ? (
                  <p className="admin-muted">No interests recorded.</p>
                ) : (
                  <div className="admin-chip-list">
                    {summary.topInterests.map((t) => (
                      <span key={t.tag} className="admin-chip">
                        {(INTEREST_LABELS as Record<string, string>)[t.tag] ?? t.tag}{" "}
                        <strong>{t.count}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <CardImagesManager />

            <ReportsReview />

            <CommunitiesReview />

            <section className="admin-section">
              <h2 className="admin-section-title">Users</h2>
              <div className="admin-card">
                <input
                  className="admin-search"
                  placeholder="Search name, phone, id, neighborhood…"
                  value={userQuery}
                  onChange={(ev) => setUserQuery(ev.target.value)}
                />
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Phone</th>
                        <th>Hood</th>
                        <th>Status</th>
                        <th>Plans</th>
                        <th>RSVPs</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <tr
                          key={u.id}
                          className="admin-row-clickable"
                          onClick={() => setSelectedUserId(u.id)}
                        >
                          <td>
                            <div style={{ fontWeight: 600 }}>{u.firstName || "—"}</div>
                            <div className="admin-muted" style={{ fontSize: "0.7rem" }}>
                              {u.id.slice(0, 8)}…
                            </div>
                          </td>
                          <td>{maskPhone(u.phoneNumber)}</td>
                          <td>{u.neighborhoodName ?? u.neighborhoodId ?? "—"}</td>
                          <td>
                            <span className={`admin-pill ${u.onboardingComplete ? "admin-pill--ok" : "admin-pill--wait"}`}>
                              {u.onboardingComplete ? "Onboarded" : "Incomplete"}
                            </span>
                            {u.accountSource === "seed" ? (
                              <span className="admin-pill admin-pill--seed" style={{ marginLeft: 4 }}>
                                Seed
                              </span>
                            ) : null}
                          </td>
                          <td>{u.plansHosted}</td>
                          <td>{u.rsvps}</td>
                          <td className="admin-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="admin-section admin-grid-2">
              <div className="admin-card">
                <h3 className="admin-section-title" style={{ marginBottom: "0.5rem" }}>
                  Recently joined
                </h3>
                <ul className="admin-log-list">
                  {summary.recentUsers.map((u) => (
                    <li
                      key={u.id}
                      className="admin-row-clickable"
                      onClick={() => setSelectedUserId(u.id)}
                    >
                      <span>
                        <strong>{u.firstName}</strong>{" "}
                        <span className="admin-muted">{maskPhone(u.phoneNumber)}</span>
                      </span>
                      <span className="admin-log-time" style={{ marginLeft: "auto" }}>
                        {u.onboardingComplete ? "✓" : "…"} · {u.interestsCount} tags
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="admin-card">
                <h3 className="admin-section-title" style={{ marginBottom: "0.5rem" }}>
                  Recent server logs
                </h3>
                {summary.recentLogs.length === 0 ? (
                  <p className="admin-muted">No log rows in store.</p>
                ) : (
                  <ul className="admin-log-list">
                    {summary.recentLogs.map((l) => (
                      <li key={l.id}>
                        <span className="admin-log-time">{new Date(l.createdAt).toLocaleString()}</span>
                        <span>{l.event}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>
      {selectedUserId && (
        <AdminUserDetailModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      )}
    </div>
  );
}
