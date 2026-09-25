import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, DemoBadge, Empty, useLoad } from './customerUi.jsx';
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
  const [error, setError] = useState('');

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const { payment, checkout } = await customerApi.pay(event.id, reservation.id);
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
          <div className="flex justify-between py-3">
            <span className="text-sm font-bold text-navy">Total</span>
            <span className="text-lg font-extrabold text-navy">{formatINR(reservation.amount)}</span>
          </div>
        </div>
        <div className="text-[11px] text-muted">Pay with UPI, cards, net banking or wallets — you choose in the Razorpay window.</div>
        {error && <div className="text-xs text-red-500 mt-3">{error}</div>}
        <button onClick={pay} disabled={busy} className="mt-4 w-full rounded-2xl bg-primary text-white text-sm font-extrabold py-3 disabled:opacity-60">
          {busy ? 'Opening payment…' : `Confirm & Pay ${formatINR(reservation.amount)}`}
        </button>
        <div className="text-[11px] text-center text-muted mt-2">🔒 100% secure payments via Razorpay</div>
        <div className="text-[10px] text-center text-muted mt-1">Your booking is confirmed only after STARVNT verifies the payment.</div>
        <button onClick={onClose} disabled={busy} className="mt-3 w-full text-xs font-bold text-muted">Not now</button>
      </div>
    </div>
  );
}

export default function BookingsPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useLoad(() => customerApi.bookings(id), [id]);
  const [paying, setPaying] = useState(null);

  // Poll while any payment is waiting for verification.
  const waiting = data?.payments?.some((p) => ['processing', 'paid'].includes(p.status));
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  if (loading && !data) return <div className="text-xs text-muted">Loading…</div>;
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
                    <div className="text-[11px] text-muted">{formatINR(r.amount)} · {holdLeft(r.expiresAt)}</div>
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
          <div className="space-y-2">
            {bookings.map((b) => {
              const [label, cls] = BOOKING_STATUS[b.status];
              return (
                <div key={b.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-navy truncate">{b.label}: {b.vendorName} {b.isDemo && <DemoBadge />}</div>
                    <div className="text-[11px] text-muted">Booking #{b.reference} · {formatINR(b.amount)}</div>
                    {b.underReviewReason && <div className="text-[11px] text-amber-700 mt-0.5">{b.underReviewReason}. Our team is reviewing it.</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${cls}`}>{label}</span>
                    <Link to={`/customer/events/${id}/circle?booking=${b.id}`} className="text-[11px] font-bold text-primary inline-flex items-center gap-1">
                      <Icon name="message" size={11} /> Messages
                    </Link>
                  </div>
                </div>
              );
            })}
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
                  <td className="py-2 font-semibold">{formatINR(p.amount)}</td>
                  <td className={`py-2 ${p.status === 'verified' ? 'text-emerald-600 font-bold' : p.status === 'failed' ? 'text-red-500' : 'text-muted'}`}>
                    {PAYMENT_STATUS[p.status]}{p.failureReason ? ` — ${p.failureReason}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {paying && <PaySheet event={event} reservation={paying} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); reload(); }} />}
    </div>
  );
}
