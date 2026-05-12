import { useState } from "react";
import { api } from "../api/http";
import { Avatar } from "./Avatar";
import { useAuth } from "../context/AuthContext";
import type { MeDTO, NetworkPromptDTO } from "../types/shared";

/**
 * Post-plan network seed prompt. Fires after a plan's end time passes for
 * anyone who RSVP'd. The whole interaction is two taps — one to add the group
 * to your network, one to skip — no per-person checkboxes or search. The
 * shared real-world experience is the entire filtering signal.
 */
export function NetworkPromptModal({
  prompt,
  onClose,
  onUpdated,
}: {
  prompt: NetworkPromptDTO;
  onClose: () => void;
  onUpdated: (me: MeDTO) => void;
}) {
  const { setUser } = useAuth();
  const [busy, setBusy] = useState(false);

  const count = prompt.others.length;
  const names = prompt.others.map((o) => o.firstName).join(", ");

  async function addAll() {
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; me: MeDTO }>("/api/auth/network-add", {
        method: "POST",
        body: JSON.stringify({
          planId: prompt.planId,
          userIds: prompt.others.map((o) => o.id),
        }),
      });
      setUser(res.me);
      onUpdated(res.me);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    setBusy(true);
    try {
      await api("/api/auth/network-dismiss", {
        method: "POST",
        body: JSON.stringify({ planId: prompt.planId }),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="network-prompt-overlay" role="dialog" aria-modal="true" aria-labelledby="network-prompt-title">
      <div className="network-prompt-card">
        <h2 id="network-prompt-title" className="network-prompt-title">
          Stay connected?
        </h2>
        <p className="network-prompt-body">
          You went to <strong>{prompt.planTitle}</strong> with {count} {count === 1 ? "person" : "people"}.
          Want to add them to your network?
        </p>

        <div className="network-prompt-avatars" aria-label={names}>
          {prompt.others.map((o) => (
            <span key={o.id} className="network-prompt-avatar" title={o.firstName}>
              <Avatar seed={o.avatarSeed} style={o.avatarStyle} photoDataUrl={o.avatarPhotoDataUrl} params={o.avatarParams} name={o.firstName} size="lg" />
              <span className="network-prompt-avatar-name">{o.firstName}</span>
            </span>
          ))}
        </div>

        <div className="network-prompt-actions">
          <button type="button" className="btn-primary btn-block" disabled={busy} onClick={() => void addAll()}>
            {busy ? "Saving…" : `Add ${count === 1 ? "to" : "all to"} my network`}
          </button>
          <button type="button" className="btn-link btn-block" disabled={busy} onClick={() => void dismiss()}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
