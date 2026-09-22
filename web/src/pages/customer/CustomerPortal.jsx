import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import { useTheme } from '../../lib/ThemeContext.jsx';
import Icon from '../../components/Icon.jsx';
import { LogoMark, LogoWord } from '../../components/ui.jsx';
import AuraChat from './AuraChat.jsx';
import EventCenter from './EventCenter.jsx';
import { HomeView, UpdatesView, MeView, EventsView } from './views.jsx';
import { externalApi } from '../../lib/api.js';

/* ── Blueprint-shaped demo state (will bind to Core APIs as they land) ───── */
const EVENTS = [
  {
    name: "My Daughter's Wedding",
    date: '26 November 2025',
    place: 'New Town, Kolkata',
    guests: 500,
    state: 'BOOKING_IN_PROGRESS',
    readiness: 68,
    requirements: [
      { name: 'Catering', status: 'Decision needed', detail: '3 validated quotes ready — SpiceRoute is the best value at ₹1,12,000 (base + service + travel).', action: 'Compare quotes' },
    ],
    timeline: [
      ['Intent captured', 'Wedding, 26 Nov, 500 guests — understood via Aura+', true],
      ['Event plan drafted', 'Essentials first; recommendations marked clearly', true],
      ['Booking in progress', '2 of 5 essentials confirmed; catering decision pending', true],
      ['Ready for event', 'All essentials confirmed and scheduled', false],
      ['Event day', 'Live status feed for you and your circle', false],
      ['Memory', 'Your organized story: photos, videos, moments', false],
    ],
    budget: {
      spent: '₹1,38,000', total: '₹3,00,000', pct: 46,
      lines: [['Photography', '₹48,000'], ['Venue', '₹90,000'], ['Catering (pending)', '~₹1,12,000']],
    },
    payments: [
      { label: 'Photography advance', amount: '₹15,000', status: 'Confirmed' },
      { label: 'Venue reservation', amount: '₹20,000', status: 'Confirmed' },
      { label: 'Catering', amount: '—', status: 'Finding options' },
    ],
    vendors: [
      { name: 'ShutterCraft Studio', role: 'Photography', status: 'Booked' },
      { name: 'SpiceRoute Caterers', role: 'Catering', status: 'Quotes ready' },
      { name: 'New Town Banquets', role: 'Venue', status: 'Confirmed' },
    ],
  },
  {
    name: "Rahul's 30th Birthday",
    date: '17 September 2026 · today',
    place: 'Eco Park Lawns',
    guests: 80,
    state: 'LIVE',
    readiness: 100,
    requirements: [
      { name: 'Decoration', status: 'Booked', detail: 'Team arrived 08:00 — setup verified.' },
      { name: 'Photography', status: 'Booked', detail: 'Checked in 09:42.' },
      { name: 'Cake', status: 'Confirmed', detail: 'Delivery window 17:30–18:00.' },
    ],
    timeline: [
      ['Planned', 'All essentials confirmed', true],
      ['Event day', 'Live now — everything on track', true],
      ['Memory', 'Photos and story assembled after the event', false],
    ],
    budget: {
      spent: '₹52,000', total: '₹60,000', pct: 87,
      lines: [['Decoration', '₹22,000'], ['Photography', '₹18,000'], ['Cake & extras', '₹12,000']],
    },
    payments: [
      { label: 'All payments', amount: '₹52,000', status: 'Confirmed' },
    ],
    vendors: [
      { name: 'Bloom Decor', role: 'Decoration', status: 'Booked' },
      { name: 'Lens & Light', role: 'Photography', status: 'Booked' },
      { name: 'Sweet Moments', role: 'Cake', status: 'Confirmed' },
    ],
  },
];

const NAV = [
  { key: 'home', label: 'Home', icon: 'dashboard' },
  { key: 'events', label: 'Events', icon: 'calendar' },
  { key: 'aura', label: 'Aura+', icon: 'star' },
  { key: 'updates', label: 'Updates', icon: 'bell' },
  { key: 'me', label: 'Me', icon: 'profile' },
];

