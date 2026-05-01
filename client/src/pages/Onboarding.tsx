import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { AvatarBuilder } from "../components/AvatarBuilder";
import { useAuth } from "../context/AuthContext";
import {
  ALL_INTERESTS,
  INTEREST_EMOJI,
  type AvatarStyle,
  type InterestTag,
  type MeDTO,
  type NeighborhoodDTO,
  type PlanDTO,
} from "../types/shared";

type Step = "tease" | "phone" | "code" | "name" | "neighborhood" | "interests" | "avatar";

export function OnboardingPage() {
  const { user, refreshUser, setUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(() => decideInitialStep(user));
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // If logged-in user navigates here with onboarding done, send them home.
  useEffect(() => {
    if (user?.onboardingComplete) navigate("/", { replace: true });
  }, [user, navigate]);

  // If they log in via code-verify mid-flow, advance them past phone steps.
  useEffect(() => {
    if (user && (step === "phone" || step === "code" || step === "tease")) {
      setStep(decideInitialStep(user));
    }
  }, [user, step]);

  async function requestCode() {
    setError(null);
    setBusy(true);
    try {
      const result = await api<{ phoneNumber: string }>("/api/auth/request-code", {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
      });
      setPhoneNumber(result.phoneNumber);
      setStep("code");
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setError(null);
    setBusy(true);
    try {
      const me = await api<MeDTO>("/api/auth/verify-code", {
        method: "POST",
        body: JSON.stringify({ phoneNumber, code }),
      });
      setUser(me);
      setStep(decideInitialStep(me));
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  async function patchMe(patch: Partial<MeDTO>) {
    const me = await api<MeDTO>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setUser(me);
    return me;
  }

  if (step === "tease") {
    return <TeaseStep onSignUp={() => setStep("phone")} />;
  }
  if (step === "phone") {
    return (
      <OnboardingShell title="What's your number?" subtitle="We'll text you a code.">
        <input
          className="onboarding-input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 555-0100"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
        />
        {error && <div className="onboarding-error">{error}</div>}
        <button className="btn-primary btn-block" disabled={busy || !phoneNumber} onClick={requestCode}>
          {busy ? "Sending…" : "Send code"}
        </button>
      </OnboardingShell>
    );
  }
  if (step === "code") {
    return (
      <OnboardingShell title="Enter the code" subtitle={`Sent to ${phoneNumber}`}>
        <input
          className="onboarding-input onboarding-input-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        {error && <div className="onboarding-error">{error}</div>}
        <button className="btn-primary btn-block" disabled={busy || code.length !== 6} onClick={verifyCode}>
          {busy ? "Verifying…" : "Verify"}
        </button>
        <button className="btn-link" onClick={() => setStep("phone")} type="button">
          Wrong number?
        </button>
      </OnboardingShell>
    );
  }
  if (!user) {
    return <OnboardingShell title="Loading…" subtitle="" />;
  }
  if (step === "name") {
    return <NameStep me={user} onSave={async (firstName) => { await patchMe({ firstName }); setStep("neighborhood"); }} />;
  }
  if (step === "neighborhood") {
    return <NeighborhoodStep me={user} onSave={async (neighborhoodId) => { await patchMe({ neighborhoodId }); setStep("interests"); }} />;
  }
  if (step === "interests") {
    return <InterestsStep me={user} onSave={async (interests) => { await patchMe({ interests }); setStep("avatar"); }} />;
  }
  if (step === "avatar") {
    return (
      <AvatarStep
        me={user}
        onSave={async (avatarSeed, avatarStyle) => {
          await patchMe({ avatarSeed, avatarStyle, onboardingComplete: true });
          await refreshUser();
          navigate("/", { replace: true });
        }}
      />
    );
  }
  return null;
}

function decideInitialStep(user: MeDTO | null): Step {
  if (!user) return "tease";
  if (user.onboardingComplete) return "tease"; // will redirect via effect
  if (!user.firstName) return "name";
  if (!user.neighborhoodId) return "neighborhood";
  if (user.interests.length < 1) return "interests";
  return "avatar";
}

function formatError(e: unknown): string {
  if (e instanceof Error) {
    try {
      const parsed = JSON.parse(e.message);
      if (typeof parsed?.error === "string") return parsed.error;
    } catch { /* fall through */ }
    return e.message;
  }
  return "Something went wrong";
}

function OnboardingShell({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">
        <div className="onboarding-brand">COMMONS</div>
        <h1 className="onboarding-title">{title}</h1>
        {subtitle && <p className="onboarding-subtitle">{subtitle}</p>}
        <div className="onboarding-body">{children}</div>
      </div>
    </div>
  );
}

function TeaseStep({ onSignUp }: { onSignUp: () => void }) {
  const [plans, setPlans] = useState<PlanDTO[] | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const data = await api<PlanDTO[]>("/api/plans/preview");
        setPlans(data);
      } catch {
        setPlans([]);
      }
    })();
  }, []);

  return (
    <div className="tease">
      <div className="tease-header">
        <div className="onboarding-brand">COMMONS</div>
        <p className="tease-tagline">A peek at what's happening near you</p>
      </div>
      <div className="tease-scroller">
        {plans === null && <div className="tease-loading">Loading…</div>}
        {plans && plans.length === 0 && <div className="tease-empty">No live plans yet.</div>}
        {plans?.map((p) => (
          <div key={p.id} className="tease-card">
            <div className="tease-card-host">
              <span className="tease-card-emoji">{p.hostEmoji}</span>
              <span>{p.creator.firstName}</span>
            </div>
            <div className="tease-card-title">{p.title}</div>
            <div className="tease-card-meta">
              {p.location.name} · {p.isFlexibleTime ? "flexible" : p.time}
            </div>
            <div className="tease-card-going">{p.participants.going.length} going</div>
          </div>
        ))}
      </div>
      <button className="btn-primary btn-block tease-cta" onClick={onSignUp}>
        Sign up to do more
      </button>
    </div>
  );
}

