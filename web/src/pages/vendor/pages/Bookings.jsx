import { useState, useEffect } from 'react';
import { Page, Card, EmptyHint } from './shared.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import Icon from '../../../components/Icon.jsx';
import { externalApi } from '../../../lib/api.js';

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [evidenceModalBooking, setEvidenceModalBooking] = useState(null);
  const [deliverablesUrl, setDeliverablesUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    async function loadBookings() {
      setLoading(true);
      try {
        const res = await externalApi.call('/vendor/bookings');
        if (Array.isArray(res)) {
          const mapped = res.map((b) => ({
            id: b.bookingReference || `BK-${b._id?.slice(-4)}`,
            dbId: b._id,
            title: `${b.serviceName || 'Wedding Service'} (${b.customerName || 'Direct Booking'})`,
            date: b.eventDate ? new Date(b.eventDate).toLocaleDateString() : 'Scheduled',
            location: b.location?.venue || b.location?.city || 'Selected Venue',
            amount: `₹${(b.totalAmount || 0).toLocaleString()}`,
            status: b.executionStatus === 'SERVICE_STARTED' ? 'In Progress' : (b.executionStatus === 'COMPLETION_SUBMITTED' ? 'Completion Submitted' : (b.status || 'Confirmed')),
            executionStatus: b.executionStatus || 'SCHEDULED',
            payment: b.paymentStatus || 'PAYMENT_VERIFIED',
            team: b.assignedTeam || 'Lead Team Scheduled',
            checklist: (b.checklist && b.checklist.length > 0)
              ? b.checklist
              : [
                  { item: 'Service Commenced / Check-in', done: b.executionStatus === 'SERVICE_STARTED' || b.executionStatus === 'COMPLETION_SUBMITTED' },
                  { item: 'On-site Execution Complete', done: b.executionStatus === 'COMPLETION_SUBMITTED' },
                  { item: 'Deliverables & Evidence Uploaded', done: b.executionStatus === 'COMPLETION_SUBMITTED' },
                ],
          }));
          setBookings(mapped);
          if (mapped[0]) setOpen(mapped[0].id);
        }
      } catch (err) {
        console.warn('[Bookings] Load error:', err.message);
      } finally {
        setLoading(false);
      }
    }
    loadBookings();
  }, []);

  async function handleStartService(booking) {
    try {
      if (booking.dbId) {
        await externalApi.call(`/vendor/bookings/${booking.dbId}/start`, { method: 'POST' });
      }
      setBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? { ...b, status: 'In Progress', executionStatus: 'SERVICE_STARTED' } : b))
      );
      setFeedback(`Service started for ${booking.title}. Status updated to In Progress.`);
    } catch (err) {
      setFeedback(`Notice: ${err.message}`);
    }
  }

  async function handleSubmitEvidence() {
    if (!evidenceModalBooking) return;
    setSubmitting(true);
    try {
      if (evidenceModalBooking.dbId) {
        await externalApi.call(`/vendor/bookings/${evidenceModalBooking.dbId}/submit-completion`, {
          method: 'POST',
          body: {
            deliverablesUrl,
            notes,
            checklist: [
              { item: 'Ceremony Photography Completed', checked: true },
              { item: 'Raw Footage Backed Up', checked: true },
              { item: 'Deliverables Drive Uploaded', checked: true },
            ],
          },
        });
      }
      setBookings((prev) =>
        prev.map((b) =>
          b.id === evidenceModalBooking.id
            ? { ...b, status: 'Completion Submitted', executionStatus: 'COMPLETION_SUBMITTED' }
            : b
        )
      );
      setFeedback(`Completion evidence submitted for ${evidenceModalBooking.id}. Core Platform will now validate and unlock settlement.`);
      setEvidenceModalBooking(null);
      setDeliverablesUrl('');
      setNotes('');
    } catch (err) {
      setFeedback(`Notice: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Page
      title="Bookings & Execution Workspace"
      sub="Spec §11: Confirmed via Core after quote approval. Submit execution progress & completion evidence here."
    >
      {feedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 text-xs font-semibold mb-4 inline-flex items-center gap-2 w-full">
          <Icon name="check" size={16} className="text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="space-y-4">
        {bookings.map((b) => (
          <Card key={b.id} className="!p-0 overflow-hidden">
            <button onClick={() => setOpen(open === b.id ? null : b.id)} className="w-full flex items-center gap-3 p-4 sm:p-5 text-left">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[15px]">{b.title}</span>
                  <StatusChip status={b.status} />
                  <span className="text-[10px] text-muted">{b.id}</span>
                </div>
                <div className="text-xs text-muted mt-1">{b.date} · {b.location} · <b className="text-ink">{b.amount}</b></div>
              </div>
              <Icon
                name="chevronDown"
                size={16}
                className={`text-muted transition-transform duration-200 shrink-0 ${open === b.id ? 'rotate-180' : ''}`}
              />
            </button>

            {open === b.id && (
              <div className="border-t border-gray-100 p-4 sm:p-5 grid sm:grid-cols-2 gap-5">
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
                    <button
                      onClick={() => handleStartService(b)}
                      className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold px-4 py-2.5 transition shadow-sm"
                    >
                      Start Service
                    </button>
                    <button
                      onClick={() => setEvidenceModalBooking(b)}
                      className="rounded-xl border border-gray-200 text-xs font-semibold px-4 py-2.5 hover:bg-lavender transition shadow-xs"
                    >
                      Upload Completion Evidence
                    </button>
                  </div>
                </div>
                <div className="space-y-2.5 text-xs">
                  <div className="bg-lavender rounded-xl p-3">
                    <div className="text-muted text-[10px] uppercase font-bold">Payment Status</div>
                    <div className="font-semibold mt-0.5">{b.payment} <span className="text-muted font-normal">(Core authority)</span></div>
                  </div>
                  <div className="bg-lavender rounded-xl p-3">
                    <div className="text-muted text-[10px] uppercase font-bold">Team / Resources</div>
                    <div className="font-semibold mt-0.5">{b.team}</div>
                  </div>
                  <div className="bg-lavender rounded-xl p-3">
                    <div className="text-muted text-[10px] uppercase font-bold">Settlement Rule</div>
                    <div className="font-semibold mt-0.5">Eligible only after Core Platform validates completion evidence</div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        ))}

        {bookings.length === 0 && !loading && (
          <Card className="text-center py-12 px-6">
            <div className="w-14 h-14 rounded-2xl bg-primary-soft text-primary grid place-items-center mx-auto mb-3 shadow-xs">
              <Icon name="calendar" size={26} />
            </div>
            <h3 className="text-base font-extrabold text-navy">No Bookings Yet</h3>
            <p className="text-xs text-muted max-w-md mx-auto mt-1 leading-relaxed">
              When client quotes are approved and advance payments are verified into Core Platform escrow, scheduled bookings will appear here for execution and deliverable verification.
            </p>
          </Card>
        )}
      </div>

      <EmptyHint text="Golden Test J Rule: You submit completion facts & deliverables evidence — PAYMENT_VERIFIED, COMPLETION_VERIFIED and SETTLEMENT_ELIGIBLE are decided strictly by Core authority." />

      {/* Completion Evidence Submission Modal */}
      {evidenceModalBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs animate-fade">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-base font-extrabold text-navy">Submit Completion Evidence</h2>
                <p className="text-xs text-muted">{evidenceModalBooking.title} · {evidenceModalBooking.id}</p>
              </div>
              <button
                onClick={() => setEvidenceModalBooking(null)}
                className="w-8 h-8 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center transition"
                aria-label="Close"
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-muted font-semibold mb-1">Deliverables Link (Google Drive / Dropbox / Cloud URL)</label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/drive/folders/starvnt-deliverables"
                  value={deliverablesUrl}
                  onChange={(e) => setDeliverablesUrl(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl px-3.5 py-2.5 text-navy outline-none focus:border-primary font-medium"
                />
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Completion Notes & Sign-off Summary</label>
                <textarea
                  rows={3}
                  placeholder="All 8 hours completed. Client signed off on ceremony coverage. High-res files uploaded."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-lavender/60 border border-gray-200 rounded-xl p-3 text-navy outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="bg-primary-soft/50 border border-primary/20 rounded-xl p-3 text-[11px] text-navy">
                <b>Core Platform Guarantee:</b> Once submitted, Core Operations verifies your deliverables against customer requirements. Upon validation, settlement unlocks automatically.
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                onClick={() => setEvidenceModalBooking(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitEvidence}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark shadow-md shadow-primary/25"
              >
                {submitting ? 'Submitting to Core...' : 'Submit Evidence'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
