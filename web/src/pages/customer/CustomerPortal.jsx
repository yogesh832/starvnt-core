import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import { useTheme } from '../../lib/ThemeContext.jsx';
import Icon from '../../components/Icon.jsx';
import { LogoMark, LogoWord } from '../../components/ui.jsx';
import AuraChat from './AuraChat.jsx';
import HomePage from './HomePage.jsx';
import EventsPage from './EventsPage.jsx';
import EventPage from './EventPage.jsx';
import EventPlanPage from './EventPlanPage.jsx';
import EventHistoryPage from './EventHistoryPage.jsx';
import ServicesPage from './ServicesPage.jsx';
import ServiceDetailPage from './ServiceDetailPage.jsx';
import ComparePage from './ComparePage.jsx';
import QuotesPage from './QuotesPage.jsx';
import BookingsPage from './BookingsPage.jsx';
import EventDayPage from './EventDayPage.jsx';
import CirclePage from './CirclePage.jsx';
import BudgetPage from './BudgetPage.jsx';
import ManualPlanPage from './ManualPlanPage.jsx';
import UpdatesPage from './UpdatesPage.jsx';
import MePage from './MePage.jsx';
import { customerApi } from './customerApi.js';
import { takePendingPrompt } from './pendingPrompt.js';

const NAV = [
  { key: 'home', label: 'Home', icon: 'dashboard', to: '/customer' },
  { key: 'events', label: 'Events', icon: 'events', to: '/customer/events' },
  { key: 'aura', label: 'Aura+', icon: 'star', to: '/customer/aura' },
  { key: 'updates', label: 'Updates', icon: 'bell', to: '/customer/updates' },
  { key: 'me', label: 'Me', icon: 'profile', to: '/customer/me' },
];

function activeKey(pathname) {
  const seg = pathname.replace(/^\/customer\/?/, '').split('/')[0];
  return NAV.some((n) => n.key === seg) ? seg : 'home';
}

function Badge({ n }) {
  if (!n) return null;
  return (
    <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center leading-none">
      {n > 9 ? '9+' : n}
    </span>
  );
}

