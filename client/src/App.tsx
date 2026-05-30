import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./context/AuthContext";
import { BottomNav } from "./components/BottomNav";
import { TopBar } from "./components/TopBar";
import { LoadingScreen } from "./components/LoadingScreen";
import { ChatPage } from "./pages/Chat";
import { CreatePlanPage } from "./pages/CreatePlan";
import { EditPlanPage } from "./pages/EditPlan";
import { ExplorePage } from "./pages/Explore";
import { FeedPage } from "./pages/Feed";
import { NotificationsPage } from "./pages/Notifications";
import { OnboardingPage } from "./pages/Onboarding";
import { PlanDetailPage } from "./pages/PlanDetail";
import { AdminPage } from "./pages/Admin";
import { ProfilePage } from "./pages/Profile";
import { NetworkPage } from "./pages/Network";
import { InvitePage } from "./pages/Invite";
import { SettingsPage } from "./pages/Settings";
import { NotificationPrefsPage } from "./pages/NotificationPrefs";
import { MessagesPage } from "./pages/Messages";

const APP_BOOT_AT = Date.now();
const MIN_BOOT_SPLASH_MS = 1500;

function Protected({
  children,
  allowIncomplete = false,
}: {
  children: ReactNode;
  allowIncomplete?: boolean;
}) {
  const { user, loading } = useAuth();
  const [bootSplashDone, setBootSplashDone] = useState(
    () => Date.now() - APP_BOOT_AT >= MIN_BOOT_SPLASH_MS,
  );
  useEffect(() => {
    if (bootSplashDone) return;
    const remaining = MIN_BOOT_SPLASH_MS - (Date.now() - APP_BOOT_AT);
    const t = setTimeout(() => setBootSplashDone(true), Math.max(0, remaining));
    return () => clearTimeout(t);
  }, [bootSplashDone]);
  if (loading || !bootSplashDone) return <LoadingScreen tagline="A place for plans meant to be shared." />;
  if (!user) return <Navigate to="/onboarding" replace />;
  if (!allowIncomplete && !user.onboardingComplete) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <TopBar />
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/login" element={<Navigate to="/onboarding" replace />} />

        <Route path="/" element={<Protected><FeedPage /></Protected>} />
        <Route path="/explore" element={<Protected><ExplorePage /></Protected>} />
        <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
        <Route path="/messages" element={<Protected><MessagesPage /></Protected>} />
        <Route path="/plans/new" element={<Protected><CreatePlanPage /></Protected>} />
        <Route path="/plans/:id/edit" element={<Protected><EditPlanPage /></Protected>} />
        <Route path="/plans/:id" element={<Protected><PlanDetailPage /></Protected>} />
        <Route path="/plans/:planId/chat" element={<Protected><ChatPage /></Protected>} />
        <Route path="/network" element={<Protected><NetworkPage /></Protected>} />
        <Route path="/invite" element={<Protected><InvitePage /></Protected>} />
        <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
        <Route path="/settings/notifications" element={<Protected><NotificationPrefsPage /></Protected>} />
        {/* Profile is reachable even before onboarding completes — users can review/edit themselves. */}
        <Route path="/profile/:userId" element={<Protected allowIncomplete><ProfilePage /></Protected>} />
      </Routes>
      <BottomNav />
    </>
  );
}
