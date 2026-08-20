import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./context/AuthContext";
import { BottomNav } from "./components/BottomNav";
import { CoachMarks } from "./components/CoachMarks";
import { TopBar } from "./components/TopBar";
import { LoadingScreen } from "./components/LoadingScreen";
import { listenForDeepLinks } from "./lib/deepLinks";
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
import { PublicEventPage } from "./pages/PublicEvent";
import { AdminPage } from "./pages/Admin";
import { ProfilePage } from "./pages/Profile";
import { EditProfilePage } from "./pages/EditProfile";
import { NetworkPage } from "./pages/Network";
import { InvitePage } from "./pages/Invite";
import { SettingsPage } from "./pages/Settings";
import { SettingsInterestsPage } from "./pages/SettingsInterests";
import { NotificationPrefsPage } from "./pages/NotificationPrefs";
import { MessagesPage } from "./pages/Messages";
import { ForumPage } from "./pages/ForumPage";
import { ForumPostPage } from "./pages/ForumPostPage";
import { MyPlansPage } from "./pages/MyPlans";
import { EmptyStatesPage } from "./pages/EmptyStates";
import { SearchPage } from "./pages/Search";
import { BlockedListPage } from "./pages/BlockedList";
import { PrivacyPage } from "./pages/Privacy";
import { CommunitiesPage } from "./pages/Communities";
import { CommunityDetailPage } from "./pages/CommunityDetail";
import { CommunityChatPage } from "./pages/CommunityChat";
import { SettingsForumsPage } from "./pages/SettingsForums";
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
  const location = useLocation();
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
  // Preserve the query string (e.g. `?invite=CODE` from a deep link into "/")
  // so waitlist/invite credit survives the bounce.
  if (!user) return <Navigate to={`${isNative() ? "/onboarding" : "/welcome"}${location.search}`} replace />;
  if (!allowIncomplete && !user.onboardingComplete) return <Navigate to={`/onboarding${location.search}`} replace />;
  return <>{children}</>;
}

// A shared plan link (/plans/:id) is the one deep link a logged-out visitor can
// hit. Instead of bouncing them to the marketing landing, show a public event
// page that converts them (number → onboarding → app). Signed-in members get
// the normal detail page.
function PlanRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen simple tagline="A place for plans meant to be shared." />;
  if (user && user.onboardingComplete) return <PlanDetailPage />;
  const inviteCode = new URLSearchParams(location.search).get("invite") ?? undefined;
  // Mid-signup visitors keep a path back to this plan instead of dumping onto
  // a generic onboarding screen with the shared event lost.
  if (user && !user.onboardingComplete) {
    return (
      <Navigate
        to="/onboarding"
        state={{ redirect: location.pathname, inviteCode, eventRef: true }}
        replace
      />
    );
  }
  // Logged out: native users go to onboarding — carrying the invite code (if
  // any) and a redirect back to this plan so the deep link isn't a dead end.
  // Web visitors get the public page instead. Don't hold them on the boot
  // splash; the public landing should paint as soon as we know there's no session.
  if (isNative()) {
    return (
      <Navigate
        to="/onboarding"
        state={{ redirect: location.pathname, inviteCode }}
        replace
      />
    );
  }
  return <PublicEventPage />;
}

// Listens for the `commons:push-open` CustomEvent dispatched by push.ts when
// the user taps a push notification, and navigates to the deep link once the
// router is mounted (works for both a cold start and a backgrounded tap).
function usePushOpenNavigation() {
  const navigate = useNavigate();
  useEffect(() => {
    function onPushOpen(e: Event) {
      const path = (e as CustomEvent<{ path?: string }>).detail?.path;
      if (path) navigate(path);
    }
    window.addEventListener("commons:push-open", onPushOpen);
    return () => window.removeEventListener("commons:push-open", onPushOpen);
  }, [navigate]);
}

// Handles universal/custom-scheme links (shared plan URLs like
// `https://…/plans/xyz?invite=ABC`) tapped while the app is installed — both
// a cold start (`getLaunchUrl`) and a tap while running/backgrounded
// (`appUrlOpen`). No-ops on web. See lib/deepLinks.ts.
function useDeepLinkNavigation() {
  const navigate = useNavigate();
  useEffect(() => {
    return listenForDeepLinks(navigate);
  }, [navigate]);
}

export default function App() {
  usePushOpenNavigation();
  useDeepLinkNavigation();
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
        <Route path="/search" element={<Protected><SearchPage /></Protected>} />
        <Route path="/communities" element={<Protected><CommunitiesPage /></Protected>} />
        <Route path="/communities/new" element={<Protected><CreateCommunityPage /></Protected>} />
        <Route path="/communities/:id" element={<Protected><CommunityDetailPage /></Protected>} />
        <Route path="/communities/:id/chat" element={<Protected><CommunityChatPage /></Protected>} />
        <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
        <Route path="/messages" element={<Protected><MessagesPage /></Protected>} />
        <Route path="/forums/:tag" element={<Protected><ForumPage /></Protected>} />
        <Route path="/forums/:tag/posts/:postId" element={<Protected><ForumPostPage /></Protected>} />
        <Route path="/my-plans" element={<Protected><MyPlansPage /></Protected>} />
        <Route path="/empty-states" element={<Protected><EmptyStatesPage /></Protected>} />
        <Route path="/plans/new" element={<Protected><CreatePlanPage /></Protected>} />
        <Route path="/plans/:id/edit" element={<Protected><EditPlanPage /></Protected>} />
        <Route path="/plans/:id" element={<PlanRoute />} />
        <Route path="/plans/:planId/chat" element={<Protected><ChatPage /></Protected>} />
        <Route path="/network" element={<Protected><NetworkPage /></Protected>} />
        <Route path="/invite" element={<Protected><InvitePage /></Protected>} />
        <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
        <Route path="/settings/interests" element={<Protected><SettingsInterestsPage /></Protected>} />
        <Route path="/settings/forums" element={<Protected><SettingsForumsPage /></Protected>} />
        <Route path="/settings/notifications" element={<Protected><NotificationPrefsPage /></Protected>} />
        <Route path="/settings/privacy" element={<Protected><PrivacyPage /></Protected>} />
        <Route path="/settings/blocked" element={<Protected><BlockedListPage /></Protected>} />
        <Route path="/profile/:userId/edit" element={<Protected allowIncomplete><EditProfilePage /></Protected>} />
        {/* Profile is reachable even before onboarding completes — users can review/edit themselves. */}
        <Route path="/profile/:userId" element={<Protected allowIncomplete><ProfilePage /></Protected>} />
      </Routes>
      <BottomNav />
      <CoachMarks />
    </>
  );
}
