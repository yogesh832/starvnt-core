import ProfileStatus from '../../../components/ProfileStatus.jsx';
import { VENDOR_SETUP_STEPS } from '../../../../../server/src/common/vendorSetupSteps.js';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../../components/Icon.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import { externalApi } from '../../../lib/api.js';
import VendorMessageField from '../VendorMessageField.jsx';
import { useExternalAuth } from '../../../auth/ExternalAuthContext.jsx';
import { buildDashboardQuotePayload, buildVendorActionItems, buildVendorSalesMetrics, buildVendorWeeklySummary, formatRate, formatResponseTime, getDashboardFreshness, getVendorActivationPresentation } from '../dashboardMetrics.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function SkeletonLine({ className = '' }) {
  return <div className={`animate-pulse rounded-full bg-gray-200/80 ${className}`} />;
}

function VendorDashboardSkeleton({ business = 'Your Brand' }) {
  return (
    <div className="p-3 sm:p-5 lg:p-6 w-full max-w-[1600px] mx-auto min-w-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
      <div className="space-y-6 min-w-0 w-full">
        <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-xs border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-2xl bg-gray-200 animate-pulse shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonLine className="h-6 w-56 max-w-full" />
              <SkeletonLine className="h-3 w-72 max-w-full" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SkeletonLine className="h-9 w-24 rounded-xl" />
            <SkeletonLine className="h-9 w-24 rounded-xl" />
          </div>
        </div>

        <div className="rounded-3xl p-5 sm:p-6 border border-primary/15 bg-white shadow-sm space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-3 flex-1">
              <SkeletonLine className="h-4 w-44" />
              <SkeletonLine className="h-6 w-80 max-w-full" />
              <SkeletonLine className="h-3 w-full max-w-2xl" />
            </div>
            <SkeletonLine className="h-10 w-36 rounded-xl" />
          </div>
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <div className="flex justify-between">
              <SkeletonLine className="h-3 w-48" />
              <SkeletonLine className="h-3 w-20" />
            </div>
            <SkeletonLine className="h-2.5 w-full" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3.5 pt-2">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="p-4 rounded-2xl border border-gray-100 bg-white space-y-3">
                  <SkeletonLine className="h-3 w-16" />
                  <SkeletonLine className="h-4 w-28" />
                  <SkeletonLine className="h-3 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="bg-white rounded-3xl p-4 border border-gray-100 shadow-xs space-y-3">
              <SkeletonLine className="h-9 w-9 rounded-2xl" />
              <SkeletonLine className="h-6 w-20" />
              <SkeletonLine className="h-3 w-28 max-w-full" />
            </div>
          ))}
        </div>

        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
          <SkeletonLine className="h-5 w-44" />
          <div className="grid sm:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonLine key={idx} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-4">
          <SkeletonLine className="h-5 w-32" />
          <SkeletonLine className="h-64 w-full rounded-2xl" />
        </div>
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs space-y-3">
          <SkeletonLine className="h-5 w-40" />
          <SkeletonLine className="h-12 w-full rounded-2xl" />
          <SkeletonLine className="h-12 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * Live Interactive Mini Calendar
 * Strictly driven by the current real date and authentic vendor bookings.
 */
export function MiniCalendar({ bookings = [], blockouts = [], available = true }) {
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
      {!available && <p role="status" className="mt-2 text-[10px] text-amber-800">Some booking or availability records failed to load; calendar markers may be incomplete.</p>}
    </div>
  );
}

/**
 * Authentic Funnel Performance Widget
 * Accurately derives conversion rates from real opportunities, proposals, and bookings.
 */
export function Performance({ enquiries = [], quotes = [], bookings = [], available = true }) {
  const [periodDays, setPeriodDays] = useState(30);
  const [firstResponseMetric, setFirstResponseMetric] = useState(null);
  const [firstResponseState, setFirstResponseState] = useState('loading');
  const metrics = useMemo(() => buildVendorSalesMetrics({ enquiries, quotes, bookings, periodDays }), [enquiries, quotes, bookings, periodDays]);
  const quoteRate = formatRate(metrics.enquiryToQuoteRate);
  const bookingRate = formatRate(metrics.enquiryToBookingRate);
  const quoteTurnaround = formatResponseTime(metrics.averageQuoteTurnaroundMs);

  useEffect(() => {
    let active = true;
    setFirstResponseState('loading');
    externalApi.call(`/vendor/metrics/first-response?periodDays=${periodDays}`)
      .then((response) => {
        if (!response?.ok || !response.metrics) throw new Error('First-response metrics are unavailable.');
        if (active) {
          setFirstResponseMetric(response.metrics);
          setFirstResponseState('ready');
        }
      })
      .catch(() => { if (active) setFirstResponseState('error'); });
    return () => { active = false; };
  }, [periodDays]);

  return (
    <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center">
            <Icon name="trend" size={15} />
          </div>
          <h3 className="font-extrabold text-sm text-navy">Conversion Pipeline</h3>
        </div>
        <label className="flex items-center gap-1.5 text-[10px] font-semibold text-muted">
          Enquiry cohort
          <select aria-label="Sales performance cohort period" value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
      </div>

      {!available ? (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Sales performance is unavailable because one or more source records could not be loaded. Retry the dashboard to refresh these metrics.
        </div>
      ) : (
      <>
      <p className="mb-3 text-[10px] leading-relaxed text-muted">
        Matured cohort: enquiries received {periodDays}–{periodDays + metrics.attributionWindowDays} days ago. Each enquiry has a 30-day attribution window; newer enquiries are excluded until that window closes.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pb-3 border-b border-gray-100">
        <div className="p-2 rounded-2xl bg-lavender/50 min-w-0">
          <div className="text-[10px] text-muted font-semibold truncate">Eligible enquiries</div>
          <div className="font-extrabold text-base text-navy mt-0.5">{metrics.eligibleEnquiries}</div>
          <div className="text-[9px] text-muted font-medium mt-0.5 truncate">Matured cohort</div>
        </div>
        <div className="p-2 rounded-2xl bg-lavender/50 min-w-0">
          <div className="text-[10px] text-muted font-semibold truncate">Lead → Quote</div>
          <div className="font-extrabold text-base text-navy mt-0.5">{quoteRate}</div>
          <div className="text-[9px] text-emerald-600 font-bold mt-0.5 truncate">{metrics.enquiriesWithSubmittedQuote} enquiries</div>
        </div>
        <div className="p-2 rounded-2xl bg-lavender/50 min-w-0">
          <div className="text-[10px] text-muted font-semibold truncate">Quote → Booked</div>
          <div className="font-extrabold text-base text-navy mt-0.5">{bookingRate}</div>
          <div className="text-[9px] text-emerald-600 font-bold mt-0.5 truncate">{metrics.confirmedBookings} confirmed</div>
        </div>
        <div className="p-2 rounded-2xl bg-lavender/50 min-w-0">
          <div className="text-[10px] text-muted font-semibold truncate">Declined with reason</div>
          <div className="font-extrabold text-base text-navy mt-0.5">{metrics.declinedWithRecordedReasonCount}</div>
          <div className="text-[9px] text-muted font-medium mt-0.5 truncate">Recorded in cohort</div>
        </div>
      </div>
      {metrics.declineReasonBreakdown.length > 0 && <p className="mb-3 text-[10px] text-muted">Recorded reasons: {metrics.declineReasonBreakdown.map((item) => `${item.reason} (${item.count})`).join(' · ')}</p>}

      {metrics.eligibleEnquiries === 0 ? (
        <div className="pt-4 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-lavender text-muted mb-2">
            <Icon name="trend" size={18} />
          </div>
          <p className="text-xs font-bold text-navy">Insufficient mature cohort data</p>
          <p className="text-[11px] text-muted mt-1 leading-relaxed">
            No eligible enquiries were received in this completed cohort period. Newer enquiries remain outside this calculation until their attribution window matures.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="font-semibold text-muted">Enquiries with submitted quote</span>
              <span className="font-extrabold text-navy">{quoteRate}</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (metrics.enquiryToQuoteRate || 0) * 100)}%` }} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="font-semibold text-muted">Enquiry-to-confirmed booking rate</span>
              <span className="font-extrabold text-navy">{bookingRate}</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (metrics.enquiryToBookingRate || 0) * 100)}%` }} />
            </div>
          </div>
          <div className="pt-1 flex items-center justify-between text-[10px] text-muted">
            <span>Average time to first submitted quote: <strong className="text-navy">{quoteTurnaround}</strong></span>
            <span className="text-right">Based on {metrics.quoteTurnaroundSampleSize} recorded submission{metrics.quoteTurnaroundSampleSize === 1 ? '' : 's'}</span>
          </div>
        </div>
      )}
      <div className="mt-4 grid sm:grid-cols-2 gap-2.5 border-t border-gray-100 pt-3">
        <div className="rounded-xl bg-gray-50/70 p-3 min-w-0">
          <div className="text-[10px] font-semibold text-muted">Average first vendor response (quote or message)</div>
          <div className="mt-1 text-sm font-extrabold text-navy">{!available || firstResponseState === 'error' || (firstResponseState === 'ready' && !firstResponseMetric?.complete) ? 'Unavailable' : firstResponseState === 'loading' ? 'Loading…' : formatResponseTime(firstResponseMetric?.averageFirstResponseMs)}</div>
          <div className="mt-1 text-[9px] text-muted">Matured {periodDays}-day enquiry cohort · {firstResponseState === 'ready' && firstResponseMetric.complete ? `${firstResponseMetric.respondedEnquiries} of ${firstResponseMetric.eligibleEnquiries} enquiries with response records` : firstResponseState === 'ready' ? 'Source volume exceeded the complete calculation limit' : 'Waiting for response records'}</div>
        </div>
        <div className="rounded-xl bg-gray-50/70 p-3 min-w-0">
          <div className="text-[10px] font-semibold text-muted">Quote submission turnaround</div>
          <div className="mt-1 text-sm font-extrabold text-navy">{quoteTurnaround}</div>
          <div className="mt-1 text-[9px] text-muted">From enquiry receipt to first submitted quote · sample {metrics.quoteTurnaroundSampleSize}</div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

