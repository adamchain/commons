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
import { LandingPage } from "./pages/Landing";
import { LegalPage } from "./pages/Legal";
import { isNative } from "./lib/platform";
import { PlanDetailPage } from "./pages/PlanDetail";
import { AdminPage } from "./pages/Admin";
import { ProfilePage } from "./pages/Profile";
import { EditProfilePage } from "./pages/EditProfile";
import { NetworkPage } from "./pages/Network";
import { InvitePage } from "./pages/Invite";
import { SettingsPage } from "./pages/Settings";
import { SettingsInterestsPage } from "./pages/SettingsInterests";
import { NotificationPrefsPage } from "./pages/NotificationPrefs";
import { MessagesPage } from "./pages/Messages";
import { MyPlansPage } from "./pages/MyPlans";
import { CommunitiesPage } from "./pages/Communities";
import { CommunityDetailPage } from "./pages/CommunityDetail";
import { CommunityChatPage } from "./pages/CommunityChat";
import { CreateCommunityPage } from "./pages/CreateCommunity";

const APP_BOOT_AT = Date.now();
const MIN_BOOT_SPLASH_MS = 600;

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
  if (loading || !bootSplashDone) return <LoadingScreen simple tagline="A place for plans meant to be shared." />;
  // The app is iOS-only; on the web there's nothing to sign into, so send
  // unauthenticated web visitors to the marketing landing instead of onboarding.
  if (!user) return <Navigate to={isNative() ? "/onboarding" : "/welcome"} replace />;
  if (!allowIncomplete && !user.onboardingComplete) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <TopBar />
      <Routes>
        <Route path="/welcome" element={<LandingPage />} />
        <Route path="/legal/:slug" element={<LegalPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/login" element={<Navigate to="/onboarding" replace />} />

        <Route path="/" element={<Protected><FeedPage /></Protected>} />
        <Route path="/explore" element={<Protected><ExplorePage /></Protected>} />
        <Route path="/communities" element={<Protected><CommunitiesPage /></Protected>} />
        <Route path="/communities/new" element={<Protected><CreateCommunityPage /></Protected>} />
        <Route path="/communities/:id" element={<Protected><CommunityDetailPage /></Protected>} />
        <Route path="/communities/:id/chat" element={<Protected><CommunityChatPage /></Protected>} />
        <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
        <Route path="/messages" element={<Protected><MessagesPage /></Protected>} />
        <Route path="/my-plans" element={<Protected><MyPlansPage /></Protected>} />
        <Route path="/plans/new" element={<Protected><CreatePlanPage /></Protected>} />
        <Route path="/plans/:id/edit" element={<Protected><EditPlanPage /></Protected>} />
        <Route path="/plans/:id" element={<Protected><PlanDetailPage /></Protected>} />
        <Route path="/plans/:planId/chat" element={<Protected><ChatPage /></Protected>} />
        <Route path="/network" element={<Protected><NetworkPage /></Protected>} />
        <Route path="/invite" element={<Protected><InvitePage /></Protected>} />
        <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
        <Route path="/settings/interests" element={<Protected><SettingsInterestsPage /></Protected>} />
        <Route path="/settings/notifications" element={<Protected><NotificationPrefsPage /></Protected>} />
        <Route path="/profile/:userId/edit" element={<Protected allowIncomplete><EditProfilePage /></Protected>} />
        {/* Profile is reachable even before onboarding completes — users can review/edit themselves. */}
        <Route path="/profile/:userId" element={<Protected allowIncomplete><ProfilePage /></Protected>} />
      </Routes>
      <BottomNav />
    </>
  );
}
