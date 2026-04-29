import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { ThemeToggle } from "../components/ThemeToggle";
import { LoadingScreen } from "../components/LoadingScreen";

const SIGN_IN_LOADER_MS = 1500;
const INITIAL_LOADER_MS = 3500;

const MailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
  </svg>
);

const SparkleMark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v3" />
    <path d="M12 18v3" />
    <path d="M3 12h3" />
    <path d="M18 12h3" />
    <path d="m5.6 5.6 2.1 2.1" />
    <path d="m16.3 16.3 2.1 2.1" />
    <path d="m5.6 18.4 2.1-2.1" />
    <path d="m16.3 7.7 2.1-2.1" />
  </svg>
);

interface DecoIconSpec {
  key: string;
  top: string;
  left: string;
  size: number;
  rotate: string;
  delay: string;
  svg: ReactNode;
}

const HERO_DECO: DecoIconSpec[] = [
  {
    key: "coffee",
    top: "16%",
    left: "70%",
    size: 56,
    rotate: "-12deg",
    delay: "0s",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
        <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
        <path d="M6 2v3" />
        <path d="M10 2v3" />
        <path d="M14 2v3" />
      </svg>
    ),
  },
  {
    key: "ticket",
    top: "70%",
    left: "78%",
    size: 64,
    rotate: "8deg",
    delay: "1.1s",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
        <path d="M13 5v2" />
        <path d="M13 17v2" />
        <path d="M13 11v2" />
      </svg>
    ),
  },
  {
    key: "music",
    top: "82%",
    left: "8%",
    size: 50,
    rotate: "-6deg",
    delay: "2.0s",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    key: "wine",
    top: "8%",
    left: "12%",
    size: 44,
    rotate: "14deg",
    delay: "0.6s",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 22h8" />
        <path d="M12 11v11" />
        <path d="M19 3H5l1.4 7.5a6 6 0 0 0 11.2 0Z" />
      </svg>
    ),
  },
];

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const t = setTimeout(() => setBootLoading(false), INITIAL_LOADER_MS);
    return () => clearTimeout(t);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email to continue.");
      return;
    }
    setError(null);
    setSigningIn(true);
    const startedAt = Date.now();
    try {
      await api("/api/auth/request-link", {
        method: "POST",
        body: JSON.stringify({ email: trimmed }),
      });
      await refreshUser();
      const elapsed = Date.now() - startedAt;
      if (elapsed < SIGN_IN_LOADER_MS) {
        await new Promise((resolve) => setTimeout(resolve, SIGN_IN_LOADER_MS - elapsed));
      }
      navigate("/");
    } catch (err) {
      setSigningIn(false);
      setError(err instanceof Error ? err.message : "Could not sign in. Try again.");
    }
  };

  if (bootLoading) {
    return <LoadingScreen tagline="Welcome to Commons" />;
  }
  if (signingIn) {
    return <LoadingScreen tagline="Signing you in" />;
  }

  return (
    <main className="login-shell login-shell--split">
      <ThemeToggle />

      <section className="login-hero" aria-hidden="true">
        <div className="login-hero-deco">
          <span className="deco-arc arc-1" />
          <span className="deco-arc arc-2" />
          <span className="deco-arc arc-3" />
          {HERO_DECO.map((icon) => {
            const style: CSSProperties & { ["--rot"]?: string } = {
              top: icon.top,
              left: icon.left,
              width: icon.size,
              height: icon.size,
              animationDelay: icon.delay,
              ["--rot"]: icon.rotate,
            };
            return (
              <span key={icon.key} className="deco-icon" style={style}>
                {icon.svg}
              </span>
            );
          })}
        </div>

        <span className="login-hero-mark">
          <SparkleMark />
        </span>

        <div className="login-hero-body">
          <h2 className="login-hero-greeting">
            Hello there!<span className="wave" role="img" aria-label="wave">👋</span>
          </h2>
          <p className="login-hero-lede">
            Post plans in seconds, see who's interested, lock it in when it's time.
            Less group-chat noise. More real-life meetups.
          </p>
        </div>

        <p className="login-hero-footer">© 2026 Commons. Plans, made together.</p>
      </section>

      <section className="login-card-wrapper">
        <span className="login-form-brand">COMMONS</span>

        <header className="login-mobile-brand">
          <h1 className="brand">COMMONS</h1>
          <p className="brand-tagline">Plans, made together</p>
        </header>

        <div className="login-card">
          <h2 className="login-card-heading">Welcome back!</h2>
          <p className="login-card-sub">
            New here? <a href="#commons">Just enter your email</a> — we'll create your account on the fly.
          </p>

          <form onSubmit={(event) => void submit(event)} className="stack">
            <div className="login-input-wrap">
              <span className="input-icon" aria-hidden="true">
                <MailIcon />
              </span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                type="email"
                autoFocus
                aria-label="Email address"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block">
              Send magic link
            </button>
          </form>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="login-trust-row">
            <ShieldIcon />
            <span>Private to you. No password, no spam.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
