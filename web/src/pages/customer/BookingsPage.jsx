import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, DemoBadge, Empty, PageSkeleton, useLoad } from './customerUi.jsx';
import { formatDate, formatINR } from './format.js';
import { openCheckout } from './razorpay.js';

const BOOKING_STATUS = {
  confirmed: ['✓ Confirmed', 'bg-emerald-50 text-emerald-700'],
  pending: ['⏳ Under review', 'bg-amber-50 text-amber-700'],
  cancelled: ['Cancelled', 'bg-gray-100 text-muted'],
};
const PAYMENT_STATUS = {
  pending: 'Started',
  processing: 'Processing — waiting for confirmation',
  paid: 'Processing — waiting for confirmation',
  verified: 'Verified',
  failed: 'Failed',
};

function holdLeft(expiresAt) {
  const ms = new Date(expiresAt) - Date.now();
  if (ms <= 0) return 'Hold expired';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `Held for ${h}h ${m}m`;
}

/** "You're almost done." review sheet before paying. */
function PaySheet({ event, reservation, onClose, onPaid }) {
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [error, setError] = useState('');
  const showDevPaymentButton = import.meta.env.DEV;
  const packageTotal = reservation.packageTotal || reservation.amount;
  const originalAdvance = reservation.advanceAmount || reservation.amount;
  const discountAmount = coupon?.discountAmount || 0;
  const payableAdvance = coupon?.payableAmount || Math.max(1, originalAdvance - discountAmount);
  const balanceAfterAdvance = Math.max(0, packageTotal - payableAdvance);
  const canPay = !busy && !couponBusy;
  const canApplyCoupon = !busy && !couponBusy && !coupon && Boolean(couponCode.trim());

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const { payment, checkout } = await customerApi.pay(event.id, reservation.id, coupon?.code || '');
      const response = await openCheckout(checkout);
      // Recorded only; STARVNT confirms after verifying with Razorpay.
      await customerApi.checkoutComplete(event.id, payment.id, response).catch(() => {});
      onPaid();
    } catch (err) {
      setError(err?.dismissed ? 'Payment window closed. You can try again while the hold is active.' : errorText(err, err?.message));
    } finally {
      setBusy(false);
    }
  }

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    setCouponBusy(true);
    setCoupon(null);
    setError('');
    try {
      const res = await customerApi.previewCoupon(event.id, reservation.id, couponCode);
      setCoupon(res.coupon);
      setCouponCode(res.coupon?.code || couponCode.trim().toUpperCase());
    } catch (err) {
      setError(errorText(err, 'This coupon could not be applied.'));
    } finally {
      setCouponBusy(false);
    }
  }

  function removeCoupon() {
    setCoupon(null);
    setCouponCode('');
    setError('');
  }

  function updateCouponCode(value) {
    setCouponCode(value.toUpperCase().replace(/\s+/g, ''));
    if (coupon) setCoupon(null);
    setError('');
  }

  async function testSuccessPayment() {
    setTestBusy(true);
    setError('');
    try {
      await customerApi.devSuccessPayment(event.id, reservation.id);
      onPaid();
    } catch (err) {
      setError(errorText(err, 'Could not mark the test payment successful.'));
    } finally {
      setTestBusy(false);
    }
  }

  const rows = [
    ['Event', event.title],
    ['Date', formatDate(event.eventDate) || 'Not specified'],
    ['Location', event.city || 'Not specified'],
    ['Guests', event.guestCount || 'Not specified'],
    ['Package', `${reservation.vendorName} · ${reservation.packageName}`],
    ['Held until', new Date(reservation.expiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-navy/50" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="text-lg font-extrabold text-navy">You're almost done.</div>
        <div className="text-xs text-muted mt-0.5">Review and pay to request your booking.</div>
        {reservation.isDemo && <div className="mt-2"><DemoBadge /></div>}
        <div className="mt-4 divide-y divide-gray-50">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-2 text-xs">
              <span className="text-muted">{k}</span>
              <span className="font-semibold text-navy text-right">{v}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-extrabold text-navy">Coupon code</div>
              <div className="text-[11px] text-muted">Optional. Discount applies to the advance payment.</div>
            </div>
            {coupon && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700">Applied</span>}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={couponCode}
              onChange={(e) => updateCouponCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canApplyCoupon) {
                  e.preventDefault();
                  applyCoupon();
                }
              }}
              disabled={busy || couponBusy || Boolean(coupon)}
              placeholder="ENTER CODE"
              aria-label="Coupon code"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-extrabold text-navy outline-none focus:border-primary disabled:opacity-60"
            />
            {coupon ? (
              <button type="button" onClick={removeCoupon} disabled={busy} className="rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-muted border border-gray-200">
                Remove
              </button>
            ) : (
              <button type="button" onClick={applyCoupon} disabled={!canApplyCoupon} className="rounded-xl bg-primary-soft px-3 py-2 text-xs font-extrabold text-primary disabled:opacity-50">
                {couponBusy ? 'Checking...' : 'Apply'}
              </button>
            )}
          </div>
          {coupon && (
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
              Coupon {coupon.code} saved {formatINR(discountAmount)}. Razorpay will charge {formatINR(payableAdvance)} now.
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="flex justify-between gap-3 px-3 py-3">
            <span className="text-sm font-bold text-navy">Package total</span>
            <span className="text-lg font-extrabold text-navy">{formatINR(packageTotal)}</span>
          </div>
          <div className="flex justify-between gap-3 border-t border-gray-50 px-3 py-2">
            <span className="text-xs font-semibold text-muted">Advance before coupon ({reservation.advancePercent || 30}%)</span>
            <span className={coupon ? 'text-sm font-bold text-muted line-through' : 'text-sm font-bold text-navy'}>{formatINR(originalAdvance)}</span>
          </div>
          {coupon && (
            <div className="flex justify-between gap-3 border-t border-gray-50 px-3 py-2">
              <span className="text-xs font-semibold text-emerald-700">Coupon {coupon.code}</span>
              <span className="text-sm font-bold text-emerald-700">-{formatINR(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-primary/10 bg-primary-soft/60 px-3 py-3">
            <span className="text-sm font-extrabold text-primary">Pay now by Razorpay</span>
            <span className="text-lg font-extrabold text-primary">{formatINR(payableAdvance)}</span>
          </div>
          <div className="flex justify-between gap-3 border-t border-gray-50 px-3 py-2">
            <span className="text-xs font-semibold text-muted">Balance after advance</span>
            <span className="text-sm font-bold text-navy">{formatINR(balanceAfterAdvance)}</span>
          </div>
        </div>
        <div className="mt-3 text-[11px] text-muted">Pay only the advance now. The remaining balance is handled later as per vendor terms.</div>
        {error && <div className="text-xs text-red-500 mt-3">{error}</div>}
        <button onClick={pay} disabled={!canPay} className="mt-4 w-full rounded-2xl bg-primary text-white text-sm font-extrabold py-3 disabled:opacity-60">
          {busy ? 'Opening payment...' : couponBusy ? 'Checking coupon...' : `Confirm & Pay Advance ${formatINR(payableAdvance)}`}
        </button>
        {/* TODO_REMOVE_BEFORE_PRODUCTION: temporary QA shortcut for payment-success testing. */}
        {showDevPaymentButton && (
          <button
            type="button"
            onClick={testSuccessPayment}
            disabled={busy || testBusy}
            className="mt-2 w-full rounded-2xl border border-amber-300 bg-amber-50 text-amber-800 text-xs font-extrabold py-2.5 disabled:opacity-60"
          >
            {testBusy ? 'Marking test payment…' : 'Test success payment'}
          </button>
        )}
        <div className="text-[11px] text-center text-muted mt-2">🔒 100% secure payments via Razorpay</div>
        <div className="text-[10px] text-center text-muted mt-1">Your booking is confirmed only after STARVNT verifies the payment.</div>
        <button onClick={onClose} disabled={busy} className="mt-3 w-full text-xs font-bold text-muted">Not now</button>
      </div>
    </div>
  );
}

function sanitizePackageTitle(name, label, vendorName) {
  if (!name || typeof name !== 'string' || name.includes('Event Enquiry') || name.startsWith('👤') || /customer/i.test(name)) {
    return vendorName && vendorName !== 'Vendor' && vendorName !== 'Vendor Partner' ? `${vendorName} Package` : `${label || 'Service'} Package`;
  }
  return name;
}

function BookingCard({ b, eventId, onVerify, verifying, onPay, onCancel, cancelling }) {
  const [open, setOpen] = useState(true);

  let [label, cls] = BOOKING_STATUS[b.status] || ['✓ Confirmed', 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40'];
  if (b.executionStatus === 'SERVICE_STARTED') {
    label = '⚡ Work Started — In Progress';
    cls = 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/40 font-extrabold';
  } else if (b.executionStatus === 'COMPLETION_SUBMITTED') {
    label = '⏳ Work Completed — Action Required';
    cls = 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/40 font-extrabold';
  } else if (b.executionStatus === 'COMPLETION_VERIFIED') {
    label = '✓ Completed & Verified';
    cls = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40 font-extrabold';
  }

  const isActionRequired = b.executionStatus === 'COMPLETION_SUBMITTED';
  const pkgName = sanitizePackageTitle(b.packageName, b.label, b.vendorName);

  return (
    <div
      className={`bg-white dark:bg-[#161926] rounded-2xl border transition overflow-hidden shadow-xs ${
        isActionRequired
          ? 'border-amber-300 dark:border-amber-700 ring-2 ring-amber-400/20'
          : 'border-gray-100 dark:border-gray-800'
      }`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50/50 dark:hover:bg-white/5 transition cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-2xl bg-lavender dark:bg-[#1f2336] text-primary dark:text-[#a5b4fc] grid place-items-center shrink-0 font-bold text-sm">
            <Icon name="bookings" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-extrabold text-navy dark:text-white truncate">
                {b.label}: {b.vendorName} {b.isDemo && <DemoBadge />}
              </span>
              <span className={`text-[10px] font-bold rounded-full px-2.5 py-0.5 border ${cls}`}>{label}</span>
            </div>
            <div className="text-[11px] text-muted dark:text-slate-400 mt-1 font-medium flex items-center gap-1.5 flex-wrap">
              <span>Booking #{b.reference} · Total <b className="text-navy dark:text-slate-200">{formatINR(b.packageTotal || b.amount)}</b> · Paid advance {formatINR(b.paidAmount || b.amount)}</span>
              {b.balanceAmount > 0 && <span className="text-amber-700 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-800/40">Balance {formatINR(b.balanceAmount)}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-xs text-muted dark:text-slate-400 font-semibold">{open ? 'Collapse' : 'Details'}</span>
          <Icon name="chevronDown" size={16} className={`text-muted dark:text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isActionRequired && (
        <div className="mx-4 mb-4 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 flex items-center justify-between gap-3 flex-wrap shadow-2xs">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-extrabold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <Icon name="star" size={14} className="text-amber-600" />
              <span>Work Done & Evidence Uploaded by Vendor</span>
            </div>
            <div className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
              Please inspect proof of work, verify completion, and pay remaining balance.
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onVerify(b);
            }}
            disabled={verifying === b.id}
            className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2 transition cursor-pointer shadow-sm disabled:opacity-50"
          >
            {verifying === b.id ? 'Verifying...' : 'Verify Completion & Proceed'}
          </button>
        </div>
      )}

      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800/60 bg-gray-50/40 dark:bg-[#131622] space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-white dark:bg-[#1a1d2d] border border-gray-100 dark:border-gray-800 rounded-xl p-3 min-w-0">
              <div className="text-[10px] text-muted dark:text-slate-400 font-bold uppercase tracking-wider">Package</div>
              <div className="font-extrabold text-navy dark:text-white mt-1 truncate" title={pkgName}>{pkgName}</div>
            </div>
            <div className="bg-white dark:bg-[#1a1d2d] border border-gray-100 dark:border-gray-800 rounded-xl p-3 min-w-0">
              <div className="text-[10px] text-muted dark:text-slate-400 font-bold uppercase tracking-wider">Paid Advance</div>
              <div className="font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">{formatINR(b.paidAmount || b.amount)}</div>
            </div>
            <div className="bg-white dark:bg-[#1a1d2d] border border-gray-100 dark:border-gray-800 rounded-xl p-3 min-w-0">
              <div className="text-[10px] text-muted dark:text-slate-400 font-bold uppercase tracking-wider">Remaining Balance</div>
              <div className="font-extrabold text-amber-700 dark:text-amber-400 mt-1">{formatINR(b.balanceAmount || 0)}</div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
            <Link
              to={`/customer/events/${eventId}/circle?booking=${b.id}`}
              className="text-xs font-bold text-primary dark:text-[#a5b4fc] inline-flex items-center gap-1.5 hover:underline"
            >
              <Icon name="message" size={14} />
              <span>Open Chat & Discussion</span>
            </Link>

            <div className="flex items-center gap-3">
              {onCancel && (
                <button
                  type="button"
                  onClick={() => onCancel(b.id)}
                  disabled={cancelling === b.id}
                  className="text-xs font-bold text-rose-500 hover:text-rose-700 dark:text-rose-400 hover:underline px-2 py-1 cursor-pointer disabled:opacity-50"
                >
                  {cancelling === b.id ? 'Removing…' : 'Cancel / Remove'}
                </button>
              )}
              {b.executionStatus === 'COMPLETION_VERIFIED' && b.balanceAmount > 0 && (
                <button
                  onClick={() => onPay({ ...b, advanceAmount: b.balanceAmount, amount: b.balanceAmount })}
                  className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2 hover:bg-primary-dark transition shadow-xs cursor-pointer"
                >
                  Pay Balance ({formatINR(b.balanceAmount)})
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function parseEvidence(ev) {
  if (!ev) return { photos: [], videos: [], pdfs: [], driveLinks: [], otherLinks: [], deliverablesUrl: '', notes: '', checklist: [] };
  const items = Array.isArray(ev) ? ev : [ev];
  const photos = [];
  const videos = [];
  const pdfs = [];
  const driveLinks = [];
  const otherLinks = [];
  let deliverablesUrl = '';
  let notes = '';
  let checklist = [];

  const categorizeUrl = (url) => {
    if (!url || typeof url !== 'string') return;
    const lower = url.toLowerCase();
    if (lower.includes('drive.google.com') || lower.includes('docs.google.com') || lower.includes('dropbox.com') || lower.includes('onedrive.live.com')) {
      driveLinks.push(url);
    } else if (lower.match(/\.(mp4|webm|mov|mkv|avi)$/i) || lower.includes('/video/upload/')) {
      videos.push(url);
    } else if (lower.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt)$/i) || lower.includes('/raw/upload/')) {
      pdfs.push(url);
    } else if (lower.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i) || lower.includes('/image/upload/')) {
      photos.push(url);
    } else if (lower.startsWith('http')) {
      otherLinks.push(url);
    }
  };

  items.forEach((item) => {
    if (!item) return;
    if (typeof item === 'string') {
      if (item.startsWith('http')) categorizeUrl(item);
      else notes = notes ? `${notes}\n${item}` : item;
      return;
    }
    if (item.notes || item.note) notes = notes || item.notes || item.note;
    if (item.deliverablesUrl || item.deliverableUrl) deliverablesUrl = deliverablesUrl || item.deliverablesUrl || item.deliverableUrl;

    if (Array.isArray(item.photos)) item.photos.forEach(categorizeUrl);
    if (Array.isArray(item.videos)) item.videos.forEach(categorizeUrl);
    if (Array.isArray(item.pdfs)) item.pdfs.forEach(categorizeUrl);
    if (Array.isArray(item.files)) {
      item.files.forEach((f) => {
        if (typeof f === 'string') categorizeUrl(f);
        else if (f?.url) categorizeUrl(f.url);
      });
    }

    if (typeof item.url === 'string') categorizeUrl(item.url);
    if (Array.isArray(item.checklist)) checklist.push(...item.checklist);
  });

  if (deliverablesUrl) categorizeUrl(deliverablesUrl);

  return {
    photos: [...new Set(photos)],
    videos: [...new Set(videos)],
    pdfs: [...new Set(pdfs)],
    driveLinks: [...new Set(driveLinks)],
    otherLinks: [...new Set(otherLinks)],
    deliverablesUrl,
    notes,
    checklist,
  };
}

function EvidenceInspectionModal({ booking, onClose, onConfirm, verifying }) {
  const [activePhoto, setActivePhoto] = useState(null);
  const evidence = parseEvidence(booking.completionEvidence);
  const hasContent = evidence.photos.length > 0 || evidence.videos.length > 0 || evidence.pdfs.length > 0 || evidence.driveLinks.length > 0 || evidence.deliverablesUrl || evidence.notes || evidence.checklist.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-navy/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-[#161926] border border-gray-100 dark:border-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#1e2235]/60 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              <h3 className="text-base font-extrabold text-navy dark:text-white">Verify Completion Evidence</h3>
            </div>
            <p className="text-xs text-muted dark:text-slate-400 mt-0.5 font-medium">
              {booking.vendorName} · {booking.packageName || booking.label} (Booking #{booking.reference})
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 text-muted dark:text-slate-300 hover:text-navy dark:hover:text-white grid place-items-center transition cursor-pointer"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {!hasContent ? (
            <div className="text-center py-8 bg-gray-50 dark:bg-[#1a1d2d] rounded-2xl p-6 border border-dashed border-gray-200 dark:border-gray-700">
              <Icon name="star" size={24} className="mx-auto text-amber-500 mb-2" />
              <p className="text-sm font-bold text-navy dark:text-white">Service Marked Completed by Vendor</p>
              <p className="text-xs text-muted dark:text-slate-400 mt-1 max-w-md mx-auto">
                The vendor has declared work complete for this booking. Confirming verification will approve completion and unlock final balance settlement.
              </p>
            </div>
          ) : (
            <>
              {/* Handover Notes */}
              {evidence.notes && (
                <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4">
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-300 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                    <Icon name="info" size={14} className="text-amber-600" />
                    <span>Vendor Handover Notes</span>
                  </div>
                  <p className="text-xs text-amber-900/90 dark:text-amber-200 font-medium italic whitespace-pre-wrap">
                    "{evidence.notes}"
                  </p>
                </div>
              )}

              {/* Google Drive / Cloud Deliverables Links */}
              {evidence.driveLinks.length > 0 && (
                <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 rounded-2xl p-4 space-y-2">
                  <div className="text-xs font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Icon name="externalLink" size={14} className="text-blue-600" />
                    <span>Google Drive / Cloud Deliverables</span>
                  </div>
                  <div className="space-y-2">
                    {evidence.driveLinks.map((url, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 bg-white dark:bg-[#1a1d2d] p-2.5 rounded-xl border border-blue-100 dark:border-blue-900/40">
                        <span className="text-xs text-blue-800 dark:text-blue-300 font-medium truncate max-w-md">{url}</span>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition shrink-0"
                        >
                          <span>Open Drive Folder</span>
                          <Icon name="externalLink" size={12} />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* General Deliverables URL fallback */}
              {evidence.deliverablesUrl && evidence.driveLinks.length === 0 && (
                <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-xs font-bold text-blue-900 dark:text-blue-300">Deliverables & Evidence Link</div>
                    <p className="text-xs text-blue-800 dark:text-blue-400 truncate max-w-md mt-0.5">{evidence.deliverablesUrl}</p>
                  </div>
                  <a
                    href={evidence.deliverablesUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition"
                  >
                    <span>View Link</span>
                    <Icon name="externalLink" size={13} />
                  </a>
                </div>
              )}

              {/* Proof Documents & PDFs */}
              {evidence.pdfs.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-navy dark:text-white uppercase tracking-wider mb-2">Proof Documents & PDFs ({evidence.pdfs.length})</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {evidence.pdfs.map((url, idx) => (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-[#1a1d2d] border border-gray-200 dark:border-gray-700 hover:border-primary p-3 rounded-2xl transition group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 grid place-items-center font-bold text-xs shrink-0">📄</span>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-navy dark:text-white truncate">Document File {idx + 1}</div>
                            <div className="text-[10px] text-muted dark:text-slate-400 truncate max-w-[180px]">{url}</div>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-primary dark:text-[#a5b4fc] shrink-0 group-hover:translate-x-0.5 transition">View ↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Checklist */}
              {evidence.checklist.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-navy dark:text-white uppercase tracking-wider mb-2">Completed Tasks Checklist</div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {evidence.checklist.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-800/40 rounded-xl px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
                        <Icon name="check" size={14} className="text-emerald-600 shrink-0" />
                        <span className="truncate">{typeof item === 'string' ? item : item.label || item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Photos Gallery */}
              {evidence.photos.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-navy dark:text-white uppercase tracking-wider mb-2">Proof Photos ({evidence.photos.length})</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {evidence.photos.map((url, idx) => (
                      <div
                        key={idx}
                        onClick={() => setActivePhoto(url)}
                        className="group relative aspect-4/3 rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer border border-gray-200 dark:border-gray-700"
                      >
                        <img src={url} alt={`Evidence proof ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                        <div className="absolute inset-0 bg-navy/30 opacity-0 group-hover:opacity-100 transition grid place-items-center text-white">
                          <Icon name="zoom" size={20} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Videos Gallery */}
              {evidence.videos.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-navy dark:text-white uppercase tracking-wider mb-2">Proof Videos ({evidence.videos.length})</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {evidence.videos.map((url, idx) => (
                      <div key={idx} className="rounded-2xl overflow-hidden bg-black border border-gray-700">
                        <video src={url} controls className="w-full max-h-48 object-contain" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#1e2235]/60 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <button
            onClick={onClose}
            disabled={verifying}
            className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1d2d] px-4 py-2.5 text-xs font-bold text-navy dark:text-white hover:bg-gray-50 transition cursor-pointer"
          >
            Not Now / Back
          </button>
          <button
            onClick={onConfirm}
            disabled={verifying}
            className="rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold px-6 py-2.5 shadow-md transition disabled:opacity-50 cursor-pointer flex items-center gap-2"
          >
            <Icon name="check" size={14} />
            <span>{verifying ? 'Verifying Completion...' : 'Confirm & Approve Completion'}</span>
          </button>
        </div>
      </div>

      {/* Photo Lightbox */}
      {activePhoto && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 cursor-pointer" onClick={() => setActivePhoto(null)}>
          <img src={activePhoto} alt="Proof zoom" className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain" />
        </div>
      )}
    </div>
  );
}

export default function BookingsPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data, error, loading, reload } = useLoad(() => customerApi.bookings(id), [id]);
  const [paying, setPaying] = useState(null);
  const [verifying, setVerifying] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [inspectingBooking, setInspectingBooking] = useState(null);

  const inspectId = params.get('inspect');

  useEffect(() => {
    if (inspectId && data?.bookings?.length) {
      const match = data.bookings.find(
        (b) =>
          b.id === inspectId ||
          String(b.dbId || '') === inspectId ||
          String(b.id || '').endsWith(inspectId) ||
          inspectId.endsWith(String(b.dbId || ''))
      );
      if (match) {
        setInspectingBooking(match);
      }
    }
  }, [inspectId, data?.bookings]);

  const handleCancelBooking = async (bId) => {
    try {
      setCancelling(bId);
      await customerApi.cancelBooking(bId);
      await reload();
    } catch {
      // ignore
    } finally {
      setCancelling(null);
    }
  };

  const handleVerifyCompletion = async (b) => {
    try {
      setVerifying(b.id);
      await customerApi.verifyVendorBookingCompletion(b.id);
      setInspectingBooking(null);
      await reload();
    } catch {
      // ignore
    } finally {
      setVerifying(null);
    }
  };

  // Poll while any payment is waiting for verification.
  const waiting = data?.payments?.some((p) => ['processing', 'paid'].includes(p.status));
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  if (loading && !data) return <PageSkeleton title="Bookings" count={3} type="cards" />;
  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <BackLink to={`/customer/events/${id}`}>Event</BackLink>
        <div className="mt-3 text-sm text-red-500">{error.status === 404 ? 'Event not found.' : errorText(error)}</div>
      </div>
    );
  }
  const { event, reservations, bookings, payments, paymentsConfigured } = data;
  const awaiting = reservations.filter((r) => r.status === 'pending_payment');
  const paymentFor = (rid) => payments.find((p) => p.reservationId === rid);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <BackLink to={`/customer/events/${id}`}>{event.title}</BackLink>
      <h1 className="text-xl font-extrabold text-navy">Bookings & payments</h1>

      {awaiting.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-sm font-bold text-navy">Reserved – awaiting payment</div>
          {!paymentsConfigured && <p className="text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mt-2">Online payment is not set up yet.</p>}
          <ul className="mt-2 divide-y divide-gray-50">
            {awaiting.map((r) => {
              const p = paymentFor(r.id);
              const inFlight = p && ['processing', 'paid'].includes(p.status);
              return (
                <li key={r.id} className="py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-navy truncate">{r.label}: {r.vendorName} {r.isDemo && <DemoBadge />}</div>
                    <div className="text-[11px] text-muted">
                      Advance {formatINR(r.advanceAmount || r.amount)} of {formatINR(r.packageTotal || r.amount)} · Balance {formatINR(r.balanceAmount || 0)} · {holdLeft(r.expiresAt)}
                    </div>
                    {inFlight && <div className="text-[11px] text-primary">Payment received — waiting for verification…</div>}
                    {p?.status === 'failed' && <div className="text-[11px] text-red-500">Last attempt failed. You can try again.</div>}
                  </div>
                  {!inFlight && (
                    <button onClick={() => setPaying(r)} disabled={!paymentsConfigured} className="rounded-xl bg-primary text-white text-xs font-bold px-3 py-2 disabled:opacity-50">
                      Review & pay
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <div className="text-sm font-extrabold text-navy mb-2">My bookings</div>
        {bookings.length === 0 ? (
          <Empty title="No bookings yet">Select options, get a quote, accept it and pay — bookings appear here once verified.</Empty>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <BookingCard
                key={b.id}
                b={b}
                eventId={id}
                onVerify={setInspectingBooking}
                verifying={verifying}
                onPay={setPaying}
                onCancel={handleCancelBooking}
                cancelling={cancelling}
              />
            ))}
          </div>
        )}
      </section>

      {payments.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm p-4 overflow-x-auto">
          <div className="text-sm font-bold text-navy mb-2">Payments</div>
          <table className="w-full text-xs min-w-[380px]">
            <thead>
              <tr className="text-left text-muted border-b border-gray-100">
                <th className="py-2 font-semibold">Date</th>
                <th className="py-2 font-semibold">Amount</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2">{new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                  <td className="py-2 font-semibold">
                    {formatINR(p.amount)}
                    {p.coupon?.code && (
                      <div className="text-[10px] font-bold text-emerald-600">
                        {p.coupon.code} saved {formatINR(p.coupon.discountAmount)}
                      </div>
                    )}
                  </td>
                  <td className={`py-2 ${p.status === 'verified' ? 'text-emerald-600 font-bold' : p.status === 'failed' ? 'text-red-500' : 'text-muted'}`}>
                    {PAYMENT_STATUS[p.status]}{p.failureReason ? ` — ${p.failureReason}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {inspectingBooking && (
        <EvidenceInspectionModal
          booking={inspectingBooking}
          onClose={() => setInspectingBooking(null)}
          onConfirm={() => handleVerifyCompletion(inspectingBooking)}
          verifying={verifying === inspectingBooking.id}
        />
      )}

      {paying && <PaySheet event={event} reservation={paying} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); reload(); }} />}
    </div>
  );
}
