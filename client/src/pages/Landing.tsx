import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
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

// Google Form waitlist. Short link: https://forms.gle/GxVDLYj74rvXtGYb9
// Field entry IDs (from the form HTML) let us pre-fill answers via URL params.
const WAITLIST_FORM_BASE =
  "https://docs.google.com/forms/d/e/1FAIpQLSc8S_DMmQz7WaS1wZUn9GKHbIK1XELSnx81Kbjj1EMnLiOKVg/viewform";
const WAITLIST_EMAIL_ENTRY = "entry.1045781291";

function waitlistFormUrl(prefillEmail?: string): string {
  const params = new URLSearchParams({ embedded: "true" });
  if (prefillEmail) params.set(WAITLIST_EMAIL_ENTRY, prefillEmail);
  return `${WAITLIST_FORM_BASE}?${params.toString()}`;
}

// Served from client/public — referenced by root-absolute URL, not imported.
const shadowsImg = "/landing/photo-shadows.jpg";
const sunsetImg = "/landing/photo-sunset.jpg";
const picnicImg = "/landing/photo-picnic.jpg";

function Pill({
  children,
  variant = "dark",
  style: x,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  variant?: "dark" | "red" | "white" | "ghost";
  style?: CSSProperties;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  const map: Record<string, CSSProperties> = {
    dark: { background: NAVY, color: WHITE },
    red: { background: RED, color: WHITE },
    white: { background: WHITE, color: NAVY },
    ghost: { background: "transparent", color: NAVY, border: `1.5px solid rgba(20,17,48,0.22)` },
  };
  return (
    <button
      type={type}
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
 * Branded waitlist popup. Embeds the full COMMONS Google Form
 * (https://forms.gle/GxVDLYj74rvXtGYb9) in an iframe so signups happen inline
 * without leaving the landing page. The Google chrome is stripped via
 * `embedded=true`; the app-styled card supplies the framing while the form's
 * own title/fields carry the content. Opened from the hero CTA and the buttons
 * under "Post a plan two ways" and "How it works".
 */
function WaitlistModal({
  open,
  onClose,
  prefillEmail,
}: {
  open: boolean;
  onClose: () => void;
  prefillEmail?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const formUrl = waitlistFormUrl(prefillEmail);

  useEffect(() => {
    if (open) setLoaded(false);
  }, [open, formUrl]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(20,17,48,0.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", background: WHITE, borderRadius: 20, width: "100%", maxWidth: 640, height: "96vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 80px rgba(20,17,48,0.32)" }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: "absolute", top: 14, right: 14, zIndex: 2, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: WHITE, borderRadius: 9999, border: "none", fontSize: 22, lineHeight: 1, color: MUTED, cursor: "pointer", boxShadow: "0 2px 10px rgba(20,17,48,0.14)" }}
        >
          ×
        </button>
        <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {!loaded && (
            <p style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: B, fontSize: 14, color: MUTED }}>
              Loading form…
            </p>
          )}
          <iframe
            title="COMMONS waitlist form"
            src={formUrl}
            onLoad={() => setLoaded(true)}
            style={{ width: "100%", height: "100%", border: "none", display: "block", opacity: loaded ? 1 : 0, transition: "opacity 0.2s" }}
          >
            Loading…
          </iframe>
        </div>
      </div>
    </div>
  );
}

function Nav() {
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 50, background: BEIGE }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px", height: 68, display: "flex", alignItems: "center", justifyContent: "flex-start", borderBottom: `1px solid rgba(20,17,48,0.06)` }}>
        <img src={wordmark} alt="Commons" style={{ height: 26, width: "auto" }} />
      </div>
    </nav>
  );
}

function Hero({ onSignupWithEmail }: { onSignupWithEmail: (email: string) => void }) {
  const [email, setEmail] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    onSignupWithEmail(trimmed);
  };

  return (
    <section style={{ background: BEIGE }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "96px 48px 88px", display: "grid", gridTemplateColumns: "1fr", gap: 72, alignItems: "center" }} className="hero-grid">
        <div>
          <h1 style={{ fontFamily: D, fontWeight: 800, fontSize: "clamp(48px, 5.8vw, 76px)", color: NAVY, lineHeight: 0.98, letterSpacing: "-0.045em", marginBottom: 32 }}>
            More plans.<br />
            More people.<br />
            <em style={{ fontStyle: "normal", color: RED }}>More showing up.</em>
          </h1>
          <p style={{ fontFamily: B, fontSize: 16, color: MUTED, lineHeight: 1.8, marginBottom: 44, maxWidth: 400 }}>
            COMMONS is where women actually make plans — find someone to do it with, or bring your people together. Either way, something happens.
          </p>
          <form
            onSubmit={submit}
            style={{ display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap", marginBottom: 22, maxWidth: 460 }}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              aria-label="Email address"
              style={{
                flex: "1 1 200px",
                minWidth: 0,
                boxSizing: "border-box",
                fontFamily: B,
                fontSize: 15,
                color: NAVY,
                padding: "12px 18px",
                borderRadius: 9999,
                border: `1.5px solid rgba(20,17,48,0.16)`,
                background: WHITE,
                outline: "none",
              }}
            />
            <Pill type="submit" style={{ padding: "12px 26px", flexShrink: 0 }}>
              Join the waitlist
            </Pill>
          </form>
          <p style={{ fontFamily: B, fontSize: 11, color: MUTED, letterSpacing: "0.05em", marginTop: 22 }}>Invite-only · Built for iOS</p>
        </div>
      </div>
    </section>
  );
}

function PhotoStrip() {
  return (
    <div style={{ position: "relative", height: "48vh", minHeight: 300, overflow: "hidden" }}>
      <img src={shadowsImg} alt="Shadows of three friends cast against a sunlit wall" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 35%" }} />
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
        <div style={{ position: "sticky", top: 96, marginTop: 48, borderRadius: 18, overflow: "hidden", height: 500 }}>
          <img src={picnicImg} alt="Women dancing together at a show" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
        </div>
      </div>
    </section>
  );
}

function Footer() {
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
        <p style={{ fontFamily: B, fontSize: 11, color: "rgba(255,255,255,0.42)", letterSpacing: "0.05em", marginTop: 0 }}>Invite-only · Built for iOS</p>
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
  const [signupOpen, setSignupOpen] = useState(false);
  const [prefillEmail, setPrefillEmail] = useState<string | undefined>();
  const onSignup = () => {
    setPrefillEmail(undefined);
    setSignupOpen(true);
  };
  const onSignupWithEmail = (email: string) => {
    setPrefillEmail(email);
    setSignupOpen(true);
  };
  const closeSignup = () => {
    setSignupOpen(false);
    setPrefillEmail(undefined);
  };
  return (
    <div style={{ background: BEIGE, minHeight: "100vh" }}>
      <style>{`
        @media (max-width: 920px) {
          .hero-grid, .pathways-header-grid, .pathway-grid, .how-grid {
            grid-template-columns: 1fr !important;
          }
          /* Let the hero previews breathe nearly wall-to-wall on narrow screens
             so the two floating columns keep sitting side by side. */
          .hero-grid {
            padding: 48px 16px 64px !important;
            gap: 44px !important;
          }
        }
        @media (max-width: 520px) {
          .hero-grid {
            padding: 36px 10px 52px !important;
          }
          .hero-previews {
            gap: 8px !important;
          }
        }
      `}</style>
      <Nav />
      <Hero onSignupWithEmail={onSignupWithEmail} />
      <PhotoStrip />
      <TwoPathways onSignup={onSignup} />
      <HowItWorks onSignup={onSignup} />
      <Footer />
      <WaitlistModal open={signupOpen} onClose={closeSignup} prefillEmail={prefillEmail} />
    </div>
  );
}
