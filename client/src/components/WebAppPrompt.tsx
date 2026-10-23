import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import appStoreBadge from "../assets/app-store-badge.png";
import { APP_STORE_URL } from "../lib/appStore";
import { isNative } from "../lib/platform";

const STORAGE_PREFIX = "commons.webAppPrompt.";

/**
 * Web-only gate on the marketing page and the phone sign-in screen.
 * The App Store is the main action. Continue in browser dismisses it
 * for that surface for the rest of the browser session.
 */
export function WebAppPrompt({ surface }: { surface: "landing" | "auth" }) {
  const [open, setOpen] = useState(() => {
    if (isNative() || typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem(STORAGE_PREFIX + surface) !== "1";
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  function continueInBrowser() {
    sessionStorage.setItem(STORAGE_PREFIX + surface, "1");
    setOpen(false);
  }

  return createPortal(
    <div className="web-app-prompt" role="presentation">
      <div
        className="web-app-prompt-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="web-app-prompt-title"
      >
        <h2 id="web-app-prompt-title" className="web-app-prompt-title">
          Get the iPhone app
        </h2>
        <p className="web-app-prompt-copy">
          Plans, messages, and communities are built for the app.
        </p>
        <a
          className="web-app-prompt-store"
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src={appStoreBadge} alt="Download on the App Store" />
        </a>
        <button type="button" className="web-app-prompt-continue" onClick={continueInBrowser}>
          Continue in browser
        </button>
      </div>
    </div>,
    document.body,
  );
}
