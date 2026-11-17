import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, CardSkeleton, PageSkeleton, useLoad } from './customerUi.jsx';
import { formatINR } from './format.js';
import { offerTerms, offersForEvent, offerBlockReason, proposalLink } from './transactionState.js';

function VendorOfferCard({ quote, event, onChanged }) {
  const eventId = event.id;
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [counterBudget, setCounterBudget] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const { total, advance, percent, balance } = offerTerms(quote);
  const money = value => value == null ? 'Not specified' : formatINR(value);
  const blocked = offerBlockReason(quote, event);
  const isAccepted = quote.status === 'APPROVED' || quote.status === 'accepted';
  const canAct = ['SUBMITTED', 'APPROVED'].includes(quote.status) && !blocked && (isAccepted || quote.commercialSnapshot?.source === 'VENDOR_CONFIRMED');

  async function negotiate() {
    if (!message.trim() && !counterBudget.trim()) return;
    setBusy('negotiate');
    setError('');
    try {
      await customerApi.negotiateVendorQuote(quote.id, message.trim(), counterBudget.trim());
      setMessage('');
      setCounterBudget('');
      onChanged();
    } catch (err) {
      setError(errorText(err, 'Could not send negotiation request.'));
    } finally {
      setBusy('');
    }
  }

  async function acceptOffer() {
    if (blocked) { setError(blocked); return; }
    setBusy('accept');
    setError('');
    try {
      const res = await customerApi.acceptVendorQuote(quote.id, eventId, quote.commercialSnapshot?.version);
      onChanged?.();
      const targetEventId = eventId || res?.eventId;
      if (targetEventId) {
        navigate(`/customer/events/${targetEventId}/bookings`);
      }
    } catch (err) {
      setError(errorText(err, 'Could not accept this quote offer.'));
    } finally { setBusy(''); }
  }

  return (
    <div id={`quote-${quote.id}`} tabIndex={-1} className="bg-white rounded-2xl shadow-sm p-4 border border-primary/10 scroll-mt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide font-extrabold text-primary">Vendor offer</div>
          <div className="text-sm font-extrabold text-navy mt-0.5">{quote.vendorName} · {quote.serviceName}</div>
          <div className="text-[11px] text-muted">{quote.eventDate} · {quote.serviceLocation?.address || quote.serviceLocation?.city || 'Location shared'}</div>
        </div>
        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${isAccepted ? 'bg-emerald-50 text-emerald-600' : canAct ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-muted'}`}>
          {isAccepted ? 'Accepted' : quote.status}
        </span>
      </div>

      {quote.notes && (
        <div className="mt-3 rounded-2xl bg-lavender/70 border border-gray-100 p-3 text-xs text-navy">
          <div className="font-extrabold mb-1">Vendor message</div>
          <div className="whitespace-pre-wrap text-ink/80">{quote.notes}</div>
        </div>
      )}
      {quote.commercialSnapshot?.source === 'VENDOR_CONFIRMED' ? <div className="mt-3 rounded-xl bg-blue-50 p-3 text-xs"><p className="font-bold">Vendor-confirmed quote</p><p>Base {money(quote.pricingBreakdown?.basePrice)} · Travel {money(quote.pricingBreakdown?.travelFee)} · Equipment {money(quote.pricingBreakdown?.equipmentFee)} · Setup {money(quote.pricingBreakdown?.setupFee)} · Other {money(quote.pricingBreakdown?.additionalFee)}</p></div> : !isAccepted && <p role="status" className="mt-3 text-sm">Ask the vendor to confirm and itemize the full price before accepting this offer.</p>}

      <div className="mt-3 grid sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-gray-50 p-3">
          <div className="text-muted text-[10px] font-bold">Total quote</div>
          <div className="font-extrabold text-navy text-base">{money(total)}</div>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3">
          <div className="text-emerald-700 text-[10px] font-bold">Recorded advance{percent != null ? ` (${percent}%)` : ''}</div>
          <div className="font-extrabold text-emerald-700 text-base">{money(advance)}</div>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <div className="text-muted text-[10px] font-bold">Balance later</div>
          <div className="font-extrabold text-navy text-base">{money(balance)}</div>
        </div>
      </div>

      {Array.isArray(quote.history) && quote.history.length > 0 && (
        <div className="mt-3 text-[11px] text-muted space-y-1">
          {quote.history.slice(-3).map((h, i) => (
            <div key={`${h.timestamp}-${i}`} className="truncate">• {h.reason}</div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted mt-3">Reference: {quote.quoteReference || quote.id}{quote.validUntil ? ` · Valid until ${new Date(quote.validUntil).toLocaleString('en-IN')}` : ''}</p>
      {blocked && <p role="status" className="text-xs text-amber-700 mt-2">{blocked}</p>}
      {error && <p role="alert" className="text-xs text-red-500 mt-2">{error}</p>}
      {canAct && (
        <div className="mt-4 grid gap-2">
          <div className="flex gap-2">
            <input
              aria-label="Counter offer budget"
              type="number"
              value={counterBudget}
              onChange={(e) => setCounterBudget(e.target.value)}
              placeholder="Your Budget (₹)"
              className="w-1/3 rounded-2xl bg-lavender/60 border border-gray-200 p-3 text-xs outline-none focus:border-primary"
            />
            <textarea
              aria-label="Message to vendor"
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask for a lower price, changed package, timing, add-ons..."
              className="flex-1 rounded-2xl bg-lavender/60 border border-gray-200 p-3 text-xs outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setReviewing(true)}
              disabled={busy}
              className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5 disabled:opacity-50"
            >
              {isAccepted ? 'Review reservation' : 'Review offer acceptance'}
            </button>
            <button
              onClick={negotiate}
              disabled={busy || (!message.trim() && !counterBudget.trim())}
              className="rounded-xl border border-primary/30 text-primary bg-primary-soft text-xs font-bold px-4 py-2.5 disabled:opacity-50"
            >
              {busy === 'negotiate' ? 'Sending...' : 'Send counter quote'}
            </button>
          </div>
        </div>
      )}

      {reviewing && canAct && <section aria-label="Review offer acceptance" className="mt-3 rounded-xl border border-primary/20 p-4 space-y-3">
        <h3 className="text-sm font-bold">Accept this exact offer?</h3>
        <p className="text-xs">{quote.vendorName} · {quote.serviceName} · {quote.quoteReference || quote.id} · {event.title} · {quote.eventDate}</p>
        <p className="text-xs">Total {money(total)} · Recorded advance {money(advance)}. Acceptance opens or resumes a reservation after availability checks. It does not charge a payment or confirm a booking. Review the reservation and saved terms before paying.</p>
        <div className="flex flex-wrap gap-3"><button className="customer-primary-action" disabled={Boolean(busy)} onClick={acceptOffer}>{busy === 'accept' ? 'Accepting…' : 'Accept offer & review reservation'}</button><button className="customer-secondary-action" disabled={Boolean(busy)} onClick={() => setReviewing(false)}>Keep reviewing</button></div>
      </section>}
      {isAccepted && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-muted">Offer accepted · Pay 30% advance on Bookings</span>
          <Link
            to={eventId ? `/customer/events/${eventId}/bookings` : '/customer/events'}
            className="inline-flex text-xs font-bold text-primary hover:underline"
          >
            Go to bookings & payments →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function QuotesPage() {
  const { id } = useParams();
  return <EventQuotes key={id} id={id} />;
}

function EventQuotes({ id }) {
  const [params] = useSearchParams();
  const { data, error, loading } = useLoad(() => customerApi.quotes(id), [id]);
  const vendorOffers = useLoad(() => customerApi.vendorQuotes(id), [id]);
  const selected = params.get('quote');
  useEffect(() => { if (vendorOffers.data && selected) document.getElementById(`quote-${selected}`)?.focus(); }, [vendorOffers.data, selected]);

  if (loading && !data) return <PageSkeleton title="Quotes & Offers" count={3} type="cards" />;
  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <BackLink to={`/customer/events/${id}`}>Event</BackLink>
        <div className="mt-3 text-sm text-red-500">{error.status === 404 ? 'Event not found.' : errorText(error)}</div>
      </div>
    );
  }
  const { event } = data;
  const { quotes: commercialQuotes, requests: pendingVendorRequests } = offersForEvent(vendorOffers.error ? null : vendorOffers.data, id);

  return (
    <div className="customer-transactions max-w-3xl mx-auto space-y-4">
      <BackLink to={`/customer/events/${id}`}>{event.title}</BackLink>
      <h1 className="text-xl font-extrabold text-navy">Quotes & Offers</h1>
      {selected && vendorOffers.data && !vendorOffers.error && !commercialQuotes.some(quote => quote.id === selected) && <p role="status">This offer is unavailable for this event. Review an available offer below or ask for an updated quote.</p>}
      <p className="text-sm text-muted">Compare the scope, exclusions, dates and recorded price before accepting. A selected option or accepted offer is not a confirmed booking.</p>
      <div className="flex flex-wrap gap-3"><Link className="customer-secondary-action" to={`/customer/events/${id}/services`}>Explore & compare services</Link><Link className="customer-secondary-action" to={proposalLink(id)}>Proposals for this event</Link><Link className="customer-secondary-action" to={`/customer/events/${id}/bookings`}>Reservations & payments</Link></div>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-extrabold text-navy">Vendor offers from enquiries</h2>
          <p className="text-xs text-muted">Offers linked to this event, with saved prices, messages and negotiation history. Payment terms come from the recorded offer and reservation.</p>
        </div>
        {vendorOffers.error ? <div role="alert" className="customer-home-panel">Offers could not be refreshed. <button className="customer-secondary-action" onClick={vendorOffers.reload}>Try again</button></div> : vendorOffers.loading && !vendorOffers.data ? (
          <CardSkeleton count={2} />
        ) : commercialQuotes.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-4 text-xs text-muted">
            No vendor offers yet. When a vendor responds with price and message, the offer appears here.
          </div>
        ) : (
          commercialQuotes.map((q) => <VendorOfferCard key={q.id} quote={q} event={event} onChanged={vendorOffers.reload} />)
        )}
        {pendingVendorRequests.length > 0 && (
          <div className="rounded-2xl border border-primary/10 bg-primary-soft/40 p-3 text-xs">
            <div className="text-[10px] uppercase tracking-wide font-extrabold text-primary">Quote requested</div>
            <div className="mt-2 space-y-2">
              {pendingVendorRequests.map((o) => (
                <div key={o._id || o.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-navy truncate">
                      {o.vendor?.businessName || o.vendorName || 'Vendor'} · {o.serviceName}
                    </div>
                    <div className="text-[11px] text-muted truncate">
                      Waiting for vendor quote · {o.eventDate} · {o.serviceLocation?.locality || o.serviceLocation?.city || 'Location shared'}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-white text-primary text-[10px] font-extrabold px-2 py-1">
                    {o.status || 'NEW'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
