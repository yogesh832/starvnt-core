import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, CardSkeleton, DemoBadge, Empty, PageSkeleton, useLoad } from './customerUi.jsx';
import { formatINR } from './format.js';


const QUOTE_STATUS = {
  draft: ['Awaiting your decision', 'bg-amber-50 text-amber-600'],
  accepted: ['Accepted', 'bg-emerald-50 text-emerald-600'],
  cancelled: ['Replaced by a newer quote', 'bg-gray-100 text-muted'],
  expired: ['Expired', 'bg-gray-100 text-muted'],
};

function QuoteCard({ quote, eventId }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function accept() {
    setBusy(true);
    setError('');
    try {
      await customerApi.acceptQuote(quote.id);
      navigate(`/customer/events/${eventId}/bookings`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }
  const [label, cls] = QUOTE_STATUS[quote.status] || QUOTE_STATUS.draft;
  const faded = quote.status === 'cancelled' || quote.status === 'expired';
  return (
    <div className={`bg-white rounded-2xl shadow-sm p-4 ${faded ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold text-navy">Test estimate · {new Date(quote.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${cls}`}>{label}</span>
      </div>
      <ul className="mt-3 divide-y divide-gray-50">
        {quote.items.map((i) => (
          <li key={i.id} className="py-2 flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <div className="font-bold text-navy truncate">{i.label}: {i.vendorName} {i.isDemo && <DemoBadge />}</div>
              <div className="text-[11px] text-muted truncate">{i.packageName}</div>
            </div>
            <div className="font-bold text-navy shrink-0">{formatINR(i.price)}</div>
          </li>
        ))}
      </ul>
      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-muted">Demo total</span>
        <span className="text-base font-extrabold text-navy">{formatINR(quote.total)}</span>
      </div>
      {quote.status === 'draft' && (
        <p className="text-[11px] text-muted mt-2">
          Test validity until {new Date(quote.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. This is for sandbox flow testing, not a vendor-sent commercial offer.
        </p>
      )}
      {quote.status === 'draft' && (
        <div className="mt-3">
          {error && <div className="text-xs text-red-500 mb-2">{error}</div>}
          <button onClick={accept} disabled={busy} className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5 disabled:opacity-60">
            {busy ? 'Reserving…' : 'Test reserve'}
          </button>
          <span className="text-[10px] text-muted ml-2">Creates a demo hold so payment and booking can be tested.</span>
        </div>
      )}
      {quote.status === 'accepted' && (
        <Link to={`/customer/events/${eventId}/bookings`} className="inline-flex mt-3 text-xs font-bold text-primary">Go to bookings & payments →</Link>
      )}
    </div>
  );
}

function VendorOfferCard({ quote, eventId, onChanged }) {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [counterBudget, setCounterBudget] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const total = quote.totalAmount || quote.pricingBreakdown?.totalAmount || 0;
  const advance = quote.advanceAmount || Math.ceil(total * 0.3);
  const balance = Math.max(0, total - advance);
  const isAccepted = quote.status === 'APPROVED' || quote.status === 'accepted';
  const canAct = quote.status === 'SUBMITTED';

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
    setBusy('accept');
    setError('');
    try {
      const res = await customerApi.acceptVendorQuote(quote.id, eventId);
      onChanged?.();
      const targetEventId = eventId || res?.eventId;
      if (targetEventId) {
        navigate(`/customer/events/${targetEventId}/bookings`);
      }
    } catch (err) {
      setError(errorText(err, 'Could not accept this quote offer.'));
      setBusy('');
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-primary/10">
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

      <div className="mt-3 grid sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-gray-50 p-3">
          <div className="text-muted text-[10px] font-bold">Total quote</div>
          <div className="font-extrabold text-navy text-base">{formatINR(total)}</div>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3">
          <div className="text-emerald-700 text-[10px] font-bold">Pay now ({quote.advancePercentage || 30}%)</div>
          <div className="font-extrabold text-emerald-700 text-base">{formatINR(advance)}</div>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <div className="text-muted text-[10px] font-bold">Balance later</div>
          <div className="font-extrabold text-navy text-base">{formatINR(balance)}</div>
        </div>
      </div>

      {Array.isArray(quote.history) && quote.history.length > 0 && (
        <div className="mt-3 text-[11px] text-muted space-y-1">
          {quote.history.slice(-3).map((h, i) => (
            <div key={`${h.timestamp}-${i}`} className="truncate">• {h.reason}</div>
          ))}
        </div>
      )}

      {canAct && (
        <div className="mt-4 grid gap-2">
          <div className="flex gap-2">
            <input
              type="number"
              value={counterBudget}
              onChange={(e) => setCounterBudget(e.target.value)}
              placeholder="Your Budget (₹)"
              className="w-1/3 rounded-2xl bg-lavender/60 border border-gray-200 p-3 text-xs outline-none focus:border-primary"
            />
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask for a lower price, changed package, timing, add-ons..."
              className="flex-1 rounded-2xl bg-lavender/60 border border-gray-200 p-3 text-xs outline-none focus:border-primary resize-none"
            />
          </div>
          {error && <div className="text-xs text-red-500">{error}</div>}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={acceptOffer}
              disabled={busy}
              className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5 disabled:opacity-50"
            >
              {busy === 'accept' ? 'Accepting...' : 'Accept offer'}
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
  const { data, error, loading, reload } = useLoad(() => customerApi.quotes(id), [id]);
  const vendorOffers = useLoad(() => customerApi.vendorQuotes(), [id]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  async function getQuote() {
    setBusy(true);
    setActionError('');
    try {
      await customerApi.createQuote(id);
      reload();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <PageSkeleton title="Quotes & Offers" count={3} type="cards" />;
  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <BackLink to={`/customer/events/${id}`}>Event</BackLink>
        <div className="mt-3 text-sm text-red-500">{error.status === 404 ? 'Event not found.' : errorText(error)}</div>
      </div>
    );
  }
  const { event, selections, quotes } = data;
  const selectionTotal = selections.reduce((s, r) => s + (r.selectedOption?.price || 0), 0);
  const commercialQuotes = Array.isArray(vendorOffers.data?.quotes)
    ? vendorOffers.data.quotes.filter((q) => !event.eventDate || q.eventDate === event.eventDate)
    : [];
  const quotedOpportunityIds = new Set(commercialQuotes.map((q) => q.opportunityId).filter(Boolean));
  const pendingVendorRequests = Array.isArray(vendorOffers.data?.opportunities)
    ? vendorOffers.data.opportunities.filter((o) =>
        (!event.eventDate || o.eventDate === event.eventDate) &&
        !quotedOpportunityIds.has(String(o._id || o.id))
      )
    : [];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <BackLink to={`/customer/events/${id}`}>{event.title}</BackLink>
      <h1 className="text-xl font-extrabold text-navy">Quotes & Offers</h1>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-extrabold text-navy">Vendor offers from enquiries</h2>
          <p className="text-xs text-muted">These are direct vendor quotes with their price, message, negotiation history, and 30% advance payment.</p>
        </div>
        {vendorOffers.loading && !vendorOffers.data ? (
          <CardSkeleton count={2} />
        ) : commercialQuotes.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-4 text-xs text-muted">
            No vendor offers yet. When a vendor responds with price and message, the offer appears here.
          </div>
        ) : (
          commercialQuotes.map((q) => <VendorOfferCard key={q.id} quote={q} eventId={id} onChanged={vendorOffers.reload} />)
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

      <div className="bg-white rounded-2xl shadow-sm p-4 border border-dashed border-amber-200 bg-amber-50/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-navy">Sandbox test estimate</div>
            <p className="text-[11px] text-muted mt-0.5">
              This section is only for testing STARVNT demo listings. Real customer negotiation should happen from vendor offers above.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-amber-100 text-amber-700 text-[10px] font-extrabold px-2 py-0.5">TEST</span>
        </div>
        {selections.length === 0 ? (
          <p className="text-xs text-muted mt-2">
            You haven't selected any options yet. <Link to={`/customer/events/${id}/services`} className="font-bold text-primary">Find options →</Link>
          </p>
        ) : (
          <>
            <ul className="mt-2 divide-y divide-gray-50">
              {selections.map((r) => (
                <li key={r.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-navy truncate">{r.label}: {r.selectedOption.vendorName} {r.selectedOption.isDemo && <DemoBadge />}</div>
                    <div className="text-[11px] text-muted truncate">{r.selectedOption.packageName}</div>
                  </div>
                  <div className="font-semibold text-navy shrink-0">{formatINR(r.selectedOption.price)}</div>
                </li>
              ))}
            </ul>
            <div className="text-[11px] text-muted mt-1">These prices come from selected demo/catalog options. They are not vendor-entered negotiation offers.</div>
            {actionError && <div className="text-xs text-red-500 mt-2">{actionError}</div>}
            <button
              onClick={getQuote}
              disabled={busy || event.status === 'draft'}
              className="mt-3 rounded-xl bg-amber-600 text-white text-xs font-bold px-4 py-2.5 disabled:opacity-50"
            >
              {busy ? 'Preparing…' : `Create test quote (${formatINR(selectionTotal)})`}
            </button>
          </>
        )}
      </div>

      {quotes.length === 0 ? (
        <Empty title="No test estimates yet">Use this only to test demo reservation and payment flow.</Empty>
      ) : (
        quotes.map((q) => <QuoteCard key={q.id} quote={q} eventId={id} />)
      )}
    </div>
  );
}
