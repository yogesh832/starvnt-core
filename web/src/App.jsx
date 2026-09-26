import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useExternalAuth } from './auth/ExternalAuthContext.jsx';
import { AdminAuthProvider, useAdminAuth } from './auth/AdminAuthContext.jsx';
import { LogoWord } from './components/ui.jsx';
import ExternalLogin from './pages/external/Login.jsx';
import Landing from './pages/customer/Landing.jsx';
import CustomerPortal from './pages/customer/CustomerPortal.jsx';
import VendorPortal from './pages/vendor/VendorPortal.jsx';
import AdminLogin from './pages/admin/AdminLogin.jsx';
import AdminShell from './pages/admin/AdminShell.jsx';

function FullScreenLoader() {
  return (
    <div className="min-h-screen grid place-items-center bg-lavender">
      <div className="animate-pulse">
        <LogoWord sub="Loading..." />
      </div>
    </div>
  );
}

function GlobalApiLoader() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let showTimer = null;
    let hideTimer = null;

    function handleActivity(event) {
      const nextActive = event.detail?.active || 0;
      setActive(nextActive);

      if (nextActive > 0) {
        clearTimeout(hideTimer);
        showTimer = setTimeout(() => setVisible(true), 450);
      } else {
        clearTimeout(showTimer);
        hideTimer = setTimeout(() => setVisible(false), 250);
      }
    }

    window.addEventListener('starvnt:api-activity', handleActivity);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      window.removeEventListener('starvnt:api-activity', handleActivity);
    };
  }, []);

  if (!visible || active <= 0) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[100] pointer-events-none">
      <div className="h-1 bg-primary/15 overflow-hidden">
        <div className="h-full w-1/3 bg-primary animate-[loadingBar_1.2s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}

/** External surface guard: requires ACTIVE external session of accountType. */
function RequireExternal({ type, children }) {
  const { user, ready } = useExternalAuth();
  const loc = useLocation();
  if (!ready) return <FullScreenLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(`${loc.pathname}${loc.search}`)}`} replace />;
  if (type && user.accountType !== type) {
    return <Navigate to={user.accountType === 'VENDOR' ? '/vendor' : '/customer'} replace />;
  }
  return children;
}

/** Admin guard: separate identity domain entirely. */
function RequireAdmin({ children }) {
  const { admin, ready } = useAdminAuth();
  if (!ready) return <FullScreenLoader />;
  if (!admin) return <Navigate to="/admin/login" replace />;
  return children;
}

function RootRedirect() {
  const { user, ready } = useExternalAuth();
  if (!ready) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.accountType === 'VENDOR' ? '/vendor' : '/customer'} replace />;
}

export default function App() {
  return (
    <>
      <GlobalApiLoader />
      <Routes>
        {/* Public landing — guests plan here, partner/admin subdomains redirect appropriately */}
        <Route
          path="/"
          element={
            window.location.hostname.startsWith('partner.') || window.location.hostname.startsWith('vendor.')
              ? <Navigate to="/vendor" replace />
              : window.location.hostname.startsWith('admin.')
                ? <Navigate to="/admin" replace />
                : <Landing />
          }
        />
        {/* External domain — one auth UI, two portals */}
        <Route path="/login" element={<ExternalLogin />} />
        <Route path="/signup" element={<ExternalLogin />} />
        <Route path="/register" element={<ExternalLogin />} />
        <Route
          path="/customer/*"
          element={
            <RequireExternal type="CUSTOMER">
              <CustomerPortal />
            </RequireExternal>
          }
        />
        <Route
          path="/vendor/*"
          element={
            <RequireExternal type="VENDOR">
              <VendorPortal />
            </RequireExternal>
          }
        />

      {/* Internal domain — fully separate admin experience */}
        <Route
          path="/admin/login"
          element={
            <AdminAuthProvider>
              <AdminLogin />
            </AdminAuthProvider>
          }
        />
        <Route
          path="/admin/*"
          element={
            <AdminAuthProvider>
              <RequireAdmin>
                <AdminShell />
              </RequireAdmin>
            </AdminAuthProvider>
          }
        />

        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </>
  );
}
