import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./context/AuthContext";
import { LoadingScreen } from "./components/LoadingScreen";
import { ChatPage } from "./pages/Chat";
import { CreatePlanPage } from "./pages/CreatePlan";
import { FeedPage } from "./pages/Feed";
import { OnboardingPage } from "./pages/Onboarding";
import { PlanDetailPage } from "./pages/PlanDetail";
import { ProfilePage } from "./pages/Profile";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen tagline="Warming things up" />;
  if (!user) return <Navigate to="/onboarding" replace />;
  if (!user.onboardingComplete) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/login" element={<Navigate to="/onboarding" replace />} />

      <Route path="/" element={<Protected><FeedPage /></Protected>} />
      <Route path="/plans/new" element={<Protected><CreatePlanPage /></Protected>} />
      <Route path="/plans/:id" element={<Protected><PlanDetailPage /></Protected>} />
      <Route path="/plans/:planId/chat" element={<Protected><ChatPage /></Protected>} />
      <Route path="/plans/:planId/chat/:conversationId" element={<Protected><ChatPage /></Protected>} />
      <Route path="/profile/:userId" element={<Protected><ProfilePage /></Protected>} />
    </Routes>
  );
}
