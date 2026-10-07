import { useCallback, useEffect, useRef, useState } from 'react';
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
import VendorsPage from './VendorsPage.jsx';
import { DocumentsPage, FavoritesPage, SettingsPage } from './PlaceholderPages.jsx';
import { CurrentEventProvider, GoToSection, useCurrentEvent } from './currentEvent.jsx';
import { customerApi } from './customerApi.js';
import { CustomerErrorScreen } from './customerUi.jsx';
import { takePendingPrompt } from './pendingPrompt.js';

/* Sidebar (reference screen set 4). Per-event sections open the current event. */
const SIDEBAR = [
  { key: 'home', label: 'Home', icon: 'dashboard', to: '/customer' },
  { key: 'new', label: 'New Event', icon: 'plus', to: '/customer/events/new' },
  { key: 'aura', label: 'Aura+', icon: 'bolt', to: '/customer/aura' },
  { key: 'events', label: 'My Events', icon: 'events', to: '/customer/events' },
  { key: 'messages', label: 'Messages', icon: 'message', to: '/customer/updates?tab=messages', badge: true },
  { key: 'quotes', label: 'Plans & Quotes', icon: 'quotes', to: '/customer/go/quotes' },
  { key: 'bookings', label: 'Bookings', icon: 'bookings', to: '/customer/go/bookings' },
  { key: 'payments', label: 'Payments', icon: 'payments', to: '/customer/go/payments' },
  { key: 'vendors', label: 'My Vendors', icon: 'vendors', to: '/customer/go/vendors' },
  { key: 'timeline', label: 'Event Timeline', icon: 'calendar', to: '/customer/go/timeline' },
  { key: 'documents', label: 'Documents', icon: 'documents', to: '/customer/documents' },
  { key: 'favorites', label: 'Favorites', icon: 'star', to: '/customer/favorites' },
  { key: 'settings', label: 'Settings', icon: 'settings', to: '/customer/settings' },
];

const SIDEBAR_GROUPS = [
  { label: 'Plan', keys: ['home', 'new', 'aura', 'events'] },
  { label: 'Current Event', keys: ['messages', 'quotes', 'bookings', 'payments', 'vendors', 'timeline'] },
  { label: 'Library', keys: ['documents', 'favorites', 'settings'] },
];
const SIDEBAR_BY_KEY = Object.fromEntries(SIDEBAR.map((item) => [item.key, item]));

/* Mobile bottom bar keeps five primary destinations. */
const MOBILE_NAV = [
  { key: 'home', label: 'Home', icon: 'dashboard', to: '/customer' },
  { key: 'events', label: 'Events', icon: 'events', to: '/customer/events' },
  { key: 'aura', label: 'Aura+', icon: 'star', to: '/customer/aura' },
  { key: 'messages', label: 'Updates', icon: 'bell', to: '/customer/updates', badge: true },
  { key: 'me', label: 'Me', icon: 'profile', to: '/customer/me' },
];

function activeKey(pathname) {
  const p = pathname.replace(/^\/customer\/?/, '');
  if (!p) return 'home';
  if (p.startsWith('aura')) return 'aura';
  if (p === 'events/new') return 'new';
  if (p.startsWith('updates')) return 'messages';
  if (p.startsWith('go/')) return p.slice(3).split('/')[0];
  const m = /^events\/[^/]+\/([^/?]+)/.exec(p);
  if (m) {
    const section = { quotes: 'quotes', bookings: 'bookings', payments: 'payments', vendors: 'vendors', history: 'timeline' }[m[1]];
    if (section) return section;
  }
  if (p.startsWith('events')) return 'events';
  return p.split('/')[0];
}

function Badge({ n }) {
  if (!n) return null;
  return (
    <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center leading-none">
      {n > 9 ? '9+' : n}
    </span>
  );
}

