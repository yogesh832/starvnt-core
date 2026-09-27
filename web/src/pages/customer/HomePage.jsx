import { useState } from 'react';
import { Link } from 'react-router-dom';
import { customerApi, errorText } from './customerApi.js';
import { AskBox, Empty, EventCard, useLoad } from './customerUi.jsx';
import { attentionLink, formatINR } from './format.js';
import { openCheckout } from './razorpay.js';

const START_CHIPS = ["My daughter's wedding", 'Plan my birthday', 'Corporate event for 300 people', 'Arrange a Puja', 'Plan an anniversary'];

export default function HomePage({ firstName }) {
  const { data, error, loading } = useLoad(() => customerApi.home(), []);
  const vendorFlow = useLoad(() => customerApi.vendorQuotes(), []);
  const [creatingEnquiry, setCreatingEnquiry] = useState(false);
  const [payingQuoteId, setPayingQuoteId] = useState(null);
  const [verifyingBookingId, setVerifyingBookingId] = useState(null);
  const [negotiatingQuoteId, setNegotiatingQuoteId] = useState(null);
  const [negotiationText, setNegotiationText] = useState('Can you please share a better final price or include extra sound support?');
  const [flowMessage, setFlowMessage] = useState('');
  const active = data?.activeEvents || [];
  const attention = data?.attention || [];
  const focus = active[0];

  async function createDemoEnquiry() {
    setCreatingEnquiry(true);
    setFlowMessage('');
    try {
      await customerApi.createMahimanDemoEnquiry();
      setFlowMessage('Enquiry sent to mahiman tent house. The vendor can now see it in Enquiries.');
      vendorFlow.reload();
    } catch (err) {
      setFlowMessage(errorText(err, err.message || 'Could not create enquiry.'));
    } finally {
      setCreatingEnquiry(false);
    }
  }

  async function requestChange(quoteId) {
    setFlowMessage('');
    try {
      await customerApi.negotiateVendorQuote(quoteId, negotiationText);
      setNegotiatingQuoteId(null);
      setFlowMessage('Your change request was sent to the vendor.');
      vendorFlow.reload();
    } catch (err) {
      setFlowMessage(errorText(err, err.message || 'Could not send request.'));
    }
  }

  async function payAdvance(quoteId) {
    setPayingQuoteId(quoteId);
    setFlowMessage('');
    try {
      const { checkout } = await customerApi.payVendorQuoteAdvance(quoteId);
      const response = await openCheckout(checkout);
      await customerApi.completeVendorQuoteCheckout(quoteId, response);
      setFlowMessage('30% advance paid and verified. Booking is now sent to the vendor dashboard.');
      vendorFlow.reload();
    } catch (err) {
      setFlowMessage(err?.dismissed ? 'Payment window closed. You can try again.' : errorText(err, err.message || 'Payment failed.'));
    } finally {
      setPayingQuoteId(null);
    }
  }

  async function verifyWorkDone(bookingId) {
    setVerifyingBookingId(bookingId);
    setFlowMessage('');
    try {
      await customerApi.verifyVendorBookingCompletion(bookingId, 'Customer confirmed the vendor work is complete.');
      setFlowMessage('Work verified. The booking is now marked complete.');
      vendorFlow.reload();
    } catch (err) {
      setFlowMessage(errorText(err, err.message || 'Could not verify work yet.'));
    } finally {
      setVerifyingBookingId(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <section className="rounded-3xl p-5 sm:p-7 bg-gradient-to-br from-primary to-[#9b6dff] text-white shadow-lg shadow-primary/20 grid md:grid-cols-[1fr_220px] gap-5 items-center">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-extrabold">Welcome back, {firstName} 👋</h1>
          <p className="text-sm text-white/85 mt-1">
            {focus ? `Your ${focus.eventTypeLabel?.toLowerCase() || 'event'} is taking shape!` : "Tell us what you're planning. We'll handle the rest."}
          </p>
          <div className="mt-4 text-ink">
            <AskBox chips={focus ? [] : START_CHIPS} eventId={focus?.id} />
          </div>
        </div>
        <Link to="/customer/events/new" className="bg-white rounded-2xl p-4 text-navy shadow-md hover:shadow-lg transition block">
          <div className="text-2xl">📝</div>
          <div className="text-sm font-extrabold mt-1">Fill details manually</div>
          <div className="text-[11px] text-muted mt-0.5">Prefer a form? Enter your event and services yourself.</div>
        </Link>
      </section>

      {loading && <div className="text-xs text-muted">Loading…</div>}
      {error && <div className="text-xs text-red-500">{errorText(error, "Couldn't load your events.")}</div>}

      <section className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold text-navy">DJ booking test with mahiman tent house</div>
            <p className="text-xs text-muted mt-1">
              Use this to send a real enquiry to the vendor, receive their quote, then pay 30% advance by Razorpay.
            </p>
          </div>
          <button
            onClick={createDemoEnquiry}
            disabled={creatingEnquiry}
            className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5 disabled:opacity-60"
          >
            {creatingEnquiry ? 'Sending...' : 'Send enquiry'}
          </button>
        </div>

        {flowMessage && (
          <div className="mt-3 rounded-xl bg-primary-soft text-primary text-xs font-bold px-3 py-2">
            {flowMessage}
          </div>
        )}

        {!vendorFlow.loading && vendorFlow.data?.opportunities?.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-bold text-muted uppercase tracking-wide">My vendor enquiries</div>
            {vendorFlow.data.opportunities.slice(0, 3).map((opp) => (
              <div key={opp._id} className="rounded-2xl border border-gray-100 bg-lavender/30 p-3 text-xs">
                <div className="font-bold text-navy">{opp.vendor?.businessName || 'Vendor'} · {opp.serviceName}</div>
                <div className="text-muted mt-0.5">{opp.eventDate} · {opp.serviceLocation?.locality || opp.serviceLocation?.city} · {opp.guestCount} guests</div>
                <div className="mt-1 font-bold text-primary">Status: {opp.status === 'NEW' ? 'Sent to vendor' : opp.status}</div>
              </div>
            ))}
          </div>
        )}

        {!vendorFlow.loading && vendorFlow.data?.quotes?.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="text-xs font-bold text-muted uppercase tracking-wide">Quotes from vendor</div>
            {vendorFlow.data.quotes.map((quote) => (
              <div key={quote.id} className="rounded-2xl border border-gray-100 p-3 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-extrabold text-navy">{quote.vendorName}</div>
                    <div className="text-muted mt-0.5">{quote.serviceName} · {quote.eventDate}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-xl bg-lavender/50 p-2">
                        <div className="text-muted">Total quote</div>
                        <div className="font-extrabold text-navy">{formatINR(quote.totalAmount)}</div>
                      </div>
                      <div className="rounded-xl bg-emerald-50 p-2">
                        <div className="text-emerald-700">Pay now</div>
                        <div className="font-extrabold text-emerald-700">30% · {formatINR(quote.advanceAmount)}</div>
                      </div>
                    </div>
                  </div>
                  <span className="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[10px] font-bold self-start">
                    {quote.status === 'SUBMITTED' ? 'Vendor quote ready' : quote.status}
                  </span>
                </div>

                {quote.status === 'SUBMITTED' && quote.advanceStatus !== 'VERIFIED' && (
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => payAdvance(quote.id)}
                      disabled={payingQuoteId === quote.id || !vendorFlow.data.paymentsConfigured}
                      className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5 disabled:opacity-60"
                    >
                      {payingQuoteId === quote.id ? 'Opening payment...' : 'Pay 30% advance'}
                    </button>
                    <button
                      onClick={() => setNegotiatingQuoteId(negotiatingQuoteId === quote.id ? null : quote.id)}
                      className="rounded-xl border border-gray-200 text-navy text-xs font-bold px-4 py-2.5"
                    >
                      Ask for change
                    </button>
                  </div>
                )}

                {quote.advanceStatus === 'VERIFIED' && (
                  <div className="mt-3 rounded-xl bg-emerald-50 text-emerald-700 px-3 py-2 font-bold">
                    Advance verified. Booking sent to vendor.
                  </div>
                )}

                {negotiatingQuoteId === quote.id && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      rows={2}
                      value={negotiationText}
                      onChange={(e) => setNegotiationText(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 p-3 text-xs outline-none focus:border-primary"
                    />
                    <button onClick={() => requestChange(quote.id)} className="rounded-xl bg-lavender text-primary text-xs font-bold px-4 py-2">
                      Send request
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!vendorFlow.loading && vendorFlow.data?.bookings?.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="text-xs font-bold text-muted uppercase tracking-wide">Bookings after advance payment</div>
            {vendorFlow.data.bookings.map((booking) => (
              <div key={booking.id} className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-extrabold text-navy">{booking.vendorName}</div>
                    <div className="text-muted mt-0.5">
                      {booking.serviceName} · {booking.eventDate} · Booking #{booking.bookingReference}
                    </div>
                    <div className="mt-2 font-bold text-emerald-700">
                      {booking.executionStatus === 'COMPLETION_VERIFIED'
                        ? 'Work completed and verified'
                        : booking.executionStatus === 'COMPLETION_SUBMITTED'
                          ? 'Vendor marked work done. Please verify.'
                          : booking.executionStatus === 'SERVICE_STARTED'
                            ? 'Vendor has started work'
                            : 'Booking confirmed'}
                    </div>
                  </div>
                  <span className="rounded-full bg-white text-emerald-700 px-2 py-0.5 text-[10px] font-bold self-start">
                    {booking.paymentStatus === 'PAYMENT_VERIFIED' ? 'Advance paid' : booking.paymentStatus}
                  </span>
                </div>
                {booking.executionStatus === 'COMPLETION_SUBMITTED' && (
                  <button
                    onClick={() => verifyWorkDone(booking.id)}
                    disabled={verifyingBookingId === booking.id}
                    className="mt-3 rounded-xl bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 disabled:opacity-60"
                  >
                    {verifyingBookingId === booking.id ? 'Verifying...' : 'Yes, work is done'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {!loading && !error && (
        <div className="grid lg:grid-cols-[1fr_300px] gap-5 items-start">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-extrabold text-navy">Your events</h2>
              <Link to="/customer/events" className="text-xs font-bold text-primary">See all</Link>
            </div>
            {active.length === 0 ? (
              <Empty
                title="No events yet"
                action={<Link to="/customer/aura?new=1" className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5">Plan with Aura+</Link>}
              >
                Tell Aura+ what you're planning — a wedding, a birthday, a puja — and it will start your plan.
              </Empty>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {active.map((e) => <EventCard key={e.id} event={e} />)}
              </div>
            )}
          </section>

          <aside className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-sm font-bold text-navy mb-2">Upcoming actions</div>
            {attention.length === 0 ? (
              <p className="text-xs text-muted">You're all caught up.</p>
            ) : (
              <ul className="space-y-2">
                {attention.map((a, i) => (
                  <li key={i}>
                    <Link to={attentionLink(a)} className="block rounded-xl bg-lavender/60 hover:bg-primary-soft p-2.5 text-xs">
                      <b className="text-navy">{a.title}</b>
                      <div className="text-muted text-[11px]">{a.detail}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
