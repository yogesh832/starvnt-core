import { useState, useEffect, useCallback } from 'react';
import { Page, Card, EmptyHint } from './shared.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import { externalApi } from '../../../lib/api.js';

const PIPELINE = [
  { stage: 'Draft', hint: 'Finish pricing & terms' },
  { stage: 'Submitted', hint: 'Awaiting customer' },
  { stage: 'Approved', hint: 'Booking request → Core' },
  { stage: 'Rejected', hint: 'Customer declined' },
  { stage: 'Expired', hint: 'No response in window' },
];

export default function Quotes() {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadQuotes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await externalApi.call('/quotes');
      if (res.ok && res.quotes) {
        setQuotes(res.quotes);
      }
    } catch (err) {
      console.error('[Quotes] Failed to load quotes:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  async function handleSendQuote(quoteId) {
    try {
      await externalApi.call(`/quotes/${quoteId}/transition`, {
        method: 'POST',
        body: {
          targetStatus: 'SUBMITTED',
          reason: 'Vendor finalized proposal via Quotes Workspace',
        },
      });
      await loadQuotes();
    } catch (err) {
      alert(`Could not transition quote: ${err.message}`);
    }
  }

  // Normalize status for grouping
  const normalizeStatus = (status) => {
    if (!status) return 'Draft';
    const s = status.toUpperCase();
    if (s === 'DRAFT') return 'Draft';
    if (s === 'SUBMITTED') return 'Submitted';
    if (s === 'APPROVED') return 'Approved';
    if (s === 'REJECTED') return 'Rejected';
    if (s === 'EXPIRED') return 'Expired';
    return status;
  };

  const stages = quotes.reduce((acc, q) => {
    const stage = normalizeStatus(q.status);
    (acc[stage] = acc[stage] || []).push(q);
    return acc;
  }, {});

  return (
    <Page
      title="Quotes"
      sub="Validated total cost = base + travel + logistics. Approval creates a booking request via Core."
      action={
        <a
          href="/vendor/enquiries"
          className="rounded-xl bg-primary text-white text-sm font-semibold px-4 py-2.5 inline-block"
        >
          + Prepare from Enquiry
        </a>
      }
    >
      {/* Pipeline strip */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {PIPELINE.map((p) => (
          <div key={p.stage} className="bg-white rounded-xl px-4 py-3 shadow-xs min-w-[130px] flex-1 border border-gray-100">
            <div className="text-lg font-extrabold text-navy">{(stages[p.stage] || []).length}</div>
            <div className="text-xs font-semibold text-navy mt-0.5">{p.stage}</div>
            <div className="text-[10px] text-muted">{p.hint}</div>
          </div>
        ))}
      </div>

      <Card className="!p-0 overflow-x-auto">
        <table className="w-full text-[13px] min-w-[720px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted border-b border-gray-100">
              {['Quote', 'Client', 'Service', 'Event Date', 'Base', 'Travel', 'Total', 'Status', 'Action'].map((h) => (
                <th key={h} className="px-5 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => {
              const stage = normalizeStatus(q.status);
              const base = q.pricingBreakdown?.basePrice || 0;
              const travel = q.pricingBreakdown?.travelFee || 0;
              const total = q.pricingBreakdown?.totalAmount || base + travel;
              const clientName = q.customer?.fullName || q.customer?.email || 'Customer';

              return (
                <tr key={q._id} className="border-b border-gray-50 last:border-0 hover:bg-lavender/40 transition">
                  <td className="px-5 py-3 font-semibold text-primary">{q.quoteReference || q._id.slice(-6)}</td>
                  <td className="px-5 py-3 font-medium text-navy">{clientName}</td>
                  <td className="px-5 py-3 text-muted">{q.serviceName}</td>
                  <td className="px-5 py-3 text-muted">{q.eventDate}</td>
                  <td className="px-5 py-3 text-ink">₹{base.toLocaleString()}</td>
                  <td className="px-5 py-3 text-ink">₹{travel.toLocaleString()}</td>
                  <td className="px-5 py-3 font-bold text-navy">₹{total.toLocaleString()}</td>
                  <td className="px-5 py-3"><StatusChip status={stage} /></td>
                  <td className="px-5 py-3">
                    {stage === 'Draft' && (
                      <button
                        onClick={() => handleSendQuote(q._id)}
                        className="text-[11px] font-bold bg-primary hover:bg-primary-dark text-white rounded-lg px-3 py-1.5 transition shadow-xs"
                      >
                        Send
                      </button>
                    )}
                    {stage === 'Submitted' && <span className="text-[11px] text-muted">Awaiting Customer</span>}
                    {stage === 'Approved' && <span className="text-[11px] text-emerald-600 font-semibold">Booking created ✓</span>}
                    {['Rejected', 'Expired'].includes(stage) && <span className="text-[11px] text-muted">—</span>}
                  </td>
                </tr>
              );
            })}
            {quotes.length === 0 && !loading && (
              <tr>
                <td colSpan="9" className="py-8 text-center text-xs text-muted">
                  No quotes created yet. Prepare quotes directly from received Enquiries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <EmptyHint text="Invalid transitions are blocked server-side with audit — e.g. a Rejected quote cannot be re-submitted without creating a new revision." />
    </Page>
  );
}
