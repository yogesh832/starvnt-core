import { useState, useEffect, useRef } from 'react';
import { Page, Card } from './shared.jsx';
import { StatusChip } from '../../../components/ui.jsx';
import Icon from '../../../components/Icon.jsx';
import { externalApi } from '../../../lib/api.js';

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isExecutionDone(status) {
  return status === 'COMPLETION_SUBMITTED' || status === 'COMPLETION_VERIFIED';
}

function isExecutionActive(status) {
  return status === 'SERVICE_STARTED' || isExecutionDone(status);
}

function bookingStatusLabel(status, fallback = 'Confirmed') {
  if (status === 'SERVICE_STARTED') return 'In Progress';
  if (status === 'COMPLETION_SUBMITTED') return 'Work Done - Core Review';
  if (status === 'COMPLETION_VERIFIED') return 'Completed';
  return fallback;
}

function executionChecklistFor(status, checklist = []) {
  if (!isExecutionDone(status) && checklist && checklist.length > 0) return checklist;
  return [
    { item: 'Service Commenced / Check-in', done: isExecutionActive(status) },
    { item: 'On-site Execution Complete', done: isExecutionDone(status) },
    { item: 'Deliverables & Evidence Uploaded', done: isExecutionDone(status) },
  ];
}

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  // Evidence modal states
  const [evidenceModalBooking, setEvidenceModalBooking] = useState(null);
  const [uploadedMedia, setUploadedMedia] = useState([]);
  const [uploadingToCloudinary, setUploadingToCloudinary] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const [deliverablesUrl, setDeliverablesUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [checklistState, setChecklistState] = useState([
    { item: 'Service executed & on-site scope completed', checked: true },
    { item: 'Deliverables & evidence uploaded to Cloudinary', checked: true },
    { item: 'Client walkthrough / handover sign-off obtained', checked: true },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    async function loadBookings() {
      setLoading(true);
      try {
        const res = await externalApi.call('/vendor/bookings');
        const rows = Array.isArray(res) ? res : Array.isArray(res?.bookings) ? res.bookings : [];
        const mapped = rows.map((b) => ({
          id: b.bookingReference || `BK-${b._id?.slice(-4)}`,
          dbId: b._id,
          title: `${b.serviceName || 'Wedding Service'} (${b.customerName || 'Direct Booking'})`,
          date: b.eventDate ? new Date(b.eventDate).toLocaleDateString() : 'Scheduled',
          location: b.serviceLocation?.address || b.serviceLocation?.locality || b.serviceLocation?.city || 'Selected Venue',
          amount: `₹${(b.totalAmount || 0).toLocaleString()}`,
          advancePaid: b.paymentSummary?.paidAmount || 0,
          balanceAmount: b.paymentSummary?.balanceAmount ?? Math.max(0, (b.totalAmount || 0) - (b.paymentSummary?.paidAmount || 0)),
          status: bookingStatusLabel(b.executionStatus, b.status || 'Confirmed'),
          executionStatus: b.executionStatus || 'SCHEDULED',
          settlementStatus: b.settlementStatus || 'NOT_ELIGIBLE',
          payment: b.paymentStatus || 'PAYMENT_VERIFIED',
          team: b.assignedTeam || 'Lead Team Scheduled',
          checklist: executionChecklistFor(b.executionStatus, b.checklist),
        }));
        setBookings(mapped);
        if (mapped.length > 0) {
          const nextActionable = mapped.find((b) => !isExecutionDone(b.executionStatus)) || mapped[0];
          if (nextActionable) setOpen(nextActionable.id);
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
        prev.map((b) =>
          b.id === booking.id
            ? {
                ...b,
                status: 'In Progress',
                executionStatus: 'SERVICE_STARTED',
                checklist: executionChecklistFor('SERVICE_STARTED', b.checklist),
              }
            : b
        )
      );
      setFeedback(`Service started for ${booking.title}. Status updated to In Progress.`);
    } catch (err) {
      setFeedback(`Notice: ${err.message}`);
    }
  }

  // Cloudinary Multi-File Upload Handler (Images & Videos)
  async function handleFilesUpload(filesList) {
    if (!filesList || filesList.length === 0) return;
    setUploadingToCloudinary(true);
    setUploadProgress({ current: 0, total: filesList.length });

    const newUploaded = [];
    const failedFiles = [];

    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      setUploadProgress({ current: i + 1, total: filesList.length });

      try {
        const base64Data = await readFileAsDataURL(file);
        const isVideo = file.type.startsWith('video') || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name);
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        const isDoc = /\.(doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt)$/i.test(file.name);
        const mediaType = isVideo ? 'VIDEO' : isPdf ? 'PDF' : isDoc ? 'DOCUMENT' : 'IMAGE';

        let uploadRes;
        try {
          uploadRes = await externalApi.call('/vendor/portfolio/upload', {
            method: 'POST',
            body: {
              file: base64Data,
              filename: file.name,
              mediaType: mediaType === 'DOCUMENT' || mediaType === 'PDF' ? 'IMAGE' : mediaType,
            },
          });
        } catch (uploadErr) {
          console.warn('[Cloudinary Upload fallback]:', uploadErr.message);
          uploadRes = { ok: true, url: base64Data, resourceType: mediaType, provider: 'local' };
        }

        const url = uploadRes.ok && uploadRes.url ? uploadRes.url : base64Data;
        const resType = mediaType;
        const thumb = uploadRes.thumbnailUrl || (resType === 'VIDEO' ? `${url}-poster.jpg` : url);

        newUploaded.push({
          id: `evidence-${Date.now()}-${i}`,
          url,
          thumbnailUrl: thumb,
          resourceType: resType,
          name: file.name,
          size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          publicId: uploadRes.publicId || '',
          provider: uploadRes.provider === 'cloudinary' ? 'Cloudinary Media CDN' : 'Secure Media',
        });
      } catch (err) {
        console.warn('Upload error for file:', file.name, err);
        failedFiles.push(file.name);
      }
    }

    setUploadedMedia((prev) => [...prev, ...newUploaded]);
    setUploadingToCloudinary(false);
    setUploadProgress(null);

    if (failedFiles.length > 0) {
      alert(`Could not process ${failedFiles.length} file(s): ${failedFiles.slice(0, 3).join(', ')}`);
    }
  }

  function handleRemoveMedia(idToRemove) {
    setUploadedMedia((prev) => prev.filter((m) => m.id !== idToRemove));
  }

  function openEvidenceModal(booking) {
    setEvidenceModalBooking(booking);
    setUploadedMedia([]);
    setDeliverablesUrl('');
    setNotes('');
    setChecklistState([
      { item: 'Service executed & on-site scope completed', checked: true },
      { item: 'Deliverables & evidence uploaded to Cloudinary', checked: true },
      { item: 'Client walkthrough / handover sign-off obtained', checked: true },
    ]);
  }

  async function handleSubmitEvidence() {
    if (!evidenceModalBooking) return;
    if (uploadedMedia.length === 0 && !notes.trim() && !deliverablesUrl.trim()) {
      alert('Please upload at least one photo/video evidence or provide completion notes.');
      return;
    }

    setSubmitting(true);
    try {
      const photos = uploadedMedia.filter((m) => m.resourceType !== 'VIDEO').map((m) => m.url);
      const videos = uploadedMedia.filter((m) => m.resourceType === 'VIDEO').map((m) => m.url);

      let savedBooking = null;
      if (evidenceModalBooking.dbId) {
        const res = await externalApi.call(`/vendor/bookings/${evidenceModalBooking.dbId}/submit-completion`, {
          method: 'POST',
          body: {
            deliverablesUrl: deliverablesUrl.trim() || photos[0] || videos[0] || '',
            photos,
            videos,
            files: uploadedMedia,
            notes: notes.trim(),
            checklist: checklistState,
          },
        });
        savedBooking = res?.booking || null;
      }

      setBookings((prev) => {
        const updated = prev.map((b) => {
          if (b.id !== evidenceModalBooking.id) return b;
          const executionStatus = savedBooking?.executionStatus || 'COMPLETION_SUBMITTED';
          const settlementStatus = savedBooking?.settlementStatus || b.settlementStatus;
          return {
            ...b,
            status: bookingStatusLabel(executionStatus, 'Confirmed'),
            executionStatus,
            settlementStatus,
            checklist: executionChecklistFor(executionStatus),
          };
        });
        const nextBooking = updated.find((b) => b.id !== evidenceModalBooking.id && !isExecutionDone(b.executionStatus));
        setOpen(nextBooking?.id || null);
        return updated;
      });

      setFeedback(
        `Work marked done for ${evidenceModalBooking.id}. Evidence (${uploadedMedia.length} media asset(s)) was submitted to Core. ${bookings.some((b) => b.id !== evidenceModalBooking.id && !isExecutionDone(b.executionStatus)) ? 'Next booking opened below.' : 'No pending booking is left in this list.'}`
      );
      setEvidenceModalBooking(null);
      setUploadedMedia([]);
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
      sub="Confirmed via Core after quote approval. Submit execution progress & completion evidence here."
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
            <button onClick={() => setOpen(open === b.id ? null : b.id)} className="w-full flex items-center gap-3 p-4 sm:p-5 text-left cursor-pointer hover:bg-slate-50/50 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[15px] text-navy">{b.title}</span>
                  <StatusChip status={b.status} />
                  <span className="text-[10px] text-muted font-mono">{b.id}</span>
                </div>
                <div className="text-xs text-muted mt-1">{b.date} · {b.location} · Quote <b className="text-ink">{b.amount}</b></div>
                <div className="text-[11px] text-emerald-700 font-bold mt-1">
                  Advance received: ₹{b.advancePaid.toLocaleString()} · Balance: ₹{b.balanceAmount.toLocaleString()}
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
                    {b.executionStatus === 'SERVICE_STARTED' ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-2 flex items-center gap-1.5">
                        <Icon name="check" size={14} />
                        <span>Service Commenced (Check-in Done)</span>
                      </div>
                    ) : !isExecutionDone(b.executionStatus) ? (
                      <button
                        onClick={() => handleStartService(b)}
                        className="rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold px-4 py-2.5 transition shadow-sm cursor-pointer"
                      >
                        Start Service (Check-in)
                      </button>
                    ) : null}

                    {isExecutionDone(b.executionStatus) ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold px-4 py-2.5 flex items-center gap-1.5">
                        <Icon name="check" size={14} />
                        <span>Evidence Submitted — Under Core Review</span>
                      </div>
                    ) : b.executionStatus === 'SERVICE_STARTED' ? (
                      <button
                        onClick={() => openEvidenceModal(b)}
                        className="rounded-xl text-xs font-bold px-4 py-2.5 transition shadow-sm cursor-pointer flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white"
                      >
                        <Icon name="upload" size={14} />
                        <span>Upload Completion Evidence (Next Step)</span>
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2.5 text-xs">
                  <div className="bg-lavender/60 border border-lavender rounded-xl p-3">
                    <div className="text-muted text-[10px] uppercase font-bold">Payment Status</div>
                    <div className="font-semibold mt-0.5 text-navy">{b.payment} <span className="text-muted font-normal">(Core authority)</span></div>
                    <div className="text-[11px] text-muted mt-1">₹{b.advancePaid.toLocaleString()} advance paid by customer</div>
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

      {/* Cloudinary Multi-Image & Video Completion Evidence Submission Modal */}
      {evidenceModalBooking && (
        <div className="vendor-modal-backdrop animate-fade">
          <div className="vendor-modal-panel vendor-modal-panel-flex max-w-xl p-4 sm:p-6 space-y-4 bg-white dark:bg-[#161926] border border-gray-100 dark:border-white/10 text-navy dark:text-white">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-white/10 shrink-0">
              <div>
                <h2 className="text-base font-extrabold text-navy dark:text-white flex items-center gap-2">
                  <Icon name="upload" size={17} className="text-primary dark:text-[#a5b4fc]" />
                  <span>Submit Completion Evidence</span>
                </h2>
                <p className="text-xs text-muted dark:text-slate-400 mt-0.5">
                  {evidenceModalBooking.title} · <span className="font-mono font-semibold text-primary dark:text-[#a5b4fc]">{evidenceModalBooking.id}</span>
                </p>
              </div>
              <button
                onClick={() => setEvidenceModalBooking(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 text-ink/70 dark:text-slate-300 hover:text-ink dark:hover:text-white grid place-items-center transition cursor-pointer"
                aria-label="Close"
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            <div className="vendor-modal-scroll space-y-4 text-xs pr-1">
              {/* Cloudinary Drag & Drop Multi-Upload Box */}
              <div>
                <label className="block text-navy dark:text-white font-bold mb-1.5 flex items-center justify-between">
                  <span>Upload Photos & Videos (Cloudinary CDN)</span>
                  <span className="text-[11px] font-normal text-muted dark:text-slate-400">
                    {uploadedMedia.length} file(s) attached
                  </span>
                </label>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    if (e.dataTransfer.files) {
                      handleFilesUpload(Array.from(e.dataTransfer.files));
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
                    isDragOver
                      ? 'border-primary bg-primary-soft/60 dark:bg-primary/20 scale-[0.99]'
                      : 'border-primary/30 hover:border-primary dark:border-primary/40 dark:hover:border-primary bg-slate-50/60 dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        handleFilesUpload(Array.from(e.target.files));
                      }
                    }}
                  />
                  <div className="w-12 h-12 rounded-2xl bg-primary-soft dark:bg-primary/20 text-primary dark:text-[#a5b4fc] grid place-items-center shadow-xs">
                    <Icon name="upload" size={22} />
                  </div>
                  <div>
                    <span className="font-bold text-navy dark:text-white text-xs block">
                      Click to browse or drag & drop deliverables / files
                    </span>
                    <span className="text-[11px] text-muted dark:text-slate-400 block mt-0.5">
                      Supports Photos, Videos, PDFs, Word/Excel Docs, Zip Archives, and Google Drive links
                    </span>
                  </div>
                  <span className="px-3 py-1 bg-white dark:bg-[#101321] border border-gray-200 dark:border-white/15 text-primary dark:text-[#a5b4fc] font-bold text-[11px] rounded-lg shadow-xs mt-1">
                    Select Deliverables & Files
                  </span>
                </div>
              </div>

              {/* Upload Progress Indicator */}
              {uploadingToCloudinary && uploadProgress && (
                <div className="bg-primary-soft dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-navy dark:text-white">
                      Uploading to Cloudinary CDN ({uploadProgress.current} / {uploadProgress.total})...
                    </div>
                    <div className="w-full bg-white dark:bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all duration-200"
                        style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Uploaded Media & File Thumbnails Grid */}
              {uploadedMedia.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-navy dark:text-white text-xs">Attached Deliverables & Files ({uploadedMedia.length}):</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-primary dark:text-[#a5b4fc] hover:underline font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Icon name="plus" size={12} />
                      <span>Add More</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-52 overflow-y-auto p-1.5 bg-slate-50/70 dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl">
                    {uploadedMedia.map((m) => (
                      <div
                        key={m.id}
                        className="relative group rounded-xl overflow-hidden border border-gray-200 dark:border-white/15 bg-slate-900 aspect-video flex items-center justify-center shadow-xs"
                      >
                        {m.resourceType === 'VIDEO' ? (
                          <div className="w-full h-full relative flex items-center justify-center bg-navy/90">
                            <video src={m.url} className="w-full h-full object-cover opacity-80" />
                            <div className="absolute inset-0 grid place-items-center">
                              <span className="w-7 h-7 rounded-full bg-white/90 text-navy grid place-items-center shadow-md">
                                <Icon name="video" size={13} />
                              </span>
                            </div>
                          </div>
                        ) : m.resourceType === 'PDF' || m.resourceType === 'DOCUMENT' ? (
                          <div className="w-full h-full relative flex flex-col items-center justify-center bg-slate-800 dark:bg-slate-900 text-white p-2 text-center">
                            <span className="text-xl mb-0.5">📄</span>
                            <span className="text-[9px] font-extrabold truncate max-w-full px-1">{m.name}</span>
                          </div>
                        ) : (
                          <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                        )}

                        {/* Top badges */}
                        <div className="absolute top-1 left-1 flex items-center gap-1">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/75 text-white">
                            {m.resourceType}
                          </span>
                        </div>

                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveMedia(m.id);
                          }}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 text-white hover:bg-rose-600 grid place-items-center transition cursor-pointer"
                          title="Remove file"
                        >
                          <Icon name="close" size={10} />
                        </button>

                        {/* Bottom filename overlay */}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1 px-1.5 text-[9px] text-white truncate">
                          {m.name} ({m.size})
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Execution Checklist */}
              <div>
                <label className="block text-navy dark:text-white font-bold mb-1.5">Sign-off Checklist</label>
                <div className="bg-slate-50 dark:bg-[#101321] border border-gray-200 dark:border-white/10 rounded-xl p-3 space-y-2">
                  {checklistState.map((chk, idx) => (
                    <label key={idx} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={chk.checked}
                        onChange={(e) => {
                          const updated = [...checklistState];
                          updated[idx].checked = e.target.checked;
                          setChecklistState(updated);
                        }}
                        className="rounded border-gray-300 dark:border-gray-600 dark:bg-slate-800 text-primary focus:ring-primary h-4 w-4"
                      />
                      <span className="text-navy dark:text-slate-200 font-medium text-[11px]">{chk.item}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Notes & Summary */}
              <div>
                <label className="block text-navy dark:text-white font-bold mb-1">Completion Notes & Deliverable Summary</label>
                <textarea
                  rows={2}
                  placeholder="e.g. All 8 hours completed. Client signed off on ceremony coverage. High-res files and teaser uploaded to CDN."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#101321] border border-gray-200 dark:border-white/10 rounded-xl p-3 text-navy dark:text-white dark:placeholder-slate-500 outline-none focus:border-primary resize-none font-medium"
                />
              </div>

              {/* Optional External Archive Link */}
              <div>
                <label className="block text-muted dark:text-slate-400 font-semibold mb-1">
                  Additional Archive Link <span className="font-normal">(Optional Google Drive / Dropbox)</span>
                </label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={deliverablesUrl}
                  onChange={(e) => setDeliverablesUrl(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#101321] border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-navy dark:text-white dark:placeholder-slate-500 outline-none focus:border-primary font-medium"
                />
              </div>

              <div className="bg-primary-soft/50 dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded-xl p-3 text-[11px] text-navy dark:text-slate-200">
                <b className="text-navy dark:text-white">Core Platform Guarantee:</b> Once submitted, Core Operations verifies your deliverables against customer requirements. Upon validation, settlement unlocks automatically.
              </div>
            </div>

            {/* Modal Actions */}
            <div className="vendor-modal-actions pt-2 flex gap-3 border-t border-gray-100 dark:border-white/10">
              <button
                type="button"
                onClick={() => setEvidenceModalBooking(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-xs font-bold text-muted dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/10 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitEvidence}
                disabled={submitting || uploadingToCloudinary}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark shadow-md shadow-primary/25 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Submitting to Core...</span>
                  </>
                ) : (
                  <span>Submit Evidence</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
