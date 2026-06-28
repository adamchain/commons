import { Link } from "react-router-dom";
import type { CSSProperties } from "react";
import wordmark from "../assets/wordmark.png";
import { Avatar } from "../components/Avatar";
import { AVATAR_PRESETS } from "../types/shared";

// Served from client/public — referenced by root-absolute URL, not imported.
const screenChat = "/landing/screen-a.png";
const screenEvent = "/landing/screen-b.png";

/**
 * Public marketing landing — the web front door. The Commons app itself is
 * iOS-only, so there is no log-in / download CTA here (web can't run it). The
 * layout mirrors a two-phone hero: a headline on the left, the real app
 * screenshots framed as phones on the right, with subtle floating member
 * avatars drifting around them. The only link out is a small Admin Console
 * link tucked into the footer.
 */

/** Floating member avatars scattered around the phone stage. Decorative only. */
const FLOATING_AVATARS: Array<{
  seed: string;
  preset: number;
  top: string;
  left: string;
  size: "xs" | "sm" | "md";
  delay: string;
  duration: string;
}> = [
  { seed: "ava-quinn", preset: 0, top: "4%", left: "2%", size: "md", delay: "0s", duration: "6.2s" },
  { seed: "ava-liam", preset: 6, top: "0%", left: "62%", size: "sm", delay: "0.8s", duration: "5.4s" },
  { seed: "ava-maya", preset: 9, top: "30%", left: "-4%", size: "sm", delay: "1.6s", duration: "6.8s" },
  { seed: "ava-noah", preset: 16, top: "52%", left: "90%", size: "md", delay: "0.4s", duration: "7s" },
  { seed: "ava-ari", preset: 13, top: "82%", left: "0%", size: "xs", delay: "1.1s", duration: "5.8s" },
  { seed: "ava-sam", preset: 3, top: "92%", left: "70%", size: "sm", delay: "0.2s", duration: "6.5s" },
  { seed: "ava-jess", preset: 11, top: "68%", left: "44%", size: "xs", delay: "2s", duration: "6s" },
];

export function LandingPage() {
  return (
    <div className="lp-page">
      <header className="lp-nav">
        <Link to="/welcome" className="lp-nav-brand" aria-label="Commons">
          <img src={wordmark} alt="COMMONS" />
        </Link>
        <nav className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="https://jointhecommons.com/privacy" target="_blank" rel="noreferrer">
            Privacy
          </a>
          <a href="https://jointhecommons.com/terms" target="_blank" rel="noreferrer">
            Terms
          </a>
        </nav>
      </header>

      <main className="lp-main">
        <section className="lp-hero">
          <p className="lp-eyebrow">Make it happen</p>
          <h1 className="lp-headline">
            Turn “we should hang out” into <span>real plans</span>.
          </h1>
          <p className="lp-sub">
            Commons is where the people around you make plans worth showing up for —
            start an event, rally the crew in the group chat, and settle the details
            with a quick poll.
          </p>
          <p className="lp-caption">Invite-only · Built for iOS</p>
        </section>

        <section className="lp-stage" aria-hidden="true">
          <div className="lp-avatars">
            {FLOATING_AVATARS.map((a) => {
              const style: CSSProperties = {
                top: a.top,
                left: a.left,
                animationDelay: a.delay,
                animationDuration: a.duration,
              };
              return (
                <span key={a.seed} className="lp-avatar" style={style}>
                  <Avatar
                    seed={a.seed}
                    style="avataaars"
                    params={AVATAR_PRESETS[a.preset]?.params}
                    size={a.size}
                  />
                </span>
              );
            })}
          </div>

          <div className="lp-phone lp-phone--back">
            <div className="lp-phone-notch" />
            <img className="lp-phone-screen" src={screenEvent} alt="" />
          </div>
          <div className="lp-phone lp-phone--front">
            <div className="lp-phone-notch" />
            <img className="lp-phone-screen" src={screenChat} alt="" />
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <span className="lp-footer-copy">© Commons 2026</span>
        <div className="lp-footer-links">
          <a href="https://jointhecommons.com/privacy" target="_blank" rel="noreferrer">
            Privacy Policy
          </a>
          <a href="https://jointhecommons.com/terms" target="_blank" rel="noreferrer">
            Terms
          </a>
          <Link to="/admin" className="lp-footer-admin">
            Admin Console
          </Link>
        </div>
      </footer>
    </div>
  );
}
