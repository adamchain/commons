import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import wordmark from "../assets/wordmark.png";
import { APP_STORE_URL } from "../lib/appStore";
import { useAuth } from "../context/AuthContext";
import { needsOnboarding } from "../lib/onboarding";
import { trackAppStoreClick } from "../lib/pixels";
import "./NewLanding.css";

const INSTAGRAM = "https://www.instagram.com/oncommons/";
const APP_ID = "6785627674";

const PLAN_BEATS = [
  "trying tennis for the first time",
  "a night of crafting",
  "an extra concert ticket",
  "cat cafe this week",
  "happy hour in Haddonfield",
  "dinner with new people",
];

const COMMUNITY_BEATS = [
  "run clubs",
  "supper clubs",
  "WFH crews",
  "book clubs",
  "neighborhood hangouts",
  "new-to-Philly circles",
];

function deviceKind(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return "other";
}

function showAppStoreCta(): boolean {
  return deviceKind() !== "android";
}

function DualCta({
  onJoin,
  tone = "cream",
}: {
  onJoin: () => void;
  tone?: "cream" | "dark" | "red";
}) {
  const app = showAppStoreCta();
  return (
    <div className={`cl-dual cl-dual--${tone}`}>
      <button type="button" className="cl-btn cl-btn--fill" onClick={onJoin}>
        Join on the web
      </button>
      {app ? (
        <a
          className="cl-btn cl-btn--ghost"
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackAppStoreClick()}
        >
          Get the iPhone app
        </a>
      ) : null}
    </div>
  );
}

/**
 * Public marketing landing (routed at /welcome). Logged-out web visits to /
 * land here. Join opens the existing phone onboarding flow.
 */
