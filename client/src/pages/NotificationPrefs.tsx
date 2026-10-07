import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PushNotifications } from "@capacitor/push-notifications";
import { ArrowLeft } from "lucide-react";
import { api } from "../api/http";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import { ensurePushRegistered } from "../lib/push";
import { isNative } from "../lib/platform";
import {
  DEFAULT_NOTIFICATION_PREFS,
  type MeDTO,
  type NotificationPrefs,
} from "../types/shared";

/**
 * Dedicated notification-preferences page (linked from Settings).
 * Toggles are grouped into PLANS / SOCIAL / WEEKLY DIGEST / HOW — same
 * pattern as Settings, so the visual language stays consistent.
 *
 * HOW lists the channels that actually fire today: push for in-app prefs,
 * SMS for time-sensitive plan reminders. Email isn't collected on accounts
 * (phone-only auth), so it isn't offered here.
 */
export function NotificationPrefsPage() {
  const { user, setUser } = useAuth();
  const [busy, setBusy] = useState<keyof NotificationPrefs | null>(null);

  if (!user) return <LoadingScreen tagline="Loading preferences" />;

  const current: NotificationPrefs = {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...(user.notificationPrefs ?? {}),
  };

  async function toggle(key: keyof NotificationPrefs) {
    if (!user || busy) return;
    setBusy(key);
    const next: NotificationPrefs = { ...current, [key]: !current[key] };
    const snapshot = user;
    setUser({ ...snapshot, notificationPrefs: next });
    try {
      const updated = await api<MeDTO>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ notificationPrefs: next }),
      });
      setUser(updated);
    } catch {
      setUser(snapshot);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to="/settings" className="back-circle" aria-label="Back">
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 6 }}>
        Notifications
      </h1>
      <p className="brand-tagline" style={{ marginBottom: 12, textTransform: "none", letterSpacing: 0 }}>
        Pick what reaches you, when.
      </p>

      <Group label="Plans">
        <ToggleRow
          title="When a plan you joined is updated"
          sub="Time, place, cancellations"
          on={current.planCancellation}
          busy={busy === "planCancellation"}
          onToggle={() => void toggle("planCancellation")}
        />
        <ToggleRow
          title="Plan reminders"
          sub="A heads-up before it starts"
          on={current.planTomorrow && current.planInTwoHours}
          busy={busy === "planTomorrow"}
          onToggle={() => {
            const next = !(current.planTomorrow && current.planInTwoHours);
            void toggleBoth("planTomorrow", "planInTwoHours", next);
          }}
        />
        <ToggleRow
          title="When someone in your network posts a plan"
          sub="From people you've already been out with"
          on={current.postPlanNetworkNudge}
          busy={busy === "postPlanNetworkNudge"}
          onToggle={() => void toggle("postPlanNetworkNudge")}
        />
        <ToggleRow
          title="Looking For… needs someone to lock it in"
          sub="A plan you're interested in is ready"
          on={current.lookingForRecovery}
          busy={busy === "lookingForRecovery"}
          onToggle={() => void toggle("lookingForRecovery")}
        />
      </Group>

      <Group label="Social">
        <ToggleRow
          title="Group Chat messages"
          sub="Plans you're going to"
          on={current.newGroupChatMessage}
          busy={busy === "newGroupChatMessage"}
          onToggle={() => void toggle("newGroupChatMessage")}
        />
        <ToggleRow
          title="Join and Interested"
          sub="When someone taps Join or Interested on your plan"
          on={current.someoneJoinedYourPlan}
          busy={busy === "someoneJoinedYourPlan"}
          onToggle={() => void toggle("someoneJoinedYourPlan")}
        />
      </Group>

      <Group label="Weekly digest">
        <ToggleRow
          title="Friday roundup"
          sub="What's happening in Philly this weekend"
          on={current.weeklyFridayDigest}
          busy={busy === "weeklyFridayDigest"}
          onToggle={() => void toggle("weeklyFridayDigest")}
        />
      </Group>

      <Group label="How">
        <PushSetupRow />
        <InfoRow
          icon="💬"
          title="SMS"
          sub={
            user.phoneNumber
              ? `${user.phoneNumber} · Follows Plan reminders above`
              : "Follows Plan reminders above"
          }
        />
      </Group>
    </main>
  );

  async function toggleBoth(
    a: keyof NotificationPrefs,
    b: keyof NotificationPrefs,
    next: boolean,
  ) {
    if (!user) return;
    setBusy(a);
    const patched: NotificationPrefs = { ...current, [a]: next, [b]: next };
    const snapshot = user;
    setUser({ ...snapshot, notificationPrefs: patched });
    try {
      const updated = await api<MeDTO>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ notificationPrefs: patched }),
      });
      setUser(updated);
    } catch {
      setUser(snapshot);
    } finally {
      setBusy(null);
    }
  }
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <div className="settings-group-label">{label}</div>
      <div className="settings-card">{children}</div>
    </section>
  );
}

