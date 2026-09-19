import { useState } from 'react';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import Icon from '../../components/Icon.jsx';
import { LogoMark, LogoWord } from '../../components/ui.jsx';
import AuraChat from './AuraChat.jsx';
import EventCenter from './EventCenter.jsx';
import { HomeView, UpdatesView, MeView, EventsView } from './views.jsx';

/* ── Blueprint-shaped demo state (will bind to Core APIs as they land) ───── */
const EVENTS = [
  {
    name: "My Daughter's Wedding",
    date: '28 November 2026',
    place: 'Kisar Palace, New Town',
    guests: 500,
    state: 'BOOKING_IN_PROGRESS',
    readiness: 62,
    requirements: [
      { name: 'Catering', status: 'Decision needed', detail: '3 validated quotes ready — SpiceRoute is the best value at ₹1,12,000 (base + service + travel).', action: 'Compare quotes' },
      { name: 'Photography', status: 'Booked', detail: 'ShutterCraft Studio · full day · advance verified.', action: 'View booking' },
      { name: 'Venue', status: 'Confirmed', detail: 'Banquet hall reserved — exact address unlocks for guests closer to the date.', action: 'Details' },
      { name: 'Decoration', status: 'Finding options', detail: 'Aura+ is shortlisting decorators who cover New Town on your date.', action: 'See progress' },
      { name: 'Makeup artist', status: 'Clarify needed', detail: 'One answer needed: bridal only, or family too?', action: 'Answer' },
      { name: 'Music & DJ', status: 'Finding options', detail: 'Optional — add when ready. Nothing is booked without you.', action: 'Ask Aura+' },
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
  { key: 'events', label: 'Events', icon: 'events' },
  { key: 'aura', label: 'Aura+', icon: 'star' },
  { key: 'updates', label: 'Updates', icon: 'bell' },
  { key: 'me', label: 'Me', icon: 'profile' },
];

/* ── Portal shell: 5 primary nav items (§9.1) ────────────────────────────── */
export default function CustomerPortal() {
  const { user, logout } = useExternalAuth();
  const firstName = user?.fullName?.split(' ')[0] || 'there';
  const [tab, setTab] = useState('home');
  const [activeEvent, setActiveEvent] = useState(null); // index into EVENTS, or null

  const openEvent = (i) => { setActiveEvent(i); setTab('events'); };
  const openAura = () => setTab('aura');

  function renderTab() {
    if (tab === 'home') {
      return <HomeView firstName={firstName} events={EVENTS} onOpenEvent={openEvent} onOpenAura={openAura} onOpenUpdates={() => setTab('updates')} />;
    }
    if (tab === 'events') {
      if (activeEvent != null) {
        return (
          <div className="max-w-5xl mx-auto">
            <button onClick={() => setActiveEvent(null)} className="text-xs font-bold text-muted hover:text-primary mb-3">← All events</button>
            <EventCenter event={EVENTS[activeEvent]} onAskAura={openAura} />
          </div>
        );
      }
      return <EventsView events={EVENTS} onOpenEvent={openEvent} onOpenAura={openAura} />;
    }
    if (tab === 'aura') return null; // full-height, handled below
    if (tab === 'updates') return <UpdatesView />;
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
        <div className="mt-auto flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-lavender transition">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-xs font-bold shrink-0">
            {firstName[0]?.toUpperCase()}
          </div>
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
        <header className="md:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">
          <LogoWord size="text-base" />
          <div className="ml-auto w-8 h-8 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-xs font-bold">
            {firstName[0]?.toUpperCase()}
          </div>
        </header>

        {tab === 'aura' ? (
          <main className="flex-1 min-h-0 flex flex-col">
            <AuraChat
              firstName={firstName}
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
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => { setTab(n.key); if (n.key !== 'events') setActiveEvent(null); }}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition ${tab === n.key ? 'text-primary' : 'text-muted'}`}
            >
              <Icon name={n.icon} size={18} />
              {n.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
