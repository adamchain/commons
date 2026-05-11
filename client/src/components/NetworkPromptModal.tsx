import { useState } from "react";
import { api } from "../api/http";
import { Avatar } from "./Avatar";
import { useAuth } from "../context/AuthContext";
import type { MeDTO, NetworkPromptDTO } from "../types/shared";

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
  const [picked, setPicked] = useState<Set<string>>(() => new Set(prompt.others.map((o) => o.id)));

  const names = prompt.others.map((o) => o.firstName).join(", ");

  async function addAll() {
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; me: MeDTO }>("/api/auth/network-add", {
        method: "POST",
        body: JSON.stringify({
          planId: prompt.planId,
          userIds: [...picked],
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

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="network-prompt-overlay" role="dialog" aria-modal="true" aria-labelledby="network-prompt-title">
      <div className="network-prompt-card">
        <h2 id="network-prompt-title" className="network-prompt-title">
          Stay connected?
        </h2>
        <p className="network-prompt-body">
          You went to <strong>{prompt.planTitle}</strong> with {names} — add them to your network on COMMONS?
        </p>
        <ul className="network-prompt-list">
          {prompt.others.map((o) => (
            <li key={o.id}>
              <label className="network-prompt-row">
                <input
                  type="checkbox"
                  checked={picked.has(o.id)}
                  onChange={() => toggle(o.id)}
                />
                <Avatar seed={o.avatarSeed} style={o.avatarStyle} photoDataUrl={o.avatarPhotoDataUrl} emoji={o.avatarEmoji} name={o.firstName} size="sm" />
                <span>{o.firstName}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="network-prompt-actions">
          <button type="button" className="btn-primary btn-block" disabled={busy || picked.size === 0} onClick={() => void addAll()}>
            {busy ? "Saving…" : "Yes — add to my network"}
          </button>
          <button type="button" className="btn-link btn-block" disabled={busy} onClick={() => void dismiss()}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
