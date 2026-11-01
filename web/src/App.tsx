import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { lazy, Suspense, useEffect } from "react";
import { useAuth } from "./store/user";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import WallsPage from "./pages/WallsPage";
import EditorPage from "./pages/EditorPage";
import { Logo, Spinner } from "./components/ui";
import { sendAnalytics, trackedPage } from './lib/analytics';
import { usePageView } from './lib/usePageView';

const AdminStatsPage = lazy(() => import('./pages/AdminStatsPage'));

function PageAnalytics() {
  const location = useLocation();
  const { user, loading } = useAuth();
  const page = trackedPage(location.pathname);
  const canTrack = !loading && page && ((page === 'login' || page === 'register') ? !user : Boolean(user));
  usePageView(page, Boolean(canTrack && page !== 'editor'));
  useEffect(() => {
    if (!canTrack || !user || !page) return;
    const heartbeat = () => {
      if (document.visibilityState === 'visible') void sendAnalytics({ type: 'active' });
    };
    const timer = window.setInterval(heartbeat, 60_000);
    document.addEventListener('visibilitychange', heartbeat);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', heartbeat); };
  }, [canTrack, user?.id, page]);
  return null;
}

function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="anim-float">
        <Logo size={64} />
      </div>
      <Spinner className="size-7" />
      <p className="font-[family-name:var(--font-hand)] text-[var(--color-ink-soft)]">
        正在加载照片墙 …
      </p>
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  const { init } = useAuth();

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <>
    <PageAnalytics />
    <Routes>
      <Route path="/admin/stats" element={<Protected><Suspense fallback={<Splash />}><AdminStatsPage /></Suspense></Protected>} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/walls"
        element={
          <Protected>
            <WallsPage />
          </Protected>
        }
      />
      <Route
        path="/editor/:id"
        element={
          <Protected>
            <EditorPage />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/walls" replace />} />
    </Routes>
    </>
  );
}