/**
 * Enquiry Detail Dialog
 */
function EnquiryModal({ enquiry, onClose, onPrepareQuote }) {
  if (!enquiry) return null;
  return (
    <div className="vendor-modal-backdrop">
      <div className="vendor-modal-panel max-w-lg p-4 sm:p-6 space-y-4">
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

        <div className="vendor-modal-actions pt-2 flex gap-3">
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
 * Quote Builder Dialog
 */
function QuoteModal({ enquiry, vendorCity, onClose, onSubmitQuote }) {
  const [basePrice, setBasePrice] = useState(0);
  const [quoteMessage, setQuoteMessage] = useState('');
  const [travelFee, setTravelFee] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const total = (Number(basePrice) || 0) + (Number(travelFee) || 0);
  const validAmounts = Number.isFinite(Number(basePrice)) && Number(basePrice) > 0
    && Number.isFinite(Number(travelFee)) && Number(travelFee) >= 0 && total > 0;

  async function submitQuote(status) {
    if (!enquiry?.opportunityId) {
      setSubmitError('This enquiry is missing its record link. Refresh the dashboard and try again.');
      return;
    }
    if (!validAmounts) {
      setSubmitError('Enter a base price greater than ₹0 and a travel amount of ₹0 or more.');
      return;
    }
    setSaving(true);
    setSubmitError('');
    try {
      await onSubmitQuote({ base: Number(basePrice), travel: Number(travelFee), total, notes: quoteMessage, status });
      onClose();
    } catch (error) {
      setSubmitError(error?.message || 'The quote could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="vendor-modal-backdrop">
      <div className="vendor-modal-panel max-w-md p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-extrabold text-navy">Prepare Official Quote</h2>
            <p className="text-xs text-muted">{enquiry?.title || 'Service Proposal'} · {enquiry?.date || 'Upcoming'}</p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center transition disabled:opacity-50"
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
              min="1"
              step="1"
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
              min="0"
              step="1"
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
          {!validAmounts && <p role="status" className="text-[11px] text-amber-800">Enter a base price greater than ₹0 and a travel amount of ₹0 or more to save this quote.</p>}
        </div>

        <VendorMessageField value={quoteMessage} onChange={setQuoteMessage} context={{ type: 'opportunity', id: enquiry?.opportunityId }} label="Message with quote (optional)" placeholder="e.g. Describe package inclusions, timing or any conditions for this offer." />
        {submitError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{submitError}</p>}
        <div className="vendor-modal-actions pt-2 flex gap-3">
          <button
            type="button"
            disabled={saving || !validAmounts}
            onClick={() => submitQuote('DRAFT')}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:text-navy transition disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            type="button"
            disabled={saving || !validAmounts}
            onClick={() => submitQuote('SUBMITTED')}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark shadow-md shadow-primary/25 transition disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Submit Quote'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduledEventsCard({ bookings = [], available = true }) {
  return (
    <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-extrabold text-sm text-navy">{available ? `${bookings.length} Scheduled Events` : 'Scheduled Events'}</h3>
        <Link to="/vendor/bookings" className="text-[11px] font-bold text-primary hover:underline">View all</Link>
      </div>
      <ul className="space-y-2.5 text-xs">
        {!available ? <li role="status" className="text-amber-800 text-center py-3 text-[11px]">Booking data is unavailable.</li> : bookings.slice(0, 3).map((b, idx) => (
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
        {available && bookings.length === 0 && (
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
  available = true,
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
        {!available ? <li role="status" className="text-amber-800 text-center py-4 text-[11px]">Notifications are unavailable. Retry the dashboard.</li> : notifications.slice(0, 4).map((n) => (
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
        {available && notifications.length === 0 && (
          <li className="text-muted text-center py-4 text-[11px]">
            You're all caught up! No unread notifications.
          </li>
        )}
      </ul>
    </div>
  );
}

const AURA_CHIPS = ['Aaj kya karna hai?', 'Pending enquiries dikhao', 'Mera settlement status kya hai?', 'Is hafte ki bookings'];

/** Ask Aura+ from the dashboard: opens the Aura+ panel and sends the question. */
function AskAuraCard({ onAsk }) {
  const [text, setText] = useState('');
  function submit(e) {
    e.preventDefault();
    if (!text.trim()) return onAsk();
    onAsk(text.trim());
    setText('');
  }
  return (
    <div className="rounded-3xl p-4 sm:p-5 bg-gradient-to-br from-primary via-[#7b5cf0] to-[#b18cff] text-white shadow-lg shadow-primary/20">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl bg-white/20 grid place-items-center">
          <Icon name="aura" size={15} />
        </span>
        <div>
          <div className="text-sm font-extrabold">Ask Aura+</div>
          <div className="text-[11px] text-white/80">Enquiries, quotes, bookings, payments — pooch lo, main batati hoon.</div>
        </div>
      </div>
      <form onSubmit={submit} className="mt-3 flex items-center gap-2 bg-white rounded-2xl px-3 py-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="e.g. Kaunse quotes pending hain?"
          className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-navy py-1"
        />
        <button type="submit" className="w-8 h-8 rounded-xl bg-primary text-white grid place-items-center shrink-0" aria-label="Ask Aura+">
          <Icon name="send" size={14} />
        </button>
      </form>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {AURA_CHIPS.map((c) => (
          <button key={c} onClick={() => onAsk(c)} className="rounded-full bg-white/15 hover:bg-white/25 text-[11px] font-semibold px-3 py-1 transition">
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActionCenter({ enquiries, quotes, bookings, reviews, messagesCount, messageThreads, failedSources, today, profileNeedsCompletion }) {
  const actions = buildVendorActionItems({ enquiries, quotes, bookings, reviews, messagesCount, messageThreads, today, profileNeedsCompletion });
  const unavailableLabels = [
    ['enquiries', 'enquiries'],
    ['quotes', 'quotes'],
    ['bookings', 'bookings'],
    ['reviews', 'published reviews'],
    ['message counts', 'unread message count'],
    ['activation status', 'profile readiness'],
  ].filter(([source]) => failedSources.includes(source)).map(([, label]) => label);

  return (
    <section aria-labelledby="vendor-action-center-title" className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 id="vendor-action-center-title" className="font-extrabold text-base text-navy">Today’s Action Center</h2>
          <p className="text-[11px] text-muted mt-0.5">Prioritized work from current booking, enquiry, quote, message and profile records.</p>
        </div>
        <Icon name="bolt" size={19} />
      </div>
      {actions.length ? (
        <ul className="grid sm:grid-cols-2 gap-2.5">
          {actions.map((action) => (
            <li key={action.key} className="min-w-0 rounded-2xl border border-gray-100 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-navy">{action.title}</div>
                <div className="text-[10px] text-muted truncate mt-1">{action.detail}</div>
                <div className="text-[10px] text-muted mt-1">{action.state} · Needs attention · no deadline recorded</div>
                <div className="text-[10px] text-muted mt-0.5">{action.reason}</div>
              </div>
              <Link to={action.href} className="shrink-0 text-[11px] font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">{action.label} →</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-800">No supported vendor action is currently recorded.</p>
      )}
      {unavailableLabels.length > 0 && <p role="status" className="mt-2 text-[10px] text-amber-800">Some action sources are unavailable: {unavailableLabels.join(', ')}. Items from those sources may be missing.</p>}
    </section>
  );
}

function FinancialClarity({ financialTruth, available }) {
  if (!available) {
    return <section aria-labelledby="dashboard-finance-title" className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100"><h2 id="dashboard-finance-title" className="font-extrabold text-base text-navy">Financial clarity</h2><p role="status" className="mt-2 text-xs text-amber-800">Core financial figures are unavailable. Open Payments or retry the dashboard before relying on a balance.</p></section>;
  }
  const metrics = financialTruth?.metrics || {};
  const values = [
    ['Customer balance outstanding', metrics.expectedReceivables],
    ['Customer balance due this week', metrics.dueThisWeek],
    ['Overdue customer balance', metrics.overdueAmount],
    ['Settlement eligible', metrics.expectedSettlements],
    ['Settlement on hold', metrics.settlementHoldAmount],
    ['Vendor settlements completed', metrics.settledAmount],
  ];
  return (
    <section aria-labelledby="dashboard-finance-title" className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div><h2 id="dashboard-finance-title" className="font-extrabold text-base text-navy">Financial clarity</h2><p className="mt-1 text-[10px] text-muted">Core booking and settlement records · all time</p></div>
        <Link to="/vendor/payments" className="shrink-0 text-xs font-bold text-primary hover:underline">Open payments →</Link>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {values.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
            <div className="text-[10px] font-semibold text-muted">{label}</div>
            <div className="mt-1 break-words text-lg font-extrabold text-navy">{value !== null && value !== undefined && Number.isFinite(Number(value)) ? `₹${Number(value).toLocaleString('en-IN')}` : 'Unavailable'}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-muted">Customer balances are receivables, not vendor earnings. Eligibility, holds and completed payouts are separate Core states; the current model has no separate payout-initiated state.</p>
      <p className="mt-1 text-[9px] text-muted">Data generated {new Date(financialTruth.generatedAt).toLocaleString()}</p>
    </section>
  );
}

function ServiceQualitySummary({ reviews, stats, available }) {
  return (
    <section aria-labelledby="dashboard-quality-title" className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div><h2 id="dashboard-quality-title" className="font-extrabold text-base text-navy">Service quality</h2><p className="mt-1 text-[10px] text-muted">Published STARVNT reviews; Google Maps is shown separately in your profile.</p></div>
        <Link to="/vendor/reviews" className="shrink-0 text-xs font-bold text-primary hover:underline">Open reviews →</Link>
      </div>
      {!available ? (
        <p role="status" className="text-xs text-amber-800">Review information is unavailable. No rating or review count is being inferred.</p>
      ) : Number(stats?.totalReviews || 0) === 0 ? (
        <p className="rounded-xl bg-lavender/40 p-3 text-xs text-muted">No published STARVNT reviews yet.</p>
      ) : (
        <>
          <p className="text-sm font-bold text-navy">{stats.averageRating} / 5 · {stats.totalReviews} published review{stats.totalReviews === 1 ? '' : 's'}</p>
          <ul className="mt-3 grid sm:grid-cols-3 gap-2">
            {reviews.slice(0, 3).map((review) => (
              <li key={review._id} className="rounded-xl border border-gray-100 p-3 min-w-0">
                <div className="text-xs font-bold text-navy">{review.rating} / 5 · {review.serviceName || 'Service'}</div>
                <div className="mt-1 text-[10px] text-muted">{review.createdAt ? new Date(review.createdAt).toLocaleDateString() : 'Date not recorded'}</div>
                <div className="mt-2 text-[10px] text-muted">{review.vendorReply?.text ? 'Reply posted' : 'Reply status available in Reviews'}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function VendorImprovement({ recommendations, available }) {
  return (
    <section aria-labelledby="dashboard-improvement-title" className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div><h2 id="dashboard-improvement-title" className="font-extrabold text-base text-navy">Vendor improvement</h2><p className="mt-1 text-[10px] text-muted">Suggestions are based on saved vendor records and refresh with your dashboard.</p></div>
      </div>
      {!available ? (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Recommendations are unavailable. No suggestions have been inferred from missing data.</p>
      ) : recommendations.length ? (
        <ul className="grid sm:grid-cols-2 gap-2.5">
          {recommendations.map((item, index) => {
            const href = item.signal === 'NEW_ENQUIRY' ? '/vendor/enquiries'
              : item.signal === 'LOCATION_DEMAND' ? '/vendor/services?action=coverage'
              : item.signal === 'PORTFOLIO_GAP' ? '/vendor/portfolio'
              : '/vendor/bookings';
            return <li key={`${item.signal}-${item.targetId || index}`} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3 min-w-0">
              <div className="flex items-start justify-between gap-2"><h3 className="text-xs font-bold text-navy">{item.title}</h3><span className="shrink-0 rounded-full bg-lavender px-2 py-0.5 text-[9px] font-bold text-primary">{item.priority || 'INFO'}</span></div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{item.message}</p>
              <Link to={href} className="mt-2 inline-block text-[11px] font-bold text-primary hover:underline">{item.action || 'Review'} →</Link>
            </li>;
          })}
        </ul>
      ) : <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">No improvement suggestions are supported by the current records.</p>}
    </section>
  );
}

function OperatingReadiness({ activation, available }) {
  if (!available || !activation) {
    return <section aria-labelledby="dashboard-readiness-title" className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100"><h2 id="dashboard-readiness-title" className="font-extrabold text-base text-navy">Operating readiness</h2><p role="status" className="mt-2 text-xs text-amber-800">Readiness information is unavailable. No eligibility state is inferred.</p></section>;
  }
  const checklist = activation.checklist || {};
  const label = (value) => value === true ? 'Complete' : value === false ? 'Incomplete' : 'Unavailable';
  const items = [
    ['Profile completion', `${Number(activation.completionPercentage || 0)}%`],
    ['Identity verification', label(checklist.identityVerified)],
    ['Bank verification', label(checklist.bankVerified)],
    ['Account activation', String(activation.activationState || 'Unavailable').replaceAll('_', ' ')],
    ['Matching eligibility', label(activation.matchingEligible)],
    ['Services and capacity', label(checklist.services && checklist.capacity && checklist.resources)],
    ['Availability', label(checklist.availability)],
    ['Operating location and coverage', label(checklist.locations && checklist.coverage)],
    ['Portfolio', label(checklist.portfolio)],
  ];
  const blockers = Array.isArray(activation.missingRequirements) ? activation.missingRequirements : [];
  return (
    <section aria-labelledby="dashboard-readiness-title" className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div><h2 id="dashboard-readiness-title" className="font-extrabold text-base text-navy">Operating readiness</h2><p className="mt-1 text-[10px] text-muted">Profile setup, verification, activation and matching are separate platform checks.</p></div>
        <Link to="/vendor/profile" className="shrink-0 text-xs font-bold text-primary hover:underline">Review profile →</Link>
      </div>
      <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {items.map(([term, value]) => (
          <div key={term} className="flex items-start justify-between gap-2 rounded-xl border border-gray-100 p-3 min-w-0">
            <dt className="text-[10px] text-muted">{term}</dt>
            <dd className={`text-right text-[10px] font-bold ${value === 'Complete' || value === 'ELIGIBLE' || value === 'ACTIVE' ? 'text-emerald-700' : value === 'Unavailable' ? 'text-muted' : 'text-amber-800'}`}>{value}</dd>
          </div>
        ))}
      </dl>
      {!activation.matchingEligible && blockers.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[10px] font-bold text-amber-950">Matching is locked. Current readiness findings:</p>
          <ul className="mt-1 list-disc pl-4 text-[10px] text-amber-900">{blockers.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul>
          <p className="mt-2 text-[10px] text-amber-900">Profile and verification items can be completed by you; activation approval may require the authorized team.</p>
        </div>
      )}
    </section>
  );
}

function WeeklyPerformanceReview({ enquiries, quotes, bookings, reviews, availability }) {
  const summary = useMemo(() => buildVendorWeeklySummary({ enquiries, quotes, bookings, reviews }), [enquiries, quotes, bookings, reviews]);
  const rows = [
    ['Enquiries received', 'enquiries'],
    ['Quotes submitted', 'submittedQuotes'],
    ['Core-confirmed bookings', 'confirmedBookings'],
    ['Published STARVNT reviews', 'publishedReviews'],
  ];
  const comparison = (current, previous) => {
    if (previous === 0 && current > 0) return `${current} this period · prior period 0; percentage comparison unavailable`;
    const difference = current - previous;
    if (difference === 0) return `No change from comparable prior period (${previous})`;
    return `${difference > 0 ? '+' : ''}${difference} vs comparable prior period (${previous})`;
  };
  return (
    <section aria-labelledby="dashboard-weekly-title" className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100">
      <h2 id="dashboard-weekly-title" className="font-extrabold text-base text-navy">Weekly performance review</h2>
      <p className="mt-1 text-[10px] text-muted">Current elapsed UTC week vs the same elapsed period last week. No growth rate is shown when the previous count is zero.</p>
      <dl className="mt-3 grid sm:grid-cols-2 gap-2">
        {rows.map(([label, key]) => (
          <div key={key} className="rounded-xl border border-gray-100 p-3 flex items-center justify-between gap-3">
            <dt className="min-w-0 text-[10px] font-semibold text-muted">{label}</dt>
            <dd className="text-right"><div className="text-sm font-extrabold text-navy">{availability[key] ? summary.current[key] : 'Unavailable'}</div><div className="text-[9px] text-muted">{availability[key] ? comparison(summary.current[key], summary.previous[key]) : key === 'enquiries' ? 'Activation approval required' : 'Source unavailable'}</div></dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[10px] text-muted">Response-time samples and operational task completion do not have a reliable shared event source, so they are not included.</p>
    </section>
  );
}

const GOAL_METRICS = {
  SUBMITTED_QUOTES: 'Submitted quotes',
  CONFIRMED_BOOKINGS: 'Confirmed bookings',
  COMPLETED_BOOKINGS: 'Core-verified completions',
};

function localDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function BusinessGoals() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dashboardActionFeedback, setDashboardActionFeedback] = useState(null);
  const dashboardRequestSequence = useRef(0);
  const [lastCompleteDashboardRefreshAt, setLastCompleteDashboardRefreshAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [metric, setMetric] = useState('SUBMITTED_QUOTES');
  const [targetValue, setTargetValue] = useState('3');
  const [startDate, setStartDate] = useState(() => localDateInput(new Date()));
  const [endDate, setEndDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return localDateInput(date);
  });

  const loadGoals = useCallback(async () => {
    try {
      const response = await externalApi.call('/vendor/goals');
      if (!response?.ok || !Array.isArray(response.goals)) throw new Error('Goal data is unavailable.');
      setGoals(response.goals);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load your goals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGoals(); }, [loadGoals]);

  async function createGoal(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await externalApi.call(editingId ? `/vendor/goals/${editingId}` : '/vendor/goals', {
        method: editingId ? 'PATCH' : 'POST',
        body: { name, metric, targetValue: Number(targetValue), startDate, endDate },
      });
      if (!response?.ok) throw new Error(response?.message || response?.error || 'Goal could not be saved.');
      setName('');
      setEditingId(null);
      setNotice(editingId ? 'Goal updated. Progress is calculated from saved platform records.' : 'Goal saved. Progress is calculated from saved platform records.');
      await loadGoals();
    } catch (err) {
      setError(err.message || 'Goal could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  function editGoal(goal) {
    setEditingId(goal.id);
    setName(goal.name);
    setMetric(goal.metric);
    setTargetValue(String(goal.targetValue));
    setStartDate(goal.periodStart);
    setEndDate(goal.periodEnd);
    setError('');
    setNotice('');
  }

  function cancelGoalEdit() {
    setEditingId(null);
    setName('');
    setTargetValue('3');
    setStartDate(localDateInput(new Date()));
    const end = new Date();
    end.setDate(end.getDate() + 7);
    setEndDate(localDateInput(end));
  }

  async function changeGoal(goal, update) {
    setError('');
    setNotice('');
    try {
      const response = await externalApi.call(`/vendor/goals/${goal.id}`, { method: 'PATCH', body: update });
      if (!response?.ok) throw new Error(response?.message || response?.error || 'Goal could not be updated.');
      setNotice(update.status === 'COMPLETED' ? 'Goal marked complete.' : update.status === 'PAUSED' ? 'Goal paused.' : 'Goal resumed.');
      await loadGoals();
    } catch (err) {
      setError(err.message || 'Goal could not be updated.');
    }
  }

  async function removeGoal(goal) {
    setError('');
    setNotice('');
    try {
      const response = await externalApi.call(`/vendor/goals/${goal.id}`, { method: 'DELETE' });
      if (!response?.ok) throw new Error(response?.error || 'Goal could not be removed.');
      setNotice('Goal removed from your active list.');
      await loadGoals();
    } catch (err) {
      setError(err.message || 'Goal could not be removed.');
    }
  }

  const activeCount = goals.filter((goal) => goal.status === 'ACTIVE').length;

  return (
    <section aria-labelledby="vendor-goals-title" className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="vendor-goals-title" className="font-extrabold text-base text-navy">Business goals</h2>
          <p className="text-[11px] text-muted mt-1">Set up to three active goals. Progress comes from saved platform records; no baseline is assumed.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0"><button type="button" onClick={loadGoals} disabled={loading} className="rounded-lg border border-gray-200 px-2.5 py-1 text-[10px] font-bold text-navy disabled:opacity-50">Refresh progress</button><span className="text-[10px] font-bold rounded-full bg-lavender px-2.5 py-1 text-navy">{activeCount}/3 active</span></div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}
      {loading ? <p role="status" className="text-xs text-muted">Loading saved goals…</p> : goals.length > 0 ? (
        <ul className="grid lg:grid-cols-2 gap-3">
          {goals.map((goal) => (
            <li key={goal.id} className="rounded-2xl border border-gray-100 p-4 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-navy break-words">{goal.name}</h3>
                  <p className="text-[10px] text-muted mt-1">{GOAL_METRICS[goal.metric] || 'Business metric'} · {goal.periodStart} to {goal.periodEnd}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-extrabold ${goal.status === 'ACTIVE' ? 'bg-sky-50 text-sky-700' : goal.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{goal.status.toLowerCase()}</span>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2 text-xs">
                <span className="text-muted">Progress</span>
                <strong className="text-navy">{goal.metricAvailable ? `${goal.currentValue} / ${goal.targetValue}` : 'Progress unavailable'}</strong>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label={`${goal.name} progress`} aria-valuemin={0} aria-valuemax={goal.targetValue} aria-valuenow={goal.metricAvailable ? Math.min(goal.currentValue, goal.targetValue) : undefined} aria-valuetext={goal.metricAvailable ? `${goal.currentValue} of ${goal.targetValue}` : 'Progress unavailable'}>
                <div className={`h-full rounded-full transition-all ${goal.metricAvailable ? 'bg-primary' : 'bg-gray-300'}`} style={{ width: `${goal.progressPercent ?? 0}%` }} />
              </div>
              {!goal.metricAvailable && <p role="status" className="mt-1 text-[10px] text-amber-800">Progress could not be measured from the source records. No zero value is substituted.</p>}
              <p className="mt-1 text-[9px] text-muted">Measured {new Date(goal.measuredAt).toLocaleTimeString()}</p>
              {goal.targetReached && goal.status === 'ACTIVE' && <p className="mt-2 text-[10px] font-semibold text-emerald-700">Target reached. Mark complete when you’re ready.</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {goal.status !== 'COMPLETED' && <button type="button" onClick={() => editGoal(goal)} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[10px] font-bold text-navy hover:bg-gray-50">Edit</button>}
                {goal.status === 'ACTIVE' && <button type="button" onClick={() => changeGoal(goal, { status: goal.targetReached ? 'COMPLETED' : 'PAUSED' })} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[10px] font-bold text-navy hover:bg-gray-50">{goal.targetReached ? 'Mark complete' : 'Pause'}</button>}
                {goal.status === 'PAUSED' && <button type="button" onClick={() => changeGoal(goal, { status: 'ACTIVE' })} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[10px] font-bold text-navy hover:bg-gray-50">Resume</button>}
                <button type="button" onClick={() => { if (window.confirm(`Remove “${goal.name}” from your goal list?`)) removeGoal(goal); }} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[10px] font-bold text-rose-700 hover:bg-rose-50">Remove</button>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-xl bg-lavender/40 p-3 text-xs text-muted">No goals yet. Add a measurable goal below when you’re ready.</p>}

      {(editingId || activeCount < 3) && (
        <form onSubmit={createGoal} className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3 border-t border-gray-100 pt-4">
          <h3 className="sm:col-span-2 xl:col-span-5 text-xs font-bold text-navy">{editingId ? 'Edit goal' : 'Add a business goal'}</h3>
          <p className="sm:col-span-2 xl:col-span-5 -mt-2 text-[10px] text-muted">Goal dates are interpreted as UTC calendar dates. Periods can be up to one year.</p>
          <label className="text-[10px] font-semibold text-muted sm:col-span-2 xl:col-span-1">Goal name<input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-navy" placeholder="e.g. Submit more quotes" /></label>
          <label className="text-[10px] font-semibold text-muted">Metric<select value={metric} onChange={(event) => setMetric(event.target.value)} className="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-navy">{Object.entries(GOAL_METRICS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-[10px] font-semibold text-muted">Target<input required type="number" min="1" max="1000000" step="1" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-navy" /></label>
          <label className="text-[10px] font-semibold text-muted">Start date<input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-navy" /></label>
          <label className="text-[10px] font-semibold text-muted">End date<input required type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-navy" /></label>
          <div className="sm:col-span-2 xl:col-span-5 flex gap-2"><button type="submit" disabled={saving} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary-dark disabled:opacity-60">{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add goal'}</button>{editingId && <button type="button" onClick={cancelGoalEdit} className="rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-bold text-navy">Cancel</button>}</div>
        </form>
      )}
    </section>
  );
}

export default function DashboardHome({ business = 'Your Brand', onAskAura }) {
  const { user } = useExternalAuth();
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
  const [unreadMessageThreadCount, setUnreadMessageThreadCount] = useState(null);
  const [unreadMessageActionItems, setUnreadMessageActionItems] = useState(null);
  const [activation, setActivation] = useState(null);
  const [vendorProfile, setVendorProfile] = useState(null);
  const [googleRating, setGoogleRating] = useState(null);
  const [gotItAcknowledged, setGotItAcknowledged] = useState(() => localStorage.getItem('vendorOnboardingDismissed') === 'true');
  const [loading, setLoading] = useState(true);
  const [failedDashboardSources, setFailedDashboardSources] = useState([]);
  const [enquiriesAccessBlocked, setEnquiriesAccessBlocked] = useState(false);
  const [financialTruth, setFinancialTruth] = useState(null);
  const [vendorRecommendations, setVendorRecommendations] = useState([]);

  const loadLiveDashboard = useCallback(async () => {
    const requestSequence = ++dashboardRequestSequence.current;
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
        notifRes,
        financeRes,
        badgeRes,
        recommendationsRes
      ] = await Promise.all([
        externalApi.call('/vendor/activation-status').catch(() => ({ ok: false })),
        externalApi.call('/vendor/profile').catch(() => ({ ok: false })),
        externalApi.call('/vendor/opportunities').catch((error) => ({ ok: false, errorCode: error?.data?.error, message: error?.message })),
        externalApi.call('/quotes').catch(() => ({ ok: false })),
        externalApi.call('/vendor/bookings').catch(() => ({ ok: false })),
        externalApi.call('/vendor/availability/blockouts').catch(() => ({ ok: false })),
        externalApi.call('/vendor/services').catch(() => ({ ok: false })),
        externalApi.call('/vendor/reviews').catch(() => ({ ok: false })),
        externalApi.call('/vendor/notifications').catch(() => ({ ok: false })),
        externalApi.call('/vendor/financial-truth').catch(() => ({ ok: false })),
        externalApi.call('/vendor/badge-counts').catch(() => ({ ok: false })),
        externalApi.call('/vendor/intelligence/recommendations').catch(() => ({ ok: false })),
      ]);
      // Polling, focus and manual retries can overlap; only apply the newest snapshot.
      if (requestSequence !== dashboardRequestSequence.current) return;

      const accessBlocked = oppsRes?.errorCode === 'ACTIVATION_REQUIRED';
      setEnquiriesAccessBlocked(accessBlocked);
      const failedSources = [
        !actRes?.ok && 'activation status',
        !profRes?.ok && 'business profile',
        !accessBlocked && !(oppsRes?.ok && Array.isArray(oppsRes.opportunities)) && 'enquiries',
        !(quotesRes?.ok && Array.isArray(quotesRes.quotes)) && 'quotes',
        !(bkRes?.ok && Array.isArray(bkRes.bookings)) && 'bookings',
        !(blRes?.ok && Array.isArray(blRes.blockouts)) && 'availability',
        !(svcRes?.ok && Array.isArray(svcRes.services)) && 'services',
        !(revRes?.ok && Array.isArray(revRes.reviews)) && 'reviews',
        !(notifRes?.ok && Array.isArray(notifRes.notifications)) && 'notifications',
        !(financeRes?.ok && financeRes.financialTruth?.metrics) && 'financial data',
        !(badgeRes?.ok && Number.isFinite(Number(badgeRes.messagesCount)) && Array.isArray(badgeRes.messageActionItems)) && 'message counts',
        !(recommendationsRes?.ok && Array.isArray(recommendationsRes.recommendations)) && 'recommendations',
      ].filter(Boolean);
      setFailedDashboardSources(failedSources);
      if (failedSources.length === 0) setLastCompleteDashboardRefreshAt(new Date());
      if (financeRes?.ok && financeRes.financialTruth?.metrics) setFinancialTruth(financeRes.financialTruth);
      setUnreadMessageThreadCount(badgeRes?.ok && Number.isFinite(Number(badgeRes.messagesCount)) ? Number(badgeRes.messagesCount) : null);
      setUnreadMessageActionItems(badgeRes?.ok && Array.isArray(badgeRes.messageActionItems) ? badgeRes.messageActionItems : null);
      setVendorRecommendations(recommendationsRes?.ok && Array.isArray(recommendationsRes.recommendations) ? recommendationsRes.recommendations : []);

      // 0. Activation & Profile
      if (actRes?.ok && actRes.status) {
        setActivation(actRes.status);
      }
      if (profRes?.ok && profRes.vendor) {
        setVendorProfile(profRes.vendor);
        if (profRes.googleRating) setGoogleRating(profRes.googleRating);
      }
      if (revRes?.ok && revRes.googleRating) {
        setGoogleRating(revRes.googleRating);
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

          const customerName = o.customer?.fullName || o.customerName || (o.customer?.email ? o.customer.email.split('@')[0] : 'Customer Enquiry');
          const eventType = o.eventType || o.eventName || 'Event Enquiry';

          return {
            id: o._id,
            opportunityId: o._id,
            createdAt: o.createdAt,
            customerId: o.customer?._id || o.customer,
            customerName,
            eventType,
            serviceId: o.vendorService,
            serviceName: o.serviceName || 'Requested Package',
            title: `👤 ${customerName} · ${eventType}`,
            meta: `📅 ${o.eventDate || 'Date flexible'} · 📍 ${locStr}`,
            chips: [
              o.guestCount ? `👥 ${o.guestCount} guests` : null,
              o.requiredCapability || null,
            ].filter(Boolean),
            status: o.status === 'NEW' ? 'New' : o.status || 'Active',
            declineReason: o.declineReason || '',
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
          opportunityId: q.opportunity?._id || q.opportunity,
          createdAt: q.createdAt,
          history: q.history,
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
          opportunityId: b.opportunityId,
          createdAt: b.createdAt,
          bookingStatus: b.bookingStatus,
          executionStatus: b.executionStatus,
          bookingReference: b.bookingReference,
          title: `${b.serviceName || 'Event'} (${b.customerName || 'Client'})`,
          serviceName: b.serviceName,
          customerName: b.customerName,
          meta: `${b.eventDate || 'Upcoming'} · ${b.serviceLocation?.locality || b.serviceLocation?.city || 'Venue'} · ₹${(b.totalAmount || 0).toLocaleString()}`,
          eventDate: b.eventDate,
          date: b.eventDate,
          totalAmount: b.totalAmount || 0,
          advancePaid: b.paymentStatus === 'PAYMENT_VERIFIED' ? Number(b.paymentSummary?.paidAmount || 0) : 0,
          balanceAmount: Number(b.paymentSummary?.balanceAmount ?? Math.max(0, Number(b.totalAmount || 0) - Number(b.paymentSummary?.paidAmount || 0))),
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
      if (requestSequence !== dashboardRequestSequence.current) return;
      console.warn('[DashboardHome] Load error:', err.message);
    } finally {
      if (requestSequence === dashboardRequestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLiveDashboard();
    const timer = setInterval(loadLiveDashboard, 30000);
    window.addEventListener('focus', loadLiveDashboard);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', loadLiveDashboard);
      dashboardRequestSequence.current += 1;
    };
  }, [loadLiveDashboard]);

  async function handleSendQuote(q, enquiry) {
    try {
      if (!enquiry?.opportunityId) throw new Error('This enquiry is missing its record link. Refresh the dashboard and try again.');
      await externalApi.call('/quotes', {
        method: 'POST',
        body: buildDashboardQuotePayload(q, enquiry),
      });
      await loadLiveDashboard();
    } catch (err) {
      console.error('[DashboardHome] Quote submit error:', err);
      throw new Error(err?.data?.message || err?.message || 'The quote could not be saved. Check your connection and try again.');
    }
  }

  async function handleQuoteAction(q) {
    if (q.status === 'Draft' || q.status === 'DRAFT') {
      try {
        setDashboardActionFeedback(null);
        await externalApi.call(`/quotes/${q._id}/transition`, {
          method: 'POST',
          body: {
            targetStatus: 'SUBMITTED',
            reason: 'Submitted via Vendor Command Center table action',
          },
        });
        await loadLiveDashboard();
        setDashboardActionFeedback({ kind: 'success', message: 'Quote submitted. The customer can now review it.' });
      } catch (err) {
        console.error('[DashboardHome] Transition quote error:', err);
        setDashboardActionFeedback({ kind: 'error', message: err?.data?.message || err?.message || 'The quote could not be submitted. Retry after checking your connection.' });
      }
    }
  }

  async function handleMarkNotificationRead(id) {
    try {
      setDashboardActionFeedback(null);
      await externalApi.call(`/vendor/notifications/${id}/read`, { method: 'PUT' });
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      setUnreadNotifCount((prev) => Math.max(0, prev - 1));
      setDashboardActionFeedback({ kind: 'success', message: 'Notification marked as read.' });
    } catch (err) {
      console.error('Failed to mark read:', err);
      setDashboardActionFeedback({ kind: 'error', message: err?.data?.message || err?.message || 'The notification could not be marked as read. Retry.' });
    }
  }

  async function handleMarkAllNotificationsRead() {
    try {
      setDashboardActionFeedback(null);
      await externalApi.call('/vendor/notifications/read-all', { method: 'PUT' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadNotifCount(0);
      setDashboardActionFeedback({ kind: 'success', message: 'All notifications are marked as read.' });
    } catch (err) {
      console.error('Failed to mark all read:', err);
      setDashboardActionFeedback({ kind: 'error', message: err?.data?.message || err?.message || 'Notifications could not be marked as read. Retry.' });
    }
  }

  // Live profile completion calculations
  const activationPresentation = getVendorActivationPresentation(activation, failedDashboardSources.includes('activation status'));
  const completionPercentage = activationPresentation.completionPercentage ?? 0;
  const activationStatusUnavailable = !activationPresentation.available;
  const isMatchingEligible = activationPresentation.matchingEligible;
  const dashboardFreshness = getDashboardFreshness(lastCompleteDashboardRefreshAt);

  const checklist = activation?.checklist || {
    profile: false,
    services: false,
    capabilities: false,
    coverage: false,
    portfolio: false,
    documents: false,
  };

  const isDocVerified = Boolean(checklist.verified);
  const completedStepsCount = VENDOR_SETUP_STEPS.filter(step => step.done(checklist)).length;

  // Real KPI calculations
  const confirmedBookings = bookings.filter((booking) => booking.bookingStatus === 'CONFIRMED');
  const todayDateOnly = localDateInput(new Date());
  const upcomingConfirmedBookings = confirmedBookings.filter((booking) => typeof booking.eventDate === 'string' && booking.eventDate.slice(0, 10) >= todayDateOnly);
  const advanceReceived = confirmedBookings.reduce((sum, b) => sum + (Number(b.advancePaid) || 0), 0);
  const confirmedBookingValue = confirmedBookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
  const activeEnquiriesCount = enquiries.filter((e) => e.status === 'New' || e.status === 'NEW').length;
  const hasStarvntReviews = (reviewStats?.totalReviews || 0) > 0;
  const avgRatingDisplay = hasStarvntReviews && reviewStats.averageRating !== '0.0'
    ? `${reviewStats.averageRating}`
    : googleRating?.rating
    ? `${googleRating.rating}`
    : '—';

  const ratingFoot = hasStarvntReviews
    ? `${reviewStats?.totalReviews} verified client reviews`
    : googleRating?.rating
    ? `${googleRating.reviewCount || 0} reviews on Google Maps`
    : '0 verified client reviews';

  const dynamicStats = [
    {
      label: 'Verified Advance Received',
      value: failedDashboardSources.includes('bookings') ? '—' : `₹${advanceReceived.toLocaleString()}`,
      foot: failedDashboardSources.includes('bookings') ? 'Payment data unavailable' : confirmedBookingValue > 0 ? `On ₹${confirmedBookingValue.toLocaleString()} confirmed booking value` : 'No confirmed booking value yet',
      footClass: advanceReceived > 0 ? 'text-emerald-600' : 'text-muted',
      icon: 'wallet',
      iconBg: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Upcoming Confirmed Bookings',
      value: failedDashboardSources.includes('bookings') ? '—' : upcomingConfirmedBookings.length,
      foot: failedDashboardSources.includes('bookings') ? 'Booking data unavailable' : upcomingConfirmedBookings[0] ? `Next: ${upcomingConfirmedBookings[0].eventDate}` : 'No upcoming confirmed bookings',
      footClass: upcomingConfirmedBookings.length > 0 ? 'text-sky-600' : 'text-muted',
      icon: 'bookings',
      iconBg: 'bg-sky-50 text-sky-600',
    },
    {
      label: 'Inbound Enquiries',
      value: enquiriesAccessBlocked || failedDashboardSources.includes('enquiries') ? '—' : enquiries.length,
      foot: enquiriesAccessBlocked ? 'Activation approval required to access enquiries' : failedDashboardSources.includes('enquiries') ? 'Enquiry data unavailable' : activeEnquiriesCount > 0 ? `${activeEnquiriesCount} new leads require reply` : 'Matched opportunities',
      footClass: activeEnquiriesCount > 0 ? 'text-primary' : 'text-muted',
      icon: 'message',
      iconBg: 'bg-primary-soft text-primary',
    },
    {
      label: googleRating?.rating && !hasStarvntReviews ? 'Google Maps Rating' : 'Client Rating',
      value: failedDashboardSources.includes('reviews') ? '—' : avgRatingDisplay,
      foot: failedDashboardSources.includes('reviews') ? 'Review data unavailable' : ratingFoot,
      footClass: (hasStarvntReviews || googleRating?.rating) ? 'text-amber-500 font-bold' : 'text-muted',
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
      badge: unreadMessageThreadCount > 0 ? String(unreadMessageThreadCount) : null,
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

  if (loading && !activation) {
    return <VendorDashboardSkeleton business={business} />;
  }

  return (
    <div className="p-3 sm:p-5 lg:p-6 w-full max-w-[1600px] mx-auto min-w-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
      <div className="col-span-full"><ProfileStatus /></div>
      {failedDashboardSources.length > 0 && (
        <div role="status" className="col-span-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-3">
          <span>Some dashboard information could not be loaded: {failedDashboardSources.join(', ')}. Values that depend on those sources may be unavailable.</span>
          <button type="button" onClick={loadLiveDashboard} className="font-bold underline underline-offset-2">Retry</button>
        </div>
      )}
      {dashboardActionFeedback && (
        <div role={dashboardActionFeedback.kind === 'error' ? 'alert' : 'status'} className={`col-span-full rounded-2xl border px-4 py-3 text-xs flex items-center justify-between gap-3 ${dashboardActionFeedback.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
          <span>{dashboardActionFeedback.message}</span>
          <button type="button" onClick={() => setDashboardActionFeedback(null)} className="font-bold underline underline-offset-2">Dismiss</button>
        </div>
      )}
      {/* Main Operations Stream */}
      <div className="space-y-6 min-w-0 w-full">

        {/* Executive Welcome Banner */}
        <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-xs border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            {vendorProfile?.profilePicUrl || user?.avatarUrl ? (
              <img
                src={vendorProfile?.profilePicUrl || user?.avatarUrl}
                alt="Profile"
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl object-cover shrink-0 shadow-md border border-gray-100"
              />
            ) : (
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white font-extrabold text-base sm:text-lg grid place-items-center shadow-md shadow-primary/20 shrink-0">
                {(business || 'B')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-xl md:text-2xl font-extrabold text-navy tracking-tight truncate max-w-full sm:max-w-md">
                  Welcome, {business}!
                </h1>
                {activationStatusUnavailable ? (
                  <span role="status" className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-extrabold bg-gray-100 text-gray-700 border border-gray-200 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-gray-500" />
                    Profile status unavailable
                  </span>
                ) : isMatchingEligible ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Live & Matchable
                  </span>
                ) : completionPercentage === 100 ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-extrabold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Profile setup 100% · {activation?.activationState?.replaceAll('_', ' ') || 'Status unavailable'}
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
                <span>·</span>
                <span role="status" className={dashboardFreshness.state === 'stale' ? 'text-amber-700 font-semibold' : ''}>{dashboardFreshness.label}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            <Link
              to="/vendor/profile"
              className="px-3 py-2 rounded-xl bg-lavender hover:bg-gray-200/70 text-navy text-xs font-bold transition flex items-center gap-1.5 shrink-0"
            >
              <Icon name="profile" size={14} />
              <span>Storefront</span>
            </Link>
            <Link
              to="/vendor/availability"
              className="px-3 py-2 rounded-xl bg-lavender hover:bg-gray-200/70 text-navy text-xs font-bold transition flex items-center gap-1.5 shrink-0"
            >
              <Icon name="calendar" size={14} />
              <span>Calendar</span>
            </Link>
          </div>
        </div>

        {/* Aura+ assistant */}
        {onAskAura && <AskAuraCard onAsk={onAskAura} />}

        <ActionCenter
          enquiries={enquiries}
          quotes={quotes}
          bookings={bookings}
          reviews={reviews}
          messagesCount={unreadMessageThreadCount}
          messageThreads={unreadMessageActionItems}
          failedSources={failedDashboardSources}
          today={localDateInput(new Date())}
          profileNeedsCompletion={Number.isFinite(Number(activation?.completionPercentage)) && Number(activation.completionPercentage) < 100}
        />

        {/* 6-STEP MANDATORY ONBOARDING READINESS */}
        {!activationStatusUnavailable && (!isMatchingEligible || !gotItAcknowledged) && (
          <div className={`rounded-3xl p-5 sm:p-6 border transition shadow-sm ${
            isMatchingEligible
              ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50'
              : 'bg-gradient-to-br from-purple-50/70 via-white to-amber-50/40 dark:from-[#1e1b2e] dark:via-[#161926] dark:to-[#1e1f2b] border-primary/25 dark:border-primary/40'
          }`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className={`text-[10px] uppercase tracking-wider font-extrabold px-3 py-1 rounded-full border shadow-2xs ${
                    isMatchingEligible
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60'
                      : completionPercentage === 0
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300 border-rose-300 dark:border-rose-700/60'
                      : 'bg-amber-100 text-amber-900 dark:bg-amber-500/25 dark:text-amber-300 border-amber-300/80 dark:border-amber-500/40'
                  }`}>
                    {isMatchingEligible
                      ? 'Activation approved'
                      : completionPercentage === 0
                      ? 'Action Required: Initial Setup (0% Completed)'
                      : completionPercentage === 100 ? `PROFILE COMPLETE · ${activation?.activationState?.replaceAll('_', ' ') || 'STATUS UNAVAILABLE'}` : `ONBOARDING IN PROGRESS (${completionPercentage}% COMPLETED)`}
                  </span>
                  <span className="text-xs font-extrabold text-navy dark:text-white">
                    {isMatchingEligible ? 'Ready for Bookings' : `${completedStepsCount} of 6 Steps Configured`}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-extrabold text-navy dark:text-white tracking-tight mt-1">
                  {isMatchingEligible
                    ? 'Profile 100% Complete — Your Brand is Active and Matchable'
                    : completionPercentage === 100
                    ? 'Operating profile complete — review your activation status above'
                    : completionPercentage === 0
                    ? 'Welcome! Complete your operating profile for activation review'
                    : 'Complete Your Operating Profile & Documents to Unlock Client Enquiries'}
                </h2>
                <p className="text-xs text-muted dark:text-slate-300 max-w-2xl leading-relaxed">
                  {isMatchingEligible
                    ? 'Your operating profile and verification are complete, and activation has been approved. Matching also checks availability and service eligibility.'
                    : 'STARVNT requires profile completion, verification and an authorised activation approval before matching clients with your brand. Complete each section below: brand & city, services & pricing, gear capability, service coverage, operating availability, portfolio projects, and separate identity/bank verification.'}
                </p>
              </div>

              <div className="flex items-center gap-2 self-start lg:self-center shrink-0 flex-wrap">
                {!isMatchingEligible && (
                  <Link
                    to={
                      !checklist.profile
                        ? '/vendor/profile'
                        : !checklist.services
                        ? '/vendor/services'
                        : !checklist.capabilities
                        ? '/vendor/services'
                        : !checklist.coverage
                        ? '/vendor/availability'
                        : !checklist.portfolio
                        ? '/vendor/portfolio'
                        : '/vendor/profile?tab=documents'
                    }
                    className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold px-3.5 sm:px-4 py-2.5 shadow-md shadow-primary/25 transition inline-flex items-center gap-1.5"
                  >
                    <Icon name="edit" size={13} />
                    <span>Complete Details</span>
                  </Link>
                )}
                  <button
                    onClick={() => {
                      setGotItAcknowledged(true);
                      if (isMatchingEligible) localStorage.setItem('vendorOnboardingDismissed', 'true');
                    }}
                    className={`rounded-xl text-xs font-bold px-3.5 sm:px-4 py-2.5 transition border ${
                    isMatchingEligible
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-sm'
                      : 'bg-white hover:bg-lavender text-navy border-gray-200'
                  }`}
                >
                  {isMatchingEligible ? 'Dismiss' : 'Got it'}
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-muted">
                  Overall Completion Progress ({completedStepsCount} of 6 steps completed)
                </span>
                <span className={isMatchingEligible ? 'text-emerald-600 font-extrabold' : completionPercentage === 0 ? 'text-muted font-bold' : 'text-primary font-extrabold'}>
                  {completionPercentage}% / 100%
                </span>
              </div>
              <div className="w-full bg-gray-200/80 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isMatchingEligible
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

              {/* Six operational milestones and separate verification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3.5 pt-3">

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
                      {checklist.profile ? `${vendorProfile?.businessName || 'Brand'} · ${vendorProfile?.city || vendorProfile?.location || 'City'}` : 'Configure company name, category, and base city.'}
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-gray-100">
                    <Link
                      to="/vendor/profile"
                      className={`text-xs font-bold hover:underline inline-flex items-center gap-1 max-w-full truncate ${
                        checklist.profile ? 'text-emerald-700' : 'text-primary'
                      }`}
                    >
                      <span className="truncate">{checklist.profile ? 'Edit Profile' : 'Add Details'}</span>
                      <Icon name="chevronRight" size={12} className="shrink-0" />
                    </Link>
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
                      {failedDashboardSources.includes('services') ? 'Service details unavailable. Retry the dashboard.' : checklist.services ? `${services.length} active service(s) configured` : 'Define service packages, deliverables, and base rates.'}
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-gray-100">
                    <Link
                      to="/vendor/services"
                      className={`text-xs font-bold hover:underline inline-flex items-center gap-1 max-w-full truncate ${
                        checklist.services ? 'text-emerald-700' : 'text-primary'
                      }`}
                    >
                      <span className="truncate">{checklist.services ? 'Manage Services' : 'Add Service'}</span>
                      <Icon name="chevronRight" size={12} className="shrink-0" />
                    </Link>
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
                      {checklist.capabilities ? 'Equipment & crew capacity declared' : 'Declare equipment, crew capacity, and event formats.'}
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-gray-100">
                    <Link
                      to={checklist.capabilities ? "/vendor/services" : "/vendor/services?action=gear"}
                      className={`text-xs font-bold hover:underline inline-flex items-center gap-1 max-w-full truncate ${
                        checklist.capabilities ? 'text-emerald-700' : 'text-primary'
                      }`}
                    >
                      <span className="truncate">{checklist.capabilities ? 'View Gear' : 'Configure Gear'}</span>
                      <Icon name="chevronRight" size={12} className="shrink-0" />
                    </Link>
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
                    <Link
                      to="/vendor/services?action=coverage"
                      className={`text-xs font-bold hover:underline inline-flex items-center gap-1 max-w-full truncate ${
                        checklist.coverage ? 'text-emerald-700' : 'text-primary'
                      }`}
                    >
                      <span className="truncate">{checklist.coverage ? 'Coverage & Transit' : 'Set Radius & Transit'}</span>
                      <Icon name="chevronRight" size={12} className="shrink-0" />
                    </Link>
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
                    <Link
                      to="/vendor/portfolio"
                      className={`text-xs font-bold hover:underline inline-flex items-center gap-1 max-w-full truncate ${
                        checklist.portfolio ? 'text-emerald-700' : 'text-primary'
                      }`}
                    >
                      <span className="truncate">{checklist.portfolio ? 'View Portfolio' : 'Add Project'}</span>
                      <Icon name="chevronRight" size={12} className="shrink-0" />
                    </Link>
                  </div>
                </div>

                {/* Operational step 6, counted by Core separately from verification. */}
                <div className="p-4 rounded-2xl border border-gray-200 bg-white text-navy shadow-xs flex flex-col justify-between">
                  <div><div className="flex items-center justify-between mb-2"><span className="text-[10px] font-extrabold uppercase text-muted">Step 6</span><span className="text-[11px] font-bold">{checklist.availability ? 'Done' : 'Pending'}</span></div><div className="font-extrabold text-xs">6. Operating Availability</div><p className="text-[11px] text-muted mt-1">Set your working days and hours. Event conflicts use dated bookings and blockouts.</p></div>
                  <Link to="/vendor/availability" className="text-xs font-bold text-primary mt-3">{checklist.availability ? 'View Availability' : 'Set Availability'} →</Link>
                </div>
                {/* Identity and bank verification do not count toward profile percentage. */}
                <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between min-w-0 ${
                  isDocVerified
                    ? 'border-emerald-200 bg-emerald-50/50 text-emerald-900'
                    : 'border-gray-200 bg-white text-navy shadow-xs'
                }`}>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Verification</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0 ${
                        isDocVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-muted'
                      }`}>
                        <Icon name={isDocVerified ? "check" : "documents"} size={11} strokeWidth={2.2} />
                        <span>{isDocVerified ? 'Done' : 'Pending'}</span>
                      </span>
                    </div>
                    <div className="font-extrabold text-xs text-navy truncate">Document & KYC</div>
                    <p className="text-[11px] text-muted mt-1 leading-snug break-words">
                      {isDocVerified ? 'Identity and bank account verified' : 'Verify your identity and bank account. Add GST details if registered.'}
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-gray-100">
                    <Link
                      to="/vendor/profile?tab=documents"
                      className={`text-xs font-bold hover:underline inline-flex items-center gap-1 max-w-full truncate ${
                        isDocVerified ? 'text-emerald-700' : 'text-primary'
                      }`}
                    >
                      <span className="truncate">{isDocVerified ? 'Manage Documents' : 'Verify Documents'}</span>
                      <Icon name="chevronRight" size={12} className="shrink-0" />
                    </Link>
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

        <FinancialClarity financialTruth={financialTruth} available={!failedDashboardSources.includes('financial data')} />
        <ServiceQualitySummary reviews={reviews} stats={reviewStats} available={!failedDashboardSources.includes('reviews')} />
        <OperatingReadiness activation={activation} available={!failedDashboardSources.includes('activation status')} />
        <WeeklyPerformanceReview
          enquiries={enquiries}
          quotes={quotes}
          bookings={bookings}
          reviews={reviews}
          availability={{
            enquiries: !enquiriesAccessBlocked && !failedDashboardSources.includes('enquiries'),
            submittedQuotes: !failedDashboardSources.includes('quotes'),
            confirmedBookings: !failedDashboardSources.includes('bookings'),
            publishedReviews: !failedDashboardSources.includes('reviews'),
          }}
        />

        {/* 2-Column Section: Recent Enquiries & Upcoming Bookings */}
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 min-w-0">

          {/* Recent Enquiries / Matching Leads */}
          <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100 flex flex-col justify-between min-w-0">
            <div>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-primary-soft text-primary grid place-items-center shrink-0">
                    <Icon name="message" size={15} />
                  </div>
                  <h2 className="font-extrabold text-base text-navy">Recent Enquiries</h2>
                  {enquiries.length > 0 && (
                    <span className="text-[10px] font-extrabold bg-primary-soft text-primary px-2 py-0.5 rounded-full shrink-0">
                      {enquiries.length}
                    </span>
                  )}
                </div>
                <Link to="/vendor/enquiries" className="text-xs font-bold text-primary hover:underline shrink-0">
                  View all leads →
                </Link>
              </div>

              <div className="space-y-3 min-w-0">
                {enquiries.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className="flex gap-3.5 border border-gray-100 rounded-2xl p-3.5 hover:shadow-xs hover:border-gray-200 transition bg-white min-w-0"
                  >
                    <div className="w-12 h-12 rounded-xl bg-lavender text-primary grid place-items-center font-bold text-sm shrink-0">
                      <Icon name="message" size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                        <span className="font-bold text-sm text-navy truncate">{e.title}</span>
                        <span className="text-[10px] text-muted whitespace-nowrap shrink-0">{e.ago}</span>
                      </div>
                      <div className="text-[11px] text-muted truncate mt-0.5">{e.meta}</div>
                      {e.serviceName && (
                        <div className="text-[10px] font-bold text-primary bg-primary-soft/70 px-2 py-0.5 rounded-md inline-block mt-1 truncate max-w-full">
                          Package: {e.serviceName}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 mt-2 pt-1 border-t border-gray-50 flex-wrap sm:flex-nowrap">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          {e.chips.slice(0, 2).map((c) => (
                            <span key={c} className="text-[9px] bg-lavender rounded-md px-2 py-0.5 text-muted font-semibold truncate max-w-[110px]">
                              {c}
                            </span>
                          ))}
                          <StatusChip status={e.status} />
                        </div>
                        {['DECLINED', 'EXPIRED', 'CANCELLED', 'CLOSED'].includes(String(e.status).toUpperCase()) ? (
                          <span className="text-xs font-semibold text-muted shrink-0 ml-auto" aria-label="This enquiry is closed; no response is available">Closed</span>
                        ) : (
                          <button
                            onClick={() => setSelectedEnquiry(e)}
                            className="text-xs font-bold text-primary hover:underline shrink-0 ml-auto cursor-pointer"
                          >
                            {['Responded', 'RESPONDED', 'Submitted', 'SUBMITTED', 'APPROVED'].includes(e.status) ? '✓ View Offer →' : 'Respond →'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {enquiriesAccessBlocked ? (
                  <p role="status" className="py-6 text-center text-xs text-amber-800">{activationStatusUnavailable ? 'Activation status is unavailable, so the dashboard cannot confirm enquiry access. Retry the dashboard data.' : 'Enquiries are locked until authorized activation approval. Complete the listed setup and verification steps above.'}</p>
                ) : failedDashboardSources.includes('enquiries') ? (
                  <p role="status" className="py-6 text-center text-xs text-amber-800">Enquiry data is unavailable. Retry the dashboard.</p>
                ) : enquiries.length === 0 && (
                  <div className="py-8 text-center px-4">
                    {activationStatusUnavailable ? (
                      <div role="status" className="p-4 rounded-2xl bg-gray-50 border border-gray-200 text-xs text-gray-700 space-y-2 text-left">
                        <div className="font-extrabold">Activation status unavailable</div>
                        <p className="text-[11px] leading-relaxed">The dashboard could not confirm whether enquiries are unlocked. Retry the dashboard before changing your setup.</p>
                        <button type="button" onClick={loadLiveDashboard} className="text-xs font-bold text-primary underline">Retry dashboard data</button>
                      </div>
                    ) : !isMatchingEligible ? (
                      <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-2 text-left">
                        <div className="font-extrabold flex items-center gap-1.5 text-amber-950">
                          <Icon name="lock" size={14} className="text-amber-800 shrink-0" />
                          <span>Inbound Enquiries Locked (Profile {completionPercentage}%)</span>
                        </div>
                        <p className="text-[11px] text-amber-800 leading-relaxed">
                          Customer matching requires a complete operating profile, identity and bank verification, and an authorised activation approval. Review your current status above for the next step.
                        </p>
                        <Link
                          to={completionPercentage === 100 ? '/vendor/profile?tab=documents' : !checklist.profile ? '/vendor/profile' : '/vendor/services'}
                          className="inline-block text-xs font-bold text-primary underline"
                        >
                          Finish onboarding setup →
                        </Link>
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
          <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100 flex flex-col justify-between min-w-0">
            <div>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-sky-50 text-sky-600 grid place-items-center shrink-0">
                    <Icon name="bookings" size={15} />
                  </div>
                  <h2 className="font-extrabold text-base text-navy">Upcoming Bookings</h2>
                  {upcomingConfirmedBookings.length > 0 && (
                    <span className="text-[10px] font-extrabold bg-sky-50 text-sky-600 px-2 py-0.5 rounded-full shrink-0">
                      {upcomingConfirmedBookings.length}
                    </span>
                  )}
                </div>
                <Link to="/vendor/bookings" className="text-xs font-bold text-primary hover:underline shrink-0">
                  View all bookings →
                </Link>
              </div>

              <div className="space-y-3 min-w-0">
                {upcomingConfirmedBookings.slice(0, 3).map((b) => (
                  <div
                    key={b.id}
                    className="flex gap-3.5 items-center border border-gray-100 rounded-2xl p-3.5 hover:shadow-xs hover:border-gray-200 transition bg-white min-w-0"
                  >
                    <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 grid place-items-center font-bold text-xs shrink-0">
                      <Icon name="bookings" size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                        <span className="font-bold text-sm text-navy truncate">{b.title}</span>
                        <StatusChip status={b.status} />
                      </div>
                      <div className="text-[11px] text-muted truncate mt-0.5">{b.meta}</div>
                      <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                        <span className={`text-[10px] font-bold truncate ${b.paymentStatus === 'PAYMENT_VERIFIED' ? 'text-emerald-600' : 'text-muted'}`}>
                          {b.paymentStatus === 'PAYMENT_VERIFIED' ? 'Payment verified' : 'Payment not verified'}
                        </span>
                        <Link to="/vendor/bookings" className="text-xs font-bold text-primary hover:underline shrink-0 ml-auto">
                          View Details →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}

                {failedDashboardSources.includes('bookings') ? (
                  <p role="status" className="py-6 text-center text-xs text-amber-800">Booking data is unavailable. Retry the dashboard.</p>
                ) : upcomingConfirmedBookings.length === 0 && (
                  <div className="py-8 text-center px-4 space-y-1.5">
                    <div className="w-10 h-10 rounded-2xl bg-lavender text-muted grid place-items-center mx-auto mb-2">
                      <Icon name="bookings" size={18} />
                    </div>
                    <div className="text-xs font-bold text-navy">No Bookings Scheduled Yet</div>
                    <p className="text-[11px] text-muted max-w-xs mx-auto">
                      Confirmed client events and milestone dates will appear here after quotes are approved and advance payments are provider-verified.
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
            <Link to="/vendor/quotes" className="text-xs font-bold text-primary hover:underline">
              View all quotes →
            </Link>
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
                        <Link to="/vendor/quotes" className="text-[11px] font-semibold text-primary hover:underline">
                          {q.action}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
                {failedDashboardSources.includes('quotes') ? (
                  <tr><td colSpan="6" role="status" className="py-8 text-center text-xs text-amber-800">Quote data is unavailable. Retry the dashboard.</td></tr>
                ) : quotes.length === 0 && (
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

        <BusinessGoals />
        <VendorImprovement
          recommendations={vendorRecommendations}
          available={!failedDashboardSources.includes('recommendations')}
        />

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
              <Link
                key={a.label}
                to={a.to}
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
              </Link>
            ))}
          </div>
        </div>

        {/* Live Interactive Mini Calendar */}
        <div className="min-w-0">
          <MiniCalendar bookings={confirmedBookings} blockouts={blockouts} available={!failedDashboardSources.some((source) => ['bookings', 'availability'].includes(source))} />
        </div>

        {/* Scheduled Upcoming Events */}
        <div className="min-w-0">
          <ScheduledEventsCard bookings={upcomingConfirmedBookings} available={!failedDashboardSources.includes('bookings')} />
        </div>

        {/* Notifications & System Alerts */}
        <div className="min-w-0">
          <NotificationsCard
            notifications={notifications}
            unreadNotifCount={unreadNotifCount}
            available={!failedDashboardSources.includes('notifications')}
            onMarkRead={handleMarkNotificationRead}
            onMarkAllRead={handleMarkAllNotificationsRead}
          />
        </div>

        {/* Conversion Funnel Performance */}
        <div className="md:col-span-2 xl:col-span-1 min-w-0">
          <Performance enquiries={enquiries} quotes={quotes} bookings={bookings} available={!failedDashboardSources.some((source) => ['enquiries', 'quotes', 'bookings'].includes(source))} />
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
          onSubmitQuote={(q) => handleSendQuote(q, quoteEnquiry)}
        />
      )}
    </div>
  );
}
