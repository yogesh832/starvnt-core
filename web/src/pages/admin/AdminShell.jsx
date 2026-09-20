import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';
import { useTheme } from '../../lib/ThemeContext.jsx';
import Icon from '../../components/Icon.jsx';
import { LogoWord } from '../../components/ui.jsx';
import Dashboard from './Dashboard.jsx';
import ModuleTable from './ModuleTable.jsx';
import UsersAccess from './UsersAccess.jsx';
import AuditLogs from './AuditLogs.jsx';

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
  { path: 'users', label: 'Users & Access', icon: 'access', superOnly: true },
  { path: 'audit', label: 'Audit Logs', icon: 'audit', anyOf: ['audit.read'] },
  { path: 'settings', label: 'Settings', icon: 'settings', anyOf: ['settings.read'] },
];

export default function AdminShell() {
  const { admin, logout, can } = useAdminAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const [navOpen, setNavOpen] = useState(false);

  const visible = MODULES.filter((m) => {
    if (m.superOnly) return admin.role === 'SUPER_ADMIN';
    if (!m.anyOf) return true;
    return m.anyOf.some((p) => can(p));
  });

  return (
    <div className="min-h-screen bg-lavender flex">
      {navOpen && <div className="fixed inset-0 bg-navy/40 z-30 md:hidden" onClick={() => setNavOpen(false)} />}

      {/* Sidebar — light, per screen set */}
      <aside className={`fixed md:sticky top-0 h-screen z-40 w-56 bg-white flex flex-col transform transition-transform md:translate-x-0 ${navOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        <div className="px-5 py-5 flex items-center justify-between">
          <LogoWord sub="Core" />
          <button
            onClick={() => setNavOpen(false)}
            className="md:hidden w-8 h-8 rounded-lg text-ink/60 hover:bg-lavender grid place-items-center transition"
            aria-label="Close navigation"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
          {visible.map((m) => (
            <NavLink
              key={m.path}
              to={`/admin/${m.path}`}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition ${
                  isActive ? 'bg-primary text-white shadow-md shadow-primary/25' : 'text-ink/60 hover:bg-lavender'
                }`
              }
            >
              <Icon name={m.icon} size={17} />
              <span>{m.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-100 flex flex-col gap-1">
          <button
            onClick={toggleTheme}
            className="w-full rounded-xl px-3.5 py-2 text-xs text-ink/60 hover:bg-lavender flex items-center gap-2 transition cursor-pointer"
            title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            <Icon name={dark ? 'sun' : 'moon'} size={16} />
            <span>{dark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <button onClick={logout} className="w-full rounded-xl px-3.5 py-2 text-xs text-ink/60 hover:bg-lavender flex items-center gap-2 cursor-pointer transition">
            <Icon name="logout" size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="bg-white/80 backdrop-blur sticky top-0 z-20 border-b border-gray-100 px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            className="md:hidden text-ink/70 hover:text-ink p-1"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="menu" size={20} />
          </button>
          <div className="flex-1 max-w-lg flex items-center gap-2 bg-lavender rounded-xl px-3.5 py-2 text-sm text-muted">
            <Icon name="search" size={16} />
            <input className="bg-transparent flex-1 outline-none placeholder:text-muted/70" placeholder="Search anything..." />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button className="relative w-9 h-9 grid place-items-center rounded-xl hover:bg-lavender text-ink/60">
              <Icon name="bell" size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
            </button>
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
              <button onClick={logout} className="text-[11px] text-muted hover:text-ink ml-1">Sign out</button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
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
            <Route path="users" element={<UsersAccess />} />
            <Route path="audit" element={<AuditLogs />} />
            <Route path="settings" element={<ModuleTable kind="settings" />} />
          </Routes>
        </main>

        <footer className="px-6 py-3 flex items-center justify-between text-[10px] text-muted/70">
          <span>© 2025 STARVNT. All rights reserved.</span>
          <span className="hidden sm:block">One Platform. Every Event. A Brighter Tomorrow.</span>
        </footer>
      </div>
    </div>
  );
}
