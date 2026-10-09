import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { LogoWord } from '../components/ui.jsx';
import { useExternalAuth } from '../auth/ExternalAuthContext.jsx';
import { useAdminAuth } from '../auth/AdminAuthContext.jsx';
import { externalApi, adminApi } from '../lib/api.js';

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  return import.meta.env.MODE === 'production' ? 'https://app.starvnt.com' : 'http://localhost:4000';
};

// ── 15 Pre-Seeded Vendors Across Categories & States ────────────────────────
const SEEDED_VENDORS = [
  {
    id: 'v1',
    name: 'Himalayan Moments & Wedding Studio',
    category: 'Photography',
    owner: 'Arun Roy',
    email: 'vendor@starvnt.com',
    location: 'Kapkote, Uttarakhand',
    badge: 'Verified 100% Live',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: 'camera',
    pricing: '₹48,000 / event',
  },
  {
    id: 'v2',
    name: 'Kumaon Candid & Birthday Reel Stories',
    category: 'Photography',
    owner: 'Vikram Negi',
    email: 'photo2@starvnt.com',
    location: 'Kapkote, Uttarakhand',
    badge: 'Verified 100% Live',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: 'camera',
    pricing: '₹18,000 / event',
  },
  {
    id: 'v3',
    name: 'Valley Peak Photography & Drone Films',
    category: 'Photography',
    owner: 'Deepak Pant',
    email: 'photo3@starvnt.com',
    location: 'Bageshwar, Uttarakhand',
    badge: 'KYC Pending (100%)',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    icon: 'camera',
    pricing: '₹14,000 / event',
  },
  {
    id: 'v4',
    name: 'Royal Kumaoni Feast & Traditional Catering',
    category: 'Catering',
    owner: 'Chef Sanjeev Verma',
    email: 'catering@starvnt.com',
    location: 'Kapkote, Uttarakhand',
    badge: 'Verified 100% Live',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: 'services',
    pricing: '₹650 / plate',
  },
  {
    id: 'v5',
    name: 'Mountain Bites & Birthday Party Catering',
    category: 'Catering',
    owner: 'Ramesh Joshi',
    email: 'catering2@starvnt.com',
    location: 'Kapkote, Uttarakhand',
    badge: 'Verified 100% Live',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: 'services',
    pricing: '₹350 / plate',
  },
  {
    id: 'v6',
    name: 'Grand Bageshwar Feast & Gourmet Catering',
    category: 'Catering',
    owner: 'Chef Amit Bishai',
    email: 'catering3@starvnt.com',
    location: 'Bageshwar, Uttarakhand',
    badge: 'Verified 100% Live',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: 'services',
    pricing: '₹850 / plate',
  },
  {
    id: 'v7',
    name: 'Pahadi Varmala & Grandeur Event Decor',
    category: 'Decor & Styling',
    owner: 'Pooja Rawat',
    email: 'decor@starvnt.com',
    location: 'Kapkote, Uttarakhand',
    badge: 'Verified 100% Live',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: 'star',
    pricing: '₹85,000 / setup',
  },
  {
    id: 'v8',
    name: 'Kumaon Floral Arches & Theme Party Decor',
    category: 'Decor & Styling',
    owner: 'Sandeep Pandey',
    email: 'decor2@starvnt.com',
    location: 'Kapkote, Uttarakhand',
    badge: 'Verified 100% Live',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: 'star',
    pricing: '₹25,000 / setup',
  },
  {
    id: 'v9',
    name: 'Himalayan Fairy Lights & Birthday Decor Studio',
    category: 'Decor & Styling',
    owner: 'Meena Bisht',
    email: 'decor3@starvnt.com',
    location: 'Kapkote, Uttarakhand',
    badge: 'Verified 100% Live',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: 'star',
    pricing: '₹15,000 / setup',
  },
  {
    id: 'v10',
    name: 'Himalayan Heritage Pine Lawns & Resort',
    category: 'Venue',
    owner: 'Col. Suresh Chand',
    email: 'venue@starvnt.com',
    location: 'Kapkote, Uttarakhand',
    badge: 'Verified 100% Live',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: 'mapPin',
    pricing: '₹1,50,000 / day',
  },
  {
    id: 'v11',
    name: 'Kapkote Party Lawn & Celebration Banquet',
    category: 'Venue',
    owner: 'Ganesh Koranga',
    email: 'venue2@starvnt.com',
    location: 'Kapkote, Uttarakhand',
    badge: 'Verified 100% Live',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: 'mapPin',
    pricing: '₹45,000 / day',
  },
  {
    id: 'v12',
    name: 'Valley View Garden & Birthday Pavilion',
    category: 'Venue',
    owner: 'Harish Mehta',
    email: 'venue3@starvnt.com',
    location: 'Bageshwar, Uttarakhand',
    badge: 'Verified 100% Live',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: 'mapPin',
    pricing: '₹35,000 / day',
  },
  {
    id: 'v13',
    name: 'Kumaon Beats & Sound FX (DJ & Audio)',
    category: 'DJ & Music',
    owner: 'DJ Rahul Kumaoni',
    email: 'dj@starvnt.com',
    location: 'Kapkote, Uttarakhand',
    badge: 'Verified 100% Live',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: 'mic',
    pricing: '₹22,000 / night',
  },
  {
    id: 'v14',
    name: 'Pahadi Bridal Glow & Artistry Studio',
    category: 'Makeup & Styling',
    owner: 'Neeta Sharma',
    email: 'makeup@starvnt.com',
    location: 'Kapkote, Uttarakhand',
    badge: 'Verified 100% Live',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: 'sparkles',
    pricing: '₹15,000 / bride',
  },
  {
    id: 'v15',
    name: 'Delhi & Kumaon Emcee Desk (Anchor & Host)',
    category: 'Anchor / Host',
    owner: 'Anchor Kavya',
    email: 'anchor1@starvnt.com',
    location: 'Delhi & Kapkote',
    badge: 'Verified 100% Live',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: 'mic',
    pricing: '₹25,000 / event',
  },
];

