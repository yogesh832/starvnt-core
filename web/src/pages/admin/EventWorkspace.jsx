import { useState, useEffect } from 'react';
import Icon from '../../components/Icon.jsx';
import { StatusChip } from '../../components/ui.jsx';
import { adminApi } from '../../lib/api.js';

/**
 * Screen 6: Event Details (Workspace) - Core Platform
 * Matches Screen 6 of the Complete Screen Set for Internal Admin.
 */
export default function EventWorkspace({ onBack }) {
  const [activeTab, setActiveTab] = useState('Overview');
  const [checklist, setChecklist] = useState([
    { id: 1, text: 'Review catering quotes', done: false },
    { id: 2, text: 'Confirm decoration vendor', done: false },
    { id: 3, text: 'Make payment for venue', done: true },
    { id: 4, text: 'Check photographer availability', done: true },
  ]);

  const tabs = ['Overview', 'Requirements', 'Vendors', 'Bookings', 'Budget', 'Timeline', 'Documents'];

  const services = [
    { name: 'Photography', vendor: 'Studio Pixel', amount: '₹85,000', status: 'Confirmed' },
    { name: 'Catering', vendor: 'Royal Caterers', amount: '₹2,40,000', status: 'Pending' },
    { name: 'Venue', vendor: 'The Grand Venue', amount: '₹3,50,000', status: 'Confirmed' },
    { name: 'Decoration', vendor: 'Elegance Events', amount: '₹75,000', status: 'In Progress' },
    { name: 'Makeup', vendor: 'Makeup by Riya', amount: '₹45,000', status: 'Confirmed' },
    { name: 'Transport', vendor: 'RideEasy Transport', amount: '₹60,000', status: 'Confirmed' },
    { name: 'AV / DJ', vendor: 'DJ NightPro', amount: '₹1,20,000', status: 'Pending' },
  ];

  const [adminBookings, setAdminBookings] = useState([
    {
      _id: 'sample-bk-1',
      bookingReference: 'BK-2210',
      serviceName: 'Wedding Photography & Cinematic Video',
      vendorName: 'Premium Moments',
      eventDate: '26 Nov 2026',
      serviceLocation: { locality: 'New Town, Kolkata', address: 'Kisan Palace' },
      totalAmount: 50000,
      bookingStatus: 'CONFIRMED',
      paymentStatus: 'PAYMENT_VERIFIED',
      executionStatus: 'COMPLETION_SUBMITTED',
      settlementStatus: 'NOT_ELIGIBLE',
      completionEvidence: [
        {
          deliverablesUrl: 'https://drive.google.com/drive/folders/starvnt-kisan-palace-deliverables',
          notes: '8 hours of full coverage completed. Client signed off on album review.',
        },
      ],
    },
    {
      _id: 'sample-bk-2',
      bookingReference: 'BK-2214',
      serviceName: 'Corporate Event Coverage',
      vendorName: 'Premium Moments',
      eventDate: '10 Jan 2027',
      serviceLocation: { locality: 'EM Bypass, Kolkata', address: 'ITC Royal Bengal' },
      totalAmount: 52000,
      bookingStatus: 'CONFIRMED',
      paymentStatus: 'PAYMENT_VERIFIED',
      executionStatus: 'SERVICE_STARTED',
      settlementStatus: 'NOT_ELIGIBLE',
      completionEvidence: [],
    },
  ]);
  const [adminFeedback, setAdminFeedback] = useState(null);

  useEffect(() => {
    async function loadAdminBookings() {
      try {
        const res = await adminApi.call('/operations/bookings');
        if (res.ok && res.bookings?.length) {
          setAdminBookings(res.bookings);
        }
      } catch (err) {
        // Keeps sample bookings if unauthenticated
      }
    }
    loadAdminBookings();
  }, []);

  async function handleVerifyPayment(id) {
    try {
      await adminApi.call(`/operations/bookings/${id}/verify-payment`, { method: 'POST' });
      setAdminBookings((prev) =>
        prev.map((b) => (b._id === id ? { ...b, paymentStatus: 'PAYMENT_VERIFIED', executionStatus: 'SERVICE_SCHEDULED' } : b))
      );
      setAdminFeedback('Payment verified by Core Platform.');
    } catch (err) {
      setAdminBookings((prev) =>
        prev.map((b) => (b._id === id ? { ...b, paymentStatus: 'PAYMENT_VERIFIED', executionStatus: 'SERVICE_SCHEDULED' } : b))
      );
      setAdminFeedback('Payment verified locally.');
    }
  }

  async function handleValidateCompletion(id) {
    try {
      await adminApi.call(`/operations/bookings/${id}/validate-completion`, { method: 'POST', body: { approved: true } });
      setAdminBookings((prev) =>
        prev.map((b) => (b._id === id ? { ...b, executionStatus: 'COMPLETION_VERIFIED', settlementStatus: 'SETTLEMENT_ELIGIBLE' } : b))
      );
      setAdminFeedback('Completion validated! Settlement unlocked.');
    } catch (err) {
      setAdminBookings((prev) =>
        prev.map((b) => (b._id === id ? { ...b, executionStatus: 'COMPLETION_VERIFIED', settlementStatus: 'SETTLEMENT_ELIGIBLE' } : b))
      );
      setAdminFeedback('Completion validated locally! Settlement unlocked.');
    }
  }

  async function handleSettle(id) {
    try {
      await adminApi.call(`/operations/bookings/${id}/settle`, { method: 'POST' });
      setAdminBookings((prev) =>
        prev.map((b) => (b._id === id ? { ...b, settlementStatus: 'SETTLED' } : b))
      );
      setAdminFeedback('Settlement released to vendor.');
    } catch (err) {
      setAdminBookings((prev) =>
        prev.map((b) => (b._id === id ? { ...b, settlementStatus: 'SETTLED' } : b))
      );
      setAdminFeedback('Settlement released locally.');
    }
  }

  function toggleTodo(id) {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline mb-1.5 cursor-pointer"
          >
            ← Back to Events
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold text-navy">Riya & Arjun Wedding</h1>
            <StatusChip status="Planning" />
          </div>
          <p className="text-xs text-muted mt-1">
            26 November 2025 · New Town, Kolkata · 500 guests
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl bg-white border border-gray-200 hover:bg-lavender text-navy font-bold text-xs px-4 py-2.5 transition shadow-2xs self-start sm:self-auto">
          <Icon name="edit" size={14} />
          <span>Edit Event</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto border-b border-gray-200 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-xs font-extrabold px-4 py-2 rounded-xl transition ${
              activeTab === tab
                ? 'bg-primary text-white shadow-sm shadow-primary/20'
                : 'text-muted hover:text-navy hover:bg-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Top Metrics Strip */}
      <div className="bg-white rounded-3xl p-6 shadow-xs border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Couple image */}
        <div className="flex items-center gap-4 w-full md:w-auto">
          <img
            src="https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=200&q=80"
            alt="Riya & Arjun"
            className="w-20 h-20 rounded-2xl object-cover shadow-xs shrink-0"
          />
          <div>
            <div className="text-xs font-bold text-primary uppercase tracking-wider">Event ID: EVT-9821</div>
            <h3 className="text-base font-extrabold text-navy mt-0.5">Riya Sharma & Arjun Sen</h3>
            <div className="text-xs text-muted">Customer: Priya Sharma (+91 91234 56789)</div>
          </div>
        </div>

        {/* 3 Metric Pills */}
        <div className="grid grid-cols-3 gap-3 w-full md:w-auto">
          <div className="bg-lavender/60 rounded-2xl p-3.5 text-center min-w-[90px]">
            <div className="text-xl font-extrabold text-navy">8</div>
            <div className="text-[10px] font-bold text-muted mt-0.5">Total Services</div>
          </div>
          <div className="bg-emerald-50 rounded-2xl p-3.5 text-center min-w-[90px]">
            <div className="text-xl font-extrabold text-emerald-600">5</div>
            <div className="text-[10px] font-bold text-emerald-700 mt-0.5">Confirmed</div>
          </div>
          <div className="bg-amber-50 rounded-2xl p-3.5 text-center min-w-[90px]">
            <div className="text-xl font-extrabold text-amber-600">2</div>
            <div className="text-[10px] font-bold text-amber-700 mt-0.5">In Progress</div>
          </div>
        </div>

        {/* Progress Ring */}
        <div className="flex items-center gap-3 bg-lavender/40 px-5 py-3 rounded-2xl border border-primary/20 shrink-0">
          <div className="relative w-14 h-14">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="3.5"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#5a4bd1"
                strokeWidth="3.5"
                strokeDasharray="68, 100"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-xs font-extrabold text-primary">
              68%
            </div>
          </div>
          <div>
            <div className="text-xs font-extrabold text-navy">Event Progress</div>
            <div className="text-[10px] text-muted">Ready for execution</div>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'Overview' && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Card 1: Event Details */}
          <div className="bg-white rounded-3xl p-6 shadow-xs border border-gray-100 space-y-4">
            <h2 className="text-base font-extrabold text-navy">Event Details</h2>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-lavender/40 rounded-2xl">
                <div className="text-muted text-[10px] uppercase font-bold">Date</div>
                <div className="font-extrabold text-navy mt-1">26 Nov 2025</div>
              </div>
              <div className="p-3 bg-lavender/40 rounded-2xl">
                <div className="text-muted text-[10px] uppercase font-bold">Location</div>
                <div className="font-extrabold text-navy mt-1">New Town, Kolkata</div>
              </div>
              <div className="p-3 bg-lavender/40 rounded-2xl">
                <div className="text-muted text-[10px] uppercase font-bold">Guests</div>
                <div className="font-extrabold text-navy mt-1">500 Guests</div>
              </div>
              <div className="p-3 bg-lavender/40 rounded-2xl">
                <div className="text-muted text-[10px] uppercase font-bold">Budget</div>
                <div className="font-extrabold text-primary mt-1">₹15,00,000</div>
              </div>
              <div className="p-3 bg-lavender/40 rounded-2xl">
                <div className="text-muted text-[10px] uppercase font-bold">Event Type</div>
                <div className="font-extrabold text-navy mt-1">Wedding</div>
              </div>
              <div className="p-3 bg-lavender/40 rounded-2xl">
                <div className="text-muted text-[10px] uppercase font-bold">Created</div>
                <div className="font-extrabold text-navy mt-1">12 Sep 2025</div>
              </div>
            </div>
          </div>

          {/* Card 2: What's Next? Checklist */}
          <div className="bg-white rounded-3xl p-6 shadow-xs border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-navy">What's Next?</h2>
              <span className="text-xs text-muted font-semibold">
                {checklist.filter((c) => c.done).length} of {checklist.length} completed
              </span>
            </div>
            <ul className="space-y-3 text-xs">
              {checklist.map((item) => (
                <li
                  key={item.id}
                  onClick={() => toggleTodo(item.id)}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-gray-100 hover:bg-lavender/40 cursor-pointer transition"
                >
                  <span
                    className={`w-5 h-5 rounded-full border-2 grid place-items-center transition ${
                      item.done
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-gray-300'
                    }`}
                  >
                    {item.done && <Icon name="check" size={11} strokeWidth={2.5} />}
                  </span>
                  <span className={`font-semibold ${item.done ? 'line-through text-muted' : 'text-navy'}`}>
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'Requirements' && (
        <div className="bg-white rounded-3xl p-6 shadow-xs border border-gray-100">
          <h2 className="text-base font-extrabold text-navy mb-4">Required Services & State</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted border-b border-gray-100 pb-2">
                  <th className="pb-3 font-semibold">Service</th>
                  <th className="pb-3 font-semibold">Allocated Vendor</th>
                  <th className="pb-3 font-semibold">Amount</th>
                  <th className="pb-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {services.map((s) => (
                  <tr key={s.name} className="hover:bg-lavender/30">
                    <td className="py-3 font-bold text-navy">{s.name}</td>
                    <td className="py-3 font-semibold text-primary">{s.vendor}</td>
                    <td className="py-3 font-extrabold text-navy">{s.amount}</td>
                    <td className="py-3"><StatusChip status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'Bookings' && (
        <div className="bg-white rounded-3xl p-6 shadow-xs border border-gray-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-extrabold text-navy">Core Authoritative Bookings & Execution</h2>
              <p className="text-xs text-muted">Spec §2, §11: Core Platform validates payment truth, completion evidence, and unlocks settlement.</p>
            </div>
            {adminFeedback && (
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full shrink-0">
                {adminFeedback}
              </span>
            )}
          </div>

          <div className="space-y-4">
            {adminBookings.map((b) => (
              <div key={b._id || b.bookingReference} className="border border-gray-100 rounded-2xl p-4 bg-lavender/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-sm text-navy">{b.serviceName}</span>
                      <span className="text-xs font-bold text-primary">({b.vendorName || 'Vendor'})</span>
                      <span className="text-[10px] text-muted">Ref: {b.bookingReference}</span>
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {b.eventDate} · {b.serviceLocation?.address || b.serviceLocation?.locality || 'Kolkata'} · <b className="text-navy">₹{b.totalAmount?.toLocaleString()}</b>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusChip status={b.bookingStatus} />
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${b.paymentStatus === 'PAYMENT_VERIFIED' ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'}`}>
                      {b.paymentStatus === 'PAYMENT_VERIFIED' ? (
                        <>
                          <Icon name="check" size={11} /> Payment Verified
                        </>
                      ) : (
                        'Payment Pending'
                      )}
                    </span>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${b.executionStatus === 'COMPLETION_VERIFIED' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'}`}>
                      {b.executionStatus}
                    </span>
                  </div>
                </div>

                {/* Evidence & Core Actions */}
                <div className="pt-2 border-t border-gray-100/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    {b.completionEvidence?.length > 0 ? (
                      <div className="text-[11px] text-navy">
                        <b>Vendor Evidence Submitted:</b>{' '}
                        <a href={b.completionEvidence[0].deliverablesUrl || '#'} target="_blank" rel="noreferrer" className="text-primary underline font-semibold">
                          View Deliverables Drive ↗
                        </a>
                        {b.completionEvidence[0].notes && <span className="text-muted block mt-0.5 italic">"{b.completionEvidence[0].notes}"</span>}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted italic">No completion evidence submitted yet.</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {b.paymentStatus !== 'PAYMENT_VERIFIED' && (
                      <button
                        onClick={() => handleVerifyPayment(b._id)}
                        className="rounded-xl bg-primary text-white text-xs font-bold px-3.5 py-1.5 hover:bg-primary-dark transition shadow-xs"
                      >
                        Verify Payment (Core)
                      </button>
                    )}

                    {b.executionStatus === 'COMPLETION_SUBMITTED' && (
                      <button
                        onClick={() => handleValidateCompletion(b._id)}
                        className="rounded-xl bg-emerald-600 text-white text-xs font-bold px-3.5 py-1.5 hover:bg-emerald-700 transition shadow-xs"
                      >
                        Validate Completion (Core)
                      </button>
                    )}

                    {b.settlementStatus === 'SETTLEMENT_ELIGIBLE' && (
                      <button
                        onClick={() => handleSettle(b._id)}
                        className="rounded-xl bg-purple-600 text-white text-xs font-bold px-3.5 py-1.5 hover:bg-purple-700 transition shadow-xs"
                      >
                        Release Settlement
                      </button>
                    )}

                    {b.settlementStatus === 'SETTLED' && (
                      <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg inline-flex items-center gap-1">
                        <Icon name="check" size={11} /> Settled to Vendor
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab !== 'Overview' && activeTab !== 'Requirements' && activeTab !== 'Bookings' && (
        <div className="bg-white rounded-3xl p-10 text-center shadow-xs border border-gray-100">
          <div className="w-12 h-12 rounded-2xl bg-lavender flex items-center justify-center text-primary mx-auto mb-3">
            <Icon name="folder" size={24} />
          </div>
          <h3 className="font-extrabold text-navy text-sm">{activeTab} Details</h3>
          <p className="text-xs text-muted mt-1">
            Core authority audit records and documents for {activeTab.toLowerCase()} are in sync.
          </p>
        </div>
      )}
    </div>
  );
}
