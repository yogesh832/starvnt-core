import { Routes, Route, NavLink, Navigate, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';
import { useTheme } from '../../lib/ThemeContext.jsx';
import { adminApi } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { LogoWord } from '../../components/ui.jsx';
import Dashboard from './Dashboard.jsx';
import ModuleTable from './ModuleTable.jsx';
import UsersAccess from './UsersAccess.jsx';
import AuditLogs from './AuditLogs.jsx';
import DevApiTest from '../DevApiTest.jsx';

const DEV_TOOLS_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_TOOLS === 'true';

/**
 * Core Admin shell — light theme per the Complete Screen Set.
 * Navigation is generated from the signed-in admin's permissions
 * (UX only; every API enforces permissions itself on the backend).
 */
const MODULES = [
  { path: 'dashboard', label: 'Dashboard', icon: 'dashboard', anyOf: null },
  { path: 'customers', label: 'Customers', icon: 'customers', anyOf: ['customers.read'] },
  { path: 'vendors', label: 'Vendors', icon: 'vendors', anyOf: ['vendors.read'] },
  { path: 'events', label: 'Events', icon: 'events', anyOf: ['events.read'] },
  { path: 'bookings', label: 'Bookings', icon: 'bookings', anyOf: ['bookings.read'] },
  { path: 'payments', label: 'Payments', icon: 'payments', anyOf: ['payments.read', 'settlements.read'] },
  { path: 'operations', label: 'Operations', icon: 'operations', anyOf: ['execution.read', 'automation.read'] },
  { path: 'reports', label: 'Reports', icon: 'reports', anyOf: ['analytics.read', 'reports.read'] },
  { path: 'automation', label: 'Automation', icon: 'automation', anyOf: ['automation.read'] },
  { path: 'coupons', label: 'Coupons', icon: 'payments', anyOf: ['settings.read'] },
  { path: 'users', label: 'Users & Access', icon: 'access', superOnly: true },
  { path: 'audit', label: 'Audit Logs', icon: 'audit', anyOf: ['audit.read'] },
  ...(DEV_TOOLS_ENABLED ? [{ path: 'load-testing', label: 'API Load Test', icon: 'bolt', anyOf: ['automation.read'] }] : []),
  { path: 'settings', label: 'Settings', icon: 'settings', anyOf: ['settings.read'] },
];

export default function AdminShell() {
  const { admin, logout, can } = useAdminAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationError, setNotificationError] = useState('');

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentSearch = searchParams.get('search') || '';
  const [topbarSearch, setTopbarSearch] = useState(currentSearch);

  useEffect(() => {
    setTopbarSearch(currentSearch);
  }, [currentSearch]);

  function handleTopbarSearch(e) {
    e.preventDefault();
    const query = topbarSearch.trim();
    const targetModule = location.pathname.startsWith('/admin/') && location.pathname !== '/admin/dashboard'
      ? location.pathname
      : '/admin/vendors';
    navigate(`${targetModule}${query ? `?search=${encodeURIComponent(query)}` : ''}`);
  }

  async function loadNotifications() {
    setNotificationsLoading(true);
    setNotificationError('');
    try {
      const calls = await Promise.allSettled([
        can('vendors.read') ? adminApi.call('/external-users/organizations?limit=10&tab=Pending') : Promise.resolve(null),
        can('execution.read') ? adminApi.call('/operations/bookings?limit=5') : Promise.resolve(null),
        can('automation.read') ? adminApi.call('/automation/stats') : Promise.resolve(null),
        can('audit.read') ? adminApi.call('/audit?limit=4') : Promise.resolve(null),
      ]);
      const [vendors, bookings, automation, audit] = calls.map((r) => (r.status === 'fulfilled' ? r.value : null));
      const items = [];
      const pendingVendors = vendors?.organizations?.filter?.((v) => !v.verification?.isVerified) || [];
      if (pendingVendors.length) {
        items.push({
          id: 'vendor-kyc',
          title: `${pendingVendors.length} vendor KYC review${pendingVendors.length === 1 ? '' : 's'}`,
          body: pendingVendors.slice(0, 2).map((v) => v.businessName).filter(Boolean).join(', ') || 'Vendor documents need review',
          to: '/admin/vendors?tab=Pending',
          tone: 'amber',
        });
      }
      const bookingStats = bookings?.stats || {};
      if (Number(bookingStats.pendingPaymentCount || 0) > 0) {
        items.push({
          id: 'pending-payments',
          title: `${bookingStats.pendingPaymentCount} payment verification${bookingStats.pendingPaymentCount === 1 ? '' : 's'} pending`,
          body: 'Review escrow/payment status before execution continues.',
          to: '/admin/bookings?tab=Pending',
          tone: 'rose',
        });
      }
      if (Number(bookingStats.inProgressCount || 0) > 0) {
        items.push({
          id: 'execution',
          title: `${bookingStats.inProgressCount} booking${bookingStats.inProgressCount === 1 ? '' : 's'} in execution`,
          body: 'Track evidence, completion, and settlement readiness.',
          to: '/admin/bookings?tab=In%20Progress',
          tone: 'blue',
        });
      }
      const automationStats = automation?.stats || {};
      if (Number(automationStats.deadLetter || 0) > 0 || Number(automationStats.pending || 0) > 0) {
        items.push({
          id: 'automation',
          title: `${automationStats.deadLetter || 0} failed · ${automationStats.pending || 0} queued automation`,
          body: 'Inspect outbox health and retry failed events if needed.',
          to: '/admin/automation',
          tone: Number(automationStats.deadLetter || 0) > 0 ? 'rose' : 'violet',
        });
      }
      for (const log of audit?.logs || []) {
        items.push({
          id: `audit-${log._id}`,
          title: log.action || 'Admin activity',
          body: `${log.actorEmail || 'System'} · ${log.createdAt ? new Date(log.createdAt).toLocaleString() : 'Just now'}`,
          to: '/admin/audit',
          tone: 'slate',
        });
      }
      setNotifications(items.slice(0, 8));
    } catch (err) {
      setNotificationError(err.message || 'Could not load notifications.');
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  }

  function openNotifications() {
    setNotificationsOpen((open) => {
      const next = !open;
      if (next) loadNotifications();
      return next;
    });
  }

  function goNotification(to) {
    setNotificationsOpen(false);
    navigate(to);
  }

  useEffect(() => {
    loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.id]);

  const visible = MODULES.filter((m) => {
    if (m.superOnly) return admin.role === 'SUPER_ADMIN';
    if (!m.anyOf) return true;
    return m.anyOf.some((p) => can(p));
  });
  const activeModule = useMemo(
    () => visible.find((m) => location.pathname === `/admin/${m.path}` || location.pathname.startsWith(`/admin/${m.path}/`)) || visible[0],
    [location.pathname, visible],
  );
  const sidebarSurface = dark
    ? 'border-slate-800/80 bg-slate-950'
    : 'border-gray-200 bg-white';
  const sidebarHeaderBorder = dark ? 'border-slate-900' : 'border-gray-100';
  const sidebarFooterBorder = dark ? 'border-slate-800' : 'border-gray-100';
  const navIdle = dark
    ? 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
    : 'text-slate-600 hover:bg-lavender hover:text-navy';
  const navActive = dark
    ? 'bg-primary text-white shadow-lg shadow-primary/30'
    : 'bg-primary-soft text-primary shadow-sm ring-1 ring-primary/10';
  const utilityButton = dark
    ? 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
    : 'text-slate-600 hover:bg-lavender hover:text-navy';
  const notificationCount = notifications.length;

  return (
    <div className="h-screen overflow-hidden bg-[#f5f6fb] dark:bg-[#0f1117] flex">
      {navOpen && <div className="fixed inset-0 bg-navy/40 z-30 md:hidden" onClick={() => setNavOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed md:sticky top-0 h-screen z-40 w-64 shrink-0 border-r ${sidebarSurface} flex flex-col transform transition-transform md:translate-x-0 ${navOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        <div className={`px-6 py-5 flex items-center justify-between border-b ${sidebarHeaderBorder}`}>
          <LogoWord sub="Core" light={dark} />
          <button
            onClick={() => setNavOpen(false)}
            className={`md:hidden w-8 h-8 rounded-lg grid place-items-center transition ${utilityButton}`}
            aria-label="Close navigation"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <nav className="admin-sidebar-nav flex-1 overflow-y-auto px-4 py-4 space-y-1.5">
          {visible.map((m) => (
            <NavLink
              key={m.path}
              to={`/admin/${m.path}`}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-semibold transition duration-200 ${isActive ? navActive : navIdle}`
              }
            >
              <Icon name={m.icon} size={18} />
              <span>{m.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className={`p-4 border-t ${sidebarFooterBorder} flex flex-col gap-2`}>
          <button
            onClick={toggleTheme}
            className={`w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold flex items-center gap-3 transition cursor-pointer ${utilityButton}`}
            title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            <Icon name={dark ? 'sun' : 'moon'} size={18} />
            <span>{dark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <button onClick={logout} className={`w-full rounded-xl px-4 py-2.5 text-[13px] font-semibold flex items-center gap-3 cursor-pointer transition ${dark ? 'text-slate-400 hover:bg-slate-900 hover:text-red-400' : 'text-slate-600 hover:bg-rose-50 hover:text-red-600'}`}>
            <Icon name="logout" size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="shrink-0 bg-white/90 backdrop-blur sticky top-0 z-20 border-b border-gray-100 px-3 sm:px-6 py-3 flex items-center gap-3">
          <button
            className="md:hidden text-ink/70 hover:text-ink p-1"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="menu" size={20} />
          </button>
          <div className="hidden lg:block min-w-36">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted">Admin Panel</div>
            <div className="text-sm font-extrabold text-navy">{activeModule?.label || 'Dashboard'}</div>
          </div>
          <form onSubmit={handleTopbarSearch} className="flex-1 max-w-xl min-w-0 flex items-center gap-2 bg-lavender rounded-xl px-3.5 py-2 text-sm text-muted">
            <Icon name="search" size={16} />
            <input
              value={topbarSearch}
              onChange={(e) => setTopbarSearch(e.target.value)}
              className="bg-transparent flex-1 outline-none placeholder:text-muted/70 text-navy"
              placeholder="Search vendors, customers, bookings..."
            />
            {topbarSearch && (
              <button
                type="button"
                onClick={() => {
                  setTopbarSearch('');
                  navigate(location.pathname);
                }}
                className="text-muted hover:text-navy text-xs font-bold px-1 cursor-pointer"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </form>
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={openNotifications}
                className="relative w-9 h-9 grid place-items-center rounded-xl hover:bg-lavender text-ink/60"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
              >
                <Icon name="bell" size={18} />
                {notificationCount > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-extrabold grid place-items-center">
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                ) : (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
                )}
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-11 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-gray-100 bg-white shadow-2xl shadow-navy/10 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-extrabold text-navy">Admin Notifications</div>
                      <div className="text-[10px] text-muted">Live platform signals</div>
                    </div>
                    <button
                      type="button"
                      onClick={loadNotifications}
                      disabled={notificationsLoading}
                      className="text-[11px] font-bold text-primary hover:text-primary-dark disabled:opacity-50"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notificationsLoading ? (
                      <div className="px-4 py-5 text-xs text-muted">Loading notifications...</div>
                    ) : notificationError ? (
                      <div className="px-4 py-5 text-xs font-semibold text-rose-600">{notificationError}</div>
                    ) : notifications.length ? (
                      notifications.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => goNotification(item.to)}
                          className="w-full text-left px-4 py-3 flex gap-3 hover:bg-lavender/60 border-b border-gray-50 last:border-b-0 transition"
                        >
                          <span
                            className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${
                              item.tone === 'rose'
                                ? 'bg-rose-500'
                                : item.tone === 'amber'
                                ? 'bg-amber-500'
                                : item.tone === 'blue'
                                ? 'bg-sky-500'
                                : item.tone === 'violet'
                                ? 'bg-primary'
                                : 'bg-slate-400'
                            }`}
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-extrabold text-navy leading-5">{item.title}</span>
                            <span className="block text-[11px] text-muted leading-4 truncate">{item.body}</span>
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-5 text-xs text-muted">No admin notifications right now.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2.5 pl-2">
              {admin.avatarUrl ? (
                <img src={admin.avatarUrl} alt="Admin" className="w-9 h-9 rounded-full object-cover shrink-0 border border-gray-200" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary-dark text-white grid place-items-center text-sm font-bold shrink-0">
                  {admin.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
              )}
              <div className="hidden sm:block">
                <div className="text-[13px] font-bold leading-tight">{admin.fullName}</div>
                <div className="text-[10px] text-muted">{admin.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}</div>
              </div>
              <button onClick={logout} className="hidden md:inline text-[11px] text-muted hover:text-ink ml-1 cursor-pointer">Sign out</button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 lg:px-8 lg:py-6">
          <div className="mx-auto w-full max-w-[1500px] pb-8">
            <Routes>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="customers" element={<ModuleTable kind="customers" />} />
              <Route path="vendors" element={<ModuleTable kind="vendors" />} />
              <Route path="events" element={<ModuleTable kind="events" />} />
              <Route path="bookings" element={<ModuleTable kind="bookings" />} />
              <Route path="payments" element={<ModuleTable kind="payments" />} />
              <Route path="operations" element={<ModuleTable kind="operations" />} />
              <Route path="reports" element={<ModuleTable kind="reports" />} />
              <Route path="automation" element={<ModuleTable kind="automation" />} />
              <Route path="coupons" element={<ModuleTable kind="coupons" />} />
              <Route path="users" element={<UsersAccess />} />
              <Route path="audit" element={<AuditLogs />} />
              {DEV_TOOLS_ENABLED && <Route path="load-testing" element={<DevApiTest />} />}
              <Route path="settings" element={<ModuleTable kind="settings" />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}
