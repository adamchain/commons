import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PushNotifications } from "@capacitor/push-notifications";
import { ArrowLeft, Bell, MessageCircle } from "lucide-react";
import { api } from "../api/http";
import { LoadingScreen } from "../components/LoadingScreen";
import { ScreenTitle } from "../components/ui";
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
    <main className="app-shell app-shell--with-nav app-shell--with-topbar notif-prefs-page">
      <header className="app-header app-header--minimal">
        <Link to="/settings" className="back-circle" aria-label="Back">
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </Link>
      </header>
      <ScreenTitle title="Notifications" subtitle="Pick what reaches you, when." />

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
        <PushSetupRow
          on={current.pushEnabled}
          busy={busy === "pushEnabled"}
          onChange={(next) => void setPushEnabled(next)}
        />
        <InfoRow
          icon={<MessageCircle size={18} strokeWidth={1.8} />}
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

  async function setPushEnabled(next: boolean) {
    if (!user || busy) return;
    if (next && isNative()) {
      setBusy("pushEnabled");
      try {
        await ensurePushRegistered();
        const s = await PushNotifications.checkPermissions();
        if (s.receive !== "granted") return;
      } catch {
        return;
      } finally {
        setBusy(null);
      }
    }
    setBusy("pushEnabled");
    const patched: NotificationPrefs = { ...current, pushEnabled: next };
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
    <button
      type="button"
      className="settings-row"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={onToggle}
    >
      <div className="settings-row-body" style={{ paddingLeft: 0 }}>
        <div className="settings-row-title">{title}</div>
        <div className="settings-row-sub">{sub}</div>
      </div>
      <span className={`flex-switch${on ? " is-on" : ""}`} aria-hidden="true">
        <span className="flex-switch-knob" />
      </span>
    </button>
  );
}

function PushSetupRow({
  on,
  busy,
  onChange,
}: {
  on: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
}) {
  const [ios, setIos] = useState<"checking" | "granted" | "denied" | "prompt" | "web">("checking");

  useEffect(() => {
    if (!isNative()) {
      setIos("web");
      return;
    }
    void PushNotifications.checkPermissions()
      .then((s) => {
        setIos(s.receive === "granted" ? "granted" : s.receive === "denied" ? "denied" : "prompt");
      })
      .catch(() => setIos("prompt"));
  }, [on]);

  const blockedByIos = ios === "denied";
  const shownOn = on && !blockedByIos;
  const sub = blockedByIos
    ? "Off — allow Commons in iOS Settings to turn them back on"
    : shownOn
      ? "On — tap to turn off"
      : ios === "prompt"
        ? "Set up push notifications"
        : ios === "web"
          ? "Off for pushes. This switch saves on your account."
          : "Off — tap to turn on";

  return (
    <button
      type="button"
      className="settings-row"
      role="switch"
      aria-checked={shownOn}
      disabled={busy}
      onClick={() => onChange(!shownOn)}
    >
      <span className="settings-row-icon" aria-hidden="true">
        <Bell size={18} strokeWidth={1.8} />
      </span>
      <div className="settings-row-body">
        <div className="settings-row-title">Push notifications</div>
        <div className="settings-row-sub">{sub}</div>
      </div>
      <span className={`flex-switch${shownOn ? " is-on" : ""}`} aria-hidden="true">
        <span className="flex-switch-knob" />
      </span>
    </button>
  );
}

function InfoRow({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <div className="settings-row">
      <span className="settings-row-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="settings-row-body">
        <div className="settings-row-title">{title}</div>
        <div className="settings-row-sub">{sub}</div>
      </div>
    </div>
  );
}