/* ── Portal shell: 5 primary nav items (§9.1) ────────────────────────────── */
export default function CustomerPortal() {
  const { user, logout } = useExternalAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  
  const firstName = user?.fullName?.split(' ')[0] || 'there';
  const [tab, setTab] = useState(location.state?.intent ? 'aura' : 'home');
  const [activeEvent, setActiveEvent] = useState(null); // index into eventsList, or null
  const [eventsList, setEventsList] = useState([]); // Empty until API load

  useEffect(() => {
    async function loadBackend() {
      try {
        const [oppsRes, quotesRes, bookingsRes] = await Promise.all([
          externalApi.call('/opportunities').catch(() => ({ opportunities: [] })),
          externalApi.call('/quotes').catch(() => ({ quotes: [] })),
          externalApi.call('/bookings').catch(() => ({ bookings: [] }))
        ]);
        
        // Group by event name/date
        const groups = {};
        for (const opp of (oppsRes.opportunities || [])) {
          const key = opp.eventDate + '_' + opp.guestCount;
          if (!groups[key]) {
             groups[key] = {
               name: opp.category + " Event",
               date: new Date(opp.eventDate).toLocaleDateString(),
               place: opp.serviceLocation?.locality || 'TBD',
               guests: opp.guestCount || 500,
               state: 'PLANNING',
               readiness: 68,
               requirements: [],
               timeline: EVENTS[0].timeline, // mock timeline
               budget: EVENTS[0].budget,
               payments: EVENTS[0].payments,
               vendors: []
             };
          }
          groups[key].requirements.push({
            name: opp.category,
            status: opp.status === 'NEW' ? 'Finding options' : opp.status,
            detail: `Need ${opp.category} for ${opp.guestCount} guests.`,
            action: 'View'
          });
        }
        
        // Merge bookings
        for (const bk of (bookingsRes.bookings || [])) {
          // just mock linking
        }
        
        const apiEvents = Object.values(groups);
        setEventsList(apiEvents);
      } catch (err) {}
    }
    loadBackend();
  }, []);

  const openEvent = (i) => { setActiveEvent(i); setTab('events'); };
  const openAura = () => setTab('aura');

  function renderTab() {
    if (tab === 'home') {
      return <HomeView firstName={firstName} events={eventsList} onOpenEvent={openEvent} onOpenAura={openAura} onOpenUpdates={() => setTab('updates')} />;
    }
    if (tab === 'events') {
      if (activeEvent != null) {
        return (
          <div className="max-w-5xl mx-auto">
            <button onClick={() => setActiveEvent(null)} className="text-xs font-bold text-muted hover:text-primary mb-3">← All events</button>
            <EventCenter event={eventsList[activeEvent]} onAskAura={openAura} />
          </div>
        );
      }
      return <EventsView events={eventsList} onOpenEvent={openEvent} onOpenAura={openAura} />;
    }
    if (tab === 'aura') return null; // full-height, handled below
    if (tab === 'updates') return <UpdatesView events={eventsList} />;
    return <MeView user={user} logout={logout} />;
  }

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
                onClick={() => { setTab(n.key); if (n.key !== 'events') setActiveEvent(null); }}
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
              </button>
            );
          })}
        </nav>
        
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
            <div className="text-[9px] text-muted truncate">Customer</div>
          </div>
          <button onClick={logout} title="Sign out" className="hidden lg:grid w-7 h-7 place-items-center rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition">
            <Icon name="logout" size={15} />
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        {tab !== 'home' && (
          <header className="md:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">
            <LogoWord size="text-base" />
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="Profile" className="ml-auto w-8 h-8 rounded-full object-cover border border-gray-200" />
            ) : (
              <div className="ml-auto w-8 h-8 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-xs font-bold">
                {firstName[0]?.toUpperCase()}
              </div>
            )}
          </header>
        )}

        {tab === 'aura' ? (
          <main className="flex-1 min-h-0 flex flex-col">
            <AuraChat
              firstName={firstName}
              initialIntent={location.state?.intent}
              onEventCreated={() => {
                setActiveEvent(0);
                setTab('events');
              }}
            />
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 pb-24 md:pb-6">
            {renderTab()}
          </main>
        )}

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 grid grid-cols-5 z-20" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {NAV.map((n) => {
            const isCenter = n.key === 'aura';
            return (
              <button
                key={n.key}
                onClick={() => { setTab(n.key); if (n.key !== 'events') setActiveEvent(null); }}
                className={`relative flex flex-col items-center justify-center gap-1 py-3 text-[10px] font-bold transition ${tab === n.key && !isCenter ? 'text-primary' : 'text-muted'}`}
              >
                {isCenter ? (
                  <div className="absolute -top-6 w-[3.25rem] h-[3.25rem] rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 border-[5px] border-white z-30">
                     <Icon name={n.icon} size={24} />
                  </div>
                ) : (
                  <Icon name={n.icon} size={20} />
                )}
                {isCenter ? <span className="mt-8 text-primary">Ask</span> : <span>{n.label}</span>}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
