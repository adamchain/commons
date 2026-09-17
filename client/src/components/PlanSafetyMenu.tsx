import { useEffect, useRef, useState } from "react";
import { Ban, Flag, MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, parseApiError } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { REPORT_REASON_OPTIONS, type ReportReason } from "../types/shared";
import { BottomSheet } from "./ui/BottomSheet";
import { Button } from "./ui/Button";

/**
 * Subtle ⋮ next to a plan/idea title. Report opens a modal that lands in the
 * admin panel; Block severs DMs, invites, and network follows both ways.
 */
export function PlanSafetyMenu({
  targetUserId,
  targetFirstName,
  planId,
  planTitle,
  contentKind,
  contentId,
}: {
  targetUserId: string;
  targetFirstName: string;
  planId?: string;
  planTitle?: string;
  contentKind?: "user" | "plan" | "message" | "forum_post" | "community_post";
  contentId?: string;
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
          contentKind={contentKind}
          contentId={contentId}
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

export function ReportModal({
  targetUserId,
  targetFirstName,
  planId,
  planTitle,
  contentKind,
  contentId,
  onClose,
}: {
  targetUserId: string;
  targetFirstName: string;
  planId?: string;
  planTitle?: string;
  contentKind?: "user" | "plan" | "message" | "forum_post" | "community_post";
  contentId?: string;
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
          planId: planId || undefined,
          contentKind: contentKind ?? (planId ? "plan" : "user"),
          contentId: contentId || planId || undefined,
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

  return (
    <BottomSheet
      onClose={() => {
        if (!busy) onClose();
      }}
      closeDisabled={busy}
      labelledBy="report-modal-title"
    >
        {sent ? (
          <>
            <h2 id="report-modal-title" className="sheet-title">
              Thanks for the report
            </h2>
            <p className="sheet-copy">
              Our team reviews every report within 24 hours. If it violates our Terms, we remove
              the content and eject the person who posted it. You can also block them so they
              disappear from your feed immediately.
            </p>
            <div className="sheet-actions">
              <Button variant="primary" block onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 id="report-modal-title" className="sheet-title">
              Report {targetFirstName || "this person"}
            </h2>
            <p className="plan-report-sub">
              {planTitle
                ? `This is about “${planTitle}”. `
                : ""}
              Reports go to COMMONS. We have no tolerance for objectionable content or abusive
              users, and we act within 24 hours.
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
                  <span>{opt.label}</span>
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
            <div className="sheet-actions">
              <Button variant="primary" block disabled={busy} onClick={() => void submit()}>
                {busy ? "Sending…" : "Submit report"}
              </Button>
              <Button variant="secondary" block disabled={busy} onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        )}
    </BottomSheet>
  );
}

export function BlockConfirmModal({
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

  return (
    <BottomSheet
      onClose={() => {
        if (!busy) onClose();
      }}
      closeDisabled={busy}
      labelledBy="block-modal-title"
    >
        <h2 id="block-modal-title" className="sheet-title">
          Block {name}?
        </h2>
        <p className="sheet-copy">
          You won&apos;t be able to message each other, invite each other to plans, or follow
          each other. Their content is removed from your feed immediately, and COMMONS is
          notified so we can review it.
        </p>
        {error && <p className="error-text">{error}</p>}
        <div className="sheet-actions">
          <Button variant="primary" block disabled={busy} onClick={() => void confirm()}>
            {busy ? "Blocking…" : "Block User"}
          </Button>
          <Button variant="secondary" block disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
    </BottomSheet>
  );
}
