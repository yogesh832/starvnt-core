import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { LogoWord } from '../components/ui.jsx';
import { useExternalAuth } from '../auth/ExternalAuthContext.jsx';
import { useAdminAuth } from '../auth/AdminAuthContext.jsx';
import { externalApi, adminApi } from '../lib/api.js';

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  return window.location.origin;
};

export default function DevSingleClickAuth() {
  const navigate = useNavigate();
  const { user, ready: externalReady, logout: externalLogout } = useExternalAuth();
  const { admin, ready: adminReady, logout: adminLogout } = useAdminAuth();

  const [loadingType, setLoadingType] = useState(null); // 'VENDOR', 'CUSTOMER', 'ADMIN'
  const [authError, setAuthError] = useState('');
  const [copiedToken, setCopiedToken] = useState('');

  const externalToken = localStorage.getItem('starvnt_external_access_token') || '';
  const adminToken = localStorage.getItem('starvnt_admin_access_token') || '';

  // Single Click Dev Auth Execution Handler
  const handleSingleClickAuth = async (accountType) => {
    setLoadingType(accountType);
    setAuthError('');

    const apiBase = getApiBaseUrl();

    try {
      if (accountType === 'ADMIN') {
        const res = await fetch(`${apiBase}/api/admin/auth/dev-auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Admin auth failed with status ${res.status}`);
        }

        const data = await res.json();
        if (data.accessToken) {
          adminApi.setToken(data.accessToken);
          localStorage.setItem('starvnt_admin_access_token', data.accessToken);
          // Hard refresh / navigate to admin shell
          window.location.href = data.redirectTo || '/admin/dashboard';
        }
      } else {
        const res = await fetch(`${apiBase}/api/auth/dev-auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountType }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Dev auth failed with status ${res.status}`);
        }

        const data = await res.json();
        if (data.accessToken) {
          externalApi.setToken(data.accessToken);
          localStorage.setItem('starvnt_external_access_token', data.accessToken);
          // Hard refresh / navigate to surface
          window.location.href = data.redirectTo || (accountType === 'VENDOR' ? '/vendor' : '/customer');
        }
      }
    } catch (err) {
      console.error('Dev single-click auth error:', err);
      setAuthError(err.message || 'Single click authentication failed.');
    } finally {
      setLoadingType(null);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(label);
    setTimeout(() => setCopiedToken(''), 2500);
  };

  const handleClearAllSessions = async () => {
    localStorage.removeItem('starvnt_external_access_token');
    localStorage.removeItem('starvnt_admin_access_token');
    externalApi.setToken(null);
    adminApi.setToken(null);
    try { await externalLogout(); } catch {}
    try { await adminLogout(); } catch {}
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-purple-500 selection:text-white flex flex-col justify-between p-4 lg:p-8">
      
      {/* Header Bar */}
      <header className="max-w-5xl mx-auto w-full flex items-center justify-between pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <LogoWord sub="Dev 1-Click Auth Playground" light={true} />
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            DEV AUTH PROBE (/testAuth)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/api/test"
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1.5"
          >
            <Icon name="bolt" size={14} /> API Load Workbench
          </a>
        </div>
      </header>

      {/* Main Single Click Control Center */}
      <main className="max-w-4xl mx-auto w-full py-8 space-y-8">

        {/* Hero Section */}
        <div className="text-center space-y-3">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Single-Click Instant Dev Authentication
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
            Bypass SMS OTP and manual logins during development. Click any button below to authenticate instantly as a Vendor, Customer, or Admin and open the respective portal.
          </p>
        </div>

        {authError && (
          <div className="p-4 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold text-center">
            ⚠️ {authError}
          </div>
        )}

        {/* 1-CLICK AUTH ACTION BUTTONS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* VENDOR 1-CLICK CARD */}
          <div className="bg-slate-900 border border-slate-800 hover:border-sky-500/50 rounded-2xl p-6 space-y-4 flex flex-col justify-between shadow-2xl transition-all group">
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 text-sky-400 grid place-items-center">
                <Icon name="vendors" size={24} />
              </div>
              <h3 className="text-lg font-black text-white">Vendor Portal</h3>
              <p className="text-xs text-slate-400">
                Authenticate as Vendor (`vendor@starvnt.com`) and open Vendor Dashboard.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                disabled={loadingType === 'VENDOR'}
                onClick={() => handleSingleClickAuth('VENDOR')}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider transition shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Icon name="bolt" size={16} />
                {loadingType === 'VENDOR' ? 'AUTHENTICATING...' : '1-CLICK LOGIN VENDOR'}
              </button>
              <a
                href="/vendor"
                className="block text-center text-[11px] font-mono text-sky-400 hover:underline"
              >
                Open /vendor surface directly →
              </a>
            </div>
          </div>

          {/* CUSTOMER 1-CLICK CARD */}
          <div className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-6 space-y-4 flex flex-col justify-between shadow-2xl transition-all group">
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 grid place-items-center">
                <Icon name="customers" size={24} />
              </div>
              <h3 className="text-lg font-black text-white">Customer Portal</h3>
              <p className="text-xs text-slate-400">
                Authenticate as Customer (`customer@starvnt.com`) and open Customer App.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                disabled={loadingType === 'CUSTOMER'}
                onClick={() => handleSingleClickAuth('CUSTOMER')}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Icon name="profile" size={16} />
                {loadingType === 'CUSTOMER' ? 'AUTHENTICATING...' : '1-CLICK LOGIN CUSTOMER'}
              </button>
              <a
                href="/customer"
                className="block text-center text-[11px] font-mono text-emerald-400 hover:underline"
              >
                Open /customer surface directly →
              </a>
            </div>
          </div>

          {/* ADMIN 1-CLICK CARD */}
          <div className="bg-slate-900 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-6 space-y-4 flex flex-col justify-between shadow-2xl transition-all group">
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/20 text-purple-400 grid place-items-center">
                <Icon name="shield" size={24} />
              </div>
              <h3 className="text-lg font-black text-white">Admin Command Center</h3>
              <p className="text-xs text-slate-400">
                Authenticate as Super Admin (`admin@starvnt.com`) and open Admin Shell.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                disabled={loadingType === 'ADMIN'}
                onClick={() => handleSingleClickAuth('ADMIN')}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider transition shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Icon name="lock" size={16} />
                {loadingType === 'ADMIN' ? 'AUTHENTICATING...' : '1-CLICK LOGIN ADMIN'}
              </button>
              <a
                href="/admin/dashboard"
                className="block text-center text-[11px] font-mono text-purple-400 hover:underline"
              >
                Open /admin dashboard directly →
              </a>
            </div>
          </div>

        </div>

        {/* LIVE IDENTITY INSPECTOR & ACTIVE TOKEN FEED */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Icon name="audit" size={16} className="text-purple-400" />
              <span>Active Auth Identity & Token Inspector</span>
            </h3>
            <button
              onClick={handleClearAllSessions}
              className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold rounded-lg transition border border-rose-500/30 cursor-pointer"
            >
              Clear Sessions & Tokens
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* External User Status */}
            <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>External User (Customer/Vendor)</span>
                {user ? (
                  <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-[9px]">ACTIVE SESSION</span>
                ) : (
                  <span className="text-slate-500 bg-slate-800 px-2 py-0.5 rounded text-[9px]">NOT SIGNED IN</span>
                )}
              </div>

              {user ? (
                <div className="space-y-1 text-xs font-mono text-slate-300">
                  <div>Name: <strong className="text-white">{user.fullName}</strong></div>
                  <div>Email: <strong className="text-white">{user.email}</strong></div>
                  <div>Account Type: <strong className="text-sky-400">{user.accountType}</strong></div>
                </div>
              ) : (
                <div className="text-xs font-mono text-slate-500">No active external user session. Click a button above to sign in.</div>
              )}

              {externalToken && (
                <div className="pt-2 border-t border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>Bearer Access Token:</span>
                    <button
                      onClick={() => copyToClipboard(externalToken, 'external')}
                      className="text-purple-400 hover:underline cursor-pointer"
                    >
                      {copiedToken === 'external' ? '✓ Copied!' : 'Copy Token'}
                    </button>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 bg-slate-900 p-2 rounded truncate border border-slate-800">
                    {externalToken}
                  </div>
                </div>
              )}
            </div>

            {/* Admin User Status */}
            <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Internal Admin User</span>
                {admin ? (
                  <span className="text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded text-[9px]">ACTIVE ADMIN</span>
                ) : (
                  <span className="text-slate-500 bg-slate-800 px-2 py-0.5 rounded text-[9px]">NOT SIGNED IN</span>
                )}
              </div>

              {admin ? (
                <div className="space-y-1 text-xs font-mono text-slate-300">
                  <div>Name: <strong className="text-white">{admin.fullName}</strong></div>
                  <div>Email: <strong className="text-white">{admin.email}</strong></div>
                  <div>Role: <strong className="text-purple-300">{admin.role}</strong></div>
                </div>
              ) : (
                <div className="text-xs font-mono text-slate-500">No active admin session. Click 1-Click Login Admin above to sign in.</div>
              )}

              {adminToken && (
                <div className="pt-2 border-t border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>Admin Bearer Token:</span>
                    <button
                      onClick={() => copyToClipboard(adminToken, 'admin')}
                      className="text-purple-400 hover:underline cursor-pointer"
                    >
                      {copiedToken === 'admin' ? '✓ Copied!' : 'Copy Token'}
                    </button>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 bg-slate-900 p-2 rounded truncate border border-slate-800">
                    {adminToken}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto w-full text-center text-[11px] font-mono text-slate-500 pt-6 border-t border-slate-800">
        STARVNT Dev Auth Probe · Accessible at `/testAuth` · Built for fast dev authentication & testing
      </footer>

    </div>
  );
}
