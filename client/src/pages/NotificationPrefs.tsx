import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
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
 * The HOW section is informational for now (push channel + email + sms);
 * server-side channel selection lives on a later track.
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
    if (busy) return;
    setBusy(key);
    const next: NotificationPrefs = { ...current, [key]: !current[key] };
    try {
      const updated = await api<MeDTO>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ notificationPrefs: next }),
      });
      setUser(updated);
    } catch {
      /* keep previous state on failure */
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to="/settings" className="detail-back">
          ← Settings
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
          title="Group chat messages"
          sub="Plans you're going to"
          on={current.newGroupChatMessage}
          busy={busy === "newGroupChatMessage"}
          onToggle={() => void toggle("newGroupChatMessage")}
        />
        <ToggleRow
          title="Someone joined your plan"
          sub="When someone says they're in"
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
        <InfoRow
          icon="🔔"
          title="Push notifications"
          sub="On"
        />
        <InfoRow
          icon="✉️"
          title="Email"
          sub="Add an email to receive digests"
        />
        <InfoRow
          icon="💬"
          title="SMS"
          sub={user.phoneNumber ? `${user.phoneNumber} · Only for plans starting soon` : "Only for plans starting soon"}
        />
      </Group>
    </main>
  );

  async function toggleBoth(
    a: keyof NotificationPrefs,
    b: keyof NotificationPrefs,
    next: boolean,
  ) {
    setBusy(a);
    const patched: NotificationPrefs = { ...current, [a]: next, [b]: next };
    try {
      const updated = await api<MeDTO>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ notificationPrefs: patched }),
      });
      setUser(updated);
    } catch {
      /* swallow */
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
    <div className="settings-row">
      <div className="settings-row-body" style={{ paddingLeft: 0 }}>
        <div className="settings-row-title">{title}</div>
        <div className="settings-row-sub" style={{ whiteSpace: "normal" }}>{sub}</div>
      </div>
      <label className="pref-toggle">
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={onToggle}
          aria-label={title}
        />
      </label>
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