function ToggleRow({
  title,
  sub,
  on,
  busy,
  onToggle,
}: {
  title: string;
  sub: string;
  on: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="settings-row"
      role="button"
      tabIndex={0}
      aria-pressed={on}
      aria-disabled={busy}
      onClick={busy ? undefined : onToggle}
      onKeyDown={(e) => { if (!busy && (e.key === "Enter" || e.key === " ")) onToggle(); }}
    >
      <div className="settings-row-body" style={{ paddingLeft: 0 }}>
        <div className="settings-row-title">{title}</div>
        <div className="settings-row-sub" style={{ whiteSpace: "normal" }}>{sub}</div>
      </div>
      <button
        type="button"
        role="switch"
        className={`flex-switch${on ? " is-on" : ""}`}
        aria-checked={on}
        aria-label={title}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <span className="flex-switch-knob" />
      </button>
    </div>
  );
}

function PushSetupRow() {
  const [status, setStatus] = useState<"checking" | "granted" | "denied" | "prompt" | "web">("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isNative()) {
      setStatus("web");
      return;
    }
    void PushNotifications.checkPermissions()
      .then((s) => {
        setStatus(s.receive === "granted" ? "granted" : s.receive === "denied" ? "denied" : "prompt");
      })
      .catch(() => setStatus("prompt"));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      await ensurePushRegistered();
      const s = await PushNotifications.checkPermissions();
      setStatus(s.receive === "granted" ? "granted" : s.receive === "denied" ? "denied" : "prompt");
    } catch {
      setStatus("prompt");
    } finally {
      setBusy(false);
    }
  }

  const sub =
    status === "granted"
      ? "On"
      : status === "denied"
        ? "Off — allow Commons in iOS Settings"
        : status === "web"
          ? "Turn these on in the iOS app"
          : status === "checking"
            ? "Checking…"
            : "Off";

  return (
    <div className="settings-row">
      <span className="settings-row-icon" aria-hidden="true">
        <span style={{ fontSize: 18 }}>🔔</span>
      </span>
      <div className="settings-row-body">
        <div className="settings-row-title">Push notifications</div>
        <div className="settings-row-sub" style={{ whiteSpace: "normal" }}>{sub}</div>
      </div>
      {status === "prompt" && (
        <button type="button" className="settings-row-action" disabled={busy} onClick={() => void enable()}>
          {busy ? "Turning on…" : "Turn on"}
        </button>
      )}
    </div>
  );
}

function InfoRow({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="settings-row">
      <span className="settings-row-icon" aria-hidden="true">
        <span style={{ fontSize: 18 }}>{icon}</span>
      </span>
      <div className="settings-row-body">
        <div className="settings-row-title">{title}</div>
        <div className="settings-row-sub">{sub}</div>
      </div>
    </div>
  );
}
