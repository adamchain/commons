import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./context/AuthContext";
import { LoginPage } from "./pages/Login";
import { FeedPage } from "./pages/Feed";
import { CreatePlanPage } from "./pages/CreatePlan";
import { PlanDetailPage } from "./pages/PlanDetail";
import { LoadingScreen } from "./components/LoadingScreen";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen tagline="Warming things up" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <FeedPage />
          </Protected>
        }
      />
      <Route
        path="/plans/new"
        element={
          <Protected>
            <CreatePlanPage />
          </Protected>
        }
      />
      <Route
        path="/plans/:id"
        element={
          <Protected>
            <PlanDetailPage />
          </Protected>
        }
      />
    </Routes>
  );
}
