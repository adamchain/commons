import { useState } from "react";
import type { PlanDTO } from "../types/shared";

// Stub of the share sheet from PRD §17. In-app friend search isn't wired
// up yet — this exposes the SMS path (mailto: / sms: deep link) and a copy
// button so the screen is usable today.
export function ShareSheet({ plan, onClose }: { plan: PlanDTO; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/plans/${plan.id}`;
  const smsBody = encodeURIComponent(`Want to come to "${plan.title}" on Commons? ${url}`);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title">Share this plan</div>

        <input className="onboarding-input" placeholder="Search friends (coming soon)" disabled />

        <a className="sheet-link" href={`sms:?&body=${smsBody}`}>
          📱 Invite via SMS
        </a>

        <button
          className="sheet-link"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              window.prompt("Copy this link", url);
            }
          }}
        >
          🔗 {copied ? "Copied!" : "Copy link"}
        </button>

        <button className="btn-link sheet-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