function Avatar({ user, firstName, size = 'w-8 h-8' }) {
  return user?.avatarUrl ? (
    <img src={user.avatarUrl} alt="" className={`${size} rounded-full object-cover shrink-0 border border-gray-200`} />
  ) : (
    <div className={`${size} rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-xs font-bold shrink-0`}>
      {firstName[0]?.toUpperCase()}
    </div>
  );
}

/** Top bar: Ask STARVNT, event switcher, updates bell, profile menu. */
function TopBar({ user, firstName, unread, logout }) {
  const navigate = useNavigate();
  const { dark, toggle: toggleTheme } = useTheme();
  const { events, current, setCurrent } = useCurrentEvent();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const close = (e) => menuRef.current && !menuRef.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function ask(e) {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    const p = new URLSearchParams({ ask: text });
    if (current) p.set('event', current.id);
    setQ('');
    navigate(`/customer/aura?${p}`);
  }

  return (
    <header className="hidden md:flex items-center gap-3 px-6 py-3 bg-white/80 dark:bg-[#161926]/80 backdrop-blur border-b border-gray-100 dark:border-gray-800 shrink-0">
      <form onSubmit={ask} className="flex-1 max-w-xl flex items-center gap-2 bg-lavender dark:bg-[#1f2336] rounded-2xl px-4 py-2 border border-transparent focus-within:border-primary/40 transition">
        <Icon name="search" size={15} className="text-muted dark:text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask STARVNT anything…" className="flex-1 bg-transparent outline-none text-sm text-navy dark:text-white placeholder:text-muted/70 dark:placeholder:text-slate-400 font-medium" />
      </form>
      {events.length > 1 && (
        <select
          value={current?.id || ''}
          onChange={(e) => {
            setCurrent(e.target.value);
            navigate('/customer');
          }}
          className="max-w-[220px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e2235] px-3 py-2 text-xs font-semibold text-navy dark:text-slate-200 outline-none cursor-pointer shadow-xs"
          title="Current event"
        >
          {events.map((e) => <option key={e.id} value={e.id} className="bg-white dark:bg-[#1e2235] text-navy dark:text-white">{e.title}</option>)}
        </select>
      )}
      <button onClick={() => navigate('/customer/updates')} className="relative w-9 h-9 grid place-items-center rounded-xl hover:bg-lavender dark:hover:bg-white/10 text-muted dark:text-slate-300 transition" aria-label="Updates">
        <Icon name="bell" size={18} />
        <span className="absolute -top-0.5 -right-0.5"><Badge n={unread} /></span>
      </button>
      <div className="relative" ref={menuRef}>
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-lavender dark:hover:bg-white/10 transition">
          <Avatar user={user} firstName={firstName} />
          <div className="text-left hidden lg:block">
            <div className="text-xs font-bold text-navy dark:text-white leading-tight">{user?.fullName || firstName}</div>
            <div className="text-[10px] text-muted dark:text-slate-400 leading-tight">Customer</div>
          </div>
          <span className="text-muted dark:text-slate-400 text-xs">▾</span>
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#1e2235] rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 p-1.5 z-40 text-sm">
            {[
              ['profile', 'Profile', () => navigate('/customer/me')],
              ['settings', 'Settings', () => navigate('/customer/settings')],
              [dark ? 'sun' : 'moon', dark ? 'Light mode' : 'Dark mode', toggleTheme],
              ['logout', 'Log out', logout],
            ].map(([icon, label, fn]) => (
              <button
                key={label}
                onClick={() => {
                  setOpen(false);
                  fn();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-lavender dark:hover:bg-white/10 transition ${label === 'Log out' ? 'text-red-500 dark:text-red-400 font-semibold' : 'text-navy dark:text-slate-200'}`}
              >
                <Icon name={icon} size={14} /> {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

function Shell() {
  const { user, logout } = useExternalAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { error: eventLoadError, refresh: refreshEvents } = useCurrentEvent();
  const firstName = user?.fullName?.split(' ')[0] || 'there';
  const tab = activeKey(pathname);
  const canOpenWithoutEventList = tab === 'messages' || ['me', 'settings', 'documents', 'favorites', 'events', 'new'].includes(tab);

  const [unread, setUnread] = useState(0);
  const refreshUnread = useCallback(() => {
    customerApi.home().then((h) => setUnread(h.unreadUpdates || 0)).catch(() => {});
  }, []);

  // What a visitor typed on the landing page before signing in.
  useEffect(() => {
    const pending = takePendingPrompt();
    if (pending) navigate(`/customer/aura?new=1&ask=${encodeURIComponent(pending)}`, { replace: true });
  }, [navigate]);

  // Unread badge + event list stay fresh as the customer moves around.
  useEffect(() => {
    refreshUnread();
    refreshEvents();
  }, [pathname, refreshUnread, refreshEvents]);
  useEffect(() => {
    const t = setInterval(refreshUnread, 60000);
    return () => clearInterval(t);
  }, [refreshUnread]);

  return (
    <div className="h-screen bg-lavender dark:bg-[#0b0d14] flex overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-16 lg:w-60 bg-white dark:bg-[#161926] border-r border-gray-100 dark:border-gray-800/80 flex-col py-4 px-2 lg:px-3 shrink-0 min-h-0">
        <button onClick={() => navigate('/customer')} className="px-1 mb-5 text-left">
          <div className="hidden lg:block"><LogoWord size="text-base" /></div>
          <div className="lg:hidden grid place-items-center text-primary"><LogoMark size={24} /></div>
        </button>
        <nav className="flex-1 min-h-0 overflow-y-auto pr-0.5 space-y-4">
          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="hidden lg:block px-3 pb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted dark:text-slate-500">
                {group.label}
              </div>
              {group.keys.map((key) => {
                const n = SIDEBAR_BY_KEY[key];
                if (!n) return null;
                const active = tab === n.key;
                return (
                  <button
                    key={n.key}
                    type="button"
                    onClick={() => navigate(n.to)}
                    title={n.label}
                    className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition ${
                      active
                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                        : 'text-ink/80 dark:text-slate-300 hover:bg-lavender dark:hover:bg-white/5'
                    }`}
                  >
                    <span className={`grid place-items-center shrink-0 ${active ? 'text-white' : 'text-muted dark:text-slate-400'}`}><Icon name={n.icon} size={16} /></span>
                    <span className="hidden lg:inline truncate">{n.label}</span>
                    {n.badge && <span className="ml-auto hidden lg:inline"><Badge n={unread} /></span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <button
          onClick={() => navigate('/customer/aura?new=1')}
          className="hidden lg:flex mt-4 mx-1 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-primary to-[#9b6dff] text-white text-xs font-bold py-3 shadow-sm shadow-primary/25 hover:brightness-110 transition"
        >
          <Icon name="bolt" size={13} /> Plan with Aura+
        </button>
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2.5 px-1 lg:px-2">
          <button type="button" onClick={() => navigate('/customer/me')} className="flex items-center gap-2.5 min-w-0 flex-1 text-left rounded-2xl hover:bg-lavender dark:hover:bg-white/5 p-1.5 transition">
            <Avatar user={user} firstName={firstName} />
            <div className="hidden lg:block flex-1 min-w-0">
              <div className="text-xs font-bold text-navy dark:text-white truncate">{user?.fullName || firstName}</div>
              <div className="text-[9px] text-muted dark:text-slate-400 truncate">{user?.email}</div>
            </div>
          </button>
          <button type="button" onClick={logout} title="Log out" className="hidden lg:grid w-8 h-8 place-items-center rounded-xl text-muted dark:text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition">
            <Icon name="logout" size={15} />
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar user={user} firstName={firstName} unread={unread} logout={logout} />
        {/* Mobile top bar */}
        <header className="md:hidden bg-white dark:bg-[#161926] border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-3 shrink-0">
          <LogoWord size="text-base" />
          <button onClick={() => navigate('/customer/updates')} className="ml-auto text-muted relative" aria-label="Updates">
            <Icon name="bell" size={18} />
            <span className="absolute -top-1.5 -right-2"><Badge n={unread} /></span>
          </button>
          <button onClick={() => navigate('/customer/me')} aria-label="Profile"><Avatar user={user} firstName={firstName} /></button>
        </header>

        {tab === 'aura' ? (
          <main className="flex-1 min-h-0 flex flex-col pb-28 md:pb-0">
            <AuraChat firstName={firstName} />
          </main>
        ) : eventLoadError && !canOpenWithoutEventList ? (
          <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 pb-28 md:pb-6">
            <CustomerErrorScreen
              title="Could not load customer workspace"
              message="The customer dashboard could not reach the server. Please check the API and try again."
              onRetry={refreshEvents}
            />
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 pb-28 md:pb-6">
            <Routes>
              <Route index element={<HomePage firstName={firstName} />} />
              <Route path="events" element={<EventsPage />} />
              <Route path="events/new" element={<ManualPlanPage />} />
              <Route path="events/:id" element={<EventPage />} />
              <Route path="events/:id/requirements" element={<EventPlanPage />} />
              <Route path="events/:id/history" element={<EventHistoryPage />} />
              <Route path="events/:id/services" element={<ServicesPage />} />
              <Route path="events/:id/services/:serviceId" element={<ServiceDetailPage />} />
              <Route path="events/:id/compare" element={<ComparePage />} />
              <Route path="events/:id/quotes" element={<QuotesPage />} />
              <Route path="events/:id/bookings" element={<BookingsPage />} />
              <Route path="events/:id/payments" element={<BookingsPage />} />
              <Route path="events/:id/vendors" element={<VendorsPage />} />
              <Route path="events/:id/event-day" element={<EventDayPage />} />
              <Route path="events/:id/circle" element={<CirclePage />} />
              <Route path="events/:id/budget" element={<BudgetPage />} />
              <Route path="go/:section" element={<GoToSection />} />
              <Route path="updates" element={<UpdatesPage onRead={refreshUnread} />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="favorites" element={<FavoritesPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="me" element={<MePage user={user} logout={logout} />} />
              <Route path="*" element={<Navigate to="/customer" replace />} />
            </Routes>
          </main>
        )}

        {/* Mobile bottom tab bar with a raised centre Aura+ button */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-[#161926] border-t border-gray-100 dark:border-gray-800 grid grid-cols-5 z-20 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_-10px_30px_rgba(0,0,0,0.35)]" style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}>
          {MOBILE_NAV.map((n) =>
            n.key === 'aura' ? (
              <button key={n.key} onClick={() => navigate(n.to)} className="flex flex-col items-center -mt-5 text-[10px] font-semibold text-primary dark:text-[#a5b4fc]">
                <span className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center shadow-lg shadow-primary/30 border-4 border-white dark:border-[#161926]">
                  <Icon name={n.icon} size={18} />
                </span>
                {n.label}
              </button>
            ) : (
              <button
                key={n.key}
                onClick={() => navigate(n.to)}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition ${tab === n.key ? 'text-primary dark:text-[#a5b4fc]' : 'text-muted dark:text-slate-400'}`}
              >
                <Icon name={n.icon} size={18} />
                {n.label}
                {n.badge && <span className="absolute top-1 left-1/2 ml-1.5"><Badge n={unread} /></span>}
              </button>
            )
          )}
        </nav>
      </div>
    </div>
  );
}

/* ── Portal shell (reference screen set 4) ─────────────────────────────── */
export default function CustomerPortal() {
  return (
    <CurrentEventProvider>
      <Shell />
    </CurrentEventProvider>
  );
}
