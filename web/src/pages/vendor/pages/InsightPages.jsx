import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Page, Card} from './shared.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import Icon from '../../../components/Icon.jsx';
import { externalApi } from '../../../lib/api.js';

const paidAdvance = (booking) => Number(booking?.paymentSummary?.paidAmount || 0);
const advanceDue = (booking) => Number(booking?.paymentSummary?.advanceAmount || Math.ceil((Number(booking?.totalAmount || 0) * 30) / 100));
const balanceDue = (booking) => Number(
  booking?.paymentSummary?.balanceAmount ?? Math.max(0, Number(booking?.totalAmount || 0) - paidAdvance(booking))
);

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
    .filter((b) => b.paymentStatus === 'PAYMENT_VERIFIED' && b.bookingStatus === 'CONFIRMED')
    .reduce((sum, b) => sum + paidAdvance(b), 0);

  const releasedAmount = bookings
    .filter((b) => b.settlementStatus === 'SETTLED')
    .reduce((sum, b) => sum + (b.settlementDetails?.amount || b.totalAmount || 0), 0);

  const nextPayout = bookings
    .filter((b) => b.executionStatus === 'SERVICE_STARTED' || b.executionStatus === 'COMPLETION_SUBMITTED' || b.executionStatus === 'COMPLETION_VERIFIED')
    .reduce((sum, b) => sum + balanceDue(b), 0);

  const stats = [
    {
      label: 'In Escrow',
      value: `₹${escrowAmount.toLocaleString()}`,
      foot: 'Advance paid by customers',
      iconBg: 'bg-orange-50 text-orange-500',
      icon: 'wallet',
    },
    {
      label: 'Released & Settled',
      value: `₹${releasedAmount.toLocaleString()}`,
      foot: `${bookings.filter((b) => b.settlementStatus === 'SETTLED').length} verified releases`,
      iconBg: 'bg-emerald-50 text-emerald-600',
      icon: 'trend',
    },
    {
      label: 'Pending Settlement Validation',
      value: `₹${nextPayout.toLocaleString()}`,
      foot: 'Remaining balance after advance',
      iconBg: 'bg-primary-soft text-primary',
      icon: 'payments',
    },
  ];

  return (
    <Page title="Payments" sub="Read-only payment truth from Core — escrow, releases and settlement state.">
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

      <Card className="!p-0 overflow-x-auto" title="Payment history & Core Escrow">
        <table className="w-full text-[13px] min-w-[620px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted border-b border-gray-100">
              {['Booking Reference', 'Customer', 'Service', 'Quote Total', 'Advance Paid', 'Balance', 'Payment Truth', 'Settlement Status', 'Event Date'].map((h) => (
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
                <td className="px-5 py-3 font-bold text-emerald-700">₹{paidAdvance(b).toLocaleString()}</td>
                <td className="px-5 py-3 font-semibold text-muted">₹{balanceDue(b).toLocaleString()}</td>
                <td className="px-5 py-3"><StatusChip status={b.paymentStatus || 'Verified'} /></td>
                <td className="px-5 py-3"><StatusChip status={b.settlementStatus || 'Pending'} /></td>
                <td className="px-5 py-3 text-muted">{b.eventDate}</td>
              </tr>
            ))}
            {bookings.length === 0 && !loading && (
              <tr>
                <td colSpan="9" className="py-8 text-center text-xs text-muted">
                  No payment transactions recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

    </Page>
  );
}

/* ── Reviews (Strictly DB / API Driven) ─────────────────────────────────── */
export function ReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [googleRating, setGoogleRating] = useState(null);
  const [activeTab, setActiveTab] = useState('starvnt'); // 'starvnt' | 'google'
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
        setGoogleRating(res.googleRating || null);
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
    stats.totalReviews > 0 || googleRating?.rating
      ? `${stats.averageRating} / 5 STARVNT rating (${stats.totalReviews} client reviews)${googleRating?.rating ? ` · ${googleRating.rating} / 5 on Google Maps (${googleRating.reviewCount} reviews)` : ''}.`
      : 'Verified client reviews and synced Google Maps ratings will appear here.';

  return (
    <Page title="Reviews & Ratings" sub={subTitle}>
      {/* Metric Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-2">
        <Card className="text-center">
          <div className="text-2xl font-extrabold text-navy">
            {stats.totalReviews > 0 ? stats.averageRating : '0.0'}
          </div>
          <div className="text-xs text-muted mt-1">STARVNT Rating</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-extrabold text-navy">{stats.totalReviews}</div>
          <div className="text-xs text-muted mt-1">Verified Bookings</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-extrabold text-navy flex items-center justify-center gap-1">
            <span>{googleRating?.rating ? googleRating.rating : '—'}</span>
            {googleRating?.rating && <span className="text-amber-500 text-lg">★</span>}
          </div>
          <div className="text-xs text-muted mt-1">
            {googleRating?.rating ? `${googleRating.reviewCount} Google reviews` : 'Google Maps rating'}
          </div>
          {googleRating?.googleMapsUrl && (
            <a
              href={googleRating.googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-bold text-primary hover:underline mt-1 inline-block"
            >
              View on Maps ↗
            </a>
          )}
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-extrabold text-navy">
            {stats.totalReviews > 0 ? stats.recommendPercentage : '0%'}
          </div>
          <div className="text-xs text-muted mt-1">Would recommend</div>
        </Card>
      </div>

      {/* Rating Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 bg-white p-1 rounded-2xl shadow-xs border border-gray-100">
          <button
            type="button"
            onClick={() => setActiveTab('starvnt')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'starvnt' ? 'bg-primary text-white shadow-xs' : 'text-muted hover:text-navy'
            }`}
          >
            <span>STARVNT Reviews</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === 'starvnt' ? 'bg-white/20 text-white' : 'bg-lavender text-muted'
              }`}
            >
              {stats.totalReviews}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('google')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'google' ? 'bg-primary text-white shadow-xs' : 'text-muted hover:text-navy'
            }`}
          >
            <span>Google Maps Rating & Reviews</span>
            {googleRating?.rating ? (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  activeTab === 'google' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                }`}
              >
                ★ {googleRating.rating}
              </span>
            ) : (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  activeTab === 'google' ? 'bg-white/20 text-white' : 'bg-gray-100 text-muted'
                }`}
              >
                Link ID
              </span>
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: STARVNT Client Reviews */}
      {activeTab === 'starvnt' && (
        <div className="space-y-4">
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
                      className="text-xs font-bold text-primary hover:underline cursor-pointer"
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
                        className="px-3 py-1.5 text-xs font-bold text-muted hover:text-navy cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSendReply(r._id)}
                        disabled={submittingReply || !replyText.trim()}
                        className="px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition disabled:opacity-50 cursor-pointer"
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
              <h3 className="text-base font-extrabold text-navy">No STARVNT Reviews Yet</h3>
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
      )}

      {/* TAB 2: Google Maps Rating & Reviews */}
      {activeTab === 'google' && (
        <div className="space-y-4">
          {googleRating?.rating ? (
            <>
              {/* Google Overview Banner */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 grid place-items-center font-extrabold text-2xl border border-amber-200/60 shadow-xs">
                    {googleRating.rating}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-amber-500 text-base">
                        {'★'.repeat(Math.round(googleRating.rating || 0))}
                        {'☆'.repeat(5 - Math.round(googleRating.rating || 0))}
                      </div>
                      <span className="text-xs font-bold text-navy">Google Maps Rating</span>
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {googleRating.reviewCount} public reviews
                      {googleRating.address ? ` · ${googleRating.address}` : ''}
                    </div>
                  </div>
                </div>

                {googleRating.googleMapsUrl && (
                  <a
                    href={googleRating.googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition shadow-xs"
                  >
                    <span>Open in Google Maps</span>
                    <span>↗</span>
                  </a>
                )}
              </div>

              {/* Google Reviews List */}
              {googleRating.reviews?.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-muted">Recent Customer Reviews on Google</div>
                  {googleRating.reviews.map((gr, idx) => {
                    const authorName = gr.authorAttribution?.displayName || gr.author || 'Google Reviewer';
                    const photoUrl = gr.authorAttribution?.photoUri;
                    const authorUri = gr.authorAttribution?.uri;
                    const reviewText = gr.text?.text || gr.originalText?.text || gr.text || '';
                    const ratingNum = Math.round(gr.rating || 5);
                    const publishTime = gr.relativePublishTimeDescription;

                    return (
                      <Card key={idx}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            {photoUrl ? (
                              <img src={photoUrl} alt={authorName} className="w-9 h-9 rounded-full object-cover shadow-xs" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 grid place-items-center text-xs font-bold shadow-xs">
                                {authorName[0]?.toUpperCase() || 'G'}
                              </div>
                            )}
                            <div>
                              {authorUri ? (
                                <a href={authorUri} target="_blank" rel="noreferrer" className="text-xs font-bold text-navy hover:underline">
                                  {authorName}
                                </a>
                              ) : (
                                <div className="text-xs font-bold text-navy">{authorName}</div>
                              )}
                              {publishTime && <div className="text-[10px] text-muted">{publishTime}</div>}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-amber-500 text-xs font-bold">
                              {'★'.repeat(ratingNum)}
                            </span>
                            <span className="text-[10px] bg-gray-100 text-muted px-2 py-0.5 rounded-full font-semibold">
                              Google
                            </span>
                          </div>
                        </div>

                        {reviewText ? (
                          <p className="text-sm text-ink/80 leading-relaxed mt-1">"{reviewText}"</p>
                        ) : (
                          <p className="text-xs text-muted italic mt-1">Rated without written feedback</p>
                        )}
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card className="text-center py-8">
                  <div className="text-xs text-muted max-w-md mx-auto">
                    Google Places rating synced successfully. Written reviews can be viewed and managed directly on your Google Business Profile.
                  </div>
                </Card>
              )}

              <div className="text-center py-2 text-[11px] text-muted">
                Rating & reviews are synchronized via Google Places API. To respond to Google reviews, use your Google Business Profile manager.
              </div>
            </>
          ) : (
            <Card className="text-center py-12 px-6">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 grid place-items-center mx-auto mb-3 shadow-xs">
                <Icon name="star" size={24} className="fill-amber-500 text-amber-500" />
              </div>
              <h3 className="text-base font-extrabold text-navy">Link Your Google Business Profile</h3>
              <p className="text-xs text-muted max-w-md mx-auto mt-1 leading-relaxed">
                Connect your Google Places Place ID in your Business Profile settings. Your Google Maps star rating and public reviews will automatically sync and display here and on your customer-facing service pages.
              </p>
              <div className="mt-5">
                <Link
                  to="/vendor/profile?tab=profile"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition shadow-xs"
                >
                  <Icon name="link" size={14} />
                  <span>Configure Google Place ID in Profile →</span>
                </Link>
              </div>
            </Card>
          )}
        </div>
      )}
    </Page>
  );
}

/* ── Analytics (Live Metric Grounding) ───────────────────────────────────── */
export function AnalyticsPage() {
  const [counts, setCounts] = useState({
    enquiriesCount: 0,
    quotesCount: 0,
    bookingsCount: 0,
    advanceReceived: 0,
    quoteValue: 0,
  });

  useEffect(() => {
    async function loadCounts() {
      try {
        const [res, bookingsRes] = await Promise.all([
          externalApi.call('/vendor/badge-counts'),
          externalApi.call('/vendor/bookings'),
        ]);
        const bookings = Array.isArray(bookingsRes?.bookings) ? bookingsRes.bookings : [];
        const advanceReceived = bookings.reduce((sum, b) => sum + paidAdvance(b), 0);
        const quoteValue = bookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
        if (res.ok) {
          setCounts({
            enquiriesCount: res.enquiriesCount || 0,
            quotesCount: res.quotesCount || 0,
            bookingsCount: res.bookingsCount || 0,
            advanceReceived,
            quoteValue,
          });
        }
      } catch (err) {
        console.warn('[AnalyticsPage] Failed to load counts:', err.message);
      }
    }
    loadCounts();
  }, []);

  const { enquiriesCount, quotesCount, bookingsCount, advanceReceived, quoteValue } = counts;
  const enqToQuoteRate = enquiriesCount > 0 ? `${Math.round((quotesCount / enquiriesCount) * 100)}%` : '0%';
  const quoteToBookingRate = quotesCount > 0 ? `${Math.round((bookingsCount / quotesCount) * 100)}%` : '0%';

  const rows = [
    ['Total Enquiries Received', String(enquiriesCount), enquiriesCount > 0 ? 'Active' : 'Awaiting Leads'],
    ['Enquiry → Quote Conversion', enqToQuoteRate, 'Live Funnel'],
    ['Total Quotes Generated', String(quotesCount), quotesCount > 0 ? 'In Progress' : '0 Quotes'],
    ['Quote → Booking Conversion', quoteToBookingRate, 'Core Escrow'],
    ['Confirmed Bookings', String(bookingsCount), bookingsCount > 0 ? 'Verified' : '0 Bookings'],
    ['Advance Received', `₹${advanceReceived.toLocaleString()}`, advanceReceived > 0 ? 'Payment Verified' : '₹0'],
    ['Confirmed Quote Value', `₹${quoteValue.toLocaleString()}`, quoteValue > 0 ? 'Booked Value' : '₹0'],
  ];

  return (
    <Page title="Analytics" sub="Conversion funnels, turnaround times and verified platform performance.">
      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Operational Funnel Overview">
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
        </Card>

        <Card title="Conversion Metrics">
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
        </Card>
      </div>
    </Page>
  );
}