function NameStep({ me, onSave }: { me: MeDTO; onSave: (n: string) => Promise<void> }) {
  const [name, setName] = useState(me.firstName);
  const [busy, setBusy] = useState(false);
  return (
    <OnboardingShell title="What's your first name?" subtitle="That's all we show others.">
      <input
        className="onboarding-input"
        autoFocus
        placeholder="Alex"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="btn-primary btn-block" disabled={busy || !name.trim()} onClick={async () => { setBusy(true); await onSave(name.trim()); }}>
        Next
      </button>
    </OnboardingShell>
  );
}

function NeighborhoodStep({ onSave }: { me: MeDTO; onSave: (id: string) => Promise<void> }) {
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodDTO[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const list = await api<NeighborhoodDTO[]>("/api/neighborhoods");
      setNeighborhoods(list);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return neighborhoods;
    return neighborhoods.filter((n) => n.name.toLowerCase().includes(q) || n.metro.toLowerCase().includes(q));
  }, [neighborhoods, filter]);

  return (
    <OnboardingShell title="Where do you live?" subtitle="Pick the neighborhood you spend the most time in.">
      <input
        className="onboarding-input"
        placeholder="Search…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <ul className="neighborhood-list">
        {filtered.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className="neighborhood-row"
              disabled={busy}
              onClick={async () => { setBusy(true); await onSave(n.id); }}
            >
              <span className="neighborhood-name">{n.name}</span>
              <span className="neighborhood-metro">{n.metro}</span>
            </button>
          </li>
        ))}
      </ul>
    </OnboardingShell>
  );
}

function InterestsStep({ me, onSave }: { me: MeDTO; onSave: (interests: InterestTag[]) => Promise<void> }) {
  const [picked, setPicked] = useState<InterestTag[]>(me.interests);
  const [busy, setBusy] = useState(false);
  const max = 3;

  function toggle(t: InterestTag) {
    if (picked.includes(t)) {
      setPicked(picked.filter((x) => x !== t));
    } else if (picked.length < max) {
      setPicked([...picked, t]);
    }
  }

  return (
    <OnboardingShell title="Pick 3 interests" subtitle="Shapes what you see. You can change these later.">
      <div className="interest-grid">
        {ALL_INTERESTS.map((t) => {
          const isPicked = picked.includes(t);
          const disabled = !isPicked && picked.length >= max;
          return (
            <button
              key={t}
              type="button"
              disabled={disabled}
              className={`interest-tile ${isPicked ? "is-picked" : ""}`}
              onClick={() => toggle(t)}
            >
              <span className="interest-emoji">{INTEREST_EMOJI[t]}</span>
              <span className="interest-label">{t}</span>
            </button>
          );
        })}
      </div>
      <button
        className="btn-primary btn-block"
        disabled={busy || picked.length !== max}
        onClick={async () => { setBusy(true); await onSave(picked); }}
      >
        {picked.length}/{max} picked — Next
      </button>
    </OnboardingShell>
  );
}

function AvatarStep({ me, onSave }: { me: MeDTO; onSave: (seed: string, style: AvatarStyle) => Promise<void> }) {
  return (
    <OnboardingShell title="Make your face" subtitle="No photo needed.">
      <AvatarBuilder
        initialSeed={me.avatarSeed}
        initialStyle={me.avatarStyle}
        onSave={onSave}
      />
    </OnboardingShell>
  );
}
