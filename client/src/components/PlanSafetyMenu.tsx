import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Flag, MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, parseApiError } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { REPORT_REASON_OPTIONS, type ReportReason } from "../types/shared";

/**
 * Subtle ⋮ next to a plan/idea title. Report opens a modal that lands in the
 * admin panel; Block severs DMs, invites, and network follows both ways.
 */
export function PlanSafetyMenu({
  targetUserId,
  targetFirstName,
  planId,
  planTitle,
}: {
  targetUserId: string;
  targetFirstName: string;
  planId: string;
  planTitle: string;
}) {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="plan-safety-menu" ref={wrapRef}>
      <button
        type="button"
        className="plan-safety-menu-btn"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreVertical size={18} strokeWidth={1.7} aria-hidden="true" />
      </button>
      {open && (
        <div className="plan-safety-dropdown" role="menu">
          <button
            type="button"
            className="plan-safety-dropdown-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setReportOpen(true);
            }}
          >
            <Flag size={14} strokeWidth={1.8} aria-hidden="true" />
            Report
          </button>
          <button
            type="button"
            className="plan-safety-dropdown-item is-danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setBlockOpen(true);
            }}
          >
            <Ban size={14} strokeWidth={1.8} aria-hidden="true" />
            Block User
          </button>
        </div>
      )}
      {reportOpen && (
        <ReportModal
          targetUserId={targetUserId}
          targetFirstName={targetFirstName}
          planId={planId}
          planTitle={planTitle}
          onClose={() => setReportOpen(false)}
        />
      )}
      {blockOpen && (
        <BlockConfirmModal
          targetUserId={targetUserId}
          targetFirstName={targetFirstName}
          onClose={() => setBlockOpen(false)}
          onBlocked={async () => {
            await refreshUser();
            navigate("/", { replace: true });
          }}
        />
      )}
    </div>
  );
}

function ReportModal({
  targetUserId,
  targetFirstName,
  planId,
  planTitle,
  onClose,
}: {
  targetUserId: string;
  targetFirstName: string;
  planId: string;
  planTitle: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit() {
    if (!reason) {
      setError("Pick a reason");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          targetUserId,
          planId,
          reason,
          details: details.trim() || undefined,
        }),
      });
      setSent(true);
    } catch (e) {
      setError(parseApiError(e) || "Couldn't send. Try again.");
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-card plan-report-modal" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <>
            <h4 id="report-modal-title" style={{ marginTop: 0 }}>
              Thanks for the report
            </h4>
            <p style={{ marginTop: 0 }}>
              Our team will review this in the admin panel. You can also block this person so
              they can&apos;t message, invite, or follow you.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <h4 id="report-modal-title" style={{ marginTop: 0 }}>
              Report {targetFirstName || "this person"}
            </h4>
            <p className="plan-report-sub">
              This is about &ldquo;{planTitle}&rdquo;. Reports go straight to Commons admins —
              they won&apos;t see who filed this.
            </p>
            <fieldset className="plan-report-reasons" aria-label="Reason">
              {REPORT_REASON_OPTIONS.map((opt) => (
                <label key={opt.id} className="plan-report-reason">
                  <input
                    type="radio"
                    name="report-reason"
                    value={opt.id}
                    checked={reason === opt.id}
                    onChange={() => setReason(opt.id)}
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>
            <label className="plan-report-details-label" htmlFor="report-details">
              Anything else we should know? <span>(optional)</span>
            </label>
            <textarea
              id="report-details"
              className="plan-report-details"
              rows={3}
              maxLength={2000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Add context if it helps"
            />
            {error && <p className="error-text">{error}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn-link" disabled={busy} onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void submit()}>
                {busy ? "Sending…" : "Submit report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function BlockConfirmModal({
  targetUserId,
  targetFirstName,
  onClose,
  onBlocked,
}: {
  targetUserId: string;
  targetFirstName: string;
  onClose: () => void;
  onBlocked: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = targetFirstName || "this person";

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/users/${targetUserId}/block`, { method: "POST" });
      await onBlocked();
    } catch (e) {
      setError(parseApiError(e) || "Couldn't block. Try again.");
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-modal-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h4 id="block-modal-title" style={{ marginTop: 0 }}>
          Block {name}?
        </h4>
        <p style={{ marginTop: 0 }}>
          You won&apos;t be able to message each other, invite each other to plans, or follow
          each other. They won&apos;t see your profile or plans, and you won&apos;t see theirs.
        </p>
        {error && <p className="error-text">{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn-link" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => void confirm()}
            style={{ background: "var(--danger)" }}
          >
            {busy ? "Blocking…" : "Block User"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