// ── 4 Customer Accounts ──────────────────────────────────────────────────────
const TEST_CUSTOMERS = [
  {
    id: 'c1',
    name: 'Ananya Sharma',
    email: 'customer@starvnt.com',
    event: 'Grand Pahadi Wedding (1000 Pax)',
    city: 'Kapkote',
    icon: 'profile',
  },
  {
    id: 'c2',
    name: 'Rahul Verma',
    email: 'customer2@starvnt.com',
    event: '1st Birthday Celebration & Reel Shoot',
    city: 'Kapkote',
    icon: 'profile',
  },
  {
    id: 'c3',
    name: 'Priya Patel',
    email: 'customer3@starvnt.com',
    event: 'Corporate Annual Gala & Awards',
    city: 'Bageshwar',
    icon: 'profile',
  },
  {
    id: 'c4',
    name: 'Vikram Malhotra',
    email: 'customer4@starvnt.com',
    event: 'Silver Jubilee Anniversary Dinner',
    city: 'Dehradun',
    icon: 'profile',
  },
];

// ── 4 Admin Accounts ─────────────────────────────────────────────────────────
const TEST_ADMINS = [
  {
    id: 'a1',
    name: 'Dev Super Admin',
    email: 'admin@starvnt.com',
    role: 'SUPER_ADMIN',
    desc: 'Full platform administration, audit logs, and configuration',
    color: 'from-purple-600 to-indigo-600',
  },
  {
    id: 'a2',
    name: 'Ops Operations Lead',
    email: 'ops@starvnt.com',
    role: 'OPERATIONS',
    desc: 'Lead dispatch, opportunity matching, and vendor assignment',
    color: 'from-blue-600 to-cyan-600',
  },
  {
    id: 'a3',
    name: 'Finance & Ledger Head',
    email: 'finance@starvnt.com',
    role: 'FINANCE',
    desc: 'Escrow oversight, vendor settlement release & payouts',
    color: 'from-emerald-600 to-teal-600',
  },
  {
    id: 'a4',
    name: 'Support & Verification Officer',
    email: 'support@starvnt.com',
    role: 'SUPPORT',
    desc: 'Vendor KYC document review and customer support desk',
    color: 'from-amber-600 to-orange-600',
  },
];

