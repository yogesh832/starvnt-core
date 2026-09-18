import { useState } from 'react';
import { StatusChip } from '../../components/ui.jsx';
import { Card, ReqChip } from './EventCenter.jsx';

/* ══════════════ Reference-style Event Dashboard (screen set 2) ═══════════ */

const JOURNEY = [
  { label: 'Planning', icon: '✏️' },
  { label: 'Vendors', icon: '🏪' },
  { label: 'Booking', icon: '📋' },
  { label: 'Payment', icon: '💳' },
  { label: 'Execution', icon: '🎬' },
];

const OPTIONS = [
  {
    name: 'Premium Moments Photography', price: 48000, rating: '4.9', reviews: 210,
    tags: ['Available', '2 photographers', 'Full-day coverage'],
    note: 'Aura+ pick: strongest reviews + best validated total in your budget.', selected: false,
  },
  {
    name: 'Candid Stories', price: 43500, rating: '4.8', reviews: 186,
    tags: ['Available', '2 photographers', 'Full-day coverage'],
    note: 'Best for candid, documentary-style moments.', selected: true,
  },
  {
    name: 'ShutterTalk', price: 44000, rating: '4.6', reviews: 154,
    tags: ['2 photographers', 'Half-day'],
    note: 'Budget-friendly — shorter coverage window.', selected: false,
  },
];

const COMPARE = [
  ['Price', '₹48,000', '₹43,500', '₹44,000'],
  ['Travel', 'Included', 'Included', '₹2,000'],
  ['Photographers', '2', '2', '2'],
  ['Coverage', 'Full day', 'Full day', 'Half day'],
  ['Experience', '8 yrs', '6 yrs', '4 yrs'],
  ['Best for', 'Best value', 'Candid style', 'Budget option'],
];

const inr = (n) => `₹${n.toLocaleString('en-IN')}`;

