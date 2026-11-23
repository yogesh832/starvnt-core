import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Page, Card } from './shared.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import Icon from '../../../components/Icon.jsx';
import { externalApi } from '../../../lib/api.js';
import { VENDOR_QR_ENABLED } from '../../../../../server/src/common/vendorQrRelease.js';

function isExecutionDone(status) {
  return status === 'COMPLETION_SUBMITTED' || status === 'COMPLETION_VERIFIED';
}

function bookingStatusLabel(status, fallback = 'Status unavailable') {
  if (status === 'SERVICE_STARTED') return 'In Progress';
  if (status === 'COMPLETION_SUBMITTED') return 'Work Done - Core Review';
  if (status === 'COMPLETION_VERIFIED') return 'Completed';
  return fallback;
}

function executionChecklistFor(status, checklist = []) {
  return Array.isArray(checklist) ? checklist : [];
}

export default function Bookings() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedRecord = params.get('record');
  const [openingConversation, setOpeningConversation] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [open, setOpen] = useState(null);

  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!requestedRecord || loading) return;
    const record = bookings.find(row => row.dbId === requestedRecord);
    if (record) setOpen(record.id);
    else setFeedback('This booking is unavailable or is not authorized for your account.');
  }, [requestedRecord, bookings, loading]);

  useEffect(() => {
    let active = true;
    async function loadBookings() {
      setLoading(true);
      setLoadError('');
      try {
        const res = await externalApi.call('/vendor/bookings');
        if (!Array.isArray(res) && (res?.ok === false || !Array.isArray(res?.bookings))) throw new Error('Booking records could not be confirmed.');
        const rows = Array.isArray(res) ? res : res.bookings;
        const mapped = rows.map((b) => ({
          id: b.bookingReference || `BK-${b._id?.slice(-4)}`,
          dbId: b._id,
          title: `${b.serviceName || 'Wedding Service'} (${b.customerName || 'Direct Booking'})`,
          date: b.eventDate ? new Date(b.eventDate).toLocaleDateString() : 'Scheduled',
          location: b.serviceLocation?.address || b.serviceLocation?.locality || b.serviceLocation?.city || 'Selected Venue',
          amount: Number.isFinite(b.totalAmount) ? `₹${b.totalAmount.toLocaleString('en-IN')}` : 'Unavailable',
          advancePaid: Number.isFinite(b.paymentSummary?.paidAmount) ? b.paymentSummary.paidAmount : null,
          balanceAmount: Number.isFinite(b.paymentSummary?.balanceAmount) ? b.paymentSummary.balanceAmount : null,
          status: bookingStatusLabel(b.executionStatus, b.bookingStatus || b.status || 'Status unavailable'),
          executionStatus: b.executionStatus || 'SCHEDULED',
          settlementStatus: b.settlementStatus || 'NOT_ELIGIBLE',
          payment: b.paymentStatus || 'Status unavailable',
          team: b.assignedTeam || 'No team assignment recorded',
          checklist: executionChecklistFor(b.executionStatus, b.checklist),
        }));
        if (!active) return;
        setBookings(mapped);
        setLastSync(new Date().toISOString());
        if (mapped.length > 0) {
          const nextActionable = mapped.find((b) => !isExecutionDone(b.executionStatus)) || mapped[0];
          if (nextActionable) setOpen(nextActionable.id);
        }
      } catch (err) {
        if (active) setLoadError(err.data?.message || err.message || 'Bookings are unavailable. Please retry.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadBookings();
    return () => { active = false; };
  }, [retry]);

  async function openConversation(booking) {
    if (!booking.dbId || openingConversation) return;
    setOpeningConversation(booking.dbId);
    try {
      const result = await externalApi.call(`/vendor/bookings/${booking.dbId}/message-thread`, { method: 'POST' });
      if (!result.ok || !result.thread?._id) throw new Error('Could not open this booking’s conversation.');
      navigate(`/vendor/updates?tab=messages&thread=${encodeURIComponent(result.thread._id)}`);
    } catch (error) {
      setFeedback(`Notice: ${error.message}`);
    } finally {
      setOpeningConversation(null);
    }
  }

  return (
    <Page
      title="Bookings & Operations"
      sub="Your confirmed work, event-day progress and private delivery evidence."
      action={<Link to="/vendor/external-bookings" className="min-h-11 inline-flex items-center rounded-xl bg-primary px-4 text-sm font-bold text-white">Add external booking</Link>}
    >
      <nav aria-label="Booking source" className="vendor-source-tabs"><span aria-current="page">STARVNT bookings</span><Link to="/vendor/external-bookings">External bookings</Link><Link to="/vendor/calendar">Unified calendar</Link></nav>
      <p className="text-xs text-muted">Core owns confirmation and payment verification. External commitments stay in your separate vendor-reported workspace.</p>
      {loadError && <div role="alert" className="vendor-source-notice"><strong>{bookings.length ? 'Showing saved records — refresh unavailable.' : 'Booking data is unavailable.'}</strong><p>{loadError}</p><button disabled={loading} onClick={() => setRetry(value => value + 1)} className="min-h-11 underline font-bold">Retry bookings</button></div>}
      {lastSync && <p className="text-xs text-muted">Last successful sync: {new Date(lastSync).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST{loading ? ' · Refreshing…' : ''}</p>}
      {feedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 text-xs font-semibold mb-4 inline-flex items-center gap-2 w-full">
          <Icon name="check" size={16} className="text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="space-y-4">
        {bookings.map((b) => (
          <Card key={b.id} className="!p-0 overflow-hidden">
            <button onClick={() => setOpen(open === b.id ? null : b.id)} className="w-full flex items-center gap-3 p-4 sm:p-5 text-left cursor-pointer hover:bg-slate-50/50 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[15px] text-navy">{b.title}</span>
                  <StatusChip status={b.status} />
                  <span className="text-[10px] text-muted font-mono">{b.id}</span>
                </div>
                <div className="text-xs text-muted mt-1">{b.date} · {b.location} · Quote <b className="text-ink">{b.amount}</b></div>
                <div className="text-[11px] text-emerald-700 font-bold mt-1">
                  Core recorded payment: {b.advancePaid == null ? 'Unavailable' : `₹${b.advancePaid.toLocaleString('en-IN')}`} · Balance: {b.balanceAmount == null ? 'Unavailable' : `₹${b.balanceAmount.toLocaleString('en-IN')}`}
                </div>
              </div>
              <Icon
                name="chevronDown"
                size={16}
                className={`text-muted transition-transform duration-200 shrink-0 ${open === b.id ? 'rotate-180' : ''}`}
              />
            </button>

            {open === b.id && (
              <div className="border-t border-gray-100 p-4 sm:p-5 grid sm:grid-cols-2 gap-5 bg-white">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted font-semibold">Execution checklist</div>
                  <ul className="mt-2 space-y-2 text-sm">
                    {b.checklist.map(({ item, done }) => (
                      <li key={item} className="flex items-center gap-2.5">
                        <span className={`w-5 h-5 rounded-full grid place-items-center ${done ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                          {done ? <Icon name="check" size={11} /> : <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />}
                        </span>
                        <span className={done ? 'text-ink font-medium' : 'text-muted'}>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button type="button" onClick={() => openConversation(b)} disabled={Boolean(openingConversation)} className="rounded-xl border border-primary/30 text-primary text-xs font-bold px-4 py-2.5 inline-flex items-center gap-1.5 hover:bg-primary-soft disabled:opacity-50">
                      <Icon name="message" size={14} />{openingConversation === b.dbId ? 'Opening…' : 'Write customer update'}
                    </button>
                    <button type="button" onClick={() => navigate(`/vendor/execution?booking=${b.dbId}`)} className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5">Open service execution and private evidence</button>
                    {VENDOR_QR_ENABLED && b.executionStatus === 'COMPLETION_VERIFIED' && (
                      <button
                        type="button"
                        onClick={() => navigate('/vendor/experience-qr')}
                        className="rounded-xl border border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary text-xs font-bold px-4 py-2.5 flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Icon name="star" size={14} />
                        <span>Experience QR & Feedback</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2.5 text-xs">
                  <div className="bg-lavender/60 border border-lavender rounded-xl p-3">
                    <div className="text-muted text-[10px] uppercase font-bold">Payment Status</div>
                    <div className="font-semibold mt-0.5 text-navy">{b.payment} <span className="text-muted font-normal">(Core authority)</span></div>
                    <div className="text-[11px] text-muted mt-1">{b.advancePaid == null ? 'Recorded payment amount unavailable' : `₹${b.advancePaid.toLocaleString('en-IN')} recorded against this contract`}</div>
                  </div>
                  <div className="bg-lavender/60 border border-lavender rounded-xl p-3">
                    <div className="text-muted text-[10px] uppercase font-bold">Team / Resources</div>
                    <div className="font-semibold mt-0.5 text-navy">{b.team}</div>
                  </div>
                  <div className="bg-lavender/60 border border-lavender rounded-xl p-3">
                    <div className="text-muted text-[10px] uppercase font-bold">Settlement Rule</div>
                    <div className="font-semibold mt-0.5 text-navy">
                      {isExecutionDone(b.executionStatus)
                        ? 'Evidence submitted. Waiting for Core validation to unlock settlement.'
                        : 'Eligible only after Core Platform validates completion evidence'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        ))}

        {loading && bookings.length === 0 && (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-slate-200/80 animate-pulse" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-40 bg-slate-200/80 animate-pulse rounded-full" />
                    <div className="h-3 w-28 bg-slate-200/50 animate-pulse rounded-full" />
                  </div>
                </div>
                <div className="h-6 w-20 bg-slate-200/60 animate-pulse rounded-full" />
              </div>
              <div className="grid sm:grid-cols-3 gap-3 pt-3 border-t border-gray-100">
                <div className="h-14 bg-slate-100/70 rounded-xl animate-pulse" />
                <div className="h-14 bg-slate-100/70 rounded-xl animate-pulse" />
                <div className="h-14 bg-slate-100/70 rounded-xl animate-pulse" />
              </div>
            </Card>
          ))
        )}

        {bookings.length === 0 && !loading && !loadError && (
          <Card className="text-center py-12 px-6">
            <div className="w-14 h-14 rounded-2xl bg-primary-soft text-primary grid place-items-center mx-auto mb-3 shadow-xs">
              <Icon name="calendar" size={26} />
            </div>
            <h3 className="text-base font-extrabold text-navy">No Bookings Yet</h3>
            <p className="text-xs text-muted max-w-md mx-auto mt-1 leading-relaxed">
              When client quotes are approved and advance payments are provider-verified, scheduled bookings will appear here for execution and deliverable verification.
            </p>
          </Card>
        )}
      </div>

      {/* Cloudinary Multi-Image & Video Completion Evidence Submission Modal */}
    </Page>
  );
}