export default function DevSingleClickAuth() {
  const navigate = useNavigate();
  const extCtx = useExternalAuth() || {};
  const admCtx = useAdminAuth() || {};

  const user = extCtx.user || null;
  const externalReady = extCtx.ready ?? true;
  const externalLogout = extCtx.logout || (async () => {});

  const admin = admCtx.admin || null;
  const adminReady = admCtx.ready ?? true;
  const adminLogout = admCtx.logout || (async () => {});

  const [loadingEmail, setLoadingEmail] = useState(null);
  const [reseeding, setReseeding] = useState(false);
  const [reseedMsg, setReseedMsg] = useState('');
  const [authError, setAuthError] = useState('');
  const [copiedToken, setCopiedToken] = useState('');
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState('ALL');

  const externalToken = localStorage.getItem('starvnt_external_access_token') || '';
  const adminToken = localStorage.getItem('starvnt_admin_access_token') || '';

  // 1-Click Auth Execution
  const handleAuthLogin = async ({ email, accountType, role }) => {
    const targetKey = email || accountType;
    setLoadingEmail(targetKey);
    setAuthError('');

    const apiBase = getApiBaseUrl();

    try {
      if (accountType === 'ADMIN') {
        const res = await fetch(`${apiBase}/api/admin/auth/dev-auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Admin auth failed with status ${res.status}`);
        }

        const data = await res.json();
        if (data.accessToken) {
          adminApi.setToken(data.accessToken);
          localStorage.setItem('starvnt_admin_access_token', data.accessToken);
          window.location.href = data.redirectTo || '/admin/dashboard';
        }
      } else {
        const res = await fetch(`${apiBase}/api/auth/dev-auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountType, email }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Dev auth failed with status ${res.status}`);
        }

        const data = await res.json();
        if (data.accessToken) {
          externalApi.setToken(data.accessToken);
          localStorage.setItem('starvnt_external_access_token', data.accessToken);
          window.location.href = data.redirectTo || (accountType === 'VENDOR' ? '/vendor' : '/customer');
        }
      }
    } catch (err) {
      console.error('Dev auth error:', err);
      setAuthError(err.message || 'Single-click authentication failed.');
    } finally {
      setLoadingEmail(null);
    }
  };

  const handleReseed = async () => {
    setReseeding(true);
    setReseedMsg('');
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/auth/reseed`, { method: 'POST' });
      const data = await res.json();
      setReseedMsg(data.message || 'Seeded 15 real vendors successfully!');
    } catch (err) {
      setReseedMsg(`Seed error: ${err.message}`);
    } finally {
      setReseeding(false);
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

  const filteredVendors = SEEDED_VENDORS.filter((v) => {
    if (vendorCategoryFilter === 'ALL') return true;
    return v.category.toUpperCase().includes(vendorCategoryFilter.toUpperCase());
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-purple-500 selection:text-white flex flex-col justify-between p-4 lg:p-8">
      {/* Header Bar */}
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between pb-6 border-b border-slate-800 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <LogoWord sub="Dev Auth Probe (/auth-test)" light={true} />
          <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            TEST LOGIN WORKBENCH
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleReseed}
            disabled={reseeding}
            className="px-3.5 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Icon name="bolt" size={14} />
            <span>{reseeding ? 'Seeding DB...' : '⚡ Reseed All 15 Test Vendors'}</span>
          </button>
          <a
            href="/api/test"
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1.5"
          >
            <Icon name="bolt" size={14} /> API Workbench
          </a>
        </div>
      </header>

      {/* Main Single-Click Control Center */}
      <main className="max-w-6xl mx-auto w-full py-8 space-y-10">
        {/* Hero Section */}
        <div className="text-center space-y-3">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight">
            Developer POV: 1-Click Test Login Workbench
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Instant authentication for <strong>4 Admin Roles</strong>, <strong>4 Customer Personas</strong>, and <strong>15 Working Vendors</strong> across Photography, Catering, Decor, Venue, DJ, Makeup, and Hosts. Click any button to log in and test.
          </p>
        </div>

        {reseedMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold text-center animate-fade-in flex items-center justify-center gap-2">
            <Icon name="check" size={15} />
            <span>{reseedMsg}</span>
          </div>
        )}

        {authError && (
          <div className="p-4 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold text-center">
            ⚠️ {authError}
          </div>
        )}

        {/* SECTION 1: INTERNAL ADMIN USERS (4 ROLES) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h2 className="text-sm font-black uppercase tracking-wider text-purple-400 flex items-center gap-2">
              <Icon name="shield" size={18} />
              <span>Internal Admin Team (4 Roles)</span>
            </h2>
            <span className="text-xs text-slate-500 font-mono">/admin/login override</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TEST_ADMINS.map((adm) => (
              <div
                key={adm.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-lg transition-all group"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {adm.role}
                    </span>
                    <Icon name="lock" size={14} className="text-purple-400" />
                  </div>
                  <h3 className="font-extrabold text-sm text-white group-hover:text-purple-300 transition">
                    {adm.name}
                  </h3>
                  <div className="text-[11px] font-mono text-slate-400">{adm.email}</div>
                  <p className="text-[11px] text-slate-400 leading-snug">{adm.desc}</p>
                </div>

                <button
                  disabled={loadingEmail === adm.email}
                  onClick={() => handleAuthLogin({ email: adm.email, accountType: 'ADMIN', role: adm.role })}
                  className={`w-full py-2.5 px-3 rounded-xl bg-gradient-to-r ${adm.color} hover:brightness-110 text-white font-black text-xs uppercase tracking-wider transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50`}
                >
                  <Icon name="bolt" size={14} />
                  <span>{loadingEmail === adm.email ? 'Logging in...' : `1-Click Admin (${adm.role.split('_')[0]})`}</span>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 2: CUSTOMER CLIENT PERSONAS (4 PROFILES) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h2 className="text-sm font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              <Icon name="customers" size={18} />
              <span>Customer Client Accounts (4 Test Personas)</span>
            </h2>
            <span className="text-xs text-slate-500 font-mono">/customer surface</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TEST_CUSTOMERS.map((cust) => (
              <div
                key={cust.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-lg transition-all group"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Customer
                    </span>
                    <Icon name="profile" size={14} className="text-emerald-400" />
                  </div>
                  <h3 className="font-extrabold text-sm text-white group-hover:text-emerald-300 transition">
                    👤 {cust.name}
                  </h3>
                  <div className="text-[11px] font-mono text-slate-400">{cust.email}</div>
                  <div className="text-[11px] text-slate-300 font-medium">📍 {cust.city} · {cust.event}</div>
                </div>

                <button
                  disabled={loadingEmail === cust.email}
                  onClick={() => handleAuthLogin({ email: cust.email, accountType: 'CUSTOMER' })}
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs uppercase tracking-wider transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Icon name="profile" size={14} />
                  <span>{loadingEmail === cust.email ? 'Logging in...' : `1-Click Customer`}</span>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 3: 15 WORKING VENDORS ACROSS CATEGORIES & STATES */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-sky-400 flex items-center gap-2">
                <Icon name="vendors" size={18} />
                <span>15 Test Vendor Accounts (All Categories & Activation States)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Fully seeded active vendors with capabilities, services, coverage, pricing, portfolio items & reviews.
              </p>
            </div>

            {/* Category filter tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
              {['ALL', 'PHOTOGRAPHY', 'CATERING', 'DECOR', 'VENUE', 'DJ', 'MAKEUP', 'HOST'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setVendorCategoryFilter(cat)}
                  className={`px-3 py-1 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
                    vendorCategoryFilter === cat
                      ? 'bg-sky-500 text-slate-950 font-black shadow-xs'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVendors.map((v) => (
              <div
                key={v.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-sky-500/50 rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-lg transition-all group"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                      <Icon name={v.icon} size={11} />
                      <span>{v.category}</span>
                    </span>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${v.badgeColor}`}>
                      {v.badge}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-extrabold text-sm text-white group-hover:text-sky-300 transition leading-snug">
                      {v.name}
                    </h3>
                    <div className="text-[11px] text-slate-400 mt-0.5">Owner: <span className="text-slate-200 font-semibold">{v.owner}</span></div>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">{v.email}</div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                    <span>📍 {v.location}</span>
                    <span className="text-sky-400 font-bold">{v.pricing}</span>
                  </div>
                </div>

                <button
                  disabled={loadingEmail === v.email}
                  onClick={() => handleAuthLogin({ email: v.email, accountType: 'VENDOR' })}
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-black text-xs uppercase tracking-wider transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Icon name="bolt" size={14} />
                  <span>{loadingEmail === v.email ? 'Authenticating...' : `1-Click Login (${v.category.split(' ')[0]})`}</span>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ACTIVE SESSION INSPECTOR */}
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
              Clear All Sessions & Tokens
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* External User Status */}
            <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>External Active Identity (Customer / Vendor)</span>
                {user ? (
                  <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-[9px] font-bold">
                    ACTIVE SESSION
                  </span>
                ) : (
                  <span className="text-slate-500 bg-slate-800 px-2 py-0.5 rounded text-[9px]">NOT SIGNED IN</span>
                )}
              </div>

              {user ? (
                <div className="space-y-1 text-xs font-mono text-slate-300">
                  <div>Name: <strong className="text-white">{user.fullName}</strong></div>
                  <div>Email: <strong className="text-white">{user.email}</strong></div>
                  <div>Active Surface: <strong className="text-sky-400">{user.accountType}</strong></div>
                </div>
              ) : (
                <div className="text-xs font-mono text-slate-500">No active external user session. Click any 1-Click button above to sign in.</div>
              )}

              {externalToken && (
                <div className="pt-2 border-t border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>Bearer Access Token:</span>
                    <button
                      onClick={() => copyToClipboard(externalToken, 'external')}
                      className="text-purple-400 hover:underline cursor-pointer font-bold"
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
                  <span className="text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded text-[9px] font-bold">
                    ACTIVE ADMIN
                  </span>
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
                <div className="text-xs font-mono text-slate-500">No active admin session. Click 1-Click Admin above to sign in.</div>
              )}

              {adminToken && (
                <div className="pt-2 border-t border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>Admin Bearer Token:</span>
                    <button
                      onClick={() => copyToClipboard(adminToken, 'admin')}
                      className="text-purple-400 hover:underline cursor-pointer font-bold"
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
      <footer className="max-w-6xl mx-auto w-full text-center text-[11px] font-mono text-slate-500 pt-6 border-t border-slate-800">
        STARVNT Dev Auth Probe · Accessible at `/auth-test` · Developer POV Instant Authentication & QA Playground
      </footer>
    </div>
  );
}
