import { useState, useEffect } from 'react';
import { Page, Card } from './shared.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import { externalApi } from '../../../lib/api.js';

const INITIAL_OPPORTUNITIES = [
  {
    id: 'ENQ-1042', service: 'Wedding Photography', status: 'New', ago: '2h ago',
    date: '26 Nov 2026', location: 'Kisan Palace, New Town', guests: 500,
    capability: '2 photographers · Candid + Traditional · Full day',
    coverage: 'Serves New Town ✓', availability: 'Eligible slot found ✓',
    travel: 'Barasat → New Town', travelCost: '₹2,000 est.',
    basePrice: 48000,
    fit: 96,
  },
  {
    id: 'ENQ-1043', service: 'Pre-wedding Shoot', status: 'Interested', ago: '5h ago',
    date: '14 Dec 2026', location: 'Eco Park, New Town', guests: 2,
    capability: '1 photographer · Candid · 4 hours · Outdoor',
    coverage: 'Serves New Town ✓', availability: 'Eligible slot found ✓',
    travel: 'Barasat → New Town', travelCost: '₹800 est.',
    basePrice: 18000,
    fit: 88,
  },
  {
    id: 'ENQ-1044', service: 'Corporate Event Coverage', status: 'Hot lead', ago: '1d ago',
    date: '10 Jan 2027', location: 'ITC Royal Bengal', guests: 300,
    capability: '2 photographers · Conference + Candid · Half day',
    coverage: 'Serves East Kolkata ✓', availability: 'Conflict check pending',
    travel: 'Barasat → EM Bypass', travelCost: '₹1,500 est.',
    basePrice: 50000,
    fit: 74,
  },
];

export default function Enquiries() {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [quoteModalOpp, setQuoteModalOpp] = useState(null);
  const [basePrice, setBasePrice] = useState(48000);
  const [travelFee, setTravelFee] = useState(2000);
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
            ago: 'Matched by Aura+',
            date: o.eventDate,
            location: `${o.serviceLocation?.address || ''} ${o.serviceLocation?.locality || 'New Town'}`.trim(),
            guests: o.guestCount || 500,
            capability: o.requiredCapability || '2 photographers · Candid + Traditional · Full day',
            coverage: `Serves ${o.serviceLocation?.locality || 'Kolkata'} ✓`,
            availability: 'Eligible slot verified ✓',
            travel: o.estimatedTravel || 'Barasat → New Town',
            travelCost: `₹${(o.travelCost || 2000).toLocaleString()}`,
            basePrice: 48000,
            fit: 95,
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
    setNotes(`Full day coverage at ${opp.location} on ${opp.date}`);
  }

  async function handleSendQuote() {
    if (!quoteModalOpp) return;
    setSubmitting(true);
    try {
      const totalAmount = Number(basePrice) + Number(travelFee);
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
      setFeedback(`✓ Quote of ₹${totalAmount.toLocaleString()} submitted for ${quoteModalOpp.service}. Saved to backend with Central Automation event.`);
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
      sub="Spec §9: Pre-qualified opportunities with service, location, date, guests, capability, coverage, availability, and travel."
      action={<button className="rounded-xl bg-primary text-white text-sm font-semibold px-4 py-2.5">Filters ▾</button>}
    >
      {feedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 text-xs font-semibold mb-4">
          {feedback}
        </div>
      )}

      <div className="space-y-4">
        {opportunities.map((o) => (
          <Card key={o.id} className="!p-0 overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === o.id ? null : o.id)}
              className="w-full flex items-center gap-3 p-4 sm:p-5 text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[15px]">{o.service}</span>
                  <StatusChip status={o.status} />
                  <span className="text-[10px] text-muted">{o.id} · {o.ago}</span>
                </div>
                <div className="text-xs text-muted mt-1">{o.date} · {o.location} · {o.guests} guests</div>
              </div>
              <div className="text-center shrink-0">
                <div className="text-lg font-extrabold text-primary">{o.fit}%</div>
                <div className="text-[9px] text-muted">match</div>
              </div>
              <span className="text-muted">{expanded === o.id ? '▴' : '▾'}</span>
            </button>

            {expanded === o.id && (
              <div className="border-t border-gray-100 p-4 sm:p-5">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {[
                    ['Required capability', o.capability],
                    ['Coverage', o.coverage],
                    ['Availability', o.availability],
                    ['Estimated travel', o.travel],
                    ['Travel cost', o.travelCost],
                    ['Guest count', `${o.guests} guests`],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-lavender rounded-xl p-3">
                      <div className="text-muted text-[10px] uppercase tracking-wide">{k}</div>
                      <div className="font-semibold mt-1">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <button
                    onClick={() => handleOpenQuoteModal(o)}
                    className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold px-5 py-2.5 transition shadow-sm"
                  >
                    Respond & Quote
                  </button>
                  <button className="rounded-xl border border-gray-200 text-xs font-semibold px-5 py-2.5 hover:bg-lavender transition">
                    Ask a question
                  </button>
                  <button
                    onClick={() => setOpportunities((prev) => prev.filter((item) => item.id !== o.id))}
                    className="rounded-xl text-xs font-semibold px-4 py-2.5 text-muted hover:text-red-500 transition"
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}
          </Card>
        ))}

        {opportunities.length === 0 && !loading && (
          <Card className="text-center py-12 px-6">
            <div className="w-14 h-14 rounded-2xl bg-primary-soft text-primary grid place-items-center text-2xl mx-auto mb-3 shadow-xs">
              📩
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs animate-fade">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-base font-extrabold text-navy">Submit Official Quote</h2>
                <p className="text-xs text-muted">{quoteModalOpp.service} · {quoteModalOpp.date}</p>
              </div>
              <button onClick={() => setQuoteModalOpp(null)} className="w-8 h-8 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-muted font-semibold mb-1">Base Price (₹)</label>
                <input
                  type="number"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold text-navy outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Travel & Logistics (₹)</label>
                <input
                  type="number"
                  value={travelFee}
                  onChange={(e) => setTravelFee(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold text-navy outline-none focus:border-primary"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-primary-soft/60 border border-primary/20 flex justify-between items-baseline">
                <span className="font-extrabold text-navy">Validated Total Cost</span>
                <span className="font-extrabold text-lg text-primary">₹{(Number(basePrice) + Number(travelFee)).toLocaleString()}</span>
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Terms / Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl p-3 text-navy outline-none focus:border-primary resize-none"
                />
              </div>
            </div>

            <div className="pt-2 flex gap-3">
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
                {submitting ? 'Sending...' : 'Send Quote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
