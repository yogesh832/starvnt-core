import { useState, useEffect, useCallback } from 'react';
import { Page, Card } from './shared.jsx';
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

  function cleanNegotiationReason(text = '') {
    if (!text) return '';
    let cleaned = String(text);
    while (/^(Vendor revised offer:\s*|Revised proposal in response to customer counter offer:\s*|Customer requested change\s*-\s*)/i.test(cleaned)) {
      cleaned = cleaned.replace(/^(Vendor revised offer:\s*|Revised proposal in response to customer counter offer:\s*|Customer requested change\s*-\s*)/i, '').trim();
    }
    return cleaned.trim();
  }

  function openRevision(q) {
    setEditingQuote(q);
    const historyDesc = Array.isArray(q.history) ? q.history.slice().reverse() : [];
    const latestCustomerCounter = historyDesc.find(
      (h) => (h.changedBy === 'Customer' || h.reason?.includes('Customer requested change') || h.reason?.includes('Proposed Budget')) &&
             !h.reason?.startsWith('Vendor revised offer')
    );

    let proposedPrice = q.pricingBreakdown?.basePrice || '';
    let customerNote = '';
    if (latestCustomerCounter) {
      const cleaned = cleanNegotiationReason(latestCustomerCounter.reason);
      const match = cleaned.match(/Proposed Budget:\s*₹?(\d+)/i);
      if (match && match[1]) {
        proposedPrice = match[1];
      }
      customerNote = cleaned;
    }

    setForm({
      basePrice: proposedPrice,
      travelFee: q.pricingBreakdown?.travelFee || 0,
      equipmentFee: q.pricingBreakdown?.equipmentFee || 0,
      setupFee: q.pricingBreakdown?.setupFee || 0,
      additionalFee: q.pricingBreakdown?.additionalFee || 0,
      notes: customerNote
        ? `Revised proposal: ${customerNote}`
        : (cleanNegotiationReason(q.notes) || 'Updated offer based on customer discussion.'),
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
          className="rounded-xl bg-primary text-white text-sm font-semibold px-4 py-2.5 inline-flex items-center gap-1.5 cursor-pointer shadow-sm hover:bg-primary-dark transition"
        >
          <Icon name="plus" size={14} /> Prepare from Enquiry
        </a>
      }
    >
      {/* Pipeline strip */}
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
        <table className="w-full text-[13px] min-w-[700px]">
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

              const historyDesc = Array.isArray(q.history) ? q.history.slice().reverse() : [];
              const latestEvent = historyDesc[0];
              const latestCustomerCounter = historyDesc.find(
                (h) => (h.changedBy === 'Customer' || h.reason?.includes('Customer requested change') || h.reason?.includes('Proposed Budget')) &&
                       !h.reason?.startsWith('Vendor revised offer')
              );
              const isRevisionSent = Boolean(
                latestEvent &&
                (latestEvent.changedBy !== 'Customer' || latestEvent.reason?.startsWith('Vendor revised offer')) &&
                latestCustomerCounter
              );
              const cleanedCustomerNote = latestCustomerCounter ? cleanNegotiationReason(latestCustomerCounter.reason) : '';

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
                        className="text-[11px] font-bold bg-primary hover:bg-primary-dark text-white rounded-lg px-3 py-1.5 transition shadow-xs cursor-pointer"
                      >
                        Send
                      </button>
                    )}
                    {stage === 'Submitted' && (
                      <div className="flex items-center gap-2">
                        {latestCustomerCounter && !isRevisionSent ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 max-w-[180px] truncate"
                              title={cleanedCustomerNote}
                            >
                              💬 {cleanedCustomerNote}
                            </span>
                            <button
                              onClick={() => openRevision(q)}
                              className="text-[11px] font-bold text-white bg-primary hover:bg-primary-dark rounded-lg px-3 py-1.5 shadow-xs transition cursor-pointer"
                            >
                              Revise offer
                            </button>
                          </div>
                        ) : isRevisionSent ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
                              <Icon name="check" size={12} /> Offer sent · Awaiting customer
                            </span>
                            <button
                              onClick={() => openRevision(q)}
                              className="text-[10px] font-semibold text-muted hover:text-navy underline cursor-pointer"
                              title="Edit sent offer if needed"
                            >
                              Edit
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted">Awaiting Customer</span>
                            <button
                              onClick={() => openRevision(q)}
                              className="text-[11px] font-bold text-primary bg-primary-soft hover:bg-primary hover:text-white rounded-lg px-3 py-1.5 transition cursor-pointer"
                            >
                              Revise offer
                            </button>
                          </div>
                        )}
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
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-base font-extrabold text-navy">Revise Customer Offer</h2>
                <p className="text-xs text-muted">{editingQuote.serviceName} · {editingQuote.eventDate}</p>
              </div>
              <button onClick={() => setEditingQuote(null)} className="w-8 h-8 rounded-full bg-lavender text-navy grid place-items-center cursor-pointer" aria-label="Close">
                <Icon name="close" size={14} />
              </button>
            </div>

            {/* Counter proposal callout banner */}
            {(() => {
              const latestNegotiation = Array.isArray(editingQuote.history)
                ? editingQuote.history.slice().reverse().find((h) => h.reason?.includes('Proposed Budget') || h.reason?.includes('counter offer') || h.reason?.includes('Customer requested change'))
                : null;
              if (!latestNegotiation) return null;
              return (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-950">
                  <div className="font-extrabold flex items-center gap-1.5 mb-1 text-amber-900">
                    <Icon name="message" size={14} className="text-amber-600" />
                    <span>Customer Counter Proposal:</span>
                  </div>
                  <div className="font-medium whitespace-pre-wrap">{latestNegotiation.reason.replace('Customer requested change - ', '')}</div>
                </div>
              );
            })()}

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted font-semibold mb-1">Base Price (₹)</label>
                  <input
                    type="number"
                    value={form.basePrice}
                    onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
                    className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3 py-2 text-navy outline-none focus:border-primary font-bold"
                  />
                </div>
                <div>
                  <label className="block text-muted font-semibold mb-1">Travel Fee (₹)</label>
                  <input
                    type="number"
                    value={form.travelFee}
                    onChange={(e) => setForm({ ...form, travelFee: e.target.value })}
                    className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3 py-2 text-navy outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-muted font-semibold mb-1">Equipment (₹)</label>
                  <input
                    type="number"
                    value={form.equipmentFee}
                    onChange={(e) => setForm({ ...form, equipmentFee: e.target.value })}
                    className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-2.5 py-2 text-navy outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-muted font-semibold mb-1">Setup (₹)</label>
                  <input
                    type="number"
                    value={form.setupFee}
                    onChange={(e) => setForm({ ...form, setupFee: e.target.value })}
                    className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-2.5 py-2 text-navy outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-muted font-semibold mb-1">Additional (₹)</label>
                  <input
                    type="number"
                    value={form.additionalFee}
                    onChange={(e) => setForm({ ...form, additionalFee: e.target.value })}
                    className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-2.5 py-2 text-navy outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="bg-primary-soft/50 rounded-xl p-3 flex items-center justify-between">
                <span className="font-semibold text-navy">New Total Quote:</span>
                <span className="font-extrabold text-base text-primary">
                  ₹{(
                    Number(form.basePrice || 0) +
                    Number(form.travelFee || 0) +
                    Number(form.equipmentFee || 0) +
                    Number(form.setupFee || 0) +
                    Number(form.additionalFee || 0)
                  ).toLocaleString()}
                </span>
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Notes & Scope Adjustments</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Explain package adjustments or accept proposed budget..."
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl p-3 text-navy outline-none focus:border-primary resize-none font-medium"
                />
              </div>
            </div>

            <div className="pt-2 flex gap-3 border-t border-gray-100">
              <button
                onClick={() => setEditingQuote(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:bg-gray-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={saveRevision}
                disabled={saving || !form.basePrice}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition shadow-md shadow-primary/25 disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Submitting Revision...' : 'Send Revised Quote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