export function NewLandingPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [planBeat, setPlanBeat] = useState(0);
  const [commBeat, setCommBeat] = useState(0);
  const kind = deviceKind();
  const join = () => navigate("/onboarding");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (kind !== "ios") return;
    const meta = document.createElement("meta");
    meta.name = "apple-itunes-app";
    meta.content = `app-id=${APP_ID}, app-argument=${window.location.href}`;
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [kind]);

  useEffect(() => {
    if (reduceMotion) return;
    const plan = window.setInterval(() => setPlanBeat((n) => (n + 1) % PLAN_BEATS.length), 2200);
    const comm = window.setInterval(() => setCommBeat((n) => (n + 1) % COMMUNITY_BEATS.length), 2400);
    return () => {
      window.clearInterval(plan);
      window.clearInterval(comm);
    };
  }, [reduceMotion]);

  if (!loading && user && !needsOnboarding(user)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="cl">
      <nav className="cl-bar">
        <img src={wordmark} alt="COMMONS" className="cl-mark" />
        <Link className="cl-bar-login" to="/onboarding">
          Log in
        </Link>
        <button type="button" className="cl-bar-join" onClick={join}>
          Join
        </button>
      </nav>

      <header className="cl-hero">
        <div className="cl-hero-copy">
          <h1 className="cl-display">Let's do more, together.</h1>
          <p className="cl-lede">
            A place for plans meant to be shared. Drop yours on the feed, join one already there, or find a community. Women in and around Philly.
          </p>
          <DualCta onJoin={join} />
        </div>
      </header>

      <section className="cl-band cl-band--red" aria-label="Your plans this week">
        <p className="cl-band-kicker">Your plans this week</p>
        <p className="cl-band-line" key={planBeat}>
          {PLAN_BEATS[planBeat]}
        </p>
      </section>

      <section className="cl-split">
        <article className="cl-side">
          <p className="cl-kicker">The feed</p>
          <h2>Plans</h2>
          <p>
            Everyday coffee or a night you will actually remember. Post a plan to the feed, or join one already on there. For a crowd, or just a few.
          </p>
          <button type="button" className="cl-ui-card" onClick={join}>
            <img src="/landing/plan-craft.jpg" alt="" />
            <strong>Crafting night</strong>
            <small>Sat 7:00 PM · Fishtown</small>
            <em>Want to get a group together for a night of crafting. Beginners welcome.</em>
            <span className="cl-ui-foot">
              <span className="cl-ui-rsvp">4 going · 6 interested</span>
              <span className="cl-ui-cta">Join</span>
            </span>
          </button>
          <button type="button" className="cl-ui-card" onClick={join}>
            <img src="/landing/plan-tennis.jpg" alt="" />
            <strong>Want to try tennis</strong>
            <small>Sun 11:00 AM · Fairmount</small>
            <em>Never played. Looking for someone patient to hit with.</em>
            <span className="cl-ui-foot">
              <span className="cl-ui-rsvp">1 going · 3 interested</span>
              <span className="cl-ui-cta">Join</span>
            </span>
          </button>
          <button type="button" className="cl-ui-card" onClick={join}>
            <img src="/card-image-samples/concert.jpg" alt="" />
            <strong>Extra concert ticket</strong>
            <small>Fri 8:00 PM · The Fillmore</small>
            <em>Have an extra ticket. Who wants to come?</em>
            <span className="cl-ui-foot">
              <span className="cl-ui-rsvp">1 going · 2 interested</span>
              <span className="cl-ui-cta">Join</span>
            </span>
          </button>
        </article>

        <article className="cl-side">
          <p className="cl-kicker">The clubs</p>
          <h2>Communities</h2>
          <p>
            Run clubs, supper clubs, WFH crews, book clubs, neighborhood hangouts, new-to-Philly circles. Same people, more than once. If you don't see yours, start one.
          </p>
          <ul className="cl-perks">
            <li>
              <strong>Bulletin</strong>
              Keep the chat going between hangouts.
            </li>
            <li>
              <strong>Members</strong>
              Find each other after you meet.
            </li>
            <li>
              <strong>Next plan</strong>
              Post it here, with people into the same thing.
            </li>
          </ul>
          <div className="cl-comm-stack">
            {[
              {
                name: "Philly Work-From-Home Girls",
                img: "/card-image-samples/cafe.jpg",
                meta: "214 members",
                next: "Next: cowork coffee, Tue 10am",
              },
              {
                name: "Fishtown Girls Run",
                img: "/landing/comm-run.jpg",
                meta: "89 members",
                next: "Next: Saturday 8am, Penn Treaty Park",
              },
              {
                name: "The Dinner Club",
                img: "/landing-preview/landing-assets/dinner.png",
                meta: "156 members",
                next: "Next: Thursday dinner, Fitler Square",
              },
            ].map((c) => (
              <button key={c.name} type="button" className="cl-comm" onClick={join}>
                <img src={c.img} alt="" />
                <span>
                  <strong>{c.name}</strong>
                  <small>{c.meta}</small>
                  <small>{c.next}</small>
                </span>
                <span className="cl-ui-cta">Join</span>
              </button>
            ))}
          </div>
          <button type="button" className="cl-more" onClick={join}>
            These are just a few. There are many more inside.
          </button>
        </article>
      </section>

      <section className="cl-band cl-band--navy" aria-label="Communities">
        <p className="cl-band-kicker">already gathering</p>
        <p className="cl-band-line" key={commBeat}>
          {COMMUNITY_BEATS[commBeat]}
        </p>
      </section>

      <section className="cl-record">
        <p className="cl-kicker">for the record</p>
        <div className="cl-parts">
          <article>
            <p className="cl-part-num">Part 1</p>
            <h3>The feed</h3>
            <p>
              A place to drop in the everyday plans. Coffee, tennis, that extra concert ticket. No plan too big or too small.
            </p>
            <p>
              You shouldn't miss the things you love doing just because you don't have someone to do them with.
            </p>
            <p>No swiping. No endless messaging limbo. Start with the plan.</p>
          </article>
          <article>
            <p className="cl-part-num">Part 2</p>
            <h3>Communities</h3>
            <p>
              For the people you want to keep seeing. Stay in the loop between hangouts, then make the next plan with people into the same thing.
            </p>
            <p>Women-forward. Come as you are.</p>
          </article>
        </div>
      </section>

      <footer className="cl-foot">
        <h2>Come as you are.</h2>
        <DualCta onJoin={join} tone="dark" />
        <a className="cl-ig" href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
          Instagram
        </a>
        <div className="cl-legal">
          <Link to="/legal/privacy">Privacy</Link>
          <Link to="/legal/terms">Terms</Link>
        </div>
      </footer>

      <div className="cl-sticky">
        <button type="button" onClick={join}>
          Join on the web
        </button>
        {showAppStoreCta() && (
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" onClick={() => trackAppStoreClick()}>
            Get the iPhone app
          </a>
        )}
      </div>
    </div>
  );
}
