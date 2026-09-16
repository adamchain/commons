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
          body="The week's still wide open."
          cta={{ to: "/", label: "See what's happening" }}
        />
        <EmptyCard
          icon={<Calendar size={22} strokeWidth={1.6} color="#3A6A8A" />}
          tint="#C8DCF0"
          title="Quiet week."
          body="Go find something — or start one."
        />
        <EmptyCard
          icon={<Star size={22} strokeWidth={1.6} color="#8A6A2A" />}
          tint="#F5EDD4"
          title="Nothing cooking."
          body="A soft yes lives here, when you have one."
        />
        <EmptyCard
          icon={<MessageCircle size={22} strokeWidth={1.6} color="var(--red)" />}
          title="It's quiet in here."
          body="Say hi — even a tiny one counts."
          groupChat
        />
        <EmptyCard
          icon={<Users size={22} strokeWidth={1.6} color="#3A6A3A" />}
          tint="#C8DDC8"
          title="It's just you for now."
          body="Meet people at plans, or skip ahead and invite a friend."
          cta={{ to: "/invite", label: "Invite friends →" }}
        />
      </div>
    </main>
  );
}
