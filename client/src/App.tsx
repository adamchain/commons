import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./context/AuthContext";
import { BottomNav } from "./components/BottomNav";
import { LoadingScreen } from "./components/LoadingScreen";
import { ChatPage } from "./pages/Chat";
import { CreatePlanPage } from "./pages/CreatePlan";
import { ExplorePage } from "./pages/Explore";
import { FeedPage } from "./pages/Feed";
import { OnboardingPage } from "./pages/Onboarding";
import { PlanDetailPage } from "./pages/PlanDetail";
import { AdminPage } from "./pages/Admin";
import { ProfilePage } from "./pages/Profile";

function Protected({
  children,
  allowIncomplete = false,
}: {
  children: ReactNode;
  allowIncomplete?: boolean;
}) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen tagline="Warming things up" />;
  if (!user) return <Navigate to="/onboarding" replace />;
  if (!allowIncomplete && !user.onboardingComplete) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/login" element={<Navigate to="/onboarding" replace />} />

        <Route path="/" element={<Protected><FeedPage /></Protected>} />
        <Route path="/explore" element={<Protected><ExplorePage /></Protected>} />
        <Route path="/plans/new" element={<Protected><CreatePlanPage /></Protected>} />
        <Route path="/plans/:id" element={<Protected><PlanDetailPage /></Protected>} />
        <Route path="/plans/:planId/chat" element={<Protected><ChatPage /></Protected>} />
        {/* Profile is reachable even before onboarding completes — users can review/edit themselves. */}
        <Route path="/profile/:userId" element={<Protected allowIncomplete><ProfilePage /></Protected>} />
      </Routes>
      <BottomNav />
    </>
  );
}
