import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { lazy, Suspense, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { App as CapApp } from "@capacitor/app";
import { useAuth } from "./context/AuthContext";
import { BottomNav } from "./components/BottomNav";
import { RouteStage } from "./components/RouteStage";
import { CreateLauncher } from "./components/CreateLauncher";
import { AppUpdatePrompt } from "./components/AppUpdatePrompt";
import { ChatCleanupPrompt } from "./components/ChatCleanupPrompt";
import { SmsConsentPrompt } from "./components/SmsConsentPrompt";
import { CoachMarks } from "./components/CoachMarks";
import { TopBar } from "./components/TopBar";
import { WebAppShell, webShellVisible, webShellHasRail } from "./components/WebAppShell";
import { LoadingScreen } from "./components/LoadingScreen";
import { listenForDeepLinks } from "./lib/deepLinks";
import { resetFeedFilters } from "./lib/feedFilters";
import { needsOnboarding } from "./lib/onboarding";
import { getCurrentCoords } from "./lib/geolocate";
import { api } from "./api/http";
import { isNative } from "./lib/platform";

const ChatPage = lazy(() => import("./pages/Chat").then(m => ({ default: m.ChatPage })));
const CreatePlanPage = lazy(() => import("./pages/CreatePlan").then(m => ({ default: m.CreatePlanPage })));
const FeedPage = lazy(() => import("./pages/Feed").then(m => ({ default: m.FeedPage })));
const NotificationsPage = lazy(() => import("./pages/Notifications").then(m => ({ default: m.NotificationsPage })));
const OnboardingPage = lazy(() => import("./pages/Onboarding").then(m => ({ default: m.OnboardingPage })));
const LandingPage = lazy(() => import("./pages/Landing").then(m => ({ default: m.LandingPage })));
const NewLandingPage = lazy(() => import("./pages/NewLanding").then(m => ({ default: m.NewLandingPage })));
const LegalPage = lazy(() => import("./pages/Legal").then(m => ({ default: m.LegalPage })));
const PlanDetailPage = lazy(() => import("./pages/PlanDetail").then(m => ({ default: m.PlanDetailPage })));
const PublicEventPage = lazy(() => import("./pages/PublicEvent").then(m => ({ default: m.PublicEventPage })));
const AdminPage = lazy(() => import("./pages/admin/FounderDashboard").then(m => ({ default: m.AdminPage })));
const ProfilePage = lazy(() => import("./pages/Profile").then(m => ({ default: m.ProfilePage })));
const EditProfilePage = lazy(() => import("./pages/EditProfile").then(m => ({ default: m.EditProfilePage })));
const DmChatPage = lazy(() => import("./pages/DmChat").then(m => ({ default: m.DmChatPage })));
const NetworkPage = lazy(() => import("./pages/Network").then(m => ({ default: m.NetworkPage })));
const InvitePage = lazy(() => import("./pages/Invite").then(m => ({ default: m.InvitePage })));
const SettingsPage = lazy(() => import("./pages/Settings").then(m => ({ default: m.SettingsPage })));
const SettingsInterestsPage = lazy(() => import("./pages/SettingsInterests").then(m => ({ default: m.SettingsInterestsPage })));
const NotificationPrefsPage = lazy(() => import("./pages/NotificationPrefs").then(m => ({ default: m.NotificationPrefsPage })));
const MessagesPage = lazy(() => import("./pages/Messages").then(m => ({ default: m.MessagesPage })));
const ForumPage = lazy(() => import("./pages/ForumPage").then(m => ({ default: m.ForumPage })));
const ForumPostPage = lazy(() => import("./pages/ForumPostPage").then(m => ({ default: m.ForumPostPage })));
const MyPlansPage = lazy(() => import("./pages/MyPlans").then(m => ({ default: m.MyPlansPage })));
const EmptyStatesPage = lazy(() => import("./pages/EmptyStates").then(m => ({ default: m.EmptyStatesPage })));
const SearchPage = lazy(() => import("./pages/Search").then(m => ({ default: m.SearchPage })));
const BlockedListPage = lazy(() => import("./pages/BlockedList").then(m => ({ default: m.BlockedListPage })));
const PrivacyPage = lazy(() => import("./pages/Privacy").then(m => ({ default: m.PrivacyPage })));
const CommunitiesPage = lazy(() => import("./pages/Communities").then(m => ({ default: m.CommunitiesPage })));
const CommunityDetailPage = lazy(() => import("./pages/CommunityDetail").then(m => ({ default: m.CommunityDetailPage })));
const CommunityDashboardPage = lazy(() => import("./pages/CommunityDashboard").then(m => ({ default: m.CommunityDashboardPage })));
const CommunityChatPage = lazy(() => import("./pages/CommunityChat").then(m => ({ default: m.CommunityChatPage })));
const SettingsForumsPage = lazy(() => import("./pages/SettingsForums").then(m => ({ default: m.SettingsForumsPage })));
const CreateCommunityPage = lazy(() => import("./pages/CreateCommunity").then(m => ({ default: m.CreateCommunityPage })));
const HelpChatPage = lazy(() => import("./pages/HelpChat").then(m => ({ default: m.HelpChatPage })));

const PAGE_FALLBACK = <main className="app-shell app-shell--with-nav app-shell--with-topbar" />;

function useWarmRoutes() {
  useEffect(() => {
    const warm = () => {
      void import("./pages/Feed");
      void import("./pages/Communities");
      void import("./pages/CommunityDetail");
      void import("./pages/Messages");
      void import("./pages/Network");
      void import("./pages/Profile");
      void import("./pages/PlanDetail");
      void import("./pages/Notifications");
      void import("./pages/MyPlans");
      void import("./pages/Search");
    };
    const id = window.setTimeout(warm, 0);
    return () => window.clearTimeout(id);
  }, []);
}

function Protected({
  children,
  allowIncomplete = false,
}: {
  children: ReactNode;
  allowIncomplete?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();
  // Cold start only. If we already have a session, never flash the COMMONS
  // splash on in-app navigations (Settings, etc.).
  if (!user && loading) {
    return <LoadingScreen simple tagline="A place for plans meant to be shared." />;
  }
  // The app is iOS-only; on the web there's nothing to sign into, so send
  // unauthenticated web visitors to the marketing landing instead of onboarding.
  // Preserve the query string (e.g. `?invite=CODE` from a deep link into "/")
  // so waitlist/invite credit survives the bounce.
  if (!user) return <Navigate to={`${isNative() ? "/onboarding" : "/welcome"}${location.search}`} replace />;
  if (!allowIncomplete && needsOnboarding(user)) return <Navigate to={`/onboarding${location.search}`} replace />;
  return <>{children}</>;
}

function ProfileGate({ edit = false }: { edit?: boolean }) {
  const { userId } = useParams();
  const { user } = useAuth();
  const own = Boolean(user && userId === user.id);
  return (
    <Protected allowIncomplete={own}>
      {edit ? <EditProfilePage /> : <ProfilePage />}
    </Protected>
  );
}

// A shared plan link (/plans/:id) is the one deep link a logged-out visitor can
// hit. Instead of bouncing them to the marketing landing, show a public event
// page that converts them (number → onboarding → app). Signed-in members get
// the normal detail page.
function PlanRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading && !user) return <LoadingScreen simple tagline="A place for plans meant to be shared." />;
  const inviteCode = new URLSearchParams(location.search).get("invite") ?? undefined;
  if (user && !needsOnboarding(user)) return <PlanDetailPage />;
  // Mid-signup visitors keep a path back to this plan instead of dumping onto
  // a generic onboarding screen with the shared event lost.
  if (user && needsOnboarding(user)) {
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

const LOCATION_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 min

// Silently refreshes the user's stored location each time they bring the app
// to the foreground, throttled to once per 30 minutes. Only runs if they
// already have location sharing on (opted in during onboarding/settings).
function useLocationRefresh() {
  const { user, refreshUser } = useAuth();
  const lastRefreshedAt = useRef<number>(0);

  useEffect(() => {
    if (!isNative() || !user?.location) return;

    async function refresh() {
      const now = Date.now();
      if (now - lastRefreshedAt.current < LOCATION_REFRESH_INTERVAL_MS) return;
      lastRefreshedAt.current = now;
      const coords = await getCurrentCoords({ timeoutMs: 10000 });
      if (!coords) return;
      try {
        await api("/api/auth/me", { method: "PATCH", body: JSON.stringify({ location: coords }) });
        void refreshUser();
      } catch {
        // silent — stale location is better than an error
      }
    }

    void refresh();

    const handle = CapApp.addListener("appStateChange", (state) => {
      if (state.isActive) void refresh();
    });
    return () => { void handle.then((h) => h.remove()); };
  }, [user?.location, refreshUser]);
}

// Reset the feed filters every time the app is opened — on cold start and each
// time it returns to the foreground — so a session always begins unfiltered.
// Clears the saved filters and tells a mounted FeedPage to drop its live state.
function useFilterResetOnOpen() {
  useEffect(() => {
    resetFeedFilters();
    const handle = CapApp.addListener("appStateChange", (state) => {
      if (state.isActive) resetFeedFilters();
    });
    return () => { void handle.then((h) => h.remove()); };
  }, []);
}

export default function App() {
  usePushOpenNavigation();
  useDeepLinkNavigation();
  useLocationRefresh();
  useFilterResetOnOpen();
  useWarmRoutes();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const webShell = !isNative() && webShellVisible(pathname, user);
  const shellClass = webShell
    ? `commons-web${webShellHasRail(pathname) ? " commons-web--rail" : ""}`
    : undefined;
  return (
    <div className={shellClass}>
      {!isNative() && <WebAppShell />}
      <TopBar />
      <AppUpdatePrompt />
      <ChatCleanupPrompt />
      <SmsConsentPrompt />
      <Suspense fallback={PAGE_FALLBACK}>
      <RouteStage>
      <Routes>
        <Route path="/welcome" element={<LandingPage />} />
        <Route path="/new" element={<NewLandingPage />} />
        <Route path="/legal/:slug" element={<LegalPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/dashboard" element={<Navigate to="/admin" replace />} />
        <Route path="/login" element={<Navigate to="/onboarding" replace />} />

        <Route path="/" element={<Protected><FeedPage /></Protected>} />
        <Route path="/explore" element={<Navigate to="/communities" replace />} />
        <Route path="/search" element={<Protected><SearchPage /></Protected>} />
        <Route path="/communities" element={<Protected><CommunitiesPage /></Protected>} />
        <Route path="/communities/new" element={<Protected><CreateCommunityPage /></Protected>} />
        <Route path="/communities/:id" element={<Protected><CommunityDetailPage /></Protected>} />
        <Route path="/communities/:id/dashboard" element={<Protected><CommunityDashboardPage /></Protected>} />
        <Route path="/communities/:id/chat" element={<Protected><CommunityChatPage /></Protected>} />
        <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
        <Route path="/messages" element={<Protected><MessagesPage /></Protected>} />
        <Route path="/forums/:tag" element={<Protected><ForumPage /></Protected>} />
        <Route path="/forums/:tag/posts/:postId" element={<Protected><ForumPostPage /></Protected>} />
        <Route path="/my-plans" element={<Protected><MyPlansPage /></Protected>} />
        <Route path="/empty-states" element={<Protected><EmptyStatesPage /></Protected>} />
        <Route path="/plans/new" element={<Protected><CreatePlanPage /></Protected>} />
        <Route path="/plans/:id/edit" element={<Protected><CreatePlanPage /></Protected>} />
        <Route path="/plans/:id" element={<PlanRoute />} />
        <Route path="/plans/:planId/chat" element={<Protected><ChatPage /></Protected>} />
        <Route path="/network" element={<Protected><NetworkPage /></Protected>} />
        <Route path="/dm/:userId" element={<Protected><DmChatPage /></Protected>} />
        <Route path="/invite" element={<Protected><InvitePage /></Protected>} />
        <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
        <Route path="/settings/interests" element={<Protected><SettingsInterestsPage /></Protected>} />
        <Route path="/settings/forums" element={<Protected><SettingsForumsPage /></Protected>} />
        <Route path="/settings/notifications" element={<Protected><NotificationPrefsPage /></Protected>} />
        <Route path="/settings/privacy" element={<Protected><PrivacyPage /></Protected>} />
        <Route path="/settings/blocked" element={<Protected><BlockedListPage /></Protected>} />
        <Route path="/helpchat" element={<Protected><HelpChatPage /></Protected>} />
        <Route path="/profile/:userId/edit" element={<ProfileGate edit />} />
        {/* Own profile is reachable mid-onboarding so people can review themselves. Other profiles wait. */}
        <Route path="/profile/:userId" element={<ProfileGate />} />
      </Routes>
      </RouteStage>
      </Suspense>
      <BottomNav />
      <CreateLauncher />
      <CoachMarks />
    </div>
  );
}
