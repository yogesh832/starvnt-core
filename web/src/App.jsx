import './components/auraMark.css';
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useExternalAuth } from './auth/ExternalAuthContext.jsx';
import { AdminAuthProvider, useAdminAuth } from './auth/AdminAuthContext.jsx';
import { LogoWord } from './components/ui.jsx';
import ExternalLogin from './pages/external/Login.jsx';
import Landing from './pages/customer/Landing.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import CustomerPortal from './pages/customer/CustomerPortal.jsx';
import VendorPortal from './pages/vendor/VendorPortal.jsx';
import AdminLogin from './pages/admin/AdminLogin.jsx';
import AdminShell from './pages/admin/AdminShell.jsx';
import DevApiTest from './pages/DevApiTest.jsx';
import DevSingleClickAuth from './pages/DevSingleClickAuth.jsx';
import PublicPolicyPage from './pages/PublicPolicyPage.jsx';

const DEV_TOOLS_ENABLED = import.meta.env.DEV;


class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('App render error:', error, errorInfo);
  }
  render() {
    if (this.state.error) {
      const supportEmail = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPPORT_EMAIL) || 'support@starvnt.com';
      return (
        <div className="min-h-screen grid place-items-center bg-[#faf9fe] dark:bg-[#0b0d14] p-6 text-center">
          <div className="w-full max-w-md bg-white dark:bg-[#161926] rounded-3xl shadow-sm border border-red-100 dark:border-red-950/40 p-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-500 grid place-items-center mb-4">
              <span className="text-2xl font-bold">!</span>
            </div>
            <h1 className="text-lg font-extrabold text-navy dark:text-white">We ran into an unexpected hiccup</h1>
            <p className="text-xs text-muted dark:text-slate-400 mt-2 leading-relaxed">
              There was a temporary issue loading this page. Your event and account data are safely preserved on STARVNT. Please try refreshing, or reach out to our customer care team.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5 hover:brightness-110 transition shadow-sm shadow-primary/20"
              >
                Reload page
              </button>
              <a
                href={`mailto:${supportEmail}?subject=Issue%20Report%20-%20STARVNT&body=Hi%20STARVNT%20Support,%0A%0AI%20encountered%20an%20issue%20loading%20the%20app:%0A`}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-lavender/50 dark:bg-white/5 text-navy dark:text-slate-200 text-xs font-bold px-4 py-2.5 hover:bg-lavender dark:hover:bg-white/10 transition inline-flex items-center gap-1.5"
              >
                Contact Support
              </a>
            </div>
            <div className="mt-5 pt-3 border-t border-gray-100 dark:border-gray-800 text-[11px] text-muted dark:text-slate-400">
              Customer Care: <a href={`mailto:${supportEmail}`} className="text-primary hover:underline font-semibold">{supportEmail}</a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
          window.location.hostname.startsWith('admin.')
              ? <Navigate to="/admin" replace />
              : <Landing />
        } 
      />
      {/* External domain — one auth UI, two portals */}
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/login" element={<ExternalLogin />} />
      <Route path="/signup" element={<ExternalLogin />} />
      <Route path="/register" element={<ExternalLogin />} />
      <Route path="/privacy" element={<PublicPolicyPage kind="privacy" />} />
      <Route path="/terms" element={<PublicPolicyPage kind="terms" />} />
      {DEV_TOOLS_ENABLED && <>
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
      </>}
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
