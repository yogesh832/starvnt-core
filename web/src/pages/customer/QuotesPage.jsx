import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, DemoBadge, Empty, useLoad } from './customerUi.jsx';
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
        <div className="text-sm font-extrabold text-navy">Quote · {new Date(quote.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
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
        <span className="text-xs text-muted">Total (validated)</span>
        <span className="text-base font-extrabold text-navy">{formatINR(quote.total)}</span>
      </div>
      {quote.status === 'draft' && (
        <p className="text-[11px] text-muted mt-2">
          Valid until {new Date(quote.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Prices are locked in this quote. Nothing is reserved yet.
        </p>
      )}
      {quote.status === 'draft' && (
        <div className="mt-3">
          {error && <div className="text-xs text-red-500 mb-2">{error}</div>}
          <button onClick={accept} disabled={busy} className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5 disabled:opacity-60">
            {busy ? 'Reserving…' : 'Accept & reserve'}
          </button>
          <span className="text-[10px] text-muted ml-2">Holds each option for 48 hours while you pay.</span>
        </div>
      )}
      {quote.status === 'accepted' && (
        <Link to={`/customer/events/${eventId}/bookings`} className="inline-flex mt-3 text-xs font-bold text-primary">Go to bookings & payments →</Link>
      )}
    </div>
  );
}

export default function QuotesPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useLoad(() => customerApi.quotes(id), [id]);
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

  if (loading && !data) return <div className="text-xs text-muted">Loading…</div>;
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

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <BackLink to={`/customer/events/${id}`}>{event.title}</BackLink>
      <h1 className="text-xl font-extrabold text-navy">Quotes</h1>

      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="text-sm font-bold text-navy">Your selections</div>
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
            <div className="text-[11px] text-muted mt-1">Prices as shown when you chose. The quote re-checks every option before locking prices.</div>
            {actionError && <div className="text-xs text-red-500 mt-2">{actionError}</div>}
            <button
              onClick={getQuote}
              disabled={busy || event.status === 'draft'}
              className="mt-3 rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5 disabled:opacity-50"
            >
              {busy ? 'Preparing…' : `Get a quote (${formatINR(selectionTotal)})`}
            </button>
          </>
        )}
      </div>

      {quotes.length === 0 ? (
        <Empty title="No quotes yet">Select options, then get a quote to lock the prices for 7 days.</Empty>
      ) : (
        quotes.map((q) => <QuoteCard key={q.id} quote={q} eventId={id} />)
      )}
    </div>
  );
}
