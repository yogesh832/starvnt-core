import { useState, useEffect } from 'react';
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
import DevApiTest from './pages/DevApiTest.jsx';
import DevSingleClickAuth from './pages/DevSingleClickAuth.jsx';

const DEV_TOOLS_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_TOOLS === 'true';

function FullScreenLoader() {
  return (
    <div className="min-h-screen grid place-items-center bg-[#faf9fe]">
      <div className="flex flex-col items-center gap-4">
        <LogoWord sub="Events. Simplified." />
        <div className="w-32 h-1 bg-primary/15 rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    </div>
  );
}

/** External surface guard: requires ACTIVE external session of accountType. */
function RequireExternal({ type, children }) {
  const { user, ready, switchSurface } = useExternalAuth();
  const loc = useLocation();
  const [switching, setSwitching] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);

  useEffect(() => {
    if (ready && user && type && user.accountType !== type && !switching && !switchFailed) {
      setSwitching(true);
      switchSurface(type)
        .catch((err) => {
          console.error(`Failed to switch surface to ${type}:`, err);
          setSwitchFailed(true);
        })
        .finally(() => {
          setSwitching(false);
        });
    }
  }, [ready, user, type, switching, switchFailed, switchSurface]);

  if (!ready || switching) return <FullScreenLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(`${loc.pathname}${loc.search}`)}`} replace />;
  if (type && user.accountType !== type) {
    if (switchFailed) {
      return <Navigate to={user.accountType === 'VENDOR' ? '/vendor' : '/customer'} replace />;
    }
    return <FullScreenLoader />;
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

      {/* Developer POV Test Authentication Routes (/auth-test) */}
      <Route
        path="/auth-test"
        element={
          <AdminAuthProvider>
            <DevSingleClickAuth />
          </AdminAuthProvider>
        }
      />
      <Route
        path="/testAuth"
        element={
          <AdminAuthProvider>
            <DevSingleClickAuth />
          </AdminAuthProvider>
        }
      />
      <Route
        path="/test-auth"
        element={
          <AdminAuthProvider>
            <DevSingleClickAuth />
          </AdminAuthProvider>
        }
      />
      <Route
        path="/auth/test"
        element={
          <AdminAuthProvider>
            <DevSingleClickAuth />
          </AdminAuthProvider>
        }
      />
      <Route path="/api/test" element={<DevApiTest />} />
      <Route path="/api-test" element={<DevApiTest />} />
      <Route path="/test" element={<DevApiTest />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
