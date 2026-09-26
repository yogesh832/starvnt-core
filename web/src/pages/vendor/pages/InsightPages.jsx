import { useState, useEffect, useCallback } from 'react';
import { Page, Card} from './shared.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import Icon from '../../../components/Icon.jsx';
import { externalApi } from '../../../lib/api.js';
import { CardListSkeleton, MetricSkeleton, SkeletonLine, TableSkeleton } from '../../../components/LoadingSkeleton.jsx';

/* ── Payments ─────────────────────────────────────────────────────────────── */
export function PaymentsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await externalApi.call('/vendor/bookings');
      if (res.ok && res.bookings) {
        setBookings(res.bookings);
      }
    } catch (err) {
      console.warn('[PaymentsPage] Failed to fetch payments data:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const escrowAmount = bookings
    .filter((b) => b.settlementStatus !== 'SETTLEMENT_RELEASED' && b.bookingStatus === 'CONFIRMED')
    .reduce((sum, b) => sum + (b.totalAmount || 0), 0);

  const releasedAmount = bookings
    .filter((b) => b.settlementStatus === 'SETTLEMENT_RELEASED')
    .reduce((sum, b) => sum + (b.totalAmount || 0), 0);

  const nextPayout = bookings
    .filter((b) => b.executionStatus === 'SERVICE_STARTED' || b.executionStatus === 'COMPLETION_SUBMITTED')
    .reduce((sum, b) => sum + (b.totalAmount || 0), 0);

  const stats = [
    {
      label: 'In Escrow',
      value: `₹${escrowAmount.toLocaleString()}`,
      foot: 'Protected Core escrow until completion',
      iconBg: 'bg-orange-50 text-orange-500',
      icon: 'wallet',
    },
    {
      label: 'Released & Settled',
      value: `₹${releasedAmount.toLocaleString()}`,
      foot: `${bookings.filter((b) => b.settlementStatus === 'SETTLEMENT_RELEASED').length} verified releases`,
      iconBg: 'bg-emerald-50 text-emerald-600',
      icon: 'trend',
    },
    {
      label: 'Pending Settlement Validation',
      value: `₹${nextPayout.toLocaleString()}`,
      foot: 'Core Admin execution verification',
      iconBg: 'bg-primary-soft text-primary',
      icon: 'payments',
    },
  ];

  return (
    <Page title="Payments" sub="Read-only payment truth from Core — escrow, releases and settlement state.">
      {loading && bookings.length === 0 ? (
        <MetricSkeleton count={3} />
      ) : (
        <div className="grid sm:grid-cols-3 gap-3.5">
          {stats.map((s) => (
            <Card key={s.label} className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${s.iconBg}`}>
                <Icon name={s.icon} size={18} />
              </div>
              <div>
                <div className="text-lg font-extrabold text-navy">{s.value}</div>
                <div className="text-[11px] text-muted">{s.label}</div>
                <div className="text-[10px] text-muted/80">{s.foot}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {loading && bookings.length === 0 ? (
        <TableSkeleton columns={7} rows={5} minWidth={620} />
      ) : (
      <Card className="!p-0 overflow-x-auto" title="Payment history & Core Escrow">
        <table className="w-full text-[13px] min-w-[620px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted border-b border-gray-100">
              {['Booking Reference', 'Customer', 'Service', 'Amount', 'Payment Truth', 'Settlement Status', 'Event Date'].map((h) => (
                <th key={h} className="px-5 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b._id || b.bookingReference} className="border-b border-gray-50 last:border-0 hover:bg-lavender/30">
                <td className="px-5 py-3 font-semibold text-primary">{b.bookingReference}</td>
                <td className="px-5 py-3 font-medium text-navy">{b.customerName || 'Customer'}</td>
                <td className="px-5 py-3 text-muted">{b.serviceName}</td>
                <td className="px-5 py-3 font-bold text-navy">₹{(b.totalAmount || 0).toLocaleString()}</td>
                <td className="px-5 py-3"><StatusChip status={b.paymentStatus || 'Verified'} /></td>
                <td className="px-5 py-3"><StatusChip status={b.settlementStatus || 'Pending'} /></td>
                <td className="px-5 py-3 text-muted">{b.eventDate}</td>
              </tr>
            ))}
            {bookings.length === 0 && !loading && (
              <tr>
                <td colSpan="7" className="py-8 text-center text-xs text-muted">
                  No payment transactions recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      )}

    </Page>
  );
}

/* ── Reviews (Strictly DB / API Driven) ─────────────────────────────────── */
export function ReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState({
    averageRating: '0.0',
    totalReviews: 0,
    recommendPercentage: '0%',
    distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [replyingId, setReplyingId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  const loadReviews = useCallback(async () => {
    try {
      setLoading(true);
      const res = await externalApi.call('/vendor/reviews');
      if (res.ok) {
        setReviews(res.reviews || []);
        if (res.stats) {
          setStats(res.stats);
        }
      }
    } catch (err) {
      console.warn('[ReviewsPage] Failed to fetch reviews:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  async function handleSendReply(reviewId) {
    if (!replyText.trim()) return;
    try {
      setSubmittingReply(true);
      const res = await externalApi.call(`/vendor/reviews/${reviewId}/reply`, {
        method: 'POST',
        body: { text: replyText.trim() },
      });
      if (res.ok) {
        setReplyingId(null);
        setReplyText('');
        await loadReviews();
      }
    } catch (err) {
      alert(`Could not save reply: ${err.message}`);
    } finally {
      setSubmittingReply(false);
    }
  }

  const subTitle =
    stats.totalReviews > 0
      ? `${stats.averageRating} / 5 average from ${stats.totalReviews} verified booking${stats.totalReviews === 1 ? '' : 's'}.`
      : 'Verified client reviews and ratings will appear here after completed bookings.';

  return (
    <Page title="Reviews" sub={subTitle}>
      {/* Metric Cards */}
      {loading && reviews.length === 0 ? (
        <MetricSkeleton count={3} />
      ) : (
        <div className="grid sm:grid-cols-3 gap-3.5 mb-1">
          <Card className="text-center">
            <div className="text-2xl font-extrabold text-navy">
              {stats.totalReviews > 0 ? stats.averageRating : '0.0'}
            </div>
            <div className="text-xs text-muted mt-1">Average rating</div>
          </Card>
          <Card className="text-center">
            <div className="text-2xl font-extrabold text-navy">{stats.totalReviews}</div>
            <div className="text-xs text-muted mt-1">Verified reviews</div>
          </Card>
          <Card className="text-center">
            <div className="text-2xl font-extrabold text-navy">
              {stats.totalReviews > 0 ? stats.recommendPercentage : '0%'}
            </div>
            <div className="text-xs text-muted mt-1">Would recommend</div>
          </Card>
        </div>
      )}

      {/* Reviews List or Clean Blank State */}
      <div className="space-y-4">
        {loading && reviews.length === 0 && <CardListSkeleton count={3} />}

        {reviews.map((r) => {
          const stars = Math.round(r.rating || 5);
          const initials = (r.customerName || 'Client')
            .split(' ')
            .map((w) => w[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();

          return (
            <Card key={r._id || r.customerName}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-soft text-primary grid place-items-center text-xs font-bold shrink-0">
                    {initials}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-navy">{r.customerName}</span>
                      {r.isVerified && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                          <Icon name="check" size={10} />
                          <span>Verified Booking</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted mt-0.5">
                      <span>{r.serviceName || r.eventType || 'Event'} · {r.eventDate || new Date(r.createdAt).toLocaleDateString()} ·</span>
                      <span className="inline-flex items-center gap-0.5 text-amber-500">
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <Icon
                            key={idx}
                            name="star"
                            size={11}
                            className={idx < stars ? 'fill-amber-500 text-amber-500' : 'text-gray-300'}
                          />
                        ))}
                      </span>
                    </div>
                  </div>
                </div>

                {!r.vendorReply?.text && replyingId !== r._id && (
                  <button
                    onClick={() => {
                      setReplyingId(r._id);
                      setReplyText('');
                    }}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    Reply
                  </button>
                )}
              </div>

              <p className="text-sm text-ink/80 mt-3 leading-relaxed">"{r.reviewText}"</p>

              {/* Existing Vendor Reply */}
              {r.vendorReply?.text && (
                <div className="mt-3 p-3 rounded-2xl bg-lavender/40 border border-primary/15 text-xs">
                  <div className="font-bold text-navy flex items-center justify-between">
                    <span>Response from Vendor</span>
                    <span className="text-[10px] text-muted font-normal">
                      {r.vendorReply.repliedAt ? new Date(r.vendorReply.repliedAt).toLocaleDateString() : 'Replied'}
                    </span>
                  </div>
                  <p className="text-ink/80 mt-1">{r.vendorReply.text}</p>
                </div>
              )}

              {/* Inline Reply Form */}
              {replyingId === r._id && (
                <div className="mt-3 p-3 bg-gray-50 rounded-2xl border border-gray-200 space-y-2">
                  <label className="text-xs font-bold text-navy block">Your response to {r.customerName}:</label>
                  <textarea
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Thank the client for their feedback..."
                    className="w-full text-xs p-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-primary"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setReplyingId(null);
                        setReplyText('');
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-muted hover:text-navy"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSendReply(r._id)}
                      disabled={submittingReply || !replyText.trim()}
                      className="px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition disabled:opacity-50"
                    >
                      {submittingReply ? 'Posting...' : 'Post Reply'}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {reviews.length === 0 && !loading && (
          <Card className="text-center py-12 px-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 grid place-items-center mx-auto mb-3 shadow-xs">
              <Icon name="star" size={24} className="fill-amber-500 text-amber-500" />
            </div>
            <h3 className="text-base font-extrabold text-navy">No Reviews Yet</h3>
            <p className="text-xs text-muted max-w-md mx-auto mt-1 leading-relaxed">
              Reviews are strictly verified from completed client bookings. When clients experience your service and confirm delivery, their authenticated ratings and feedback will appear here.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-[11px] font-semibold text-primary bg-primary-soft/50 px-3 py-1.5 rounded-xl">
              <Icon name="bolt" size={13} className="text-primary shrink-0" />
              <span>Tip: High verified ratings boost your placement in Aura+ client match rankings.</span>
            </div>
          </Card>
        )}
      </div>
    </Page>
  );
}

/* ── Analytics (Live Metric Grounding) ───────────────────────────────────── */
export function AnalyticsPage() {
  const [counts, setCounts] = useState({
    enquiriesCount: 0,
    quotesCount: 0,
    bookingsCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCounts() {
      try {
        setLoading(true);
        const res = await externalApi.call('/vendor/badge-counts');
        if (res.ok) {
          setCounts({
            enquiriesCount: res.enquiriesCount || 0,
            quotesCount: res.quotesCount || 0,
            bookingsCount: res.bookingsCount || 0,
          });
        }
      } catch (err) {
        console.warn('[AnalyticsPage] Failed to load counts:', err.message);
      } finally {
        setLoading(false);
      }
    }
    loadCounts();
  }, []);

  const { enquiriesCount, quotesCount, bookingsCount } = counts;
  const enqToQuoteRate = enquiriesCount > 0 ? `${Math.round((quotesCount / enquiriesCount) * 100)}%` : '0%';
  const quoteToBookingRate = quotesCount > 0 ? `${Math.round((bookingsCount / quotesCount) * 100)}%` : '0%';

  const rows = [
    ['Total Enquiries Received', String(enquiriesCount), enquiriesCount > 0 ? 'Active' : 'Awaiting Leads'],
    ['Enquiry → Quote Conversion', enqToQuoteRate, 'Live Funnel'],
    ['Total Quotes Generated', String(quotesCount), quotesCount > 0 ? 'In Progress' : '0 Quotes'],
    ['Quote → Booking Conversion', quoteToBookingRate, 'Core Escrow'],
    ['Confirmed Bookings', String(bookingsCount), bookingsCount > 0 ? 'Verified' : '0 Bookings'],
  ];

  return (
    <Page title="Analytics" sub="Conversion funnels, turnaround times and verified platform performance.">
      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Operational Funnel Overview">
          {loading ? (
            <div className="p-4 space-y-4">
              <SkeletonLine className="w-full h-8" />
              <SkeletonLine className="w-5/6 h-8" />
              <SkeletonLine className="w-4/6 h-8" />
            </div>
          ) : (
          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-muted">Inbound Enquiries</span>
                <span className="text-navy font-bold">{enquiriesCount}</span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: enquiriesCount > 0 ? '100%' : '0%' }} />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-muted">Quotes Sent</span>
                <span className="text-navy font-bold">{quotesCount} ({enqToQuoteRate})</span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500" style={{ width: enqToQuoteRate }} />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-muted">Confirmed Bookings</span>
                <span className="text-navy font-bold">{bookingsCount} ({quoteToBookingRate})</span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: quoteToBookingRate }} />
              </div>
            </div>
          </div>
          )}
        </Card>

        <Card title="Conversion Metrics">
          {loading ? (
            <div className="p-4 space-y-4">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <SkeletonLine className="w-40" />
                  <SkeletonLine className="w-24" />
                </div>
              ))}
            </div>
          ) : (
          <ul className="divide-y divide-gray-50 text-sm">
            {rows.map(([label, val, change]) => (
              <li key={label} className="py-2.5 flex items-center justify-between">
                <span className="text-muted text-xs">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-navy text-sm">{val}</span>
                  <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                    {change}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          )}
        </Card>
      </div>
    </Page>
  );
}
