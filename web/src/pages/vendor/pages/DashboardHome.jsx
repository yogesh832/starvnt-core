import { useState, useEffect, useCallback, useMemo } from 'react';
import Icon from '../../../components/Icon.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import { externalApi } from '../../../lib/api.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Live Interactive Mini Calendar
 * Strictly driven by the current real date and authentic vendor bookings.
 */
export function MiniCalendar({ bookings = [], blockouts = [] }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDate = isCurrentMonth ? today.getDate() : null;

  // Real booked days for the selected month/year
  const bookedDays = useMemo(() => {
    return bookings
      .map((b) => {
        const rawDate = b.eventDate || b.date;
        if (!rawDate) return null;
        const parts = String(rawDate).split('T')[0].split('-');
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const d = parseInt(parts[2], 10);
          if (y === year && m === month) return d;
        }
        const dt = new Date(rawDate);
        if (!isNaN(dt.getTime()) && dt.getFullYear() === year && dt.getMonth() === month) {
          return dt.getDate();
        }
        return null;
      })
      .filter(Boolean);
  }, [bookings, year, month]);

  // Real blocked days for the selected month/year
  const blockedMap = useMemo(() => {
    const map = {};
    blockouts.forEach((bl) => {
      const parts = String(bl.date || '').split('T')[0].split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (y === year && m === month) {
          map[d] = bl.reason || 'Blocked';
        }
      }
    });
    return map;
  }, [blockouts, year, month]);

  const monthTitle = `${MONTH_NAMES[month]} ${year}`;

  return (
    <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-primary-soft text-primary grid place-items-center">
            <Icon name="calendar" size={15} />
          </div>
          <h3 className="font-extrabold text-sm text-navy">{monthTitle}</h3>
        </div>
        <div className="text-muted text-xs flex items-center gap-1 font-bold">
          <button
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            className="w-7 h-7 rounded-lg hover:bg-lavender hover:text-navy grid place-items-center transition"
            title="Previous month"
            aria-label="Previous month"
          >
            <Icon name="chevronLeft" size={14} />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-2 py-1 text-[10px] rounded-lg hover:bg-lavender hover:text-navy transition font-bold"
            title="Jump to today"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            className="w-7 h-7 rounded-lg hover:bg-lavender hover:text-navy grid place-items-center transition"
            title="Next month"
            aria-label="Next month"
          >
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
        {DAYS.map((d) => (
          <div key={d} className="text-muted font-bold py-1 text-[10px] uppercase tracking-wider">{d}</div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
        {days.map((d) => {
          const isBooked = bookedDays.includes(d);
          const isBlocked = Boolean(blockedMap[d]);
          const isToday = d === todayDate;
          return (
            <div
              key={d}
              title={isBlocked ? `Blocked: ${blockedMap[d]}` : isBooked ? 'Booked Date' : ''}
              className={`py-1.5 rounded-full text-xs font-semibold relative transition ${
                isBlocked
                  ? 'bg-red-50 text-red-600 font-extrabold border-2 border-red-300'
                  : isBooked
                  ? 'bg-primary text-white font-extrabold shadow-xs'
                  : isToday
                  ? 'bg-primary-soft text-primary font-extrabold ring-1 ring-primary/30'
                  : 'text-ink/80 hover:bg-lavender/60'
              }`}
            >
              {d}
              {isBlocked && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-red-600 rounded-full" />
              )}
              {isBooked && !isBlocked && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[10px] text-muted font-medium flex-wrap gap-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span>Booked Date</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-600" />
          <span className="font-bold text-red-700">Blocked (Red)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary-soft ring-1 ring-primary/40" />
          <span>Current Day</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Authentic Funnel Performance Widget
 * Accurately derives conversion rates from real opportunities, proposals, and bookings.
 */
export function Performance({ enquiries = [], quotes = [], bookings = [] }) {
  const leadCount = enquiries.length;
  const quoteCount = quotes.length;
  const bookingCount = bookings.length;

  const quoteRate = leadCount > 0 ? Math.min(100, Math.round((quoteCount / leadCount) * 100)) : 0;
  const bookingRate = quoteCount > 0 ? Math.min(100, Math.round((bookingCount / quoteCount) * 100)) : 0;
  const overallConversion = leadCount > 0 ? Math.min(100, Math.round((bookingCount / leadCount) * 100)) : 0;

  return (
    <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center">
            <Icon name="trend" size={15} />
          </div>
          <h3 className="font-extrabold text-sm text-navy">Conversion Pipeline</h3>
        </div>
        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
          Live Data
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center pb-3 border-b border-gray-100">
        <div className="p-2 rounded-2xl bg-lavender/50 min-w-0">
          <div className="text-[10px] text-muted font-semibold truncate">Inbound Leads</div>
          <div className="font-extrabold text-base text-navy mt-0.5">{leadCount}</div>
          <div className="text-[9px] text-muted font-medium mt-0.5 truncate">Matched</div>
        </div>
        <div className="p-2 rounded-2xl bg-lavender/50 min-w-0">
          <div className="text-[10px] text-muted font-semibold truncate">Lead → Quote</div>
          <div className="font-extrabold text-base text-navy mt-0.5">{quoteRate}%</div>
          <div className="text-[9px] text-emerald-600 font-bold mt-0.5 truncate">{quoteCount} sent</div>
        </div>
        <div className="p-2 rounded-2xl bg-lavender/50 min-w-0">
          <div className="text-[10px] text-muted font-semibold truncate">Quote → Booked</div>
          <div className="font-extrabold text-base text-navy mt-0.5">{bookingRate}%</div>
          <div className="text-[9px] text-emerald-600 font-bold mt-0.5 truncate">{bookingCount} locked</div>
        </div>
      </div>

      {leadCount === 0 ? (
        <div className="pt-4 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-lavender text-muted mb-2">
            <Icon name="trend" size={18} />
          </div>
          <p className="text-xs font-bold text-navy">Pipeline Awaiting Activity</p>
          <p className="text-[11px] text-muted mt-1 leading-relaxed">
            Real conversion percentages will compute as incoming customer requests progress to proposals and confirmed escrow bookings.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="font-semibold text-muted">Proposal Response Rate</span>
              <span className="font-extrabold text-navy">{quoteRate}%</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${quoteRate}%` }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="font-semibold text-muted">Escrow Booking Close Rate</span>
              <span className="font-extrabold text-navy">{bookingRate}%</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${bookingRate}%` }}
              />
            </div>
          </div>
          <div className="pt-1 flex items-center justify-between text-[10px] text-muted">
            <span>Overall Win Rate: <strong className="text-navy">{overallConversion}%</strong></span>
            <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
              <Icon name="shieldCheck" size={12} />
              <span>Escrow Protected</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Enquiry Detail Dialog matching Spec §9
 */
function EnquiryModal({ enquiry, onClose, onPrepareQuote }) {
  if (!enquiry) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-[pop_.18s_ease-out]">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-navy">{enquiry.title}</h2>
              <StatusChip status={enquiry.status} />
            </div>
            <p className="text-xs text-muted">{enquiry.id} · {enquiry.ago}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center transition"
            aria-label="Close dialog"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="p-3.5 bg-lavender/60 rounded-2xl space-y-2">
            <div className="flex justify-between">
              <span className="text-muted">Event Date</span>
              <span className="font-bold text-navy">{enquiry.date || 'TBD'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Service Location</span>
              <span className="font-bold text-navy">{enquiry.location || 'Client location'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Guest Count</span>
              <span className="font-bold text-navy">{enquiry.guestCount ? `${enquiry.guestCount} guests` : 'Flexible'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Target Budget</span>
              <span className="font-bold text-emerald-600">{enquiry.budget || 'Custom Quote'}</span>
            </div>
          </div>

          <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1.5 border border-gray-100">
            <div className="font-bold text-navy flex items-center gap-1.5">
              <Icon name="availability" size={14} />
              <span>Logistics & Operational Verification</span>
            </div>
            <div className="text-muted">Route: {enquiry.estTravel}</div>
            <div className="flex justify-between pt-1">
              <span className="text-muted">Estimated Allowance</span>
              <span className="font-semibold text-primary">{enquiry.travelCost}</span>
            </div>
          </div>
        </div>

        <div className="pt-2 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:text-navy transition"
          >
            Dismiss
          </button>
          <button
            onClick={() => {
              onClose();
              onPrepareQuote(enquiry);
            }}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark shadow-md shadow-primary/25 transition"
          >
            Prepare Official Quote →
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Quote Builder Dialog matching Spec §9
 */
function QuoteModal({ enquiry, vendorCity, onClose, onSubmitQuote }) {
  const initialBase = enquiry?.budgetNumber || enquiry?.basePrice || 0;
  const [basePrice, setBasePrice] = useState(initialBase);
  const [travelFee, setTravelFee] = useState(0);
  const total = (Number(basePrice) || 0) + (Number(travelFee) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-[pop_.18s_ease-out]">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-extrabold text-navy">Prepare Official Quote</h2>
            <p className="text-xs text-muted">{enquiry?.title || 'Service Proposal'} · {enquiry?.date || 'Upcoming'}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center transition"
            aria-label="Close quote modal"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-muted font-semibold mb-1">Base Service Price (₹)</label>
            <input
              type="number"
              value={basePrice || ''}
              placeholder="Enter base service pricing"
              onChange={(e) => setBasePrice(e.target.value)}
              className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold text-navy outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-muted font-semibold mb-1">Travel & Transit Allowance (₹)</label>
            <input
              type="number"
              value={travelFee || ''}
              placeholder="0 (Included or custom allowance)"
              onChange={(e) => setTravelFee(e.target.value)}
              className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold text-navy outline-none focus:border-primary"
            />
            <span className="text-[10px] text-muted mt-1 block">
              {vendorCity || 'Base Studio'} to {enquiry?.location || 'Client Venue'} transit
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-primary-soft/60 border border-primary/20 flex justify-between items-baseline">
            <span className="font-extrabold text-navy">Total Proposed Amount</span>
            <span className="font-extrabold text-lg text-primary">₹{total.toLocaleString()}</span>
          </div>
        </div>

        <div className="pt-2 flex gap-3">
          <button
            onClick={() => {
              onSubmitQuote({ base: Number(basePrice), travel: Number(travelFee), total, status: 'DRAFT' });
              onClose();
            }}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:text-navy transition"
          >
            Save Draft
          </button>
          <button
            onClick={() => {
              onSubmitQuote({ base: Number(basePrice), travel: Number(travelFee), total, status: 'SUBMITTED' });
              onClose();
            }}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark shadow-md shadow-primary/25 transition"
          >
            Submit Quote
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduledEventsCard({ bookings = [] }) {
  return (
    <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-extrabold text-sm text-navy">{bookings.length} Scheduled Events</h3>
        <a href="/vendor/bookings" className="text-[11px] font-bold text-primary hover:underline">View all</a>
      </div>
      <ul className="space-y-2.5 text-xs">
        {bookings.slice(0, 3).map((b, idx) => (
          <li key={b.id || idx} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
            <span className="flex items-center gap-2 font-medium truncate pr-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${idx === 0 ? 'bg-primary' : idx === 1 ? 'bg-emerald-500' : 'bg-orange-400'}`} />
              <span className="truncate text-navy">{b.title || b.serviceName}</span>
            </span>
            <span className="text-muted font-semibold text-[11px] whitespace-nowrap">
              {b.eventDate || b.date || 'Scheduled'}
            </span>
          </li>
        ))}
        {bookings.length === 0 && (
          <li className="text-muted text-center py-3 text-[11px]">
            No upcoming event dates scheduled
          </li>
        )}
      </ul>
    </div>
  );
}

function NotificationsCard({
  notifications = [],
  unreadNotifCount = 0,
  onMarkRead,
  onMarkAllRead,
}) {
  return (
    <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-extrabold text-sm text-navy">Notifications</h3>
          {unreadNotifCount > 0 && (
            <span className="text-[10px] bg-rose-500 text-white font-extrabold px-1.5 py-0.2 rounded-full">
              {unreadNotifCount}
            </span>
          )}
        </div>
        {unreadNotifCount > 0 && (
          <button
            onClick={onMarkAllRead}
            className="text-[11px] font-bold text-primary hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>

      <ul className="space-y-2.5 text-xs">
        {notifications.slice(0, 4).map((n) => (
          <li
            key={n._id}
            onClick={() => onMarkRead && onMarkRead(n._id)}
            className={`flex gap-3 items-start p-2.5 rounded-2xl cursor-pointer transition ${
              !n.isRead ? 'bg-primary-soft/50 border border-primary/20' : 'hover:bg-lavender/40 border border-transparent'
            }`}
          >
            <div className={`w-7 h-7 rounded-xl grid place-items-center shrink-0 mt-0.5 ${
              n.type === 'PAYMENT' ? 'bg-emerald-50 text-emerald-600' :
              n.type === 'QUOTE' ? 'bg-purple-50 text-purple-600' :
              n.type === 'BOOKING' ? 'bg-sky-50 text-sky-600' : 'bg-primary-soft text-primary'
            }`}>
              <Icon
                name={
                  n.type === 'PAYMENT'
                    ? 'wallet'
                    : n.type === 'QUOTE'
                    ? 'quotes'
                    : n.type === 'BOOKING'
                    ? 'calendar'
                    : 'bell'
                }
                size={13}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <b className="text-navy truncate text-xs">{n.title}</b>
                {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />}
              </div>
              <div className="text-[11px] truncate text-ink/70 mt-0.5">{n.message}</div>
            </div>
          </li>
        ))}
        {notifications.length === 0 && (
          <li className="text-muted text-center py-4 text-[11px]">
            You're all caught up! No unread notifications.
          </li>
        )}
      </ul>
    </div>
  );
}

export default function DashboardHome({ business = 'Your Brand' }) {
  const [selectedEnquiry, setSelectedEnquiry] = useState(null);
  const [quoteEnquiry, setQuoteEnquiry] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [blockouts, setBlockouts] = useState([]);
  const [services, setServices] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reviewStats, setReviewStats] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [activation, setActivation] = useState(null);
  const [vendorProfile, setVendorProfile] = useState(null);
  const [gotItAcknowledged, setGotItAcknowledged] = useState(false);
  const [completingProfile, setCompletingProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadLiveDashboard = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch all authentic live data in parallel
      const [
        actRes,
        profRes,
        oppsRes,
        quotesRes,
        bkRes,
        blRes,
        svcRes,
        revRes,
        notifRes
      ] = await Promise.all([
        externalApi.call('/vendor/activation-status').catch(() => ({ ok: false })),
        externalApi.call('/vendor/profile').catch(() => ({ ok: false })),
        externalApi.call('/vendor/opportunities').catch(() => ({ ok: false })),
        externalApi.call('/quotes').catch(() => ({ ok: false })),
        externalApi.call('/vendor/bookings').catch(() => ({ ok: false })),
        externalApi.call('/vendor/availability/blockouts').catch(() => ({ ok: false })),
        externalApi.call('/vendor/services').catch(() => ({ ok: false })),
        externalApi.call('/vendor/reviews').catch(() => ({ ok: false })),
        externalApi.call('/vendor/notifications').catch(() => ({ ok: false })),
      ]);

      // 0. Activation & Profile
      if (actRes?.ok && actRes.status) {
        setActivation(actRes.status);
      }
      if (profRes?.ok && profRes.vendor) {
        setVendorProfile(profRes.vendor);
      }
      if (blRes?.ok && Array.isArray(blRes.blockouts)) {
        setBlockouts(blRes.blockouts);
      }

      // 1. Opportunities / Enquiries (strictly authentic DB records)
      if (oppsRes?.ok && Array.isArray(oppsRes.opportunities)) {
        const liveEnqs = oppsRes.opportunities.map((o) => {
          const locStr = [
            o.serviceLocation?.address,
            o.serviceLocation?.locality,
            o.serviceLocation?.city
          ].filter(Boolean).join(', ') || 'Location on request';

          const budgetFormatted = o.budget
            ? `₹${Number(o.budget).toLocaleString()}`
            : o.estimatedBudget
            ? `₹${Number(o.estimatedBudget).toLocaleString()}`
            : 'Custom Quote';

          const budgetNumber = Number(o.budget || o.estimatedBudget || 0);

          return {
            id: o._id,
            opportunityId: o._id,
            customerId: o.customer?._id || o.customer,
            serviceId: o.vendorService,
            title: o.serviceName || 'Client Opportunity',
            meta: `${o.eventDate || 'Date flexible'} · ${locStr}`,
            chips: [
              o.guestCount ? `${o.guestCount} guests` : null,
              o.requiredCapability || null,
              o.eventType || null,
            ].filter(Boolean),
            status: o.status === 'NEW' ? 'New' : o.status || 'Active',
            ago: 'Matched opportunity',
            guestCount: o.guestCount,
            location: locStr,
            date: o.eventDate,
            estTravel: o.estimatedTravel || `${profRes?.vendor?.city || 'Studio'} → ${o.serviceLocation?.city || 'Venue'}`,
            travelCost: o.travelCost ? `₹${Number(o.travelCost).toLocaleString()} allowance` : 'Standard Transit',
            budget: budgetFormatted,
            budgetNumber,
          };
        });
        setEnquiries(liveEnqs);
      } else {
        setEnquiries([]);
      }

      // 2. Quotes (strictly authentic DB records)
      if (quotesRes?.ok && Array.isArray(quotesRes.quotes)) {
        const liveQuotes = quotesRes.quotes.map((q) => ({
          _id: q._id,
          id: q.quoteReference || q._id,
          quoteReference: q.quoteReference,
          client: q.customer?.fullName || q.customer?.email || 'Customer',
          type: q.serviceName || 'Service',
          date: q.eventDate || 'Date pending',
          base: q.pricingBreakdown?.basePrice || 0,
          travel: q.pricingBreakdown?.travelFee || 0,
          amount: `₹${(q.pricingBreakdown?.totalAmount || 0).toLocaleString()}`,
          status: q.status === 'SUBMITTED' ? 'Submitted' : q.status === 'DRAFT' ? 'Draft' : q.status === 'APPROVED' ? 'Approved' : q.status,
          action: q.status === 'DRAFT' ? 'Submit Quote' : q.status === 'SUBMITTED' ? 'Awaiting Customer' : 'View Quote',
        }));
        setQuotes(liveQuotes);
      } else {
        setQuotes([]);
      }

      // 3. Bookings (strictly authentic DB records)
      if (bkRes?.ok && Array.isArray(bkRes.bookings)) {
        const liveBks = bkRes.bookings.map((b) => ({
          id: b.bookingReference || b._id,
          bookingReference: b.bookingReference,
          title: `${b.serviceName || 'Event'} (${b.customerName || 'Client'})`,
          serviceName: b.serviceName,
          customerName: b.customerName,
          meta: `${b.eventDate || 'Upcoming'} · ${b.serviceLocation?.locality || b.serviceLocation?.city || 'Venue'} · ₹${(b.totalAmount || 0).toLocaleString()}`,
          eventDate: b.eventDate,
          date: b.eventDate,
          totalAmount: b.totalAmount || 0,
          status: b.bookingStatus === 'CONFIRMED'
            ? (b.executionStatus === 'SERVICE_STARTED' ? 'In Progress' : 'Confirmed')
            : b.bookingStatus || 'Confirmed',
          paymentStatus: b.paymentStatus,
        }));
        setBookings(liveBks);
      } else {
        setBookings([]);
      }

      // 4. Services (strictly authentic DB records)
      if (svcRes?.ok && Array.isArray(svcRes.services)) {
        setServices(svcRes.services);
      } else {
        setServices([]);
      }

      // 5. Authentic Reviews & Ratings from DB
      if (revRes?.ok && Array.isArray(revRes.reviews)) {
        setReviews(revRes.reviews);
        setReviewStats(revRes.stats || null);
      } else {
        setReviews([]);
        setReviewStats(null);
      }

      // 6. Notifications
      if (notifRes?.ok && Array.isArray(notifRes.notifications)) {
        setNotifications(notifRes.notifications);
        setUnreadNotifCount(notifRes.unreadCount || 0);
      } else {
        setNotifications([]);
        setUnreadNotifCount(0);
      }
    } catch (err) {
      console.warn('[DashboardHome] Load error:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLiveDashboard();
  }, [loadLiveDashboard]);

  async function handleSendQuote(q, enquiry) {
    try {
      if (enquiry?.opportunityId) {
        await externalApi.call('/quotes', {
          method: 'POST',
          body: {
            opportunityId: enquiry.opportunityId,
            customerId: enquiry.customerId,
            vendorServiceId: enquiry.serviceId,
            serviceName: enquiry.title,
            eventDate: enquiry.date,
            serviceLocation: { address: enquiry.location },
            pricingBreakdown: {
              basePrice: Number(q.base),
              travelFee: Number(q.travel),
              totalAmount: Number(q.total),
            },
            status: q.status || 'SUBMITTED',
            notes: 'Official quote proposal submitted via Vendor Command Center',
          },
        });
      }
      await loadLiveDashboard();
    } catch (err) {
      console.error('[DashboardHome] Quote submit error:', err);
    }
  }

  async function handleQuoteAction(q) {
    if (q.status === 'Draft' || q.status === 'DRAFT') {
      try {
        await externalApi.call(`/quotes/${q._id}/transition`, {
          method: 'POST',
          body: {
            targetStatus: 'SUBMITTED',
            reason: 'Submitted via Vendor Command Center table action',
          },
        });
        await loadLiveDashboard();
      } catch (err) {
        console.error('[DashboardHome] Transition quote error:', err);
      }
    }
  }

  async function handleMarkNotificationRead(id) {
    try {
      await externalApi.call(`/vendor/notifications/${id}/read`, { method: 'PUT' });
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      setUnreadNotifCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  }

  async function handleMarkAllNotificationsRead() {
    try {
      await externalApi.call('/vendor/notifications/read-all', { method: 'PUT' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadNotifCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  }

  async function handleQuickCompleteProfile() {
    setCompletingProfile(true);
    try {
      const category = vendorProfile?.category || 'Cinematic Production';
      const brand = vendorProfile?.businessName || business || 'Premium Moments';
      const city = vendorProfile?.city || vendorProfile?.location || 'Mumbai';

      const isCatering = category === 'Catering';
      const isDecor = category === 'Decor & Styling';
      const isDJ = category === 'DJ & Music';
      const isVenue = category === 'Venue';
      const isMakeup = category === 'Makeup & Styling';

      const serviceName = isCatering
        ? `${brand} Grand Wedding Buffet & Live Counters`
        : isDecor
        ? `${brand} Luxury Floral Mandap & Decor`
        : isDJ
        ? `${brand} Live Bollywood Sangeet DJ Setup`
        : isVenue
        ? `${brand} Royal Wedding Lawn & Ballroom`
        : isMakeup
        ? `${brand} Bridal HD Airbrush Makeover`
        : `${brand} Cinematic Wedding Film & Teaser`;

      const deliverables = isCatering
        ? ['Multi-cuisine Buffet Spread', 'Artisanal Live Chaat Counter', 'Dedicated Uniformed Crew']
        : isDecor
        ? ['Mandap Floral Concept', 'Stage Crystal Backdrop', 'Aisle Runner & Lighting']
        : isDJ
        ? ['Concert Laser Show', 'Live Bollywood & EDM Mixing', 'Digital Dhol Percussion']
        : isVenue
        ? ['Banquet Seating (1000 Pax)', 'Air Conditioned Bridal Suites', 'Valet Parking Facility']
        : isMakeup
        ? ['HD Waterproof Airbrush', 'Bridal Hair Draping', 'Jewelry Styling']
        : ['4K Teaser (3 mins)', 'Full Event Cut', 'Drone Highlights'];

      const styles = isCatering
        ? ['Royal Buffet', 'Live Counters', 'Multi-Cuisine']
        : isDecor
        ? ['Floral Mandap', 'Pastel Elegance', 'Fairy Lights']
        : isDJ
        ? ['Bollywood', 'Punjabi', 'EDM Fusion']
        : isVenue
        ? ['Lawn & Tents', 'Ballroom', 'Outdoor Pavilion']
        : isMakeup
        ? ['Bridal HD', 'Airbrush Glow', 'Traditional']
        : ['Cinematic', 'Drone 4K', 'Candid', 'Teaser Reel'];

      const coverPhoto = isCatering
        ? 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80'
        : isDecor
        ? 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=80'
        : isDJ
        ? 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80'
        : isVenue
        ? 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80'
        : isMakeup
        ? 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=800&q=80'
        : 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80';

      // 0. Ensure Brand & City profile is completed
      await externalApi.call('/vendor/profile', {
        method: 'PUT',
        body: {
          businessName: brand,
          category,
          location: city,
          city,
        },
      });

      // 1. Service
      let serviceId;
      const svcRes = await externalApi.call('/vendor/services');
      if (!svcRes.services?.length) {
        const createSvcRes = await externalApi.call('/vendor/services', {
          method: 'POST',
          body: {
            name: serviceName,
            category,
            pricing: {
              basePrice: isCatering ? 120000 : isDecor ? 150000 : 75000,
              pricingType: 'FIXED',
              unit: 'event',
            },
            leadTimeDays: 7,
            deliverables,
            status: 'ACTIVE',
          },
        });
        serviceId = createSvcRes.service?._id;
      } else {
        serviceId = svcRes.services[0]._id;
      }

      // 2. Capability & Gear
      if (serviceId) {
        await externalApi.call('/vendor/capabilities', {
          method: 'POST',
          body: {
            vendorServiceId: serviceId,
            styles,
            format: 'Full day',
            teamSize: isCatering ? 15 : 4,
            equipment: ['Professional Commercial Gear', 'Dual-unit Backup Protocol'],
          },
        });

        // 3. Operating Location
        const locRes = await externalApi.call('/vendor/locations');
        if (!locRes.locations?.length) {
          await externalApi.call('/vendor/locations', {
            method: 'POST',
            body: {
              label: 'Main Studio & Operational Base',
              type: 'STUDIO',
              address: 'Creative Operating Hub',
              locality: 'Central Hub',
              city,
              state: 'State Hub',
              isPrimary: true,
            },
          });
        }

        // 4. Service Coverage
        await externalApi.call('/vendor/coverage', {
          method: 'POST',
          body: {
            vendorServiceId: serviceId,
            coverageType: 'RADIUS',
            radiusKm: 50,
            city,
            outstationAllowed: true,
          },
        });
      }

      // 5. Portfolio Project
      await externalApi.call('/vendor/portfolio/project', {
        method: 'POST',
        body: {
          projectName: `${brand} Showcase`,
          eventType: 'Wedding',
          eventDate: new Date().toISOString().split('T')[0],
          venue: 'Grand Taj Ballroom',
          city,
          style: styles[0],
          description: `Signature ${category} project delivered by ${brand} in ${city}.`,
          coverUrl: coverPhoto,
          tags: ['Wedding', category, city],
          status: 'PUBLISHED',
        },
      });

      await loadLiveDashboard();
    } catch (err) {
      console.error('Quick complete profile error:', err);
    } finally {
      setCompletingProfile(false);
    }
  }

  // Live profile completion calculations
  const completionPercentage = activation?.completionPercentage !== undefined
    ? activation.completionPercentage
    : 0;
  const is100Percent = completionPercentage === 100 || Boolean(activation?.is100Percent);

  const checklist = activation?.checklist || {
    profile: false,
    services: false,
    capabilities: false,
    coverage: false,
    portfolio: false,
  };

  const completedStepsCount = [
    checklist.profile,
    checklist.services,
    checklist.capabilities,
    checklist.coverage,
    checklist.portfolio,
  ].filter(Boolean).length;

  // Real KPI calculations
  const totalRevenue = bookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
  const activeBookingsCount = bookings.filter((b) => b.status !== 'CANCELLED').length;
  const activeEnquiriesCount = enquiries.filter((e) => e.status === 'New' || e.status === 'NEW').length;
  const avgRatingDisplay = reviewStats?.averageRating && reviewStats.averageRating !== '0.0'
    ? `${reviewStats.averageRating}`
    : '5.0';

  const dynamicStats = [
    {
      label: 'Total Revenue',
      value: `₹${totalRevenue.toLocaleString()}`,
      foot: totalRevenue > 0 ? 'Verified via Core Bookings' : '₹0 settled payouts yet',
      footClass: totalRevenue > 0 ? 'text-emerald-600' : 'text-muted',
      icon: 'wallet',
      iconBg: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Active Bookings',
      value: activeBookingsCount,
      foot: bookings[0] ? `Next: ${bookings[0].eventDate || bookings[0].date}` : 'No upcoming bookings',
      footClass: bookings.length > 0 ? 'text-sky-600' : 'text-muted',
      icon: 'bookings',
      iconBg: 'bg-sky-50 text-sky-600',
    },
    {
      label: 'Inbound Enquiries',
      value: enquiries.length,
      foot: activeEnquiriesCount > 0 ? `${activeEnquiriesCount} new leads require reply` : 'Qualified matching leads',
      footClass: activeEnquiriesCount > 0 ? 'text-primary' : 'text-muted',
      icon: 'message',
      iconBg: 'bg-primary-soft text-primary',
    },
    {
      label: 'Client Rating',
      value: avgRatingDisplay,
      foot: `${reviewStats?.totalReviews || 0} verified client reviews`,
      footClass: (reviewStats?.totalReviews || 0) > 0 ? 'text-amber-500' : 'text-muted',
      icon: 'star',
      iconBg: 'bg-amber-50 text-amber-500',
    },
  ];

  const quickActions = [
    { label: 'Add Service', icon: 'services', to: '/vendor/services', bg: 'bg-purple-50 text-purple-600' },
    { label: 'Update Calendar', icon: 'availability', to: '/vendor/availability', bg: 'bg-sky-50 text-sky-600' },
    { label: 'Upload Portfolio', icon: 'plus', to: '/vendor/portfolio', bg: 'bg-emerald-50 text-emerald-600' },
    {
      label: 'Messages',
      icon: 'message',
      to: '/vendor/messages',
      badge: unreadNotifCount > 0 ? String(unreadNotifCount) : null,
      bg: 'bg-rose-50 text-rose-500',
    },
  ];

  // Current formatted date
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="p-3 sm:p-5 lg:p-6 w-full max-w-[1600px] mx-auto min-w-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
      {/* Main Operations Stream */}
      <div className="space-y-6 min-w-0 w-full">

        {/* Executive Welcome Banner */}
        <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-xs border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white font-extrabold text-base sm:text-lg grid place-items-center shadow-md shadow-primary/20 shrink-0">
              {(business || 'B')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-xl md:text-2xl font-extrabold text-navy tracking-tight truncate max-w-full sm:max-w-md">
                  Welcome, {business}!
                </h1>
                {is100Percent ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Live & Matchable
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-extrabold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Setup Incomplete ({completionPercentage}%)
                  </span>
                )}
              </div>
              <p className="text-xs text-muted mt-1 flex items-center gap-2 flex-wrap">
                <span>Vendor Command Center</span>
                <span>·</span>
                <span>{todayFormatted}</span>
                {vendorProfile?.city && (
                  <>
                    <span>·</span>
                    <span className="text-navy font-semibold">{vendorProfile.city}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            <a
              href="/vendor/profile"
              className="px-3 py-2 rounded-xl bg-lavender hover:bg-gray-200/70 text-navy text-xs font-bold transition flex items-center gap-1.5 shrink-0"
            >
              <Icon name="profile" size={14} />
              <span>Storefront</span>
            </a>
            <a
              href="/vendor/availability"
              className="px-3 py-2 rounded-xl bg-lavender hover:bg-gray-200/70 text-navy text-xs font-bold transition flex items-center gap-1.5 shrink-0"
            >
              <Icon name="calendar" size={14} />
              <span>Calendar</span>
            </a>
          </div>
        </div>

        {/* 5-STEP MANDATORY ONBOARDING READINESS (Spec §3, §4) */}
        {(!is100Percent || !gotItAcknowledged) && (
          <div className={`rounded-3xl p-5 sm:p-6 border transition shadow-sm ${
            is100Percent
              ? 'bg-emerald-50/80 border-emerald-200'
              : 'bg-gradient-to-br from-purple-50/70 via-white to-amber-50/40 border-primary/25'
          }`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full ${
                    is100Percent
                      ? 'bg-emerald-100 text-emerald-800'
                      : completionPercentage === 0
                      ? 'bg-rose-100 text-rose-800 font-extrabold'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {is100Percent
                      ? 'Verified 100% Active'
                      : completionPercentage === 0
                      ? 'Action Required: Initial Setup (0% Completed)'
                      : `Onboarding in Progress (${completionPercentage}% Completed)`}
                  </span>
                  <span className="text-xs font-bold text-navy">
                    {is100Percent ? 'Ready for Bookings' : `${completedStepsCount} of 5 Steps Configured`}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-extrabold text-navy tracking-tight">
                  {is100Percent
                    ? 'Profile 100% Complete — Your Brand is Active and Matchable'
                    : completionPercentage === 0
                    ? 'Welcome! Complete your 5 onboarding steps to activate client matching'
                    : 'Complete Your Operating Profile to Unlock Client Enquiries'}
                </h2>
                <p className="text-xs text-muted max-w-2xl leading-relaxed">
                  {is100Percent
                    ? 'All operational criteria (Service, Capability, Coverage, Portfolio & Base City) are verified. Your brand is actively routed to matching client requests.'
                    : 'STARVNT requires 100% profile completion before matching clients with your brand. Complete each of the 5 sections below: configure your brand & city, add services & pricing, gear capability, service coverage, and portfolio projects.'}
                </p>
              </div>

              <div className="flex items-center gap-2 self-start lg:self-center shrink-0 flex-wrap">
                {!is100Percent && (
                  <a
                    href={
                      !checklist.profile
                        ? '/vendor/profile'
                        : !checklist.services
                        ? '/vendor/services'
                        : !checklist.capabilities
                        ? '/vendor/services'
                        : !checklist.coverage
                        ? '/vendor/availability'
                        : '/vendor/portfolio'
                    }
                    className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold px-3.5 sm:px-4 py-2.5 shadow-md shadow-primary/25 transition inline-flex items-center gap-1.5"
                  >
                    <Icon name="edit" size={13} />
                    <span>Complete Details</span>
                  </a>
                )}
                {!is100Percent && (
                  <button
                    onClick={handleQuickCompleteProfile}
                    disabled={completingProfile}
                    className="rounded-xl bg-white hover:bg-lavender text-navy text-xs font-bold px-3.5 sm:px-4 py-2.5 border border-gray-200 shadow-xs transition disabled:opacity-60 inline-flex items-center gap-1.5"
                  >
                    <Icon name="bolt" size={13} />
                    <span>{completingProfile ? 'Verifying...' : 'Quick Auto-Fill'}</span>
                  </button>
                )}
                <button
                  onClick={() => setGotItAcknowledged(true)}
                  className={`rounded-xl text-xs font-bold px-3.5 sm:px-4 py-2.5 transition border ${
                    is100Percent
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-sm'
                      : 'bg-white hover:bg-lavender text-navy border-gray-200'
                  }`}
                >
                  {is100Percent ? 'Dismiss' : 'Got it'}
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-muted">
                  Overall Completion Progress ({completedStepsCount} of 5 steps completed)
                </span>
                <span className={is100Percent ? 'text-emerald-600 font-extrabold' : completionPercentage === 0 ? 'text-muted font-bold' : 'text-primary font-extrabold'}>
                  {completionPercentage}% / 100%
                </span>
              </div>
              <div className="w-full bg-gray-200/80 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    is100Percent
                      ? 'bg-emerald-500'
                      : completionPercentage >= 60
                      ? 'bg-primary'
                      : completionPercentage > 0
                      ? 'bg-amber-500'
                      : 'bg-transparent'
                  }`}
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>

              {/* 5 Distinct Responsive Milestone Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3.5 pt-3">

                {/* Step 1: Brand & City */}
                <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between min-w-0 ${
                  checklist.profile
                    ? 'border-emerald-200 bg-emerald-50/50 text-emerald-900'
                    : 'border-amber-200 bg-white ring-2 ring-amber-200/50 text-navy shadow-xs'
                }`}>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Step 1</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0 ${
                        checklist.profile ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                      }`}>
                        <Icon name={checklist.profile ? "check" : "edit"} size={11} strokeWidth={2.2} />
                        <span>{checklist.profile ? 'Done' : 'Pending'}</span>
                      </span>
                    </div>
                    <div className="font-extrabold text-xs text-navy truncate">1. Brand & City</div>
                    <p className="text-[11px] text-muted mt-1 leading-snug break-words">
                      {checklist.profile ? `${vendorProfile?.businessName || 'Brand'} · ${vendorProfile?.city || 'City'}` : 'Configure company name, category, and base city.'}
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-gray-100">
                    <a
                      href="/vendor/profile"
                      className={`text-xs font-bold hover:underline inline-flex items-center gap-1 max-w-full truncate ${
                        checklist.profile ? 'text-emerald-700' : 'text-primary'
                      }`}
                    >
                      <span className="truncate">{checklist.profile ? 'Edit Profile' : 'Add Details'}</span>
                      <Icon name="chevronRight" size={12} className="shrink-0" />
                    </a>
                  </div>
                </div>

                {/* Step 2: Services & Pricing */}
                <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between min-w-0 ${
                  checklist.services
                    ? 'border-emerald-200 bg-emerald-50/50 text-emerald-900'
                    : 'border-gray-200 bg-white text-navy shadow-xs'
                }`}>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Step 2</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0 ${
                        checklist.services ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-muted'
                      }`}>
                        <Icon name={checklist.services ? "check" : "services"} size={11} strokeWidth={2.2} />
                        <span>{checklist.services ? 'Done' : 'Pending'}</span>
                      </span>
                    </div>
                    <div className="font-extrabold text-xs text-navy truncate">2. Services & Pricing</div>
                    <p className="text-[11px] text-muted mt-1 leading-snug break-words">
                      {checklist.services ? `${services.length} active service(s) configured` : 'Define service packages, deliverables, and base rates.'}
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-gray-100">
                    <a
                      href="/vendor/services"
                      className={`text-xs font-bold hover:underline inline-flex items-center gap-1 max-w-full truncate ${
                        checklist.services ? 'text-emerald-700' : 'text-primary'
                      }`}
                    >
                      <span className="truncate">{checklist.services ? 'Manage Services' : 'Add Service'}</span>
                      <Icon name="chevronRight" size={12} className="shrink-0" />
                    </a>
                  </div>
                </div>

                {/* Step 3: Capability & Gear */}
                <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between min-w-0 ${
                  checklist.capabilities
                    ? 'border-emerald-200 bg-emerald-50/50 text-emerald-900'
                    : 'border-gray-200 bg-white text-navy shadow-xs'
                }`}>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Step 3</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0 ${
                        checklist.capabilities ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-muted'
                      }`}>
                        <Icon name={checklist.capabilities ? "check" : "camera"} size={11} strokeWidth={2.2} />
                        <span>{checklist.capabilities ? 'Done' : 'Pending'}</span>
                      </span>
                    </div>
                    <div className="font-extrabold text-xs text-navy truncate">3. Capability & Gear</div>
                    <p className="text-[11px] text-muted mt-1 leading-snug break-words">
                      {checklist.capabilities ? 'Equipment & crew capacity verified' : 'Declare equipment, crew capacity, and event formats.'}
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-gray-100">
                    <a
                      href={checklist.capabilities ? "/vendor/services" : "/vendor/services?action=gear"}
                      className={`text-xs font-bold hover:underline inline-flex items-center gap-1 max-w-full truncate ${
                        checklist.capabilities ? 'text-emerald-700' : 'text-primary'
                      }`}
                    >
                      <span className="truncate">{checklist.capabilities ? 'View Gear' : 'Configure Gear'}</span>
                      <Icon name="chevronRight" size={12} className="shrink-0" />
                    </a>
                  </div>
                </div>

                {/* Step 4: Coverage & Transit */}
                <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between min-w-0 ${
                  checklist.coverage
                    ? 'border-emerald-200 bg-emerald-50/50 text-emerald-900'
                    : 'border-gray-200 bg-white text-navy shadow-xs'
                }`}>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Step 4</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0 ${
                        checklist.coverage ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-muted'
                      }`}>
                        <Icon name={checklist.coverage ? "check" : "mapPin"} size={11} strokeWidth={2.2} />
                        <span>{checklist.coverage ? 'Done' : 'Pending'}</span>
                      </span>
                    </div>
                    <div className="font-extrabold text-xs text-navy truncate">4. Coverage & Transit</div>
                    <p className="text-[11px] text-muted mt-1 leading-snug break-words">
                      {checklist.coverage ? 'Transit radius & studio base set' : 'Set operating radius (km), operational base, and travel policy.'}
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-gray-100">
                    <a
                      href="/vendor/services?action=coverage"
                      className={`text-xs font-bold hover:underline inline-flex items-center gap-1 max-w-full truncate ${
                        checklist.coverage ? 'text-emerald-700' : 'text-primary'
                      }`}
                    >
                      <span className="truncate">{checklist.coverage ? 'Coverage & Transit' : 'Set Radius & Transit'}</span>
                      <Icon name="chevronRight" size={12} className="shrink-0" />
                    </a>
                  </div>
                </div>

                {/* Step 5: Portfolio Projects */}
                <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between min-w-0 ${
                  checklist.portfolio
                    ? 'border-emerald-200 bg-emerald-50/50 text-emerald-900'
                    : 'border-gray-200 bg-white text-navy shadow-xs'
                }`}>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Step 5</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0 ${
                        checklist.portfolio ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-muted'
                      }`}>
                        <Icon name={checklist.portfolio ? "check" : "image"} size={11} strokeWidth={2.2} />
                        <span>{checklist.portfolio ? 'Done' : 'Pending'}</span>
                      </span>
                    </div>
                    <div className="font-extrabold text-xs text-navy truncate">5. Portfolio Projects</div>
                    <p className="text-[11px] text-muted mt-1 leading-snug break-words">
                      {checklist.portfolio ? 'Published showcase items live' : 'Upload authentic project photos and videos of past events.'}
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-gray-100">
                    <a
                      href="/vendor/portfolio"
                      className={`text-xs font-bold hover:underline inline-flex items-center gap-1 max-w-full truncate ${
                        checklist.portfolio ? 'text-emerald-700' : 'text-primary'
                      }`}
                    >
                      <span className="truncate">{checklist.portfolio ? 'View Portfolio' : 'Add Project'}</span>
                      <Icon name="chevronRight" size={12} className="shrink-0" />
                    </a>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* 4 Dynamic KPI Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-2 2xl:grid-cols-4 gap-4">
          {dynamicStats.map((s) => (
            <div
              key={s.label}
              className="bg-white rounded-3xl p-4 sm:p-5 shadow-xs border border-gray-100 hover:shadow-sm hover:border-gray-200 transition min-w-0"
            >
              <div className="flex items-center justify-between">
                <div className={`w-11 h-11 rounded-2xl grid place-items-center ${s.iconBg}`}>
                  <Icon name={s.icon} size={20} />
                </div>
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Live</span>
              </div>
              <div className="mt-4 text-2xl sm:text-3xl font-black text-navy tracking-tight">
                {s.value}
              </div>
              <div className="text-xs font-semibold text-muted mt-1">{s.label}</div>
              <div className={`text-[11px] mt-2 font-bold ${s.footClass}`}>{s.foot}</div>
            </div>
          ))}
        </div>

        {/* 2-Column Section: Recent Enquiries & Upcoming Bookings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Recent Enquiries / Matching Leads */}
          <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-primary-soft text-primary grid place-items-center">
                    <Icon name="message" size={15} />
                  </div>
                  <h2 className="font-extrabold text-base text-navy">Recent Enquiries</h2>
                  {enquiries.length > 0 && (
                    <span className="text-[10px] font-extrabold bg-primary-soft text-primary px-2 py-0.5 rounded-full">
                      {enquiries.length}
                    </span>
                  )}
                </div>
                <a href="/vendor/enquiries" className="text-xs font-bold text-primary hover:underline">
                  View all leads →
                </a>
              </div>

              <div className="space-y-3">
                {enquiries.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className="flex gap-3.5 border border-gray-100 rounded-2xl p-3.5 hover:shadow-xs hover:border-gray-200 transition bg-white"
                  >
                    <div className="w-12 h-12 rounded-xl bg-lavender text-primary grid place-items-center font-bold text-sm shrink-0">
                      <Icon name="message" size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-navy truncate">{e.title}</span>
                        <span className="text-[10px] text-muted whitespace-nowrap">{e.ago}</span>
                      </div>
                      <div className="text-[11px] text-muted truncate mt-0.5">{e.meta}</div>
                      <div className="flex items-center justify-between gap-2 mt-2 pt-1 border-t border-gray-50">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {e.chips.slice(0, 2).map((c) => (
                            <span key={c} className="text-[9px] bg-lavender rounded-md px-2 py-0.5 text-muted font-semibold">
                              {c}
                            </span>
                          ))}
                          <StatusChip status={e.status} />
                        </div>
                        <button
                          onClick={() => setSelectedEnquiry(e)}
                          className="text-xs font-bold text-primary hover:underline shrink-0"
                        >
                          View Enquiry →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {enquiries.length === 0 && (
                  <div className="py-8 text-center px-4">
                    {!is100Percent ? (
                      <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-2 text-left">
                        <div className="font-extrabold flex items-center gap-1.5 text-amber-950">
                          <Icon name="lock" size={14} className="text-amber-800 shrink-0" />
                          <span>Inbound Enquiries Locked (Profile {completionPercentage}%)</span>
                        </div>
                        <p className="text-[11px] text-amber-800 leading-relaxed">
                          STARVNT matching engine activates when your brand reaches 100% profile readiness. Complete your 5 onboarding steps to start receiving direct client requests.
                        </p>
                        <a
                          href={!checklist.profile ? '/vendor/profile' : '/vendor/services'}
                          className="inline-block text-xs font-bold text-primary underline"
                        >
                          Finish onboarding setup →
                        </a>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="w-10 h-10 rounded-2xl bg-lavender text-muted grid place-items-center mx-auto mb-2">
                          <Icon name="message" size={18} />
                        </div>
                        <div className="text-xs font-bold text-navy">No New Enquiries</div>
                        <p className="text-[11px] text-muted max-w-xs mx-auto">
                          Your profile is active and matchable. As clients submit event requirements matching your coverage area, leads will appear here.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Upcoming Bookings */}
          <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-sky-50 text-sky-600 grid place-items-center">
                    <Icon name="bookings" size={15} />
                  </div>
                  <h2 className="font-extrabold text-base text-navy">Upcoming Bookings</h2>
                  {bookings.length > 0 && (
                    <span className="text-[10px] font-extrabold bg-sky-50 text-sky-600 px-2 py-0.5 rounded-full">
                      {bookings.length}
                    </span>
                  )}
                </div>
                <a href="/vendor/bookings" className="text-xs font-bold text-primary hover:underline">
                  View all bookings →
                </a>
              </div>

              <div className="space-y-3">
                {bookings.slice(0, 3).map((b) => (
                  <div
                    key={b.id}
                    className="flex gap-3.5 items-center border border-gray-100 rounded-2xl p-3.5 hover:shadow-xs hover:border-gray-200 transition bg-white"
                  >
                    <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 grid place-items-center font-bold text-xs shrink-0">
                      <Icon name="bookings" size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-navy truncate">{b.title}</span>
                        <StatusChip status={b.status} />
                      </div>
                      <div className="text-[11px] text-muted truncate mt-0.5">{b.meta}</div>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-emerald-600">Core Escrow Secured</span>
                        <a href="/vendor/bookings" className="text-xs font-bold text-primary hover:underline">
                          View Details →
                        </a>
                      </div>
                    </div>
                  </div>
                ))}

                {bookings.length === 0 && (
                  <div className="py-8 text-center px-4 space-y-1.5">
                    <div className="w-10 h-10 rounded-2xl bg-lavender text-muted grid place-items-center mx-auto mb-2">
                      <Icon name="bookings" size={18} />
                    </div>
                    <div className="text-xs font-bold text-navy">No Bookings Scheduled Yet</div>
                    <p className="text-[11px] text-muted max-w-xs mx-auto">
                      Confirmed client events and milestone dates will appear here once clients approve your quotes and pay into Core Escrow.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Quotes Pending Table */}
        <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100 overflow-hidden min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-orange-50 text-orange-600 grid place-items-center">
                <Icon name="quotes" size={15} />
              </div>
              <h2 className="font-extrabold text-base text-navy">Active Quotes Pipeline</h2>
              {quotes.length > 0 && (
                <span className="text-[10px] font-extrabold bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">
                  {quotes.length}
                </span>
              )}
            </div>
            <a href="/vendor/quotes" className="text-xs font-bold text-primary hover:underline">
              View all quotes →
            </a>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted border-b border-gray-100 pb-2">
                  <th className="pb-3 font-semibold">Client</th>
                  <th className="pb-3 font-semibold">Service Type</th>
                  <th className="pb-3 font-semibold">Event Date</th>
                  <th className="pb-3 font-semibold">Total Amount</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {quotes.slice(0, 5).map((q) => (
                  <tr key={q._id || q.id} className="hover:bg-lavender/30 transition">
                    <td className="py-3 font-bold text-navy">{q.client}</td>
                    <td className="py-3 text-muted">{q.type}</td>
                    <td className="py-3 text-muted">{q.date}</td>
                    <td className="py-3 font-extrabold text-navy">{q.amount}</td>
                    <td className="py-3"><StatusChip status={q.status} /></td>
                    <td className="py-3 text-right">
                      {q.status === 'Draft' || q.status === 'DRAFT' ? (
                        <button
                          onClick={() => handleQuoteAction(q)}
                          className="text-[11px] font-bold bg-primary hover:bg-primary-dark text-white rounded-xl px-3.5 py-1.5 transition shadow-xs"
                        >
                          Submit Quote
                        </button>
                      ) : (
                        <a href="/vendor/quotes" className="text-[11px] font-semibold text-primary hover:underline">
                          {q.action}
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {quotes.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-xs text-muted">
                      <div className="space-y-1">
                        <p className="font-semibold text-navy">No active quotes in pipeline</p>
                        <p className="text-[11px] text-muted">Prepare proposals directly from inbound client leads.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Right Column Operational Sidebar: Responsive Grid below xl, docked sidebar on xl+ */}
      <aside className="min-w-0 w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-5 xl:space-y-5 xl:gap-0">
        {/* Quick Actions Shortcuts */}
        <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100 min-w-0">
          <div className="flex items-center justify-between mb-3.5">
            <h3 className="font-extrabold text-sm text-navy">Quick Actions</h3>
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Shortcuts</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {quickActions.map((a) => (
              <a
                key={a.label}
                href={a.to}
                className="rounded-2xl border border-gray-100 hover:border-primary/40 hover:bg-lavender/50 transition p-3 text-center relative group block"
              >
                <div className={`w-9 h-9 mx-auto rounded-xl ${a.bg} grid place-items-center transition group-hover:scale-105`}>
                  <Icon name={a.icon} size={16} />
                </div>
                <div className="text-xs font-bold text-navy mt-1.5 truncate">{a.label}</div>
                {a.badge && (
                  <span className="absolute top-2 right-2 text-[9px] font-extrabold bg-rose-500 text-white rounded-full w-4 h-4 grid place-items-center">
                    {a.badge}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>

        {/* Live Interactive Mini Calendar */}
        <div className="min-w-0">
          <MiniCalendar bookings={bookings} blockouts={blockouts} />
        </div>

        {/* Scheduled Upcoming Events */}
        <div className="min-w-0">
          <ScheduledEventsCard bookings={bookings} />
        </div>

        {/* Notifications & System Alerts */}
        <div className="min-w-0">
          <NotificationsCard
            notifications={notifications}
            unreadNotifCount={unreadNotifCount}
            onMarkRead={handleMarkNotificationRead}
            onMarkAllRead={handleMarkAllNotificationsRead}
          />
        </div>

        {/* Conversion Funnel Performance */}
        <div className="md:col-span-2 xl:col-span-1 min-w-0">
          <Performance enquiries={enquiries} quotes={quotes} bookings={bookings} />
        </div>
      </aside>

      {/* Modals */}
      {selectedEnquiry && (
        <EnquiryModal
          enquiry={selectedEnquiry}
          onClose={() => setSelectedEnquiry(null)}
          onPrepareQuote={(e) => setQuoteEnquiry(e)}
        />
      )}

      {quoteEnquiry && (
        <QuoteModal
          enquiry={quoteEnquiry}
          vendorCity={vendorProfile?.city}
          onClose={() => setQuoteEnquiry(null)}
          onSubmitQuote={(q) => {
            handleSendQuote(q, quoteEnquiry);
          }}
        />
      )}
    </div>
  );
}