/* ── Portal shell: 5 primary nav items (§9.1) ────────────────────────────── */
export default function CustomerPortal() {
  const { user, logout } = useExternalAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const firstName = user?.fullName?.split(' ')[0] || 'there';
  const tab = activeKey(pathname);

  const [unread, setUnread] = useState(0);
  const refreshUnread = useCallback(() => {
    customerApi.home().then((h) => setUnread(h.unreadUpdates || 0)).catch(() => {});
  }, []);

  // What a visitor typed on the landing page before signing in.
  useEffect(() => {
    const pending = takePendingPrompt();
    if (pending) navigate(`/customer/aura?new=1&ask=${encodeURIComponent(pending)}`, { replace: true });
  }, [navigate]);

  // Unread count for the Updates badge: on navigation and every minute.
  useEffect(() => {
    refreshUnread();
  }, [tab, refreshUnread]);
  useEffect(() => {
    const t = setInterval(refreshUnread, 60000);
    return () => clearInterval(t);
  }, [refreshUnread]);

  return (
    <div className="h-screen bg-lavender flex overflow-hidden">
      {/* Desktop sidebar rail (reference shell) */}
      <aside className="hidden md:flex w-16 lg:w-52 bg-white border-r border-gray-100 flex-col py-4 px-2 lg:px-3 shrink-0">
        <div className="px-1 mb-5">
          <div className="hidden lg:block"><LogoWord size="text-base" /></div>
          <div className="lg:hidden grid place-items-center text-primary"><LogoMark size={24} /></div>
        </div>
        <nav className="space-y-1">
          {NAV.map((n) => {
            const active = tab === n.key;
            return (
              <button
                key={n.key}
                onClick={() => navigate(n.to)}
                title={n.label}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${
                  active ? 'bg-primary-soft text-primary' : 'text-ink/60 hover:bg-lavender'
                }`}
              >
                <span className="grid place-items-center shrink-0 lg:shrink"><Icon name={n.icon} size={17} /></span>
                <span className="hidden lg:inline">{n.label}</span>
                {n.key === 'aura' && (
                  <span className="hidden lg:inline ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary-soft text-primary uppercase tracking-wider">
                    AI
                  </span>
                )}
                {n.key === 'updates' && <span className="ml-auto"><Badge n={unread} /></span>}
              </button>
            );
          })}
        </nav>

        <button
          onClick={() => navigate('/customer/aura?new=1')}
          className="hidden lg:flex mt-4 mx-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-white text-xs font-bold py-2.5 hover:bg-primary-dark transition shadow-sm shadow-primary/25"
        >
          <Icon name="bolt" size={13} /> Plan with Aura+
        </button>
        <button
          onClick={() => navigate('/customer/events/new')}
          className="hidden lg:flex mt-2 mx-1 items-center justify-center gap-1.5 rounded-xl border border-primary/40 text-primary text-xs font-bold py-2.5 hover:bg-primary-soft transition"
        >
          <Icon name="edit" size={13} /> Fill details manually
        </button>

        <div className="px-2 mt-4 lg:block hidden">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-ink/70 hover:bg-lavender hover:text-navy transition cursor-pointer"
            title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            <span className="w-8 h-8 rounded-xl bg-gray-100 text-muted grid place-items-center shrink-0">
              <Icon name={dark ? 'sun' : 'moon'} size={16} />
            </span>
            <span>{dark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>
        <div className="mt-2 lg:hidden flex justify-center">
          <button
            onClick={toggleTheme}
            className="w-10 h-10 rounded-xl bg-gray-100 text-muted grid place-items-center hover:bg-lavender transition cursor-pointer"
            title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            <Icon name={dark ? 'sun' : 'moon'} size={18} />
          </button>
        </div>

        <div className="mt-auto flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-lavender transition">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="Profile" className="w-8 h-8 rounded-full object-cover shrink-0 border border-gray-200" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-xs font-bold shrink-0">
              {firstName[0]?.toUpperCase()}
            </div>
          )}
          <div className="hidden lg:block flex-1 min-w-0">
            <div className="text-xs font-bold truncate">{firstName}</div>
            <div className="text-[9px] text-muted truncate">{user?.email || 'Customer'}</div>
          </div>
          <button onClick={logout} title="Sign out" className="hidden lg:grid w-7 h-7 place-items-center rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition">
            <Icon name="logout" size={15} />
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">
          <LogoWord size="text-base" />
          <button onClick={() => navigate('/customer/updates')} className="ml-auto text-muted relative" aria-label="Updates">
            <Icon name="bell" size={18} />
            <span className="absolute -top-1.5 -right-2"><Badge n={unread} /></span>
          </button>
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="Profile" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-xs font-bold">
              {firstName[0]?.toUpperCase()}
            </div>
          )}
        </header>

        {tab === 'aura' ? (
          <main className="flex-1 min-h-0 flex flex-col pb-28 md:pb-0">
            <AuraChat firstName={firstName} />
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 pb-28 md:pb-6">
            <Routes>
              <Route index element={<HomePage firstName={firstName} />} />
              <Route path="events" element={<EventsPage />} />
              <Route path="events/:id" element={<EventPage />} />
              <Route path="events/:id/requirements" element={<EventPlanPage />} />
              <Route path="events/:id/history" element={<EventHistoryPage />} />
              <Route path="events/:id/services" element={<ServicesPage />} />
              <Route path="events/:id/services/:serviceId" element={<ServiceDetailPage />} />
              <Route path="events/:id/compare" element={<ComparePage />} />
              <Route path="events/:id/quotes" element={<QuotesPage />} />
              <Route path="events/:id/bookings" element={<BookingsPage />} />
              <Route path="events/:id/event-day" element={<EventDayPage />} />
              <Route path="events/:id/circle" element={<CirclePage />} />
              <Route path="events/:id/budget" element={<BudgetPage />} />
              <Route path="events/new" element={<ManualPlanPage />} />
              <Route path="updates" element={<UpdatesPage onRead={refreshUnread} />} />
              <Route path="me" element={<MePage user={user} logout={logout} />} />
              <Route path="*" element={<Navigate to="/customer" replace />} />
            </Routes>
          </main>
        )}

        {/* Mobile bottom tab bar with a raised centre Aura+ button */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 grid grid-cols-5 z-20" style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}>
          {NAV.map((n) =>
            n.key === 'aura' ? (
              <button key={n.key} onClick={() => navigate(n.to)} className="flex flex-col items-center -mt-5 text-[10px] font-semibold text-primary">
                <span className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center shadow-lg shadow-primary/30 border-4 border-white">
                  <Icon name={n.icon} size={18} />
                </span>
                {n.label}
              </button>
            ) : (
              <button
                key={n.key}
                onClick={() => navigate(n.to)}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition ${tab === n.key ? 'text-primary' : 'text-muted'}`}
              >
                <Icon name={n.icon} size={18} />
                {n.label}
                {n.key === 'updates' && <span className="absolute top-1 left-1/2 ml-1.5"><Badge n={unread} /></span>}
              </button>
            )
          )}
        </nav>
      </div>
    </div>
  );
}