/* ── Journey stepper with progress fill ───────────────────────────────────── */
function Stepper() {
  return (
    <div className="bg-white rounded-2xl shadow-sm px-4 sm:px-6 py-4 overflow-x-auto">
      <div className="flex items-center min-w-[560px]">
        {JOURNEY.map((s, i) => {
          const state = i === 0 ? 'done' : i === 1 ? 'current' : 'todo';
          return (
            <div key={s.label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className={`w-9 h-9 rounded-full grid place-items-center text-sm transition ${
                  state === 'done'
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200'
                    : state === 'current'
                      ? 'bg-primary text-white shadow-md shadow-primary/40 ring-4 ring-primary/15'
                      : 'bg-lavender text-muted'
                }`}>
                  {state === 'done' ? '✓' : s.icon}
                </div>
                <span className={`text-[10px] font-bold ${state === 'todo' ? 'text-muted' : state === 'current' ? 'text-primary' : 'text-ink'}`}>
                  {s.label}
                </span>
              </div>
              {i < JOURNEY.length - 1 && (
                <div className="flex-1 h-1 mx-2 -mt-4 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full rounded-full ${i === 0 ? 'bg-gradient-to-r from-emerald-400 to-primary w-full' : 'w-0'}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Requirement tiles ────────────────────────────────────────────────────── */
function ReqTiles({ selectedPrice }) {
  const tiles = [
    { icon: '🏛', bg: 'bg-emerald-50', name: 'Venue', status: 'Confirmed', dot: 'bg-emerald-500' },
    { icon: '📷', bg: 'bg-primary-soft', name: 'Photography', status: '3 options found', dot: 'bg-amber-400' },
    { icon: '🎀', bg: 'bg-violet-50', name: 'Decoration', status: 'In progress', dot: 'bg-violet-400' },
    { icon: '🍽', bg: 'bg-orange-50', name: 'Catering', status: 'Quotes ready', dot: 'bg-amber-400' },
    { icon: '💳', bg: 'bg-red-50', name: 'Payment', status: `${inr(selectedPrice)} due`, dot: 'bg-red-400' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {tiles.map((r) => (
        <button key={r.name} className="bg-white rounded-xl shadow-sm px-3 py-3 text-left hover:shadow-md hover:-translate-y-0.5 transition">
          <div className={`w-8 h-8 rounded-lg ${r.bg} grid place-items-center text-base mb-2`}>{r.icon}</div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold truncate">{r.name}</span>
            <span className={`ml-auto w-1.5 h-1.5 rounded-full shrink-0 ${r.dot}`} />
          </div>
          <div className="text-[10px] text-muted mt-0.5 truncate">{r.status}</div>
        </button>
      ))}
    </div>
  );
}

/* ── Readiness ring ───────────────────────────────────────────────────────── */
function ReadinessRing({ pct }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5a4bd1" />
            <stop offset="100%" stopColor="#9b6dff" />
          </linearGradient>
        </defs>
        <circle cx="40" cy="40" r={r} fill="none" stroke="#eceaf7" strokeWidth="8" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-lg font-extrabold text-navy leading-none">{pct}%</div>
          <div className="text-[8px] text-muted leading-tight">Planning<br />complete</div>
        </div>
      </div>
    </div>
  );
}

/* ── Ask STARVNT anything ─────────────────────────────────────────────────── */
function AskCard({ onOpenAura }) {
  const qs = ['Which photographer is best?', 'Can I reduce the budget?', 'What is still missing?', 'Show me cheaper options'];
  return (
    <div className="rounded-2xl p-[1.5px] bg-gradient-to-r from-primary/40 via-[#9b6dff]/40 to-primary/40 shadow-sm">
      <div className="bg-white rounded-[15px] p-4 sm:p-5 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-primary text-white grid place-items-center text-xs">✨</span>
            <div className="font-bold text-sm">Ask STARVNT anything</div>
          </div>
          <button
            onClick={onOpenAura}
            className="mt-3 w-full flex items-center justify-between rounded-xl bg-lavender px-4 py-3 text-xs text-muted hover:ring-2 hover:ring-primary/30 transition"
          >
            <span>Ask something…</span>
            <span className="text-primary">🎙</span>
          </button>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {qs.map((q) => (
              <button
                key={q}
                onClick={onOpenAura}
                className="text-[10px] font-semibold border border-gray-200 bg-white hover:border-primary/40 hover:bg-primary-soft hover:text-primary rounded-full px-2.5 py-1.5 transition"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
        <ReadinessRing pct={68} />
      </div>
    </div>
  );
}

/* ── Vendor options (Aura+ recommends, customer decides) ──────────────────── */
function VendorOptions({ selected, onSelect }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-primary">Vendor recommendations</div>
          <h2 className="font-bold text-sm sm:text-[15px]">Photography options</h2>
        </div>
        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1 shrink-0">✓ Aura+ recommended</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {OPTIONS.map((o, i) => {
          const isSel = selected === i;
          return (
            <div key={o.name} className={`rounded-xl border-2 overflow-hidden transition ${isSel ? 'border-primary shadow-lg shadow-primary/10' : 'border-gray-100 hover:border-gray-200'}`}>
              <div className="relative h-20 bg-gradient-to-br from-primary/30 via-[#9b6dff]/30 to-[#c4b5fd]/40 grid place-items-center text-2xl">
                📸
                {isSel && <span className="absolute top-2 right-2 text-[9px] font-bold bg-primary text-white rounded-full px-2 py-0.5">Selected</span>}
              </div>
              <div className="p-3">
                <div className="font-bold text-[13px] leading-tight">{o.name}</div>
                <div className="text-[10px] text-muted mt-0.5">⭐ <b className="text-amber-500">{o.rating}</b> · {o.reviews} reviews</div>
                <div className="flex items-baseline gap-1.5 mt-1.5">
                  <span className="font-extrabold text-base text-navy">{inr(o.price)}</span>
                  <span className="text-[9px] text-muted">validated total</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {o.tags.map((t) => (
                    <span key={t} className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 rounded-full px-1.5 py-0.5">✓ {t}</span>
                  ))}
                </div>
                <div className="mt-2 text-[9.5px] leading-snug text-primary/90 bg-primary-soft/60 rounded-lg px-2 py-1.5">💡 {o.note}</div>
                <div className="flex gap-1.5 mt-2.5">
                  <button className="flex-1 rounded-lg border border-gray-200 text-[11px] font-bold py-1.5 text-ink/70 hover:bg-lavender transition">
                    Details
                  </button>
                  <button
                    onClick={() => onSelect(i)}
                    className={`flex-1 rounded-lg text-[11px] font-bold py-1.5 transition ${
                      isSel ? 'bg-primary text-white shadow-sm shadow-primary/30' : 'border border-primary/40 text-primary hover:bg-primary hover:text-white'
                    }`}
                  >
                    {isSel ? 'Selected ✓' : 'Select'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted mt-3 leading-relaxed">
        Prices are validated totals (base + travel + logistics). Aura+ recommends — the decision is always yours, and nothing is booked until you approve.
      </p>
    </Card>
  );
}

/* ── Compare table ────────────────────────────────────────────────────────── */
function CompareTable({ selected, onSelect }) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-5 pt-4 flex items-center justify-between">
        <h2 className="font-bold text-sm">Compare options</h2>
        <span className="text-[10px] text-muted">3 photographers</span>
      </div>
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-[11px] min-w-[380px]">
          <thead>
            <tr className="text-[10px] text-muted border-b border-gray-100">
              <th className="px-5 py-2 text-left font-semibold" />
              {OPTIONS.map((o) => {
                const parts = o.name.split(' ');
                const shortName = parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
                return (
                  <th key={o.name} className="px-3 py-2 text-left font-bold text-ink">
                    {shortName}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {COMPARE.map((row) => (
              <tr key={row[0]} className="border-b border-gray-50 last:border-0 hover:bg-lavender/30">
                <td className="px-5 py-2 text-muted font-medium">{row[0]}</td>
                {row.slice(1).map((v, j) => (
                  <td key={j} className={`px-3 py-2 ${row[0] === 'Price' ? 'font-bold' : ''}`}>{v}</td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="px-5 py-3" />
              {OPTIONS.map((o, i) => (
                <td key={o.name} className="px-3 py-3">
                  <button
                    onClick={() => onSelect(i)}
                    className={`w-full rounded-lg text-[10px] font-bold py-1.5 transition ${
                      selected === i ? 'bg-primary text-white' : 'border border-gray-200 text-muted hover:border-primary/40 hover:text-primary'
                    }`}
                  >
                    {selected === i ? 'Selected ✓' : 'Choose'}
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="px-5 pb-4 text-[10px] text-muted leading-relaxed">
        💡 Premium Moments offers the best validated total with the strongest reviews.{' '}
        <span className="text-primary font-semibold">Why this one?</span>
      </div>
    </Card>
  );
}

/* ── Booking & payment ────────────────────────────────────────────────────── */
function BookingPayment({ opt }) {
  const [state, setState] = useState('idle'); // idle → verifying → done
  function pay() {
    setState('verifying');
    setTimeout(() => setState('done'), 1600);
  }
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="font-bold text-sm">Booking &amp; payment</div>
        <StatusChip status={state === 'done' ? 'Confirmed' : 'Pending'} />
      </div>
      <div className="text-[11px] text-muted mt-0.5">You're almost done — confirm your photography booking.</div>

      <div className="mt-3 border border-gray-100 rounded-xl p-3 flex gap-3">
        <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-primary/30 to-[#9b6dff]/30 grid place-items-center text-lg shrink-0">📸</div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between gap-2 text-sm">
            <span className="font-semibold">Photography</span>
            <span className="font-extrabold text-navy">{inr(opt.price)}</span>
          </div>
          <div className="text-[11px] text-muted truncate">{opt.name}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
        {[['📅', 'Date', '26 November'], ['📍', 'Venue', 'Kisar Palace'], ['👥', 'Guests', '500']].map(([i, k, v]) => (
          <div key={k} className="bg-lavender/60 rounded-lg px-2.5 py-2">
            <div className="text-muted">{i} {k}</div>
            <div className="font-bold mt-0.5">{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <div className="text-[10px] font-bold text-muted uppercase tracking-wide">Payment method</div>
        <div className="flex gap-2 mt-1.5">
          {['UPI', 'Card', 'Net banking'].map((m, i) => (
            <button key={m} className={`flex-1 text-[11px] font-semibold rounded-lg px-3 py-2 border transition ${i === 0 ? 'border-primary bg-primary-soft text-primary' : 'border-gray-200 text-muted hover:border-gray-300'}`}>{m}</button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <div>
          <div className="text-[10px] text-muted">Total to pay</div>
          <div className="font-extrabold text-lg text-navy">{inr(opt.price)}</div>
        </div>
        {state === 'done' ? (
          <span className="rounded-xl bg-emerald-50 text-emerald-600 text-xs font-bold px-4 py-3">✓ Verified &amp; booked</span>
        ) : (
          <button
            onClick={pay}
            disabled={state === 'verifying'}
            className="rounded-xl bg-primary hover:bg-primary-dark disabled:opacity-70 text-white text-xs font-bold px-5 py-3 transition"
          >
            {state === 'verifying' ? 'Verifying securely…' : `Confirm & Pay · ${inr(opt.price)}`}
          </button>
        )}
      </div>
      <p className="text-[9px] text-muted mt-2 leading-relaxed">
        🔒 100% secure — payment shows as confirmed only after provider-side verification. Booking status is tracked separately from payment.
      </p>
    </Card>
  );
}

/* ── Event execution ──────────────────────────────────────────────────────── */
function ExecutionCard() {
  return (
    <Card>
      <div className="font-bold text-sm">Event execution</div>
      <div className="mt-2 flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-2.5">
        <span className="text-sm">🎉</span>
        <div className="text-[11px] font-bold text-emerald-700">Your event is on track!</div>
      </div>
      <div className="space-y-2.5 mt-3">
        {[
          ['Premium Moments', 'Photography · full day', 'Arrives 9:30 AM'],
          ['Bloom Decor', 'Decoration setup', 'Starts 7:00 AM'],
        ].map(([n, d, t]) => (
          <div key={n} className="flex items-center gap-2.5 border border-gray-100 rounded-xl p-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/25 to-[#9b6dff]/25 grid place-items-center text-[10px] font-bold text-primary shrink-0">
              {n.split(' ').map((w) => w[0]).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate">{n}</div>
              <div className="text-[10px] text-muted truncate">{d} · {t}</div>
            </div>
            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5 shrink-0">✓ On track</span>
          </div>
        ))}
      </div>
      <div className="mt-3 bg-lavender/60 rounded-xl p-3 flex gap-2.5">
        <div className="w-7 h-7 rounded-full bg-primary text-white grid place-items-center text-[10px] shrink-0">✨</div>
        <div>
          <p className="text-[11px] leading-snug text-ink/80">"Your photography team is scheduled and will arrive by <b>9:30 AM</b>. I'll keep you posted on the day."</p>
          <div className="text-[9px] text-muted mt-1">Aura+ · verified from vendor status</div>
        </div>
      </div>
      <button className="mt-3 w-full rounded-xl border border-gray-200 text-xs font-bold py-2.5 text-ink/70 hover:bg-lavender transition">
        View live day plan →
      </button>
    </Card>
  );
}

/* ══════════════ Dashboard home ══════════════ */
export function HomeView({ firstName, events, onOpenEvent, onOpenAura }) {
  const [selected, setSelected] = useState(1); // Candid Stories pre-selected per reference
  const e = events[0];
  const opt = OPTIONS[selected];
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Event header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-extrabold text-navy">{e.name}</h1>
            <StatusChip status="Planning" />
          </div>
          <div className="text-[11px] text-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>📅 {e.date}</span><span>📍 {e.place}</span><span>👥 {e.guests} guests</span>
          </div>
        </div>
        <button onClick={onOpenAura} className="hidden sm:block rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5 hover:bg-primary-dark transition shadow-sm shadow-primary/30">
          + Plan another event
        </button>
      </div>

      <Stepper />
      <ReqTiles selectedPrice={opt.price} />
      <AskCard onOpenAura={onOpenAura} />

      <div className="grid xl:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <VendorOptions selected={selected} onSelect={setSelected} />
          <div className="grid md:grid-cols-2 gap-4 items-start">
            <BookingPayment opt={opt} />
            <ExecutionCard />
          </div>
        </div>
        <div className="space-y-4">
          <CompareTable selected={selected} onSelect={setSelected} />
          <Card title="Event Circle">
            <p className="text-[11px] text-muted leading-relaxed">
              Invite family to follow the plan — you choose what each person sees.
            </p>
            <div className="flex -space-x-2 mt-3">
              {['RS', 'SG', 'AK', '+8'].map((i) => (
                <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-lavender to-primary-soft border-2 border-white grid place-items-center text-[9px] font-bold text-navy">{i}</div>
              ))}
            </div>
            <button className="mt-3 w-full rounded-xl border border-dashed border-gray-300 text-xs font-semibold text-muted hover:text-primary hover:border-primary/40 py-2.5 transition">
              + Invite to circle
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ── Updates — meaningful changes only (§9.3, no spam) ───────────────────── */
export function UpdatesView() {
  const items = [
    { t: '2h', kind: 'Decision needed', text: 'Catering quote from SpiceRoute Caterers expires in 2 days — ₹1,12,000 validated total.', tone: 'amber' },
    { t: '5h', kind: 'Payment verified', text: '₹15,000 advance for photography verified server-side. Your booking is confirmed.', tone: 'emerald' },
    { t: 'Yesterday', kind: 'Schedule change', text: 'Decoration setup for the wedding moved to 7:00 AM on event day (team request, approved by coordinator).', tone: 'violet' },
    { t: 'Yesterday', kind: 'Vendor ready', text: 'Sweet Moments confirmed cake design and delivery window for the birthday.', tone: 'primary' },
    { t: '2d', kind: 'Clarification', text: 'Aura+ needs one answer: veg-only catering, or mixed? Your choice updates the shortlist.', tone: 'amber' },
  ];
  const tone = { amber: 'bg-amber-50 text-amber-600', emerald: 'bg-emerald-50 text-emerald-600', violet: 'bg-violet-50 text-violet-600', primary: 'bg-primary-soft text-primary' };
  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-extrabold text-navy">Updates</h1>
        <p className="text-xs text-muted mt-0.5">Only what needs your attention — no noise.</p>
      </div>
      {items.map((u, i) => (
        <div key={i} className="bg-white rounded-2xl shadow-sm p-4 flex gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[9px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${tone[u.tone]}`}>{u.kind}</span>
              <span className="text-[10px] text-muted shrink-0">{u.t}</span>
            </div>
            <p className="text-[13px] text-ink/80 mt-2 leading-snug">{u.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Me — identity, privacy, security, settings, support (§9.1) ──────────── */
export function MeView({ user, logout }) {
  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <Card className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-lg font-extrabold shrink-0">
          {user?.fullName?.[0]?.toUpperCase() || 'G'}
        </div>
        <div className="min-w-0">
          <div className="font-extrabold text-base truncate">{user?.fullName || 'Guest'}</div>
          <div className="text-xs text-muted truncate">{user?.email}</div>
          <div className="text-[10px] text-emerald-600 font-bold mt-1">✓ Verified customer</div>
        </div>
      </Card>

      <Card title="Privacy & data">
        <ul className="divide-y divide-gray-50 text-sm">
          {[
            ['Share my contact with booked vendors', 'Only after a booking is confirmed', true],
            ['Show my location to guests in Event Circle', 'You choose who sees what', false],
            ['Allow guest photos on the event screen', 'Every upload is checked before it goes live', true],
          ].map(([label, sub, on]) => (
            <li key={label} className="flex items-start justify-between gap-3 py-3">
              <div>
                <div className="text-[13px] font-medium">{label}</div>
                <div className="text-[10px] text-muted mt-0.5">{sub}</div>
              </div>
              <span className={`mt-0.5 w-10 h-5 rounded-full relative cursor-pointer transition shrink-0 ${on ? 'bg-primary' : 'bg-gray-200'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition ${on ? 'left-5' : 'left-0.5'}`} />
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Support">
        <div className="grid grid-cols-2 gap-2.5 text-center">
          {[['💬', 'Chat with us'], ['📞', 'Request a call'], ['🛡️', 'Report an issue'], ['❓', 'How STARVNT works']].map(([i, l]) => (
            <button key={l} className="rounded-xl border border-gray-100 py-3.5 text-xs font-semibold hover:bg-lavender transition">
              <div className="text-base mb-1">{i}</div>{l}
            </button>
          ))}
        </div>
      </Card>

      <button onClick={logout} className="w-full rounded-2xl bg-white text-red-500 text-sm font-bold py-3.5 shadow-sm hover:bg-red-50 transition">
        Sign out
      </button>
      <p className="text-center text-[10px] text-muted pb-2">STARVNT · Beautiful events create happier people.</p>
    </div>
  );
}

/* ── Events list ─────────────────────────────────────────────────────────── */
export function EventsView({ events, onOpenEvent, onOpenAura }) {
  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-navy">Events</h1>
          <p className="text-xs text-muted mt-0.5">Each event has its own command center.</p>
        </div>
        <button onClick={onOpenAura} className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5 hover:bg-primary-dark transition">+ New event</button>
      </div>
      {events.map((e, idx) => (
        <button key={e.name} onClick={() => onOpenEvent(idx)} className="w-full text-left bg-white rounded-2xl shadow-sm p-4 hover:shadow-md transition">
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold truncate">{e.name}</div>
            <ReqChip status={e.state === 'LIVE' ? 'Decision needed' : 'Finding options'} />
          </div>
          <div className="text-xs text-muted mt-1">{e.date} · {e.place} · {e.guests} guests</div>
          <div className="mt-3 h-1.5 rounded-full bg-lavender overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${e.readiness}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted mt-1.5">
            <span>{e.readiness}% ready</span>
            <span>{e.budget.spent} of {e.budget.total} committed</span>
          </div>
        </button>
      ))}
    </div>
  );
}
