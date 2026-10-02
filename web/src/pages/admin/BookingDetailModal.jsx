import { useState } from 'react';
import { adminApi } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { StatusChip } from '../../components/ui.jsx';

export default function BookingDetailModal({ booking, onClose, onRefresh }) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'financials' | 'evidence' | 'actions'
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Form states for Admin actions
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [validationNotes, setValidationNotes] = useState('');
  const [settlementRef, setSettlementRef] = useState('');
  const [failureReason, setFailureReason] = useState('');

  if (!booking) return null;

  const {
    _id,
    bookingReference = '—',
    serviceName = 'General Service',
    category = 'General',
    vendorName = 'Vendor',
    vendorId,
    customerName = 'Customer',
    customerId,
    eventDate,
    serviceLocation = {},
    pricing = {},
    totalAmount = 0,
    paymentStatus = 'PENDING',
    paymentSummary = {},
    bookingStatus = 'PENDING',
    executionStatus = 'NOT_STARTED',
    settlementStatus = 'NOT_ELIGIBLE',
    vendorSettlement = {},
    completionEvidence = [],
    disputes = [],
    createdAt,
  } = booking;

  async function handleVerifyPayment(e) {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await adminApi.call(`/operations/bookings/${_id}/verify-payment`, {
        method: 'POST',
        body: {
          transactionReference: paymentRef || `MANUAL-${Date.now()}`,
          notes: paymentNotes || 'Authoritatively verified by Super Admin',
          paidAmount: paymentSummary.balanceAmount || totalAmount,
        },
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Payment successfully verified!' });
        setTimeout(() => {
          onRefresh();
          onClose();
        }, 1200);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Payment verification failed' });
    } finally {
      setLoading(false);
    }
  }

  async function handleValidateCompletion(approved) {
    if (!window.confirm(`${approved ? 'Approve' : 'Reject'} completion evidence for this booking?`)) return;
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await adminApi.call(`/operations/bookings/${_id}/validate-completion`, {
        method: 'POST',
        body: {
          approved,
          notes: validationNotes || (approved ? 'Completion verified by Super Admin' : 'Rejected due to incomplete work'),
        },
      });
      if (res.ok) {
        setMessage({ type: 'success', text: approved ? 'Completion approved! Settlement is now eligible.' : 'Completion rejected.' });
        setTimeout(() => {
          onRefresh();
          onClose();
        }, 1200);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Validation failed' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSettle(e) {
    e.preventDefault();
    if (!window.confirm('Execute vendor payout and release settlement?')) return;
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await adminApi.call(`/operations/bookings/${_id}/settle`, {
        method: 'POST',
        body: {
          settlementReference: settlementRef || `BANK-UTR-${Date.now()}`,
          notes: 'Settled by StarVnt Core Operations',
        },
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Vendor settlement executed and settled!' });
        setTimeout(() => {
          onRefresh();
          onClose();
        }, 1200);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Settlement execution failed' });
    } finally {
      setLoading(false);
    }
  }

  async function handleFailAndReassign(e) {
    e.preventDefault();
    if (!failureReason.trim()) return alert('Please enter a reason for vendor failure.');
    if (!window.confirm('Mark this vendor as FAILED and discover alternative matching vendors?')) return;
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await adminApi.call(`/operations/bookings/${_id}/fail-and-reassign`, {
        method: 'POST',
        body: {
          reason: failureReason.trim(),
        },
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Vendor marked failed. Alternatives discovered!' });
        setTimeout(() => {
          onRefresh();
          onClose();
        }, 1400);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to reassign' });
    } finally {
      setLoading(false);
    }
  }

  const executionSteps = [
    { key: 'NOT_STARTED', label: 'Booked' },
    { key: 'SERVICE_SCHEDULED', label: 'Scheduled' },
    { key: 'SERVICE_STARTED', label: 'Started' },
    { key: 'COMPLETION_SUBMITTED', label: 'Evidence Submitted' },
    { key: 'COMPLETION_VERIFIED', label: 'Completed & Verified' },
  ];

  const currentStepIdx = executionSteps.findIndex((s) => s.key === executionStatus);
  const activeStepNumber = currentStepIdx >= 0 ? currentStepIdx : 0;

  const latestEvidence = Array.isArray(completionEvidence)
    ? completionEvidence[completionEvidence.length - 1]
    : completionEvidence;
  const evidencePhotos = latestEvidence?.photos || [];
  const evidenceVideos = latestEvidence?.videos || [];
  const evidenceFiles = latestEvidence?.files || [];
  const hasMedia = evidencePhotos.length > 0 || evidenceVideos.length > 0 || evidenceFiles.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-navy/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full my-auto flex flex-col overflow-hidden border border-gray-100 max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-slate-50/80 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-xs font-mono font-bold bg-primary-soft text-primary px-2.5 py-0.5 rounded-md">
                {bookingReference}
              </span>
              <StatusChip status={bookingStatus} />
              <StatusChip status={executionStatus} />
              <StatusChip status={paymentStatus} />
              <StatusChip status={settlementStatus} />
            </div>
            <h2 className="text-xl font-extrabold text-navy">{serviceName}</h2>
            <p className="text-xs text-muted mt-0.5">
              Booked on {createdAt ? new Date(createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white text-muted hover:text-navy border border-gray-200 grid place-items-center shrink-0 cursor-pointer shadow-sm hover:bg-gray-50 transition"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Status Message Alert */}
        {message.text && (
          <div
            className={`px-6 py-3 text-xs font-semibold flex items-center gap-2 ${
              message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-100' : 'bg-rose-50 text-rose-800 border-b border-rose-100'
            }`}
          >
            <Icon name={message.type === 'success' ? 'check' : 'close'} size={15} />
            <span>{message.text}</span>
          </div>
        )}

        {/* Stepper bar */}
        <div className="px-6 py-4 bg-white border-b border-gray-100">
          <div className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2.5">Execution Lifecycle</div>
          <div className="flex items-center justify-between relative">
            <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-1 bg-gray-100 -z-0" />
            <div
              className="absolute top-1/2 left-0 -translate-y-1/2 h-1 bg-primary -z-0 transition-all duration-300"
              style={{ width: `${(activeStepNumber / (executionSteps.length - 1)) * 100}%` }}
            />
            {executionSteps.map((step, idx) => {
              const isPastOrCurrent = idx <= activeStepNumber;
              return (
                <div key={step.key} className="flex flex-col items-center relative z-10">
                  <div
                    className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition ${
                      isPastOrCurrent
                        ? 'bg-primary text-white shadow-md shadow-primary/20'
                        : 'bg-white border-2 border-gray-200 text-gray-400'
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <span className={`text-[10px] mt-1.5 font-semibold text-center whitespace-nowrap ${isPastOrCurrent ? 'text-navy' : 'text-muted'}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-gray-100 bg-white">
          {[
            { id: 'overview', label: 'Overview & Stakeholders', icon: 'bookings' },
            { id: 'financials', label: 'Pricing & Escrow', icon: 'wallet' },
            { id: 'evidence', label: 'Proof & Evidence', icon: 'image' },
            { id: 'actions', label: 'Admin Operations', icon: 'operations' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-navy hover:border-gray-200'
              }`}
            >
              <Icon name={tab.icon} size={14} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Customer Card */}
                <div className="bg-slate-50/70 border border-gray-100 rounded-2xl p-4">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-muted uppercase tracking-wider mb-2">
                    <Icon name="customers" size={14} className="text-primary" />
                    <span>Customer Details</span>
                  </div>
                  <div className="text-base font-extrabold text-navy">{customerName}</div>
                  <div className="text-xs text-muted font-mono mt-1">ID: {customerId || '—'}</div>
                </div>

                {/* Vendor Card */}
                <div className="bg-slate-50/70 border border-gray-100 rounded-2xl p-4">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-muted uppercase tracking-wider mb-2">
                    <Icon name="vendors" size={14} className="text-primary" />
                    <span>Assigned Vendor</span>
                  </div>
                  <div className="text-base font-extrabold text-navy">{vendorName}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-white border border-gray-200 text-muted">
                      {category}
                    </span>
                    <span className="text-xs text-muted font-mono">ID: {vendorId || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Event & Location Card */}
              <div className="bg-slate-50/70 border border-gray-100 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2.5 text-xs font-bold text-muted uppercase tracking-wider">
                  <Icon name="calendar" size={14} className="text-primary" />
                  <span>Event & Service Location</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-muted font-medium">Event Date</div>
                    <div className="text-sm font-bold text-navy mt-0.5">
                      {eventDate ? new Date(eventDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Not specified'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted font-medium">City & Locality</div>
                    <div className="text-sm font-bold text-navy mt-0.5">
                      {serviceLocation.city || '—'}{serviceLocation.locality ? `, ${serviceLocation.locality}` : ''}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-muted font-medium">Complete Address</div>
                    <div className="text-sm font-semibold text-navy mt-0.5 flex items-start gap-1.5">
                      <Icon name="mapPin" size={15} className="text-primary shrink-0 mt-0.5" />
                      <span>{serviceLocation.address || 'Standard Location'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Disputes / Issues notice if any */}
              {disputes.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
                  <div className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-2">Disputes Recorded ({disputes.length})</div>
                  <div className="space-y-2">
                    {disputes.map((d, i) => (
                      <div key={i} className="text-xs text-rose-700 bg-white/70 p-2.5 rounded-xl border border-rose-100">
                        <div className="font-bold">{d.raisedBy || 'User'} · {d.status || 'OPEN'}</div>
                        <div>{d.reason || d.notes || 'Dispute raised'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: FINANCIALS */}
          {activeTab === 'financials' && (
            <div className="space-y-6">
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-gray-100 rounded-2xl p-4 text-center">
                  <div className="text-[11px] text-muted font-semibold">Total Amount</div>
                  <div className="text-xl font-extrabold text-navy mt-1">₹{Number(totalAmount).toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 text-center">
                  <div className="text-[11px] text-emerald-800 font-semibold">Paid Amount</div>
                  <div className="text-xl font-extrabold text-emerald-700 mt-1">
                    ₹{Number(paymentSummary.paidAmount || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-4 text-center">
                  <div className="text-[11px] text-amber-800 font-semibold">Balance Due</div>
                  <div className="text-xl font-extrabold text-amber-700 mt-1">
                    ₹{Number(paymentSummary.balanceAmount ?? (totalAmount - (paymentSummary.paidAmount || 0))).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Pricing itemization */}
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 bg-slate-50 border-b border-gray-200 text-xs font-bold text-navy uppercase tracking-wider">
                  Cost Breakdown
                </div>
                <div className="divide-y divide-gray-100 text-xs">
                  <div className="flex justify-between px-5 py-2.5">
                    <span className="text-muted">Base Service Fee</span>
                    <span className="font-bold text-navy">₹{Number(pricing.basePrice || 0).toLocaleString('en-IN')}</span>
                  </div>
                  {pricing.travelFee > 0 && (
                    <div className="flex justify-between px-5 py-2.5">
                      <span className="text-muted">Travel & Logistics</span>
                      <span className="font-bold text-navy">₹{Number(pricing.travelFee).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {pricing.equipmentFee > 0 && (
                    <div className="flex justify-between px-5 py-2.5">
                      <span className="text-muted">Equipment & Setup</span>
                      <span className="font-bold text-navy">₹{Number(pricing.equipmentFee).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {pricing.setupFee > 0 && (
                    <div className="flex justify-between px-5 py-2.5">
                      <span className="text-muted">Onsite Setup Fee</span>
                      <span className="font-bold text-navy">₹{Number(pricing.setupFee).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between px-5 py-3 bg-slate-50 font-bold text-sm">
                    <span className="text-navy">Total Contract Value</span>
                    <span className="text-primary font-extrabold">₹{Number(totalAmount).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Vendor Settlement details */}
              <div className="bg-slate-50 border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-bold text-navy uppercase tracking-wider">Vendor Settlement Escrow</div>
                  <StatusChip status={settlementStatus} />
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-muted">Platform Commission:</span>
                    <div className="font-bold text-navy">₹{Number(vendorSettlement.platformCommission || 0).toLocaleString('en-IN')}</div>
                  </div>
                  <div>
                    <span className="text-muted">Net Payable to Vendor:</span>
                    <div className="font-bold text-emerald-700">₹{Number(vendorSettlement.netPayableToVendor || totalAmount).toLocaleString('en-IN')}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PROOF & EVIDENCE */}
          {activeTab === 'evidence' && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-gray-100 rounded-2xl p-5">
                <h4 className="text-sm font-bold text-navy mb-1">Service Completion Evidence</h4>
                <p className="text-xs text-muted mb-4">
                  Vendor-uploaded Cloudinary media deliverables & audit proofs before settlement is released.
                </p>

                {latestEvidence?.notes ? (
                  <div className="mb-4 bg-white p-3.5 rounded-xl border border-gray-200">
                    <span className="text-[11px] text-muted font-bold block mb-1">Vendor Handover Notes:</span>
                    <p className="text-xs text-ink/80 italic font-medium">"{latestEvidence.notes}"</p>
                    {latestEvidence.submittedAt && (
                      <span className="text-[10px] text-muted block mt-2">
                        Submitted: {new Date(latestEvidence.submittedAt).toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-muted italic bg-white p-4 rounded-xl border border-dashed border-gray-200 text-center mb-4">
                    No vendor notes submitted yet for this booking.
                  </div>
                )}

                {/* Evidence media files (Images & Videos) */}
                {hasMedia ? (
                  <div className="space-y-4">
                    {evidencePhotos.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-navy mb-2 flex items-center gap-1.5">
                          <Icon name="image" size={13} className="text-primary" />
                          <span>Photo Deliverables ({evidencePhotos.length})</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {evidencePhotos.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="group relative rounded-xl overflow-hidden border border-gray-200 bg-black aspect-video block"
                            >
                              <img src={url} alt={`Evidence photo ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                              <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">View Full</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {evidenceVideos.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-navy mb-2 flex items-center gap-1.5">
                          <Icon name="video" size={13} className="text-primary" />
                          <span>Video Deliverables ({evidenceVideos.length})</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {evidenceVideos.map((url, i) => (
                            <div key={i} className="rounded-xl overflow-hidden border border-gray-200 bg-black">
                              <video src={url} controls className="w-full aspect-video object-cover" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-muted italic bg-white p-4 rounded-xl border border-dashed border-gray-200 text-center">
                    No media files uploaded yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: ADMIN OPERATIONS */}
          {activeTab === 'actions' && (
            <div className="space-y-6">
              {/* Payment Verification */}
              {paymentStatus !== 'PAID' && (
                <form onSubmit={handleVerifyPayment} className="bg-slate-50 border border-gray-100 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-navy uppercase tracking-wider">
                    <Icon name="wallet" size={15} className="text-primary" />
                    <span>Authoritatively Verify Customer Payment</span>
                  </div>
                  <p className="text-xs text-muted">
                    Confirm that payment has been received in escrow account to enable vendor execution.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Bank UTR / Transaction Reference"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-primary"
                    />
                    <input
                      type="text"
                      placeholder="Internal verification notes"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-primary"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Processing...' : 'Verify & Mark Paid'}
                  </button>
                </form>
              )}

              {/* Completion Validation */}
              <div className="bg-slate-50 border border-gray-100 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-navy uppercase tracking-wider">
                  <Icon name="check" size={15} className="text-emerald-600" />
                  <span>Validate Service Completion</span>
                </div>
                <p className="text-xs text-muted">
                  Super Admin audit of ground execution. Approving completion unlocks vendor settlement eligibility.
                </p>
                <input
                  type="text"
                  placeholder="Audit feedback or rejection reason"
                  value={validationNotes}
                  onChange={(e) => setValidationNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-primary"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleValidateCompletion(true)}
                    disabled={loading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                  >
                    Approve Completion
                  </button>
                  <button
                    type="button"
                    onClick={() => handleValidateCompletion(false)}
                    disabled={loading}
                    className="px-4 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                  >
                    Reject Completion
                  </button>
                </div>
              </div>

              {/* Release Settlement */}
              {settlementStatus === 'SETTLEMENT_ELIGIBLE' && (
                <form onSubmit={handleSettle} className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 uppercase tracking-wider">
                    <Icon name="trend" size={15} className="text-emerald-600" />
                    <span>Release Vendor Settlement Payout</span>
                  </div>
                  <p className="text-xs text-muted">
                    This booking has completed verification. Trigger automated settlement transfer to the vendor.
                  </p>
                  <input
                    type="text"
                    placeholder="Bank Transfer Reference / UTR Number"
                    value={settlementRef}
                    onChange={(e) => setSettlementRef(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs outline-none focus:border-emerald-600"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Releasing...' : 'Release Settlement Now'}
                  </button>
                </form>
              )}

              {/* Emergency Vendor Failure and Reassignment */}
              <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-rose-800 uppercase tracking-wider">
                  <Icon name="shield" size={15} className="text-rose-600" />
                  <span>Vendor Failure & Fallback Reassignment</span>
                </div>
                <p className="text-xs text-muted">
                  If the assigned vendor cannot perform, mark failure to reassign immediately to alternative vendors in the same location.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Failure reason (e.g. vendor no-show, vehicle breakdown)"
                    value={failureReason}
                    onChange={(e) => setFailureReason(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-rose-200 rounded-xl text-xs outline-none focus:border-rose-500"
                  />
                  <button
                    type="button"
                    onClick={handleFailAndReassign}
                    disabled={loading}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    Fail & Discover Alternatives
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-gray-100 flex items-center justify-between text-xs text-muted">
          <span>Booking ID: <code className="font-mono text-navy font-semibold">{_id}</code></span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-200 text-navy font-semibold rounded-xl hover:bg-gray-100 transition cursor-pointer shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
