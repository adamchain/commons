import { useEffect, useState } from "react";
import { api } from "../api/http";
import { Avatar } from "./Avatar";
import { getPublicWebOrigin } from "../lib/platform";
import type { PublicUser } from "../types/shared";

/**
 * Invite people to a plan — either via SMS share link, or by picking from the
 * viewer's existing network. Picked users get a notification (they are NOT
 * auto-RSVP'd — they decide to join from the plan).
 */
export function InviteSheet({
  planId,
  planTitle,
  onClose,
}: {
  planId: string;
  planTitle: string;
  onClose: () => void;
}) {
  const [network, setNetwork] = useState<PublicUser[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [hiddenWarn, setHiddenWarn] = useState(false);

  useEffect(() => {
    void api<{ users: PublicUser[] }>("/api/auth/network")
      .then((r) => setNetwork(r.users))
      .catch(() => setNetwork([]));
  }, []);

  const planUrl = `${getPublicWebOrigin()}/plans/${planId}`;
  const smsBody = `Come to ${planTitle} on Commons — ${planUrl}`;

  async function shareSms() {
    const data = { title: planTitle, text: smsBody, url: planUrl };
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (typeof nav.share === "function") {
      try {
        await nav.share(data);
        return;
      } catch {
        /* user canceled — fall through */
      }
    }
    window.location.href = `sms:?&body=${encodeURIComponent(smsBody)}`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(planUrl);
    } catch {
      window.prompt("Copy this link", planUrl);
    }
  }

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sendInvites() {
    if (picked.size === 0 || busy) return;
    setBusy(true);
    try {
      const r = await api<{ invited: number; hiddenForSome?: boolean }>(`/api/plans/${planId}/invite`, {
        method: "POST",
        body: JSON.stringify({ userIds: [...picked] }),
      });
      setSent(r.invited);
      setHiddenWarn(Boolean(r.hiddenForSome));
      setPicked(new Set());
    } catch {
      /* swallow — could surface error toast */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="filter-sheet-backdrop" onClick={onClose}>
      <div className="filter-sheet invite-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="filter-sheet-header">
          <h2 className="filter-sheet-title">Invite people</h2>
          <button type="button" className="btn-link" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="invite-sheet-row">
          <button type="button" className="btn-secondary btn-block" onClick={() => void shareSms()}>
            Text the link
          </button>
          <button type="button" className="btn-link" onClick={() => void copyLink()}>
            Copy link
          </button>
        </div>

        <div className="filter-sheet-group">
          <div className="filter-sheet-group-label">From your network</div>
          {network === null && <p className="form-help">Loading…</p>}
          {network !== null && network.length === 0 && (
            <p className="form-help">
              You haven't added anyone yet — text the link to invite.
            </p>
          )}
          {network !== null && network.length > 0 && (
            <div className="invite-people-list">
              {network.map((u) => {
                const isPicked = picked.has(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    className={`invite-person ${isPicked ? "is-picked" : ""}`}
                    onClick={() => togglePick(u.id)}
                    aria-pressed={isPicked}
                  >
                    <Avatar
                      seed={u.avatarSeed}
                      style={u.avatarStyle}
                      photoDataUrl={u.avatarPhotoDataUrl}
                      params={u.avatarParams}
                      name={u.firstName}
                      size="sm"
                    />
                    <span className="invite-person-name">{u.firstName}</span>
                    {isPicked && <span className="invite-person-check">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {sent > 0 && (
          <p className="form-help" style={{ marginTop: 10, color: "var(--accent)" }}>
            Sent {sent} invite{sent === 1 ? "" : "s"}. They'll get a notification.
          </p>
        )}
        {hiddenWarn && (
          <p className="form-help" style={{ marginTop: 6 }}>
            Heads up: this plan is limited to your network, so anyone you invited who
            hasn't added you won't see it until they do.
          </p>
        )}

        <button
          type="button"
          className="btn-primary btn-block"
          style={{ marginTop: 14 }}
          disabled={busy || picked.size === 0}
          onClick={() => void sendInvites()}
        >
          {busy
            ? "Sending…"
            : picked.size > 0
              ? `Send to ${picked.size} ${picked.size === 1 ? "person" : "people"}`
              : "Pick people above"}
        </button>
      </div>
    </div>
  );
}
