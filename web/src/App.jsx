import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useExternalAuth } from './auth/ExternalAuthContext.jsx';
import { AdminAuthProvider, useAdminAuth } from './auth/AdminAuthContext.jsx';
import { LogoWord } from './components/ui.jsx';
import ExternalLogin from './pages/external/Login.jsx';
import TestLogin from './pages/external/TestLogin.jsx';
import TestingHub from './pages/external/TestingHub.jsx';
import Landing from './pages/customer/Landing.jsx';
import CustomerPortal from './pages/customer/CustomerPortal.jsx';
import VendorPortal from './pages/vendor/VendorPortal.jsx';
import AdminLogin from './pages/admin/AdminLogin.jsx';
import AdminShell from './pages/admin/AdminShell.jsx';

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
      <Route path="/test-login" element={<TestLogin />} />
      <Route path="/dev-login" element={<Navigate to="/test-login" replace />} />
      <Route
        path="/test"
        element={
          <AdminAuthProvider>
            <TestingHub />
          </AdminAuthProvider>
        }
      />
      <Route path="/qa" element={<Navigate to="/test" replace />} />
      <Route path="/testing" element={<Navigate to="/test" replace />} />
      <Route path="/test-all" element={<Navigate to="/test" replace />} />
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
  );
}
