import { useState, useEffect } from 'react';
import { Page, Card } from './shared.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import Icon from '../../../components/Icon.jsx';
import { externalApi } from '../../../lib/api.js';

export default function Enquiries() {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [quoteModalOpp, setQuoteModalOpp] = useState(null);
  const [basePrice, setBasePrice] = useState(0);
  const [travelFee, setTravelFee] = useState(0);
  const [equipmentFee, setEquipmentFee] = useState(0);
  const [setupFee, setSetupFee] = useState(0);
  const [additionalFee, setAdditionalFee] = useState(0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    async function loadLiveOpportunities() {
      try {
        setLoading(true);
        const res = await externalApi.call('/vendor/opportunities');
        if (res.ok && Array.isArray(res.opportunities)) {
          const mapped = res.opportunities.map((o) => ({
            id: o._id,
            dbId: o._id,
            customerId: o.customer?._id || o.customer,
            serviceId: o.vendorService,
            service: o.serviceName,
            status: o.status === 'NEW' ? 'New' : o.status,
            ago: 'Matched opportunity',
            date: o.eventDate,
            location: `${o.serviceLocation?.address || ''} ${o.serviceLocation?.locality || o.serviceLocation?.city || 'Venue'}`.trim(),
            guests: o.guestCount || 'As required',
            capability: o.requiredCapability || 'Standard Service Execution',
            coverage: `Serves ${o.serviceLocation?.locality || o.serviceLocation?.city || 'Zone'} (Verified)`,
            availability: 'Eligible slot verified',
            travel: o.estimatedTravel || 'Local Transit',
            travelCost: o.travelCost ? `₹${Number(o.travelCost).toLocaleString()}` : 'Included',
            basePrice: o.basePrice || 0,
            fit: o.fit || 95,
          }));
          setOpportunities(mapped);
          if (mapped[0]) setExpanded(mapped[0].id);
        }
      } catch (err) {
        console.warn('[Enquiries] Load error:', err.message);
      } finally {
        setLoading(false);
      }
    }
    loadLiveOpportunities();
  }, []);

  function handleOpenQuoteModal(opp) {
    setQuoteModalOpp(opp);
    setBasePrice(opp.basePrice || 48000);
    setTravelFee(parseInt(opp.travelCost?.replace(/[^0-9]/g, '')) || 2000);
    setEquipmentFee(0);
    setSetupFee(0);
    setAdditionalFee(0);
    setNotes(`Offer includes ${opp.service} for ${opp.guests} guests on ${opp.date}. Please reply here if you want any change in timing, package, or price.`);
  }

  async function handleSendQuote() {
    if (!quoteModalOpp) return;
    setSubmitting(true);
    try {
      const totalAmount = Number(basePrice) + Number(travelFee) + Number(equipmentFee) + Number(setupFee) + Number(additionalFee);
      if (quoteModalOpp.dbId) {
        await externalApi.call('/quotes', {
          method: 'POST',
          body: {
            opportunityId: quoteModalOpp.dbId,
            customerId: quoteModalOpp.customerId,
            vendorServiceId: quoteModalOpp.serviceId,
            serviceName: quoteModalOpp.service,
            eventDate: quoteModalOpp.date,
            serviceLocation: { address: quoteModalOpp.location },
            pricingBreakdown: {
              basePrice: Number(basePrice),
              travelFee: Number(travelFee),
              equipmentFee: Number(equipmentFee),
              setupFee: Number(setupFee),
              additionalFee: Number(additionalFee),
              totalAmount,
            },
            status: 'SUBMITTED',
            notes,
          },
        });
      }
      setOpportunities((prev) =>
        prev.map((o) => (o.id === quoteModalOpp.id ? { ...o, status: 'Responded' } : o))
      );
      setFeedback(`Offer of ₹${totalAmount.toLocaleString()} submitted for ${quoteModalOpp.service}. Customer can now negotiate or pay 30% advance.`);
      setQuoteModalOpp(null);
    } catch (err) {
      setFeedback(`Notice: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Page
      title="Enquiries & Structured Opportunities"
      sub="Pre-qualified opportunities with service, location, date, guests, capability, coverage, availability, and travel."
      action={
        <button className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-white text-sm font-semibold px-4 py-2.5">
          Filters <Icon name="chevronDown" size={13} />
        </button>
      }
    >
      {feedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 text-xs font-semibold mb-4 inline-flex items-center gap-2 w-full">
          <Icon name="check" size={16} className="text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="space-y-4">
        {opportunities.map((o) => (
          <Card key={o.id} className="!p-0 overflow-hidden border border-gray-100 hover:border-gray-200 transition">
            <button
              onClick={() => setExpanded(expanded === o.id ? null : o.id)}
              className="w-full flex items-center gap-3 p-4 sm:p-5 text-left hover:bg-gray-50/50 transition cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-[15px] text-navy">👤 {o.customerName} · {o.eventType}</span>
                  <StatusChip status={o.status} />
                  <span className="text-[10px] text-muted">{o.id} · {o.ago}</span>
                </div>
                <div className="text-xs text-muted mt-1 font-medium flex flex-wrap items-center gap-2">
                  <span>📅 {o.date}</span>
                  <span>·</span>
                  <span>📍 {o.location}</span>
                  <span>·</span>
                  <span>👥 {o.guests} guests</span>
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 bg-primary-soft/80 border border-primary/20 text-primary px-2.5 py-1 rounded-xl text-xs font-bold">
                  <span className="text-[10px] uppercase tracking-wide opacity-80">Requested Package:</span>
                  <span>{o.service}</span>
                </div>
              </div>
              <div className="text-center shrink-0 ml-2">
                <div className="text-lg font-extrabold text-primary">{o.fit}%</div>
                <div className="text-[9px] text-muted font-bold uppercase">match</div>
              </div>
              <Icon
                name="chevronDown"
                size={16}
                className={`text-muted transition-transform duration-200 shrink-0 ${expanded === o.id ? 'rotate-180' : ''}`}
              />
            </button>

            {expanded === o.id && (
              <div className="border-t border-gray-100 p-4 sm:p-5 bg-gray-50/30">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {[
                    ['Customer Name', o.customerName],
                    ['Event & Date', `${o.eventType} (${o.date})`],
                    ['Requested Package', o.service],
                    ['Required capability', o.capability],
                    ['Coverage', o.coverage],
                    ['Availability', o.availability],
                    ['Estimated travel', o.travel],
                    ['Travel cost', o.travelCost],
                    ['Guest count', `${o.guests} guests`],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-white border border-gray-100 rounded-xl p-3 shadow-xs">
                      <div className="text-muted text-[10px] uppercase tracking-wide font-extrabold">{k}</div>
                      <div className="font-bold text-navy mt-1 truncate">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                  {['Responded', 'RESPONDED', 'Submitted', 'SUBMITTED', 'APPROVED', 'Quote Sent'].includes(o.status) ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-extrabold px-4 py-2.5 shadow-2xs">
                        <Icon name="check" size={14} className="text-emerald-600" />
                        <span>✓ Offer Submitted</span>
                      </span>
                      <button
                        onClick={() => handleOpenQuoteModal(o)}
                        className="rounded-xl border border-primary/30 text-primary bg-primary-soft hover:bg-primary-soft/80 text-xs font-bold px-4 py-2.5 transition cursor-pointer"
                      >
                        Revise / Update Offer
                      </button>
                      <a
                        href="/vendor/messages"
                        className="rounded-xl border border-gray-200 text-xs font-semibold px-4 py-2.5 hover:bg-lavender transition flex items-center gap-1.5 text-navy"
                      >
                        <Icon name="message" size={13} className="text-primary" />
                        <span>Vendor Chat</span>
                      </a>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleOpenQuoteModal(o)}
                        className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold px-5 py-2.5 transition shadow-sm cursor-pointer"
                      >
                        Respond & Quote
                      </button>
                      <button className="rounded-xl border border-gray-200 text-xs font-semibold px-5 py-2.5 hover:bg-lavender transition cursor-pointer">
                        Ask a question
                      </button>
                      <button
                        onClick={() => setOpportunities((prev) => prev.filter((item) => item.id !== o.id))}
                        className="rounded-xl text-xs font-semibold px-4 py-2.5 text-muted hover:text-red-500 transition cursor-pointer"
                      >
                        Decline
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>
        ))}

        {loading && opportunities.length === 0 && (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-slate-200/80 animate-pulse" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-44 bg-slate-200/80 animate-pulse rounded-full" />
                    <div className="h-3 w-32 bg-slate-200/50 animate-pulse rounded-full" />
                  </div>
                </div>
                <div className="h-6 w-24 bg-slate-200/60 animate-pulse rounded-full" />
              </div>
              <div className="h-12 bg-slate-100/70 rounded-xl animate-pulse" />
              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                <div className="h-3 w-28 bg-slate-200/60 animate-pulse rounded-full" />
                <div className="h-8 w-28 bg-slate-200/70 animate-pulse rounded-xl" />
              </div>
            </Card>
          ))
        )}

        {opportunities.length === 0 && !loading && (
          <Card className="text-center py-12 px-6">
            <div className="w-14 h-14 rounded-2xl bg-primary-soft text-primary grid place-items-center mx-auto mb-3 shadow-xs">
              <Icon name="message" size={26} />
            </div>
            <h3 className="text-base font-extrabold text-navy">No Enquiries Yet</h3>
            <p className="text-xs text-muted max-w-md mx-auto mt-1 leading-relaxed">
              When clients submit event requirements matching your category, verified coverage, and calendar availability, new pre-qualified leads will appear here with instant quotation tools.
            </p>
          </Card>
        )}
      </div>

      {/* Quote Submission Modal */}
      {quoteModalOpp && (
        <div className="vendor-modal-backdrop animate-fade">
          <div className="vendor-modal-panel max-w-md p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-base font-extrabold text-navy">Send Customer Offer</h2>
                <p className="text-xs text-muted">{quoteModalOpp.service} · {quoteModalOpp.date}</p>
              </div>
              <button
                onClick={() => setQuoteModalOpp(null)}
                className="w-8 h-8 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center transition"
                aria-label="Close"
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-muted font-semibold mb-1">Your price for this quote (₹)</label>
                <input
                  type="number"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold text-navy outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Travel & logistics (₹)</label>
                <input
                  type="number"
                  value={travelFee}
                  onChange={(e) => setTravelFee(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold text-navy outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Equipment', equipmentFee, setEquipmentFee],
                  ['Setup', setupFee, setSetupFee],
                  ['Other', additionalFee, setAdditionalFee],
                ].map(([label, value, setter]) => (
                  <div key={label}>
                    <label className="block text-muted font-semibold mb-1">{label} (₹)</label>
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3 py-2.5 font-bold text-navy outline-none focus:border-primary"
                    />
                  </div>
                ))}
              </div>

              <div className="p-3.5 rounded-2xl bg-primary-soft/60 border border-primary/20 flex justify-between items-baseline">
                <span className="font-extrabold text-navy">Customer quote total</span>
                <span className="font-extrabold text-lg text-primary">
                  ₹{(Number(basePrice) + Number(travelFee) + Number(equipmentFee) + Number(setupFee) + Number(additionalFee)).toLocaleString()}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100 flex justify-between text-xs">
                <span className="font-bold text-emerald-800">Customer pays 30% advance</span>
                <span className="font-extrabold text-emerald-700">
                  ₹{Math.ceil((Number(basePrice) + Number(travelFee) + Number(equipmentFee) + Number(setupFee) + Number(additionalFee)) * 0.3).toLocaleString()}
                </span>
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Message shown to customer with this quote</label>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl p-3 text-navy outline-none focus:border-primary resize-none"
                />
                <p className="text-[10px] text-muted mt-1">Mention what is included, any condition, and what can be negotiated.</p>
              </div>
            </div>

            <div className="vendor-modal-actions pt-2 flex gap-3">
              <button
                onClick={() => setQuoteModalOpp(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSendQuote}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark shadow-md shadow-primary/25"
              >
                {submitting ? 'Sending...' : 'Send Offer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
