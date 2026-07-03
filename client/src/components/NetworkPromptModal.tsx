import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/http";
import { Avatar } from "./Avatar";
import { useAuth } from "../context/AuthContext";
import type { MeDTO, NetworkPromptDTO } from "../types/shared";

/**
 * Post-plan network seed prompt. Fires after a plan's end time passes for
 * anyone who RSVP'd. Nobody is pre-selected — the user actively taps the one
 * or two people they actually want to keep, then adds. Tapping nobody and
 * hitting "Not now" dismisses.
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
  // Default: no one selected — the user chooses who to keep.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const count = prompt.others.length;
  const names = prompt.others.map((o) => o.firstName).join(", ");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; me: MeDTO }>("/api/auth/network-add", {
        method: "POST",
        body: JSON.stringify({
          planId: prompt.planId,
          userIds: [...selected],
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

  const selectedCount = selected.size;

  // Rendered through a portal to <body> so the fixed overlay covers the whole
  // viewport. Rendering it inline in the Feed traps it inside the pull-to-refresh
  // transform container, which re-anchors `position: fixed` and pushes the modal
  // to the bottom of the (scrollable) feed instead of over the screen.
  return createPortal(
    <div className="network-prompt-overlay" role="dialog" aria-modal="true" aria-labelledby="network-prompt-title">
      <div className="network-prompt-card">
        <h2 id="network-prompt-title" className="network-prompt-title">
          Stay connected?
        </h2>
        <p className="network-prompt-body">
          You went to <strong>{prompt.planTitle}</strong> with {count} {count === 1 ? "person" : "people"}.
          Tap anyone you'd like to add to your network.
        </p>

        <div className="network-prompt-avatars" aria-label={names}>
          {prompt.others.map((o) => {
            const isOn = selected.has(o.id);
            return (
              <button
                key={o.id}
                type="button"
                className={`network-prompt-avatar network-prompt-avatar--pick ${isOn ? "is-selected" : ""}`}
                title={o.firstName}
                onClick={() => toggle(o.id)}
                aria-pressed={isOn}
              >
                <Avatar seed={o.avatarSeed} style={o.avatarStyle} photoDataUrl={o.avatarPhotoDataUrl} params={o.avatarParams} name={o.firstName} size="lg" />
                {isOn && <span className="network-prompt-avatar-check" aria-hidden="true">✓</span>}
                <span className="network-prompt-avatar-name">{o.firstName}</span>
              </button>
            );
          })}
        </div>

        <div className="network-prompt-actions">
          <button
            type="button"
            className="btn-primary btn-block"
            disabled={busy || selectedCount === 0}
            onClick={() => void addSelected()}
          >
            {busy
              ? "Saving…"
              : selectedCount === 0
                ? "Select someone to add"
                : `Add ${selectedCount} to my network`}
          </button>
          <button type="button" className="btn-link btn-block" disabled={busy} onClick={() => void dismiss()}>
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
