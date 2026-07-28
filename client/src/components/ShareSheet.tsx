import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { PlanDTO } from "../types/shared";
import { getPublicWebOrigin } from "../lib/platform";
import { getActiveInviteCode } from "../lib/inviteCode";
import { API_BASE } from "../api/http";

// Share sheet with a live social-card preview. The card image and the injected
// link metadata are rendered server-side (see server/src/routes/share.ts), so
// whatever a friend sees on Facebook / iMessage / X matches the thumbnail here —
// real cover art, live "N going · M interested" count and all.
export function ShareSheet({ plan, isOwn = false, onClose }: { plan: PlanDTO; isOwn?: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [igCopied, setIgCopied] = useState(false);
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

  // F.14 — "my plan" when the viewer is the host, "this plan" otherwise.
  const shareText = isOwn ? "Join my plan on COMMONS" : "Join this plan on COMMONS";
  const smsBody = encodeURIComponent(`${shareText}: "${plan.title}" ${url}`);
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

  // Instagram has no web share-intent URL that accepts prefilled text/links —
  // copy the link and hand off to the app so it can be pasted into a Story,
  // DM, or bio. Best-effort deep link; silently no-ops if IG isn't installed.
  async function shareToInstagram() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard unavailable — the deep link still opens the app */
    }
    setIgCopied(true);
    setTimeout(() => setIgCopied(false), 2200);
    window.location.href = "instagram://app";
  }

  const channels: { key: string; label: string; icon: ReactNode; onClick: () => void }[] = [
    {
      key: "sms",
      label: "Messages",
      icon: <MessagesIcon />,
      onClick: () => openExternal(`sms:?&body=${smsBody}`),
    },
    {
      key: "instagram",
      label: igCopied ? "Link copied!" : "Instagram",
      icon: <InstagramIcon />,
      onClick: () => void shareToInstagram(),
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: <WhatsAppIcon />,
      onClick: () => openExternal(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`),
    },
    {
      key: "facebook",
      label: "Facebook",
      icon: <FacebookIcon />,
      onClick: () => openExternal(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`),
    },
    {
      key: "x",
      label: "X",
      icon: <XIcon />,
      onClick: () =>
        openExternal(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`,
        ),
    },
  ];

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title">Share your plan</div>

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
              <LinkIcon />
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

function MessagesIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.05 2 11c0 2.48 1.14 4.72 3 6.3V22l4.05-2.23C10.01 20.25 11 20.5 12 20.5c5.52 0 10-4.05 10-9.5S17.52 2 12 2zm1.1 12.65h-4.2a.9.9 0 010-1.8h4.2a.9.9 0 010 1.8zm2.8-3.5H8.9a.9.9 0 010-1.8h7a.9.9 0 010 1.8z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 7.2A4.8 4.8 0 1016.8 12 4.81 4.81 0 0012 7.2zm0 7.92A3.12 3.12 0 1115.12 12 3.13 3.13 0 0112 15.12z" />
      <circle cx="17.34" cy="6.72" r="1.14" />
      <path d="M12 2.16c-2.67 0-3.01.01-4.06.06a6.78 6.78 0 00-2.24.43 4.52 4.52 0 00-1.63 1.06 4.52 4.52 0 00-1.06 1.63 6.78 6.78 0 00-.43 2.24c-.05 1.05-.06 1.39-.06 4.06s.01 3.01.06 4.06a6.78 6.78 0 00.43 2.24 4.52 4.52 0 001.06 1.63 4.52 4.52 0 001.63 1.06 6.78 6.78 0 002.24.43c1.05.05 1.39.06 4.06.06s3.01-.01 4.06-.06a6.78 6.78 0 002.24-.43 4.52 4.52 0 001.63-1.06 4.52 4.52 0 001.06-1.63 6.78 6.78 0 00.43-2.24c.05-1.05.06-1.39.06-4.06s-.01-3.01-.06-4.06a6.78 6.78 0 00-.43-2.24 4.52 4.52 0 00-1.06-1.63 4.52 4.52 0 00-1.63-1.06 6.78 6.78 0 00-2.24-.43c-1.05-.05-1.39-.06-4.06-.06zm0 1.62c2.63 0 2.94.01 3.97.06a5.16 5.16 0 011.72.32 2.9 2.9 0 011.66 1.66 5.16 5.16 0 01.32 1.72c.05 1.03.06 1.34.06 3.97s-.01 2.94-.06 3.97a5.16 5.16 0 01-.32 1.72 2.9 2.9 0 01-1.66 1.66 5.16 5.16 0 01-1.72.32c-1.03.05-1.34.06-3.97.06s-2.94-.01-3.97-.06a5.16 5.16 0 01-1.72-.32 2.9 2.9 0 01-1.66-1.66 5.16 5.16 0 01-.32-1.72c-.05-1.03-.06-1.34-.06-3.97s.01-2.94.06-3.97a5.16 5.16 0 01.32-1.72 2.9 2.9 0 011.66-1.66 5.16 5.16 0 011.72-.32c1.03-.05 1.34-.06 3.97-.06z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.04-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.09 3.19 5.06 4.47.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z" />
      <path d="M12.04 2C6.5 2 2.01 6.49 2.01 12.02c0 1.77.46 3.49 1.34 5.01L2 22l5.1-1.34A10 10 0 0012.04 22C17.57 22 22 17.51 22 11.98 22 6.45 17.57 2 12.04 2zm0 18.2a8.2 8.2 0 01-4.18-1.15l-.3-.18-3.03.8.81-2.95-.2-.31a8.18 8.18 0 01-1.26-4.38c0-4.53 3.69-8.22 8.16-8.22 4.48 0 8.16 3.69 8.16 8.22 0 4.53-3.68 8.17-8.16 8.17z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14.5 8.5V6.8c0-.55.1-.8.9-.8H17V3h-2.4C11.9 3 11 4.7 11 6.6v1.9H9v3h2V21h3.5v-9.5H17l.5-3h-3z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.24 2H21.5l-7.19 8.22L22.5 22h-6.59l-5.16-6.74L5.09 22H1.81l7.69-8.79L1.5 2h6.75l4.66 6.17L18.24 2zm-1.16 18h1.82L7.01 3.91H5.06L17.08 20z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 13a5 5 0 007.07 0l1.41-1.41a5 5 0 00-7.07-7.07L10 5.93"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 00-7.07 0L5.52 12.41a5 5 0 007.07 7.07L14 18.07"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
