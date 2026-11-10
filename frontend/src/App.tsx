import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useStore, setNavigate, home } from '@/store';
import { Shell } from '@/components/Shell';
import { Empty } from '@/components/ui';
import { SignIn } from '@/pages/SignIn';
import { Apps } from '@/pages/Apps';
import { AppDetail } from '@/pages/AppDetail';
import { NewCycle } from '@/pages/NewCycle';
import { Review } from '@/pages/Review';
import { Queue } from '@/pages/Queue';
import { Run } from '@/pages/Run';
import { Report } from '@/pages/Report';
import { AuditDrawer, Busy, Guide, Modal, Toasts, useEscape } from '@/overlays/Overlays';

function useThemeSync() {
  const theme = useStore(s => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('verity-theme', theme); } catch { /* private mode */ }
  }, [theme]);
}

export default function App() {
  const navigate = useNavigate();
  const loc = useLocation();
  const signedIn = useStore(s => s.signedIn);
  const role = useStore(s => s.role);
  useThemeSync();
  useEscape();
  useEffect(() => { setNavigate(to => navigate(to)); }, [navigate]);
  // Like the prototype: every navigation closes the audit drawer and scrolls to top.
  useEffect(() => { useStore.getState().set(s => { s.drawer = false; }); window.scrollTo(0, 0); }, [loc.pathname]);

  const onSignin = loc.pathname === '/signin';
  if (!signedIn && !onSignin) return <><Navigate to="/signin" replace /></>;

  return (
    <>
      <Routes>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/" element={<Navigate to={home(role)} replace />} />
        <Route path="/apps" element={<Shell><Apps /></Shell>} />
        <Route path="/apps/:appId" element={<Shell><AppDetail tab="cycles" /></Shell>} />
        <Route path="/apps/:appId/regression" element={<Shell><AppDetail tab="regression" /></Shell>} />
        <Route path="/apps/:appId/settings" element={<Shell><AppDetail tab="settings" /></Shell>} />
        <Route path="/apps/:appId/cycles/new" element={<Shell><NewCycle /></Shell>} />
        <Route path="/cycles/:cycleId/review" element={<Shell><Review /></Shell>} />
        <Route path="/cycles/:cycleId/run" element={<Shell><Run /></Shell>} />
        <Route path="/cycles/:cycleId/report" element={<Shell><Report /></Shell>} />
        <Route path="/queue" element={<Shell><Queue /></Shell>} />
        <Route path="*" element={<Shell><div className="wrap"><Empty title="Page not found">Use the navigation above.</Empty></div></Shell>} />
      </Routes>
      {signedIn && !onSignin && <Guide />}
      <AuditDrawer />
      <Modal />
      <Busy />
      <Toasts />
    </>
  );
}
