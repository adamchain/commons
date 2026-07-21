import { useEffect, useMemo, useState } from "react";
import type { PlanDTO } from "../types/shared";
import { getPublicWebOrigin } from "../lib/platform";
import { getActiveInviteCode } from "../lib/inviteCode";
import { API_BASE } from "../api/http";

// Share sheet with a live social-card preview. The card image and the injected
// link metadata are rendered server-side (see server/src/routes/share.ts), so
// whatever a friend sees on Facebook / iMessage / X matches the thumbnail here —
// real cover art, live "N going · M interested" count and all.
export function ShareSheet({ plan, onClose }: { plan: PlanDTO; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const going = plan.participants.going.length;
  const interested = plan.participants.interested.length;

  // If the sharer still has an unused invite code, stamp it on the link so a
  // recipient who isn't a member yet gets credited to it on signup.
  useEffect(() => {
    let active = true;
    void getActiveInviteCode().then((code) => {
      if (active) setInviteCode(code);
    });
    return () => {
      active = false;
    };
  }, []);

  // Public link others open — the server injects per-plan OG tags here.
  const url = useMemo(() => {
    const base = `${getPublicWebOrigin()}/plans/${plan.id}`;
    return inviteCode ? `${base}?invite=${encodeURIComponent(inviteCode)}` : base;
  }, [plan.id, inviteCode]);
  // Live preview image, served by the API host. Count query keeps it fresh.
  const previewSrc = useMemo(
    () => `${API_BASE}/plans/${plan.id}/og-image.png?c=${going}&i=${interested}`,
    [plan.id, going, interested],
  );

  const shareText = `${plan.title} on Commons`;
  const smsBody = encodeURIComponent(`Want to come to "${plan.title}" on Commons? ${url}`);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function nativeShare() {
    try {
      await navigator.share({ title: shareText, text: shareText, url });
      onClose();
    } catch {
      /* user cancelled the share sheet — leave ours open */
    }
  }

  function openExternal(href: string) {
    window.open(href, "_blank", "noopener,noreferrer");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  const channels: { key: string; label: string; icon: string; onClick: () => void }[] = [
    {
      key: "facebook",
      label: "Facebook",
      icon: "f",
      onClick: () => openExternal(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`),
    },
    {
      key: "x",
      label: "X",
      icon: "𝕏",
      onClick: () =>
        openExternal(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`,
        ),
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: "🟢",
      onClick: () => openExternal(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`),
    },
    {
      key: "sms",
      label: "Messages",
      icon: "💬",
      onClick: () => openExternal(`sms:?&body=${smsBody}`),
    },
  ];

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title">Share this plan</div>

        {/* Live preview of the exact card friends will see. */}
        <div className="share-preview">
          {imgFailed ? (
            <div className="share-preview-fallback">
              <div className="share-preview-fallback-emoji">{plan.hostEmoji || "✨"}</div>
              <div className="share-preview-fallback-title">{plan.title}</div>
            </div>
          ) : (
            <img
              className="share-preview-img"
              src={previewSrc}
              alt={`${plan.title} share card`}
              loading="eager"
              onError={() => setImgFailed(true)}
            />
          )}
          <div className="share-preview-caption">
            {going > 0 || interested > 0
              ? `${going} going · ${interested} interested — updates as people join`
              : "Be the first to join — the card fills in as people RSVP"}
          </div>
        </div>

        {canNativeShare && (
          <button type="button" className="share-primary-btn" onClick={nativeShare}>
            <ShareGlyph /> Share…
          </button>
        )}

        <div className="share-channels">
          {channels.map((c) => (
            <button key={c.key} type="button" className="share-channel" onClick={c.onClick}>
              <span className={`share-channel-icon share-channel-icon--${c.key}`} aria-hidden="true">
                {c.icon}
              </span>
              <span className="share-channel-label">{c.label}</span>
            </button>
          ))}
          <button type="button" className="share-channel" onClick={copyLink}>
            <span className="share-channel-icon share-channel-icon--copy" aria-hidden="true">
              🔗
            </span>
            <span className="share-channel-label">{copied ? "Copied!" : "Copy link"}</span>
          </button>
        </div>

        <button className="btn-link sheet-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ShareGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ marginRight: 8 }}>
      <path
        d="M12 3v12M12 3l-4 4M12 3l4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
