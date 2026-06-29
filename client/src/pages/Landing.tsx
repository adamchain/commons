import { Link } from "react-router-dom";
import wordmark from "../assets/wordmark.png";

// Served from client/public — referenced by root-absolute URL, not imported.
const screenChat = "/landing/screen-a.png"; // group chat with poll inside
const screenEvent = "/landing/screen-b.png"; // pathway selector / plan details

/**
 * Public marketing landing — the web front door, styled after anthropic.com:
 * a clean, type-forward hero on a warm light-tan paper, feature callouts, the
 * two-pathway pitch (mirroring the in-app "Just an idea" vs "Make a plan"
 * selector), a three-step "how it works" grid, and a closing CTA band. The
 * Commons app itself is iOS-only and invite-only, so there's no functional web
 * sign-in here — the only link off the marketing surface is a small Admin
 * Console link tucked into the footer.
 */

/** The two ways to post a plan — copy mirrors the in-app pathway selector. */
const PATHWAYS: Array<{
  eyebrow: string;
  title: string;
  body: string;
  selected?: boolean;
}> = [
  {
    eyebrow: "Casual",
    title: "Just an idea",
    body: "Something's on your mind but you're not sure yet. Toss it out — see who's around and interested before you commit to anything.",
  },
  {
    eyebrow: "Committed",
    title: "Make a plan",
    body: "Know what you want to do. Set the details, post it, and see who's in.",
    selected: true,
  },
];

/** The three-step pitch, rendered as an Anthropic-style card grid. */
const STEPS: Array<{ n: string; title: string; body: string }> = [
  {
    n: "01",
    title: "Post the plan",
    body: "Float a casual idea or lock in the details — a time, a place, a vibe. No endless back-and-forth just to get something on the calendar.",
  },
  {
    n: "02",
    title: "Find your people",
    body: "Discover women nearby doing the same thing, or share the plan with your existing network. Either way, the right people show up.",
  },
  {
    n: "03",
    title: "Get it out of the group chat",
    body: "Everyone who's in lands in one group chat. Share the details, settle things with a quick poll, and actually show up.",
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
          <a href="#features">Why Commons</a>
          <a href="#how">How it works</a>
          <a href="https://jointhecommons.com/privacy" target="_blank" rel="noreferrer">
            Privacy
          </a>
        </nav>
        <a href="#cta" className="lp-nav-cta">
          Get started
        </a>
      </header>

      <main className="lp-main">
        {/* Hero — type-forward headline + the two-phone visual. */}
        <section className="lp-hero">
          <div className="lp-hero-text">
            <p className="lp-eyebrow">Make it happen</p>
            <h1 className="lp-headline">
              More plans. More people. <span>More showing up.</span>
            </h1>
            <p className="lp-sub">
              Commons is where women actually make plans — find someone to do it
              with, or bring your people together. Float an idea or lock
              something in. Either way, something happens.
            </p>
            <div className="lp-hero-actions">
              <a href="#how" className="lp-btn lp-btn--primary">
                See how it works
              </a>
              <a href="#features" className="lp-btn lp-btn--ghost">
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

        {/* Feature callouts — copy + checklist on the left, one phone on the right. */}
        <section id="features" className="lp-showcase">
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
            <img className="lp-phone-screen" src={screenChat} alt="The Commons group chat with a poll inside" />
          </div>
        </section>

        {/* Two pathways — mirrors the in-app "Just an idea" vs "Make a plan" selector. */}
        <section id="pathways" className="lp-section">
          <div className="lp-section-head">
            <h2 className="lp-section-title">Post a plan two ways</h2>
            <p className="lp-section-sub">
              Whether you have something in mind or you're just putting it out there.
            </p>
          </div>
          <div className="lp-pathways">
            {PATHWAYS.map((p) => (
              <article
                key={p.title}
                className={
                  "lp-path-card" + (p.selected ? " lp-path-card--selected" : "")
                }
              >
                <span className="lp-path-eyebrow">{p.eyebrow}</span>
                <h3 className="lp-path-title">{p.title}</h3>
                <p className="lp-path-body">{p.body}</p>
              </article>
            ))}
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

        {/* Closing CTA band. */}
        <section id="cta" className="lp-cta">
          <h2 className="lp-cta-title">
            Turn “we should hang out” into real plans.
          </h2>
          <p className="lp-cta-body">
            Post what you're doing — or just float an idea. The people are
            already out there.
          </p>
          <a href="https://jointhecommons.com" className="lp-btn lp-btn--primary lp-cta-btn">
            Get started
          </a>
          <p className="lp-caption">Invite-only · Built for iOS</p>
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
              <a href="#features">Why Commons</a>
              <a href="#how">How it works</a>
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
