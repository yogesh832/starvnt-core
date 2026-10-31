import VendorBusinessDashboard from '../VendorBusinessDashboard.jsx';
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Page, Card} from './shared.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import Icon from '../../../components/Icon.jsx';
import { externalApi } from '../../../lib/api.js';
import VendorMessageField from '../VendorMessageField.jsx';

const verifiedPaid = booking => booking.paymentStatus === 'PAYMENT_VERIFIED' && Number.isFinite(booking.paymentSummary?.paidAmount) ? booking.paymentSummary.paidAmount : booking.paymentStatus === 'PENDING' ? 0 : null;
const storedPayable = booking => booking.taxSummary?.invoiceNumber && Number.isFinite(booking.taxSummary.vendorPayable) ? booking.taxSummary.vendorPayable : null;
const showMoney = value => value == null ? 'Unavailable' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function PaymentsPage() {
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError(''); setBookings(null);
    try {
      const result = await externalApi.call('/vendor/bookings');
      if (!result.ok || !Array.isArray(result.bookings)) throw new Error('Payment records unavailable.');
      setBookings(result.bookings);
    } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return <Page title="Payments" sub="Read-only payment and settlement records from Core.">
    <VendorBusinessDashboard financialOnly />
    <Card title="Booking-level payment records">
      {error && <p role="alert">{error} <button className="underline text-primary" onClick={load}>Retry</button></p>}
      {!bookings && !error && <p role="status">Loading booking records…</p>}
      {bookings?.length === 0 && <p>No payment records yet.</p>}
      <div className="space-y-3">{bookings?.map(booking => <article key={booking._id} className="border border-gray-200 rounded-2xl p-4">
        <Link className="font-bold text-primary underline" to={`/vendor/bookings?record=${encodeURIComponent(booking._id)}`}>{booking.bookingReference || 'Open booking'}</Link>
        <p className="text-xs text-muted mt-1">{booking.bookingStatus} · {booking.paymentStatus || 'Payment status unavailable'} · {booking.settlementStatus || 'Settlement status unavailable'}</p>
        <dl className="grid sm:grid-cols-3 gap-3 mt-3 text-sm">
          <div><dt className="text-muted">Contract gross</dt><dd>{showMoney(booking.totalAmount)}</dd></div>
          <div><dt className="text-muted">Invoiced vendor payable</dt><dd>{showMoney(storedPayable(booking))}</dd></div>
          <div><dt className="text-muted">Verified payment snapshot</dt><dd>{showMoney(verifiedPaid(booking))}</dd></div>
        </dl>
      </article>)}</div>
      <p className="text-xs text-muted mt-3">Amounts are current Core snapshots. Gross value is not earnings or profit. Refunds and adjustments require ledger reconciliation; no payment deadline is inferred from the event or creation date.</p>
    </Card>
  </Page>;
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
  const [reviewError, setReviewError] = useState('');

  const loadReviews = useCallback(async () => {
    try {
      setLoading(true); setReviewError('');
      const res = await externalApi.call('/vendor/reviews');
      if (!res.ok) throw new Error('Review records unavailable.');
      if (res.ok) {
        setReviews(res.reviews || []);
        if (res.stats) {
          setStats(res.stats);
        }
        setGoogleRating(res.googleRating || null);
      }
    } catch (err) {
      setReviewError(err.message);
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

  if (reviewError) return <Page title="Reviews & Ratings"><p role="alert">{reviewError} <button className="underline text-primary" onClick={loadReviews}>Retry</button></p></Page>;
  if (loading) return <Page title="Reviews & Ratings"><p role="status">Loading verified reviews…</p></Page>;

  return (
    <Page title="Reviews & Ratings" sub={subTitle}>
      {/* Metric Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-2">
        <Card className="text-center">
          <div className="text-2xl font-extrabold text-navy">
            {stats.totalReviews > 0 ? stats.averageRating : 'No verified reviews yet.'}
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
            {stats.totalReviews > 0 ? stats.recommendPercentage : '—'}
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
                    <VendorMessageField value={replyText} onChange={setReplyText} context={{ type: 'review', id: r._id }} label={`Your response to ${r.customerName}`} placeholder="e.g. Thank the customer and address the details in their feedback." disabled={submittingReply} rows={2} />
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

          {loading && reviews.length === 0 && (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-200/70 animate-pulse" />
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-32 bg-slate-200/80 animate-pulse rounded-full" />
                      <div className="h-2.5 w-20 bg-slate-200/50 animate-pulse rounded-full" />
                    </div>
                  </div>
                  <div className="h-4 w-24 bg-slate-200/60 animate-pulse rounded-full" />
                </div>
                <div className="space-y-2 pt-2">
                  <div className="h-3 w-full bg-slate-100 animate-pulse rounded-full" />
                  <div className="h-3 w-4/5 bg-slate-100 animate-pulse rounded-full" />
                </div>
              </Card>
            ))
          )}

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
                <Icon name="aura" size={13} className="text-primary shrink-0" />
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
  return <Page title="Analytics" sub="Server-calculated cohorts, documented attribution and complete weekly periods."><VendorBusinessDashboard analyticsOnly /></Page>;
}
