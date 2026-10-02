import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from './shared.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import Icon from '../../../components/Icon.jsx';
import { externalApi } from '../../../lib/api.js';

const PIPELINE = [
  { stage: 'All', hint: 'All quotations' },
  { stage: 'Draft', hint: 'Finish pricing & terms' },
  { stage: 'Submitted', hint: 'Awaiting customer / negotiations' },
  { stage: 'Approved', hint: 'Booking request confirmed' },
  { stage: 'Rejected', hint: 'Customer declined' },
  { stage: 'Expired', hint: 'No response in window' },
];

export default function Quotes() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStage, setSelectedStage] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & drawers
  const [viewingQuote, setViewingQuote] = useState(null);
  const [editingQuote, setEditingQuote] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Revision form state
  const [form, setForm] = useState({
    basePrice: '',
    travelFee: '',
    equipmentFee: '',
    setupFee: '',
    additionalFee: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const loadQuotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await externalApi.call('/quotes');
      if (res.ok && res.quotes) {
        setQuotes(res.quotes);
        // Refresh viewed quote if currently open
        if (viewingQuote) {
          const updated = res.quotes.find((q) => q._id === viewingQuote._id);
          if (updated) setViewingQuote(updated);
        }
      }
    } catch (err) {
      console.error('[Quotes] Failed to load quotes:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [viewingQuote]);

  useEffect(() => {
    loadQuotes();
  }, []);

  async function handleSendQuote(quoteId, e) {
    e?.stopPropagation?.();
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
      alert(`Could not send quote: ${err.message}`);
    }
  }

  function cleanNegotiationReason(text = '') {
    if (!text) return '';
    let cleaned = String(text);
    while (
      /^(Vendor revised offer:\s*|Revised proposal in response to customer counter offer:\s*|Customer requested change\s*-\s*)/i.test(
        cleaned
      )
    ) {
      cleaned = cleaned
        .replace(
          /^(Vendor revised offer:\s*|Revised proposal in response to customer counter offer:\s*|Customer requested change\s*-\s*)/i,
          ''
        )
        .trim();
    }
    return cleaned.trim();
  }

  function openRevision(q, e) {
    e?.stopPropagation?.();
    setEditingQuote(q);
    const historyDesc = Array.isArray(q.history) ? q.history.slice().reverse() : [];
    const latestCustomerCounter = historyDesc.find(
      (h) =>
        (h.changedBy === 'Customer' ||
          h.reason?.includes('Customer requested change') ||
          h.reason?.includes('Proposed Budget')) &&
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
        : cleanNegotiationReason(q.notes) || 'Updated offer based on customer discussion.',
    });
  }

  async function saveRevision() {
    if (!editingQuote) return;
    setSaving(true);
    try {
      const totalAmount =
        Number(form.basePrice || 0) +
        Number(form.travelFee || 0) +
        Number(form.equipmentFee || 0) +
        Number(form.setupFee || 0) +
        Number(form.additionalFee || 0);

      await externalApi.call(`/vendor/quotes/${editingQuote._id}/revise`, {
        method: 'POST',
        body: {
          pricingBreakdown: {
            basePrice: Number(form.basePrice || 0),
            travelFee: Number(form.travelFee || 0),
            equipmentFee: Number(form.equipmentFee || 0),
            setupFee: Number(form.setupFee || 0),
            additionalFee: Number(form.additionalFee || 0),
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
    const s = String(status).toUpperCase();
    if (s === 'DRAFT') return 'Draft';
    if (s === 'SUBMITTED') return 'Submitted';
    if (s === 'APPROVED') return 'Approved';
    if (s === 'REJECTED') return 'Rejected';
    if (s === 'EXPIRED') return 'Expired';
    return status;
  };

  const stages = useMemo(() => {
    const acc = { All: quotes };
    for (const q of quotes) {
      const st = normalizeStatus(q.status);
      acc[st] = acc[st] || [];
      acc[st].push(q);
    }
    return acc;
  }, [quotes]);

  // Filtered quotes based on stage and search
  const filteredQuotes = useMemo(() => {
    let list = quotes;
    if (selectedStage !== 'All') {
      list = list.filter((q) => normalizeStatus(q.status) === selectedStage);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      list = list.filter((q) => {
        const clientName = (q.customer?.fullName || q.customer?.email || '').toLowerCase();
        const ref = (q.quoteReference || q._id || '').toLowerCase();
        const service = (q.serviceName || '').toLowerCase();
        const date = (q.eventDate || '').toLowerCase();
        return (
          clientName.includes(query) ||
          ref.includes(query) ||
          service.includes(query) ||
          date.includes(query)
        );
      });
    }
    return list;
  }, [quotes, selectedStage, searchQuery]);

  function askAuraAboutQuote(q, e) {
    e?.stopPropagation?.();
    const clientName = q.customer?.fullName || 'the customer';
    const total = q.pricingBreakdown?.totalAmount || 0;
    const prompt = `Give me negotiation advice for quote ${q.quoteReference || q._id.slice(-6)} for ${clientName} (${q.serviceName} on ${q.eventDate}, total ₹${total.toLocaleString('en-IN')}). What is the best strategy to get this approved?`;
    window.dispatchEvent(new CustomEvent('openVendorAura', { detail: { text: prompt } }));
  }

  function copyQuoteSummary(q, e) {
    e?.stopPropagation?.();
    const clientName = q.customer?.fullName || 'Customer';
    const base = q.pricingBreakdown?.basePrice || 0;
    const travel = q.pricingBreakdown?.travelFee || 0;
    const total = q.pricingBreakdown?.totalAmount || base + travel;
    const text = `STARVNT Quote ${q.quoteReference || ''}\nClient: ${clientName}\nService: ${q.serviceName}\nEvent Date: ${q.eventDate}\nTotal Amount: ₹${total.toLocaleString('en-IN')}\nStatus: ${q.status}`;
    navigator.clipboard?.writeText(text);
    setCopiedId(q._id);
    setTimeout(() => setCopiedId(null), 2500);
  }

  // Quick preset adjusters in revision modal
  function applyQuickPreset(type, customerBudget, originalTotal) {
    const travel = Number(form.travelFee || 0);
    const equip = Number(form.equipmentFee || 0);
    const setup = Number(form.setupFee || 0);
    const add = Number(form.additionalFee || 0);
    const nonBase = travel + equip + setup + add;

    if (type === 'match' && customerBudget) {
      const newBase = Math.max(0, customerBudget - nonBase);
      setForm((prev) => ({
        ...prev,
        basePrice: String(newBase),
        notes: `Agreed to your proposed budget of ₹${customerBudget.toLocaleString('en-IN')}. Looking forward to your event!`,
      }));
    } else if (type === 'middle' && customerBudget && originalTotal) {
      const mid = Math.round((originalTotal + customerBudget) / 2);
      const newBase = Math.max(0, mid - nonBase);
      setForm((prev) => ({
        ...prev,
        basePrice: String(newBase),
        notes: `Offering a special middle-ground discount of ₹${mid.toLocaleString('en-IN')} to confirm your date.`,
      }));
    } else if (type === 'minus1000') {
      const currentBase = Number(form.basePrice || 0);
      setForm((prev) => ({
        ...prev,
        basePrice: String(Math.max(0, currentBase - 1000)),
      }));
    } else if (type === 'minus2000') {
      const currentBase = Number(form.basePrice || 0);
      setForm((prev) => ({
        ...prev,
        basePrice: String(Math.max(0, currentBase - 2000)),
      }));
    }
  }

  return (
    <Page
      title="Quotes & Proposals"
      sub="Create, track, and negotiate quotations. Customers can counter-offer or accept with 30% advance."
      action={
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('openVendorAura', {
                  detail: { text: 'Which quotes should I follow up on today?' },
                })
              );
            }}
            className="rounded-xl border border-primary/30 bg-primary-soft/50 text-primary text-xs font-bold px-3 py-2.5 inline-flex items-center gap-1.5 hover:bg-primary hover:text-white transition cursor-pointer"
            title="Ask Aura for quote insights"
          >
            <Icon name="bolt" size={14} /> Ask Aura
          </button>
          <a
            href="/vendor/enquiries"
            className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5 inline-flex items-center gap-1.5 cursor-pointer shadow-sm hover:bg-primary-dark transition"
          >
            <Icon name="plus" size={14} /> Prepare from Enquiry
          </a>
        </div>
      }
    >
      {/* Interactive Pipeline Stage Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {PIPELINE.map((p) => {
          const count = (stages[p.stage] || []).length;
          const isSelected = selectedStage === p.stage;
          return (
            <button
              key={p.stage}
              onClick={() => setSelectedStage(p.stage)}
              className={`text-left rounded-2xl p-3 border transition-all cursor-pointer relative overflow-hidden group ${
                isSelected
                  ? 'bg-white border-primary shadow-md ring-2 ring-primary/20 -translate-y-0.5'
                  : 'bg-white/80 hover:bg-white border-gray-100 hover:border-gray-200 shadow-xs'
              }`}
            >
              {isSelected && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-[#9b6dff]" />
              )}
              <div className="flex items-center justify-between">
                <span className="text-xl font-extrabold text-navy group-hover:text-primary transition-colors">
                  {count}
                </span>
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                )}
              </div>
              <div className="text-xs font-bold text-navy mt-1 truncate">{p.stage}</div>
              <div className="text-[10px] text-muted truncate mt-0.5">{p.hint}</div>
            </button>
          );
        })}
      </div>

      {/* Search, Filter Summary Bar */}
      <div className="bg-white rounded-2xl p-3 shadow-xs border border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <Icon name="search" size={15} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by client, quote #, service, or date..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-lavender/50 border border-transparent focus:border-primary/40 focus:bg-white text-xs font-medium text-navy placeholder:text-muted outline-none transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-navy cursor-pointer"
              >
                <Icon name="close" size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted">
            Showing <strong className="text-navy">{filteredQuotes.length}</strong> of {quotes.length}
          </span>
          {(selectedStage !== 'All' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedStage('All');
                setSearchQuery('');
              }}
              className="text-[11px] font-bold text-primary hover:underline cursor-pointer ml-1"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Responsive Interactive Quotes List / Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/70 border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-muted">
                <th className="px-4 py-3.5">Client & Reference</th>
                <th className="px-4 py-3.5">Service & Event Date</th>
                <th className="px-4 py-3.5">Total Quote</th>
                <th className="px-4 py-3.5">Status & Activity</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredQuotes.map((q) => {
                const stage = normalizeStatus(q.status);
                const base = q.pricingBreakdown?.basePrice || 0;
                const travel = q.pricingBreakdown?.travelFee || 0;
                const total = q.pricingBreakdown?.totalAmount || base + travel;
                const clientName = q.customer?.fullName || q.customer?.email || 'Customer';
                const clientInitials = clientName
                  .split(' ')
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || 'C';

                const historyDesc = Array.isArray(q.history) ? q.history.slice().reverse() : [];
                const latestEvent = historyDesc[0];
                const latestCustomerCounter = historyDesc.find(
                  (h) =>
                    (h.changedBy === 'Customer' ||
                      h.reason?.includes('Customer requested change') ||
                      h.reason?.includes('Proposed Budget')) &&
                    !h.reason?.startsWith('Vendor revised offer')
                );
                const isRevisionSent = Boolean(
                  latestEvent &&
                    (latestEvent.changedBy !== 'Customer' ||
                      latestEvent.reason?.startsWith('Vendor revised offer')) &&
                    latestCustomerCounter
                );
                const cleanedCustomerNote = latestCustomerCounter
                  ? cleanNegotiationReason(latestCustomerCounter.reason)
                  : '';
                const counterBudgetMatch = cleanedCustomerNote.match(/Proposed Budget:\s*₹?(\d+)/i);
                const customerCounterAmount = counterBudgetMatch ? counterBudgetMatch[1] : null;

                return (
                  <tr
                    key={q._id}
                    onClick={() => setViewingQuote(q)}
                    className="hover:bg-lavender/40 transition-colors cursor-pointer group"
                  >
                    {/* Client & Reference */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-soft text-primary font-extrabold text-xs grid place-items-center shrink-0 border border-primary/20">
                          {clientInitials}
                        </div>
                        <div className="min-w-0">
                          <div className="font-extrabold text-navy text-[13px] truncate group-hover:text-primary transition-colors">
                            {clientName}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted">
                            <span className="font-semibold text-primary">
                              {q.quoteReference || q._id.slice(-6)}
                            </span>
                            {q.createdAt && (
                              <>
                                <span>·</span>
                                <span>{new Date(q.createdAt).toLocaleDateString()}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Service & Event Date */}
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-navy text-xs truncate max-w-[200px]">
                        {q.serviceName}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted mt-0.5">
                        <span className="inline-flex items-center gap-1 font-semibold text-ink">
                          <Icon name="calendar" size={12} className="text-muted" />
                          {q.eventDate || 'Date TBD'}
                        </span>
                        {q.serviceLocation?.city && (
                          <>
                            <span>·</span>
                            <span className="truncate">{q.serviceLocation.city}</span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Total Quote & Breakdown */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="text-sm font-extrabold text-navy">
                        ₹{total.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-muted mt-0.5">
                        Base ₹{base.toLocaleString('en-IN')}
                        {travel > 0 && ` · Travel ₹${travel.toLocaleString('en-IN')}`}
                      </div>
                    </td>

                    {/* Status & Activity */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1 items-start">
                        <StatusChip status={stage} />
                        {latestCustomerCounter && !isRevisionSent && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 max-w-[190px] truncate"
                            title={cleanedCustomerNote}
                          >
                            💬 Counter: ₹{customerCounterAmount ? Number(customerCounterAmount).toLocaleString('en-IN') : 'New Budget'}
                          </span>
                        )}
                        {isRevisionSent && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">
                            ✓ Revised offer sent
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div
                        className="flex items-center justify-end gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {stage === 'Draft' && (
                          <button
                            onClick={(e) => handleSendQuote(q._id, e)}
                            className="text-xs font-bold bg-primary hover:bg-primary-dark text-white rounded-xl px-3 py-1.5 transition shadow-xs cursor-pointer inline-flex items-center gap-1"
                          >
                            <Icon name="send" size={12} /> Send
                          </button>
                        )}

                        {stage === 'Submitted' && (
                          <>
                            {latestCustomerCounter && !isRevisionSent ? (
                              <button
                                onClick={(e) => openRevision(q, e)}
                                className="text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 rounded-xl px-3 py-1.5 shadow-xs transition cursor-pointer inline-flex items-center gap-1"
                              >
                                <Icon name="bolt" size={13} /> Revise offer
                              </button>
                            ) : (
                              <button
                                onClick={(e) => openRevision(q, e)}
                                className="text-xs font-bold text-primary bg-primary-soft hover:bg-primary hover:text-white rounded-xl px-2.5 py-1.5 transition cursor-pointer"
                                title="Revise offer"
                              >
                                Revise
                              </button>
                            )}
                          </>
                        )}

                        {stage === 'Approved' && (
                          <span className="text-[11px] text-emerald-600 font-bold inline-flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                            <Icon name="check" size={12} /> Booked
                          </span>
                        )}

                        <button
                          onClick={() => setViewingQuote(q)}
                          className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-primary-soft hover:text-primary text-muted grid place-items-center transition cursor-pointer"
                          title="View complete quote details"
                        >
                          <Icon name="chevronRight" size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {loading && quotes.length === 0 && (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-4 py-4">
                      <div className="h-4 w-32 bg-slate-200/70 animate-pulse rounded-full" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-4 w-28 bg-slate-200/70 animate-pulse rounded-full" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-4 w-20 bg-slate-200/70 animate-pulse rounded-full" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-4 w-20 bg-slate-200/70 animate-pulse rounded-full" />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="h-6 w-16 bg-slate-200/70 animate-pulse rounded-lg ml-auto" />
                    </td>
                  </tr>
                ))
              )}

              {filteredQuotes.length === 0 && !loading && (
                <tr>
                  <td colSpan="5" className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-muted">
                      <span className="w-12 h-12 rounded-2xl bg-lavender/60 text-primary grid place-items-center mb-2">
                        <Icon name="quotes" size={24} />
                      </span>
                      <p className="text-sm font-bold text-navy">No quotations found</p>
                      <p className="text-xs text-muted max-w-sm mt-0.5">
                        {searchQuery || selectedStage !== 'All'
                          ? 'Try adjusting your search query or stage filters above.'
                          : 'You haven’t created any quotes yet. Convert your customer enquiries into custom quotes.'}
                      </p>
                      <a
                        href="/vendor/enquiries"
                        className="mt-3 text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
                      >
                        View received enquiries →
                      </a>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── RICH QUOTE DETAIL DRAWER / MODAL ───────────────────────────────── */}
      {viewingQuote && (
        <div
          className="vendor-modal-backdrop animate-fadeIn"
          onClick={() => setViewingQuote(null)}
        >
          <div
            className="vendor-modal-panel max-w-xl p-4 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-extrabold text-navy">
                    Quote {viewingQuote.quoteReference || viewingQuote._id}
                  </h2>
                  <StatusChip status={normalizeStatus(viewingQuote.status)} />
                </div>
                <p className="text-xs text-muted mt-0.5">
                  Created {new Date(viewingQuote.createdAt || Date.now()).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <button
                onClick={() => setViewingQuote(null)}
                className="w-8 h-8 rounded-full bg-lavender text-navy hover:bg-gray-200 grid place-items-center transition cursor-pointer"
                aria-label="Close"
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            {/* Client Profile Card */}
            <div className="bg-lavender/50 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary text-white font-extrabold text-sm grid place-items-center">
                  {(viewingQuote.customer?.fullName || 'C')[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-extrabold text-navy">
                    {viewingQuote.customer?.fullName || 'Customer'}
                  </div>
                  <div className="text-xs text-muted">
                    {viewingQuote.customer?.phone || viewingQuote.customer?.email || 'Direct customer'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigate('/vendor/messages');
                    setViewingQuote(null);
                  }}
                  className="rounded-xl bg-white border border-primary/30 text-primary text-xs font-bold px-3 py-1.5 hover:bg-primary hover:text-white transition cursor-pointer inline-flex items-center gap-1"
                >
                  <Icon name="message" size={13} /> Chat with Client
                </button>
              </div>
            </div>

            {/* Service & Event Details */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-100">
                <span className="text-[11px] text-muted block mb-0.5">Service Requested</span>
                <span className="font-extrabold text-navy text-[13px] block">
                  {viewingQuote.serviceName}
                </span>
              </div>
              <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-100">
                <span className="text-[11px] text-muted block mb-0.5">Event Date</span>
                <span className="font-extrabold text-navy text-[13px] block flex items-center gap-1">
                  <Icon name="calendar" size={13} className="text-primary" />
                  {viewingQuote.eventDate || 'Date TBD'}
                </span>
              </div>
            </div>

            {/* Itemized Pricing Breakdown */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 text-xs">
              <div className="font-bold text-navy text-[13px] border-b border-gray-100 pb-2 flex items-center justify-between">
                <span>Pricing Itemization</span>
                <span className="text-[11px] font-normal text-muted">INR (₹)</span>
              </div>

              <div className="flex justify-between py-1 text-muted">
                <span>Base Service Fee</span>
                <span className="font-semibold text-navy">
                  ₹{Number(viewingQuote.pricingBreakdown?.basePrice || 0).toLocaleString('en-IN')}
                </span>
              </div>

              {Number(viewingQuote.pricingBreakdown?.travelFee || 0) > 0 && (
                <div className="flex justify-between py-1 text-muted">
                  <span>Travel & Logistics</span>
                  <span className="font-semibold text-navy">
                    ₹{Number(viewingQuote.pricingBreakdown.travelFee).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              {Number(viewingQuote.pricingBreakdown?.equipmentFee || 0) > 0 && (
                <div className="flex justify-between py-1 text-muted">
                  <span>Equipment Rental</span>
                  <span className="font-semibold text-navy">
                    ₹{Number(viewingQuote.pricingBreakdown.equipmentFee).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              {Number(viewingQuote.pricingBreakdown?.setupFee || 0) > 0 && (
                <div className="flex justify-between py-1 text-muted">
                  <span>Setup & Teardown</span>
                  <span className="font-semibold text-navy">
                    ₹{Number(viewingQuote.pricingBreakdown.setupFee).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              {Number(viewingQuote.pricingBreakdown?.additionalFee || 0) > 0 && (
                <div className="flex justify-between py-1 text-muted">
                  <span>Additional Services</span>
                  <span className="font-semibold text-navy">
                    ₹{Number(viewingQuote.pricingBreakdown.additionalFee).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              <div className="border-t border-gray-100 pt-2.5 flex items-center justify-between text-sm">
                <span className="font-extrabold text-navy">Total Validated Quote</span>
                <span className="text-base font-extrabold text-primary">
                  ₹{Number(viewingQuote.pricingBreakdown?.totalAmount || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="text-[11px] text-muted flex items-center justify-between bg-primary-soft/40 px-3 py-1.5 rounded-xl">
                <span>Advance Required to Confirm (30%):</span>
                <strong className="text-primary font-extrabold">
                  ₹{Math.ceil(
                    (Number(viewingQuote.pricingBreakdown?.totalAmount || 0) * 30) / 100
                  ).toLocaleString('en-IN')}
                </strong>
              </div>
            </div>

            {/* Negotiation & Counter-Offer Activity Timeline */}
            <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
              <div className="font-bold text-navy text-[13px] flex items-center gap-1.5">
                <Icon name="message" size={14} className="text-primary" />
                <span>Negotiation & Activity History</span>
              </div>

              {Array.isArray(viewingQuote.history) && viewingQuote.history.length > 0 ? (
                <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                  {viewingQuote.history.map((h, idx) => {
                    const isCustomer =
                      h.changedBy === 'Customer' ||
                      h.reason?.includes('Customer requested change') ||
                      h.reason?.includes('Proposed Budget');
                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl text-xs space-y-1 ${
                          isCustomer
                            ? 'bg-amber-50/80 border border-amber-200 text-amber-950'
                            : 'bg-lavender/60 border border-primary/20 text-navy'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className={isCustomer ? 'text-amber-800' : 'text-primary'}>
                            {isCustomer ? '👤 Client Negotiation' : '🏢 Vendor Update'}
                          </span>
                          <span className="text-muted font-normal">
                            {h.timestamp ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        <p className="font-medium whitespace-pre-wrap">
                          {cleanNegotiationReason(h.reason)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted">No negotiation history recorded for this quote.</p>
              )}
            </div>

            {/* Drawer Action Footer */}
            <div className="vendor-modal-actions pt-2 flex flex-wrap gap-2 border-t border-gray-100">
              <button
                onClick={(e) => copyQuoteSummary(viewingQuote, e)}
                className="py-2.5 px-3 rounded-xl border border-gray-200 text-xs font-bold text-navy hover:bg-gray-50 transition cursor-pointer inline-flex items-center gap-1"
              >
                <Icon name={copiedId === viewingQuote._id ? 'check' : 'copy'} size={13} />
                {copiedId === viewingQuote._id ? 'Copied!' : 'Copy Summary'}
              </button>

              <button
                onClick={(e) => askAuraAboutQuote(viewingQuote, e)}
                className="py-2.5 px-3 rounded-xl border border-primary/30 bg-primary-soft/60 text-primary text-xs font-bold hover:bg-primary hover:text-white transition cursor-pointer inline-flex items-center gap-1"
              >
                <Icon name="bolt" size={13} /> Ask Aura to Advise
              </button>

              {normalizeStatus(viewingQuote.status) === 'Draft' && (
                <button
                  onClick={(e) => {
                    handleSendQuote(viewingQuote._id, e);
                    setViewingQuote(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition shadow-md shadow-primary/25 cursor-pointer inline-flex items-center justify-center gap-1"
                >
                  <Icon name="send" size={13} /> Send Proposal to Client
                </button>
              )}

              {normalizeStatus(viewingQuote.status) === 'Submitted' && (
                <button
                  onClick={(e) => {
                    openRevision(viewingQuote, e);
                    setViewingQuote(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition shadow-md shadow-primary/25 cursor-pointer inline-flex items-center justify-center gap-1"
                >
                  <Icon name="bolt" size={13} /> Revise Offer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SMART REVISION MODAL ────────────────────────────────────────── */}
      {editingQuote && (
        <div className="vendor-modal-backdrop animate-fadeIn">
          <div className="vendor-modal-panel max-w-lg p-4 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-base font-extrabold text-navy">Revise Customer Offer</h2>
                <p className="text-xs text-muted">
                  {editingQuote.serviceName} · {editingQuote.eventDate}
                </p>
              </div>
              <button
                onClick={() => setEditingQuote(null)}
                className="w-8 h-8 rounded-full bg-lavender text-navy hover:bg-gray-200 grid place-items-center transition cursor-pointer"
                aria-label="Close"
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            {/* Counter proposal callout banner & Smart Quick Adjust Presets */}
            {(() => {
              const latestNegotiation = Array.isArray(editingQuote.history)
                ? editingQuote.history
                    .slice()
                    .reverse()
                    .find(
                      (h) =>
                        h.reason?.includes('Proposed Budget') ||
                        h.reason?.includes('counter offer') ||
                        h.reason?.includes('Customer requested change')
                    )
                : null;
              if (!latestNegotiation) return null;

              const cleaned = cleanNegotiationReason(latestNegotiation.reason);
              const match = cleaned.match(/Proposed Budget:\s*₹?(\d+)/i);
              const proposedBudget = match ? Number(match[1]) : null;
              const originalTotal = editingQuote.pricingBreakdown?.totalAmount || 0;

              return (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-950 space-y-2.5">
                  <div className="font-extrabold flex items-center gap-1.5 text-amber-900">
                    <Icon name="message" size={14} className="text-amber-600" />
                    <span>Customer Counter Proposal:</span>
                  </div>
                  <div className="font-medium whitespace-pre-wrap">{cleaned}</div>

                  {/* One-Click Negotiation Adjusters */}
                  <div className="pt-1 flex flex-wrap gap-1.5">
                    {proposedBudget && (
                      <button
                        type="button"
                        onClick={() => applyQuickPreset('match', proposedBudget, originalTotal)}
                        className="rounded-lg bg-amber-600 text-white font-bold text-[10px] px-2.5 py-1 hover:bg-amber-700 transition cursor-pointer shadow-xs"
                      >
                        ✨ Match Budget (₹{proposedBudget.toLocaleString('en-IN')})
                      </button>
                    )}
                    {proposedBudget && originalTotal > proposedBudget && (
                      <button
                        type="button"
                        onClick={() => applyQuickPreset('middle', proposedBudget, originalTotal)}
                        className="rounded-lg bg-white border border-amber-300 text-amber-900 font-bold text-[10px] px-2.5 py-1 hover:bg-amber-100 transition cursor-pointer"
                      >
                        🤝 Split Difference (₹{Math.round((originalTotal + proposedBudget) / 2).toLocaleString('en-IN')})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => applyQuickPreset('minus1000')}
                      className="rounded-lg bg-white border border-amber-300 text-amber-900 font-bold text-[10px] px-2 py-1 hover:bg-amber-100 transition cursor-pointer"
                    >
                      -₹1,000
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickPreset('minus2000')}
                      className="rounded-lg bg-white border border-amber-300 text-amber-900 font-bold text-[10px] px-2 py-1 hover:bg-amber-100 transition cursor-pointer"
                    >
                      -₹2,000
                    </button>
                  </div>
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

              {/* Reactive Total Quote Comparison */}
              {(() => {
                const newTotal =
                  Number(form.basePrice || 0) +
                  Number(form.travelFee || 0) +
                  Number(form.equipmentFee || 0) +
                  Number(form.setupFee || 0) +
                  Number(form.additionalFee || 0);
                const oldTotal = editingQuote.pricingBreakdown?.totalAmount || 0;
                const diff = newTotal - oldTotal;

                return (
                  <div className="bg-primary-soft/50 rounded-xl p-3 flex items-center justify-between border border-primary/20">
                    <div>
                      <span className="font-bold text-navy block">New Total Quote:</span>
                      {diff !== 0 && (
                        <span
                          className={`text-[10px] font-bold ${
                            diff < 0 ? 'text-emerald-600' : 'text-amber-600'
                          }`}
                        >
                          {diff < 0
                            ? `₹${Math.abs(diff).toLocaleString('en-IN')} discount from original`
                            : `+₹${diff.toLocaleString('en-IN')} adjustment`}
                        </span>
                      )}
                    </div>
                    <span className="font-extrabold text-lg text-primary">
                      ₹{newTotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                );
              })()}

              <div>
                <label className="block text-muted font-semibold mb-1">
                  Notes & Proposal Justification
                </label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Explain package adjustments, confirm equipment inclusion, or accept proposed budget..."
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl p-3 text-navy outline-none focus:border-primary resize-none font-medium"
                />
              </div>
            </div>

            <div className="vendor-modal-actions pt-2 flex gap-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setEditingQuote(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted hover:bg-gray-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
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
