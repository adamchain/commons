import { Link } from "react-router-dom";
import wordmark from "../assets/wordmark.png";

// Served from client/public — referenced by root-absolute URL, not imported.
const screenChat = "/landing/screen-a.png";
const screenEvent = "/landing/screen-b.png";

/**
 * Public marketing landing — the web front door, styled after anthropic.com:
 * a clean, type-forward hero on a warm light-tan paper, a three-step "how it
 * works" card grid, a screenshot showcase, and a multi-column footer. The
 * Commons app itself is iOS-only and invite-only, so there's no functional web
 * sign-in here — the only link off the marketing surface is a small Admin
 * Console link tucked into the footer.
 */

/** The three-step pitch, rendered as an Anthropic-style card grid. */
const STEPS: Array<{ n: string; title: string; body: string }> = [
  {
    n: "01",
    title: "Start the plan",
    body: "Post an event in seconds — a time, a place, a vibe. No endless back-and-forth just to get something on the calendar.",
  },
  {
    n: "02",
    title: "Rally the crew",
    body: "Everyone who's in lands in one group chat. Share the details, hype it up, and keep the momentum going.",
  },
  {
    n: "03",
    title: "Settle it with a poll",
    body: "Can't agree on the spot or the time? Drop a quick poll and let the group decide it in a tap.",
  },
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
          <a href="#showcase">The app</a>
          <a href="https://jointhecommons.com/privacy" target="_blank" rel="noreferrer">
            Privacy
          </a>
        </nav>
        <a href="#how" className="lp-nav-cta">
          Get started
        </a>
      </header>

      <main className="lp-main">
        {/* Hero — type-forward headline + the two-phone visual. */}
        <section className="lp-hero">
          <div className="lp-hero-text">
            <p className="lp-eyebrow">Make it happen</p>
            <h1 className="lp-headline">
              Turn “we should hang out” into <span>real plans</span>.
            </h1>
            <p className="lp-sub">
              Commons is where the people around you make plans worth showing up
              for — start an event, rally the crew in the group chat, and settle
              the details with a quick poll.
            </p>
            <div className="lp-hero-actions">
              <a href="#how" className="lp-btn lp-btn--primary">
                See how it works
              </a>
              <a href="#showcase" className="lp-btn lp-btn--ghost">
                Peek inside
              </a>
            </div>
            <p className="lp-caption">Invite-only · Built for iOS</p>
          </div>

          <div className="lp-hero-visual" aria-hidden="true">
            <div className="lp-phone lp-phone--back">
              <div className="lp-phone-notch" />
              <img className="lp-phone-screen" src={screenEvent} alt="" />
            </div>
            <div className="lp-phone lp-phone--front">
              <div className="lp-phone-notch" />
              <img className="lp-phone-screen" src={screenChat} alt="" />
            </div>
          </div>
        </section>

        {/* How it works — three-step card grid. */}
        <section id="how" className="lp-section">
          <div className="lp-section-head">
            <h2 className="lp-section-title">
              From group-chat limbo to a real plan
            </h2>
            <p className="lp-section-sub">Three steps, start to finish.</p>
          </div>
          <div className="lp-feature-grid">
            {STEPS.map((s) => (
              <article key={s.n} className="lp-feature-card">
                <span className="lp-feature-num">{s.n}</span>
                <h3 className="lp-feature-title">{s.title}</h3>
                <p className="lp-feature-body">{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Showcase — copy on the left, a single framed screenshot on the right. */}
        <section id="showcase" className="lp-showcase">
          <div className="lp-showcase-text">
            <h2 className="lp-section-title">Made for the people you actually see</h2>
            <p className="lp-section-sub">
              Commons keeps your real-life circle in one place — the people you'd
              actually grab dinner with, not a feed full of strangers.
            </p>
            <ul className="lp-showcase-list">
              <li>Plans that fit around everyone's week</li>
              <li>A group chat that doesn't go cold</li>
              <li>Polls to break every tie</li>
            </ul>
          </div>
          <div className="lp-showcase-frame">
            <div className="lp-phone-notch" />
            <img className="lp-phone-screen" src={screenChat} alt="The Commons group chat" />
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-top">
          <div className="lp-footer-brand">
            <img src={wordmark} alt="COMMONS" />
            <p>A place for plans meant to be shared.</p>
          </div>
          <div className="lp-footer-cols">
            <div className="lp-footer-col">
              <span className="lp-footer-head">Product</span>
              <a href="#how">How it works</a>
              <a href="#showcase">The app</a>
            </div>
            <div className="lp-footer-col">
              <span className="lp-footer-head">Legal</span>
              <a href="https://jointhecommons.com/privacy" target="_blank" rel="noreferrer">
                Privacy
              </a>
              <a href="https://jointhecommons.com/terms" target="_blank" rel="noreferrer">
                Terms
              </a>
            </div>
            <div className="lp-footer-col">
              <span className="lp-footer-head">Company</span>
              <Link to="/admin" className="lp-footer-admin">
                Admin Console
              </Link>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>© Commons 2026</span>
          <span>Invite-only · Built for iOS</span>
        </div>
      </footer>
    </div>
  );
}
