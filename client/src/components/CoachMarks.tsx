import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const COACH_KEY = "commons.coachMarks.v1.done";

type Step = {
  id: string;
  title: string;
  body: string;
  /** Rough anchor: which bottom-nav slot to point at (0=Home … 4=Profile; 2=+) */
  slot: number;
};

const STEPS: Step[] = [
  {
    id: "post",
    title: "Post a plan or float an idea",
    body: "Tap + anytime, lock in a plan, or just drop an idea",
    slot: 2,
  },
  {
    id: "explore",
    title: "Find your people",
    body: "Explore communities and forums — join what’s already happening.",
    slot: 1,
  },
  {
    id: "chats",
    title: "Talk to the city by interest",
    body: "Chats hold your plan threads and interest forums — coordinate the details or connect with the city.",
    slot: 3,
  },
];

/**
 * F.13 — first-run coach marks on Home only. Max 3, dismissible, never repeated.
 */
export function CoachMarks() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [stepIdx, setStepIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.onboardingComplete) return;
    if (pathname !== "/") return;
    try {
      if (localStorage.getItem(COACH_KEY) === "1") return;
    } catch {
      return;
    }
    // Brief delay so the welcome interstitial / feed can settle first.
    const t = window.setTimeout(() => setStepIdx(0), 600);
    return () => window.clearTimeout(t);
  }, [user?.id, user?.onboardingComplete, pathname]);

  if (stepIdx === null || pathname !== "/") return null;
  const step = STEPS[stepIdx];
  if (!step) return null;

  function finish() {
    try {
      localStorage.setItem(COACH_KEY, "1");
    } catch {
      /* ignore */
    }
    setStepIdx(null);
  }

  function next() {
    if (stepIdx === null) return;
    if (stepIdx >= STEPS.length - 1) {
      finish();
      return;
    }
    setStepIdx(stepIdx + 1);
  }

  // Five equal slots across the bottom nav; center (+)=slot 2.
  const leftPct = ((step.slot + 0.5) / 5) * 100;

  return (
    <div className="coach-overlay" role="dialog" aria-label="Quick tips">
      <button type="button" className="coach-scrim" aria-label="Dismiss tips" onClick={finish} />
      <div
        className="coach-card"
        style={{ ["--coach-left" as string]: `${leftPct}%` }}
      >
        <div className="coach-card-arrow" aria-hidden />
        <p className="coach-step">
          {stepIdx + 1} of {STEPS.length}
        </p>
        <h2 className="coach-title">{step.title}</h2>
        <p className="coach-body">{step.body}</p>
        <div className="coach-actions">
          <button type="button" className="btn-link" onClick={finish}>
            Skip
          </button>
          <button type="button" className="btn-primary" onClick={next}>
            {stepIdx >= STEPS.length - 1 ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
