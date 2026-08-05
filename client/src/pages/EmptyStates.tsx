import { Calendar, Coffee, MessageCircle, Star, Users } from "lucide-react";
import { EmptyCard, ScreenTitle } from "../components/ui";

/**
 * SCREEN 11 — reference page showing empty-state anatomy across the app.
 */
export function EmptyStatesPage() {
  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar empty-states-page">
      <ScreenTitle
        title="Empty States"
        subtitle="How empty states look across the app"
      />

      <div className="ref-empty-list">
        <EmptyCard
          icon={<Coffee size={22} strokeWidth={1.6} color="var(--muted)" />}
          tint="rgba(237,229,216,0.8)"
          title="Nothing on your plate yet."
          body="Join something from the feed — see what's happening this week."
          cta={{ to: "/", label: "See what's happening" }}
        />
        <EmptyCard
          icon={<Calendar size={22} strokeWidth={1.6} color="#3A6A8A" />}
          tint="#C8DCF0"
          title="No upcoming plans yet."
          body="When you host or join a plan, it'll show up here."
        />
        <EmptyCard
          icon={<Star size={22} strokeWidth={1.6} color="#8A6A2A" />}
          tint="#F5EDD4"
          title="Nothing you're interested in yet."
          body="Mark a plan as Interested and it'll land here."
        />
        <EmptyCard
          icon={<MessageCircle size={22} strokeWidth={1.6} color="var(--red)" />}
          title="It's quiet in here."
          body="Be the first to say hi — a quick hello or a logistics note goes a long way."
          groupChat
        />
        <EmptyCard
          icon={<Users size={22} strokeWidth={1.6} color="#3A6A3A" />}
          tint="#C8DDC8"
          title="No network yet."
          body="Meet people at plans and add them after — or invite a friend to skip straight to it."
          cta={{ to: "/invite", label: "Invite friends →" }}
        />
      </div>
    </main>
  );
}
