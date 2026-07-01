import { useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import wordmark from "../assets/wordmark.png";

/**
 * Public marketing landing (routed at /welcome) — a warm, editorial one-pager:
 * a type-forward hero with two floating in-app previews, a full-bleed photo
 * strip, the two-pathway pitch (mirroring the in-app "Just an idea" vs "Make a
 * plan" selector), a three-step "how it works" split, and a photo footer CTA.
 * The Commons app is iOS-only and invite-only, so the CTAs lead into onboarding
 * rather than a web sign-up.
 *
 * Photos live in client/public/landing and are referenced by root-absolute URL.
 * The brand mark uses the shared wordmark asset (there's no standalone C mark).
 */

const NAVY = "#141130";
const RED = "#BF2B2B";
const BEIGE = "#EBE4DA";
const WHITE = "#FFFFFF";
const MUTED = "rgba(20,17,48,0.46)";
const D = "'Plus Jakarta Sans', sans-serif";
const B = "'Poppins', sans-serif";

// Mailchimp embedded-form action URL. Get it from Mailchimp:
// Audience → Signup forms → Embedded forms → copy the URL inside <form action="…">.
// It looks like: https://<something>.us21.list-manage.com/subscribe/post?u=XXXX&id=YYYY
// The modal below turns this into a JSONP call so signups happen inline (no redirect).
const MAILCHIMP_ACTION = "";

// Served from client/public — referenced by root-absolute URL, not imported.
const shadowsImg = "/landing/photo-shadows.jpg";
const sunsetImg = "/landing/photo-sunset.jpg";
const picnicImg = "/landing/photo-picnic.jpg";
const feedYogaImg = "/landing/feed-yoga.jpg";

function Pill({
  children,
  variant = "dark",
  style: x,
  onClick,
}: {
  children: ReactNode;
  variant?: "dark" | "red" | "white" | "ghost";
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const map: Record<string, CSSProperties> = {
    dark: { background: NAVY, color: WHITE },
    red: { background: RED, color: WHITE },
    white: { background: WHITE, color: NAVY },
    ghost: { background: "transparent", color: NAVY, border: `1.5px solid rgba(20,17,48,0.22)` },
  };
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 9999,
        fontFamily: B,
        fontWeight: 500,
        fontSize: 14,
        cursor: "pointer",
        border: "none",
        transition: "opacity 0.15s",
        padding: "12px 26px",
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
        ...map[variant],
        ...x,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.78")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      {children}
    </button>
  );
}

/**
 * Branded email-capture popup. Submits to Mailchimp via JSONP (the standard
 * `post-json?...&c=callback` pattern) so the signup happens inline without
 * redirecting off the landing page. Opened from the hero CTA and the buttons
 * under "Post a plan two ways" and "How it works".
 */
function WaitlistModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  if (!open) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!MAILCHIMP_ACTION) {
      setStatus("err");
      setMsg("Signup isn't connected yet — add your Mailchimp form URL.");
      return;
    }
    setStatus("loading");
    const cb = `mcCallback${Math.floor(Math.random() * 1e9)}`;
    const url = MAILCHIMP_ACTION.replace("/post?", "/post-json?");
    const script = document.createElement("script");
    (window as unknown as Record<string, unknown>)[cb] = (data: { result: string; msg: string }) => {
      const clean = data.msg ? data.msg.replace(/<[^>]*>/g, "") : "";
      if (data.result === "success") {
        setStatus("ok");
        setMsg("You're on the list — we'll be in touch.");
      } else {
        setStatus("err");
        setMsg(clean || "Something went wrong. Try again.");
      }
      delete (window as unknown as Record<string, unknown>)[cb];
      script.remove();
    };
    script.src = `${url}&EMAIL=${encodeURIComponent(email)}&c=${cb}`;
    document.body.appendChild(script);
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(20,17,48,0.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", background: WHITE, borderRadius: 24, padding: "44px 40px 40px", width: "100%", maxWidth: 420, boxShadow: "0 24px 80px rgba(20,17,48,0.32)" }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: "absolute", top: 18, right: 18, background: "transparent", border: "none", fontSize: 22, lineHeight: 1, color: MUTED, cursor: "pointer", padding: 4 }}
        >
          ×
        </button>
        <p style={{ fontFamily: B, fontWeight: 600, fontSize: 11, color: RED, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12 }}>Invite-only · iOS</p>
        <h3 style={{ fontFamily: D, fontWeight: 800, fontSize: 28, color: NAVY, letterSpacing: "-0.035em", lineHeight: 1.1, marginBottom: 10 }}>Join the waitlist</h3>
        <p style={{ fontFamily: B, fontSize: 14, color: MUTED, lineHeight: 1.65, marginBottom: 24 }}>
          Be first to know when Commons opens up in your city.
        </p>
        {status === "ok" ? (
          <p style={{ fontFamily: B, fontSize: 15, color: NAVY, fontWeight: 500, lineHeight: 1.6 }}>{msg}</p>
        ) : (
          <form onSubmit={submit}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              style={{ width: "100%", boxSizing: "border-box", fontFamily: B, fontSize: 15, color: NAVY, padding: "14px 18px", borderRadius: 9999, border: `1.5px solid rgba(20,17,48,0.16)`, outline: "none", marginBottom: 12 }}
            />
            <Pill onClick={() => {}} style={{ width: "100%", padding: "14px 26px", fontSize: 15, opacity: status === "loading" ? 0.6 : 1 }}>
              {status === "loading" ? "Joining…" : "Join the waitlist"}
            </Pill>
            {status === "err" && (
              <p style={{ fontFamily: B, fontSize: 12, color: RED, marginTop: 12, lineHeight: 1.5 }}>{msg}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function FloatingFeed() {
  const days = [
    { n: "22", d: "M", active: true },
    { n: "23", d: "T" },
    { n: "24", d: "W" },
    { n: "25", d: "T" },
    { n: "26", d: "F" },
    { n: "27", d: "S" },
    { n: "28", d: "S" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ background: WHITE, borderRadius: 16, padding: "16px 20px", boxShadow: "0 1px 12px rgba(20,17,48,0.06)", display: "flex", justifyContent: "space-between" }}>
        {days.map((d) => (
          <div key={d.n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <span style={{ fontFamily: B, fontSize: 9, color: MUTED, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em" }}>{d.d}</span>
            <div style={{ width: 29, height: 29, borderRadius: "50%", background: d.active ? RED : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: B, fontSize: 12, fontWeight: d.active ? 600 : 400, color: d.active ? WHITE : NAVY }}>{d.n}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 5, paddingLeft: 1 }}>
        {["All plans", "My plans", "Filters"].map((t, i) => (
          <span key={t} style={{ fontFamily: B, fontSize: 11, fontWeight: 500, padding: "5px 12px", borderRadius: 9999, background: i === 0 ? WHITE : "transparent", color: i === 0 ? NAVY : MUTED, boxShadow: i === 0 ? "0 1px 6px rgba(20,17,48,0.07)" : "none" }}>{t}</span>
        ))}
      </div>
      <div style={{ background: WHITE, borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 18px rgba(20,17,48,0.07)" }}>
        <div style={{ padding: "14px 16px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <div style={{ width: 19, height: 19, borderRadius: "50%", background: "#C8B8A2", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: NAVY }}>A</span>
            </div>
            <span style={{ fontFamily: B, fontSize: 10, color: MUTED, fontWeight: 500 }}>Anna</span>
          </div>
          <p style={{ fontFamily: D, fontWeight: 700, fontSize: 13, color: NAVY, letterSpacing: "-0.02em", lineHeight: 1.3, marginBottom: 4 }}>Anyone Want To Try Yoga This Week?</p>
          <p style={{ fontFamily: B, fontSize: 10, color: MUTED }}>Mon, Jun 22 · 7:00 PM · Rittenhouse</p>
        </div>
        <div style={{ height: 84, overflow: "hidden" }}>
          <img src={feedYogaImg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%" }} />
        </div>
        <div style={{ padding: "10px 16px 13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: B, fontSize: 10, color: MUTED }}>1 going · 2 interested</span>
          <span style={{ background: RED, color: WHITE, borderRadius: 9999, fontFamily: B, fontWeight: 500, fontSize: 10, padding: "4px 12px" }}>Interested</span>
        </div>
      </div>
      <div style={{ background: WHITE, borderRadius: 16, padding: "14px 16px", boxShadow: "0 2px 18px rgba(20,17,48,0.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <div style={{ width: 19, height: 19, borderRadius: "50%", background: "#8B7355", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: WHITE }}>M</span>
          </div>
          <span style={{ fontFamily: B, fontSize: 10, color: MUTED, fontWeight: 500 }}>Marcia</span>
        </div>
        <p style={{ fontFamily: D, fontWeight: 700, fontSize: 13, color: NAVY, letterSpacing: "-0.02em", lineHeight: 1.3, marginBottom: 4 }}>Long Run — Schuylkill Banks</p>
        <p style={{ fontFamily: B, fontSize: 10, color: MUTED, marginBottom: 10 }}>Wed, Jul 29 · 7:00 AM · Schuylkill Banks</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: B, fontSize: 10, color: MUTED }}>5 going · 3 interested</span>
          <span style={{ background: RED, color: WHITE, borderRadius: 9999, fontFamily: B, fontWeight: 500, fontSize: 10, padding: "4px 12px" }}>Join</span>
        </div>
      </div>
    </div>
  );
}

function FloatingPathSelector() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ paddingBottom: 6 }}>
        <p style={{ fontFamily: B, fontSize: 10, color: MUTED, marginBottom: 8, letterSpacing: "0.02em" }}>← Back</p>
        <h3 style={{ fontFamily: D, fontWeight: 800, fontSize: 20, color: NAVY, letterSpacing: "-0.035em", lineHeight: 1.2, marginBottom: 5 }}>
          Hey Anna,<br />what's on your mind?
        </h3>
        <p style={{ fontFamily: B, fontSize: 11, color: MUTED, lineHeight: 1.55 }}>Drop something in, you never know who's down.</p>
      </div>
      <div style={{ background: WHITE, borderRadius: 16, padding: "18px 18px", boxShadow: "0 2px 18px rgba(20,17,48,0.07)", border: `1.5px solid ${RED}` }}>
        <p style={{ fontFamily: B, fontWeight: 600, fontSize: 9, color: RED, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 7 }}>Casual</p>
        <p style={{ fontFamily: D, fontWeight: 800, fontSize: 15, color: NAVY, letterSpacing: "-0.025em", marginBottom: 6 }}>Just an idea</p>
        <p style={{ fontFamily: B, fontSize: 11, color: MUTED, lineHeight: 1.6, marginBottom: 13 }}>A casual thought — see who's down before committing to anything.</p>
        <span style={{ display: "inline-flex", background: RED, color: WHITE, borderRadius: 9999, fontFamily: B, fontWeight: 500, fontSize: 11, padding: "6px 14px" }}>Share the vibe →</span>
      </div>
      <div style={{ background: WHITE, borderRadius: 16, padding: "18px 18px", boxShadow: "0 2px 18px rgba(20,17,48,0.07)" }}>
        <p style={{ fontFamily: B, fontWeight: 600, fontSize: 9, color: MUTED, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 7 }}>Committed</p>
        <p style={{ fontFamily: D, fontWeight: 800, fontSize: 15, color: NAVY, letterSpacing: "-0.025em", marginBottom: 6 }}>Make a plan</p>
        <p style={{ fontFamily: B, fontSize: 11, color: MUTED, lineHeight: 1.6, marginBottom: 13 }}>Know what you want to do. Set the details, post it, and see who's in.</p>
        <span style={{ display: "inline-flex", background: "transparent", color: NAVY, border: `1.5px solid rgba(20,17,48,0.18)`, borderRadius: 9999, fontFamily: B, fontWeight: 500, fontSize: 11, padding: "6px 14px" }}>Set the details →</span>
      </div>
    </div>
  );
}

function Nav({ onStart }: { onStart: () => void }) {
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 50, background: BEIGE }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px", height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid rgba(20,17,48,0.06)` }}>
        <img src={wordmark} alt="Commons" style={{ height: 26, width: "auto" }} />
        <Pill style={{ padding: "9px 22px", fontSize: 13 }} onClick={onStart}>Get started</Pill>
      </div>
    </nav>
  );
}

function Hero({ onSignup }: { onSignup: () => void }) {
  return (
    <section style={{ background: BEIGE }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "96px 48px 88px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center" }} className="hero-grid">
        <div>
          <h1 style={{ fontFamily: D, fontWeight: 800, fontSize: "clamp(48px, 5.8vw, 76px)", color: NAVY, lineHeight: 0.98, letterSpacing: "-0.045em", marginBottom: 32 }}>
            More plans.<br />
            More people.<br />
            <em style={{ fontStyle: "normal", color: RED }}>More showing up.</em>
          </h1>
          <p style={{ fontFamily: B, fontSize: 16, color: MUTED, lineHeight: 1.8, marginBottom: 44, maxWidth: 400 }}>
            COMMONS is where women actually make plans — find someone to do it with, or bring your people together. Either way, something happens.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", marginBottom: 22 }}>
            <Pill onClick={onSignup}>Join the waitlist</Pill>
            <a href="#how" style={{ textDecoration: "none" }}>
              <Pill variant="ghost">See how it works</Pill>
            </a>
            <a href="#pathways" style={{ fontFamily: B, fontWeight: 500, fontSize: 14, color: NAVY, textDecoration: "none", borderBottom: `1px solid rgba(20,17,48,0.3)`, paddingBottom: 2 }}>Peek inside</a>
          </div>
          <p style={{ fontFamily: B, fontSize: 11, color: MUTED, letterSpacing: "0.05em" }}>Invite-only · Built for iOS</p>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ flex: 1, paddingTop: 36 }}><FloatingFeed /></div>
          <div style={{ flex: 1 }}><FloatingPathSelector /></div>
        </div>
      </div>
    </section>
  );
}

function PhotoStrip() {
  return (
    <div style={{ position: "relative", height: "48vh", minHeight: 300, overflow: "hidden" }}>
      <img src={shadowsImg} alt="Friends together in golden light" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 35%" }} />
      <div style={{ position: "absolute", inset: 0, background: "rgba(20,17,48,0.06)" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontFamily: D, fontWeight: 800, fontSize: "clamp(24px, 3.8vw, 50px)", color: WHITE, letterSpacing: "-0.035em", textAlign: "center", maxWidth: 620, padding: "0 40px", lineHeight: 1.18, textShadow: "0 2px 32px rgba(20,17,48,0.28)" }}>
          A place where "we should do something" actually turns into something.
        </p>
      </div>
    </div>
  );
}

function TwoPathways({ onSignup }: { onSignup: () => void }) {
  const [sel, setSel] = useState<"casual" | "committed">("casual");
  const cards = [
    { id: "casual" as const, label: "Casual", title: "Just an idea.", body: "Something's on your mind but you're not sure yet. Toss it out — see who's around and interested before you commit to anything.", cta: "Share the vibe →", ctaStyle: { background: RED, color: WHITE } as CSSProperties },
    { id: "committed" as const, label: "Committed", title: "Make a plan.", body: "Know what you want to do. Set the details, post it, and see who's in.", cta: "Set the details →", ctaStyle: { background: "transparent", color: NAVY, border: `1.5px solid rgba(20,17,48,0.2)` } as CSSProperties },
  ];
  return (
    <section id="pathways" style={{ background: BEIGE, padding: "112px 48px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, marginBottom: 56, alignItems: "end" }} className="pathways-header-grid">
          <h2 style={{ fontFamily: D, fontWeight: 800, fontSize: "clamp(36px, 4.2vw, 58px)", color: NAVY, letterSpacing: "-0.045em", lineHeight: 1.0, margin: 0 }}>
            Post a plan<br />two ways
          </h2>
          <p style={{ fontFamily: B, fontSize: 16, color: MUTED, lineHeight: 1.75, maxWidth: 340, margin: 0 }}>
            Whether you have something in mind or you're just putting it out there.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="pathway-grid">
          {cards.map((c) => (
            <div key={c.id} onClick={() => setSel(c.id)} style={{ background: WHITE, borderRadius: 22, padding: "38px 34px", cursor: "pointer", border: sel === c.id ? `1.5px solid ${RED}` : `1.5px solid transparent`, boxShadow: sel === c.id ? "0 6px 40px rgba(191,43,43,0.08), 0 2px 8px rgba(20,17,48,0.04)" : "0 2px 20px rgba(20,17,48,0.05)", transition: "box-shadow 0.2s, border-color 0.2s" }}>
              <p style={{ fontFamily: B, fontWeight: 600, fontSize: 10, color: RED, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 14 }}>{c.label}</p>
              <h3 style={{ fontFamily: D, fontWeight: 800, fontSize: 27, color: NAVY, letterSpacing: "-0.03em", marginBottom: 14, lineHeight: 1.12 }}>{c.title}</h3>
              <p style={{ fontFamily: B, fontSize: 15, color: MUTED, lineHeight: 1.72, marginBottom: 26 }}>{c.body}</p>
              <span style={{ display: "inline-flex", borderRadius: 9999, fontFamily: B, fontWeight: 500, fontSize: 13, padding: "9px 18px", ...c.ctaStyle }}>{c.cta}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 44 }}>
          <Pill onClick={onSignup} style={{ padding: "14px 32px", fontSize: 15 }}>Join the waitlist</Pill>
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ onSignup }: { onSignup: () => void }) {
  const steps = [
    { n: "01", title: "Post the plan", body: "Float a casual idea or lock in the details — a time, a place, a vibe. No endless back-and-forth just to get something on the calendar." },
    { n: "02", title: "Find your people", body: "Discover women nearby doing the same thing, or share the plan with your existing network. Either way, the right people show up." },
    { n: "03", title: "Get it out of the group chat", body: "Everyone who's in lands in one group chat. Share the details, settle things with a quick poll, and actually show up." },
  ];
  return (
    <section id="how" style={{ background: BEIGE, padding: "112px 48px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "start" }} className="how-grid">
        <div>
          <h2 style={{ fontFamily: D, fontWeight: 800, fontSize: "clamp(34px, 4vw, 54px)", color: NAVY, letterSpacing: "-0.045em", lineHeight: 1.0, marginBottom: 14 }}>
            From group-chat limbo to a real plan
          </h2>
          <p style={{ fontFamily: B, fontSize: 15, color: MUTED, lineHeight: 1.7, marginBottom: 52 }}>Three steps, start to finish.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {steps.map((s) => (
              <div key={s.n} style={{ background: WHITE, borderRadius: 18, padding: "26px 28px", boxShadow: "0 2px 16px rgba(20,17,48,0.05)", display: "flex", gap: 22, alignItems: "flex-start" }}>
                <span style={{ fontFamily: B, fontWeight: 700, fontSize: 11, color: RED, letterSpacing: "0.07em", minWidth: 24, paddingTop: 3 }}>{s.n}</span>
                <div>
                  <h3 style={{ fontFamily: D, fontWeight: 800, fontSize: 18, color: NAVY, letterSpacing: "-0.025em", marginBottom: 7, lineHeight: 1.2 }}>{s.title}</h3>
                  <p style={{ fontFamily: B, fontSize: 13, color: MUTED, lineHeight: 1.75 }}>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 32 }}>
            <Pill onClick={onSignup} style={{ padding: "14px 32px", fontSize: 15 }}>Join the waitlist</Pill>
          </div>
        </div>
        <div style={{ position: "sticky", top: 96, borderRadius: 18, overflow: "hidden", height: 500 }}>
          <img src={picnicImg} alt="Women clinking drinks at a picnic" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
        </div>
      </div>
    </section>
  );
}

function Footer({ onStart }: { onStart: () => void }) {
  return (
    <footer style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <img src={sunsetImg} alt="Friends silhouetted against a golden sunset" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 40%" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(20,17,48,0.75) 0%, rgba(20,17,48,0.3) 55%, rgba(20,17,48,0.1) 100%)" }} />
      </div>
      <div style={{ position: "relative", zIndex: 1, maxWidth: 600, margin: "0 auto", textAlign: "center", padding: "128px 48px 96px" }}>
        <h2 style={{ fontFamily: D, fontWeight: 800, fontSize: "clamp(36px, 4.8vw, 62px)", color: WHITE, letterSpacing: "-0.045em", lineHeight: 1.0, marginBottom: 22 }}>
          Turn "we should<br />hang out" into<br />real plans.
        </h2>
        <p style={{ fontFamily: B, fontSize: 16, color: "rgba(255,255,255,0.65)", lineHeight: 1.75, maxWidth: 360, margin: "0 auto 44px" }}>
          Post what you're doing — or just float an idea. The people are already out there.
        </p>
        <Pill variant="white" style={{ padding: "14px 34px", fontSize: 15 }} onClick={onStart}>Get started</Pill>
        <p style={{ fontFamily: B, fontSize: 11, color: "rgba(255,255,255,0.42)", letterSpacing: "0.05em", marginTop: 18 }}>Invite-only · Built for iOS</p>
        <div style={{ marginTop: 80, paddingTop: 28, borderTop: `1px solid rgba(255,255,255,0.12)`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <img src={wordmark} alt="Commons" style={{ height: 22, width: "auto", filter: "brightness(0) invert(1)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <Link to="/legal/privacy" style={{ fontFamily: B, fontSize: 11, color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>Privacy</Link>
            <Link to="/legal/terms" style={{ fontFamily: B, fontSize: 11, color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>Terms</Link>
            <span style={{ fontFamily: B, fontSize: 11, color: "rgba(255,255,255,0.38)" }}>© 2026 Commons. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const onStart = () => navigate("/onboarding");
  const [signupOpen, setSignupOpen] = useState(false);
  const onSignup = () => setSignupOpen(true);
  return (
    <div style={{ background: BEIGE, minHeight: "100vh" }}>
      <style>{`
        @media (max-width: 920px) {
          .hero-grid, .pathways-header-grid, .pathway-grid, .how-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <Nav onStart={onStart} />
      <Hero onSignup={onSignup} />
      <PhotoStrip />
      <TwoPathways onSignup={onSignup} />
      <HowItWorks onSignup={onSignup} />
      <Footer onStart={onStart} />
      <WaitlistModal open={signupOpen} onClose={() => setSignupOpen(false)} />
    </div>
  );
}
