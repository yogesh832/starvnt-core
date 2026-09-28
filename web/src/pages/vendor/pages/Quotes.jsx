import { useState, useEffect, useCallback } from 'react';
import { Page, Card} from './shared.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import Icon from '../../../components/Icon.jsx';
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
  const [editingQuote, setEditingQuote] = useState(null);
  const [form, setForm] = useState({ basePrice: '', travelFee: '', equipmentFee: '', setupFee: '', additionalFee: '', notes: '' });
  const [saving, setSaving] = useState(false);

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

  function openRevision(q) {
    setEditingQuote(q);
    setForm({
      basePrice: q.pricingBreakdown?.basePrice || '',
      travelFee: q.pricingBreakdown?.travelFee || 0,
      equipmentFee: q.pricingBreakdown?.equipmentFee || 0,
      setupFee: q.pricingBreakdown?.setupFee || 0,
      additionalFee: q.pricingBreakdown?.additionalFee || 0,
      notes: q.notes || 'Updated offer based on customer discussion.',
    });
  }

  async function saveRevision() {
    if (!editingQuote) return;
    setSaving(true);
    try {
      const totalAmount =
        Number(form.basePrice) +
        Number(form.travelFee) +
        Number(form.equipmentFee) +
        Number(form.setupFee) +
        Number(form.additionalFee);
      await externalApi.call(`/vendor/quotes/${editingQuote._id}/revise`, {
        method: 'POST',
        body: {
          pricingBreakdown: {
            basePrice: Number(form.basePrice),
            travelFee: Number(form.travelFee),
            equipmentFee: Number(form.equipmentFee),
            setupFee: Number(form.setupFee),
            additionalFee: Number(form.additionalFee),
            totalAmount,
          },
          notes: form.notes,
        },
      });
      setEditingQuote(null);
      await loadQuotes();
    } catch (err) {
      alert(`Could not revise quote: ${err.message}`);
    } finally {
      setSaving(false);
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
          className="rounded-xl bg-primary text-white text-sm font-semibold px-4 py-2.5 inline-flex items-center gap-1.5"
        >
          <Icon name="plus" size={14} /> Prepare from Enquiry
        </a>
      }
    >
      {/* Pipeline strip — 2-col on mobile, 5-col on sm+ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {PIPELINE.map((p) => (
          <div key={p.stage} className="bg-white rounded-xl px-3 py-3 shadow-xs border border-gray-100">
            <div className="text-lg font-extrabold text-navy">{(stages[p.stage] || []).length}</div>
            <div className="text-xs font-semibold text-navy mt-0.5">{p.stage}</div>
            <div className="text-[10px] text-muted">{p.hint}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-xs bg-white">
        <table className="w-full text-[13px] min-w-[680px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted border-b border-gray-100 bg-gray-50/60">
              {['Quote', 'Client', 'Service', 'Event Date', 'Base', 'Travel', 'Total', 'Status', 'Action'].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
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
                  <td className="px-4 py-3 font-semibold text-primary whitespace-nowrap">{q.quoteReference || q._id.slice(-6)}</td>
                  <td className="px-4 py-3 font-medium text-navy whitespace-nowrap">{clientName}</td>
                  <td className="px-4 py-3 text-muted max-w-[140px] truncate">{q.serviceName}</td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{q.eventDate}</td>
                  <td className="px-4 py-3 text-ink whitespace-nowrap">₹{base.toLocaleString()}</td>
                  <td className="px-4 py-3 text-ink whitespace-nowrap">₹{travel.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-navy whitespace-nowrap">₹{total.toLocaleString()}</td>
                  <td className="px-4 py-3"><StatusChip status={stage} /></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {stage === 'Draft' && (
                      <button
                        onClick={() => handleSendQuote(q._id)}
                        className="text-[11px] font-bold bg-primary hover:bg-primary-dark text-white rounded-lg px-3 py-1.5 transition shadow-xs"
                      >
                        Send
                      </button>
                    )}
                    {stage === 'Submitted' && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted">Awaiting Customer</span>
                        <button
                          onClick={() => openRevision(q)}
                          className="text-[11px] font-bold text-primary bg-primary-soft rounded-lg px-3 py-1.5"
                        >
                          Revise offer
                        </button>
                      </div>
                    )}
                    {stage === 'Approved' && (
                      <span className="text-[11px] text-emerald-600 font-semibold inline-flex items-center gap-1">
                        <Icon name="check" size={12} /> Booking created
                      </span>
                    )}
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
      </div>

      {editingQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-base font-extrabold text-navy">Revise Customer Offer</h2>
                <p className="text-xs text-muted">{editingQuote.serviceName} · {editingQuote.eventDate}</p>
              </div>
              <button onClick={() => setEditingQuote(null)} className="w-8 h-8 rounded-full bg-lavender grid place-items-center" aria-label="Close">
                <Icon name="close" size={14} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                ['Your price', 'basePrice'],
                ['Travel', 'travelFee'],
                ['Equipment', 'equipmentFee'],
                ['Setup', 'setupFee'],
                ['Other', 'additionalFee'],
              ].map(([label, key]) => (
                <div key={key}>
                  <label className="block text-muted font-semibold mb-1">{label} (₹)</label>
                  <input
                    type="number"
                    value={form[key]}
                    onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3 py-2.5 font-bold outline-none focus:border-primary"
                  />
                </div>
              ))}
              <div className="rounded-2xl bg-primary-soft/70 border border-primary/20 p-3 flex flex-col justify-center">
                <span className="text-[10px] text-muted font-bold">New total</span>
                <span className="text-lg font-extrabold text-primary">
                  ₹{(
                    Number(form.basePrice) +
                    Number(form.travelFee) +
                    Number(form.equipmentFee) +
                    Number(form.setupFee) +
                    Number(form.additionalFee)
                  ).toLocaleString()}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-muted font-semibold mb-1 text-xs">Message to customer</label>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full bg-lavender/60 border border-gray-200 rounded-xl p-3 text-xs outline-none focus:border-primary resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setEditingQuote(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted">Cancel</button>
              <button onClick={saveRevision} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-60">
                {saving ? 'Saving...' : 'Send revised offer'}
              </button>
            </div>
          </div>
        </div>
      )}

    </Page>

  );
}
