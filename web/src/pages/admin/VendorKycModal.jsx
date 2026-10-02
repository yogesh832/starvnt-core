import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { StatusChip } from '../../components/ui.jsx';

export default function VendorKycModal({ vendor, onClose, onRefresh }) {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [organization, setOrganization] = useState(vendor);
  const [actionNotes, setActionNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [selectedDoc, setSelectedDoc] = useState(null);

  const vendorId = vendor?._id || vendor?.id;

  const loadData = useCallback(async () => {
    if (!vendorId) return;
    try {
      setLoading(true);
      const res = await adminApi.call(`/external-users/organizations/${vendorId}/documents`);
      if (res.ok) {
        if (res.organization) setOrganization(res.organization);
        if (Array.isArray(res.documents)) setDocuments(res.documents);
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Failed to load vendor verification details.' });
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleVerify(approved, docId = null) {
    if (!vendorId || processing) return;
    const actionLabel = approved ? 'Approve' : 'Reject';
    const targetLabel = docId ? 'this document' : `KYC verification for ${organization.businessName || 'this vendor'}`;
    
    if (!window.confirm(`${actionLabel} ${targetLabel}?`)) return;

    try {
      setProcessing(true);
      setFeedback({ type: '', text: '' });

      const res = await adminApi.call(`/external-users/organizations/${vendorId}/verification`, {
        method: 'POST',
        body: {
          approved,
          documentId: docId,
          notes: actionNotes.trim() || `${actionLabel}d by Core Admin verification panel.`,
        },
      });

      if (res.ok) {
        setFeedback({
          type: 'success',
          text: `Vendor KYC successfully ${approved ? 'approved' : 'rejected'}. Activation status updated.`,
        });
        setActionNotes('');
        await loadData();
        if (onRefresh) onRefresh();
      } else {
        setFeedback({ type: 'error', text: res.error || `Failed to ${actionLabel.toLowerCase()} verification.` });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || `Failed to ${actionLabel.toLowerCase()} verification.` });
    } finally {
      setProcessing(false);
    }
  }

  if (!vendor) return null;

  const isOverallVerified = Boolean(organization?.verification?.isVerified);
  const owner = organization?.owner || {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-[pop_.18s_ease-out] border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="font-extrabold text-lg text-navy">
                {organization?.businessName || 'Vendor Profile'}
              </h2>
              <StatusChip status={isOverallVerified ? 'Verified' : 'Pending'} />
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-lavender text-navy">
                {organization?.category || 'Photography'}
              </span>
            </div>
            <p className="text-xs text-muted mt-1 flex items-center gap-2 flex-wrap">
              <span>{organization?.location || 'Location Pending'}</span>
              <span>·</span>
              <span>Owner: {owner.fullName || 'Vendor Owner'} ({owner.email || owner.phone || 'No contact details'})</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-lavender text-ink/70 hover:text-ink grid place-items-center transition cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback.text && (
          <div
            className={`px-6 py-3 text-xs font-semibold flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-b border-emerald-200'
                : 'bg-rose-50 text-rose-900 border-b border-rose-200'
            }`}
          >
            <Icon name={feedback.type === 'success' ? 'check' : 'alertCircle'} size={15} />
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Status Summary Banner */}
          <div
            className={`p-4 rounded-2xl border ${
              isOverallVerified
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                : 'bg-amber-50/70 border-amber-200 text-amber-950'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-extrabold text-sm">
                <Icon name={isOverallVerified ? 'shieldCheck' : 'help'} size={18} />
                <span>
                  {isOverallVerified
                    ? 'KYC Fully Verified & Active'
                    : 'KYC Document Verification Required'}
                </span>
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/80">
                {isOverallVerified ? 'Verified' : 'Review Required'}
              </span>
            </div>

            <p className="mt-1 text-xs opacity-90 leading-relaxed">
              {organization?.verification?.notes ||
                (isOverallVerified
                  ? 'Vendor documents have matched platform compliance standards and automated/admin approval.'
                  : 'Automated API check did not auto-approve or document requires manual verification of legal business name.')}
            </p>

            {organization?.verification?.verifiedAt && (
              <div className="mt-2 text-[10px] opacity-80 font-medium">
                Verified on: {new Date(organization.verification.verifiedAt).toLocaleString('en-IN')}
              </div>
            )}
          </div>

          {/* Uploaded Documents List */}
          <div>
            <h3 className="font-extrabold text-sm text-navy mb-3 flex items-center gap-2">
              <Icon name="documents" size={16} className="text-primary" />
              <span>Submitted Verification Documents (GST & PAN)</span>
            </h3>

            {loading ? (
              <div className="text-center py-8 text-muted font-medium bg-slate-50 rounded-2xl border border-gray-100">
                Loading vendor KYC documents…
              </div>
            ) : documents.length > 0 ? (
              <div className="space-y-3">
                {documents.map((doc) => {
                  const isVerifiedDoc = doc.status === 'VERIFIED';
                  const isRejectedDoc = doc.status === 'REJECTED';
                  const res = doc.verificationResult || {};

                  return (
                    <div
                      key={doc._id}
                      className={`p-4 rounded-2xl border transition ${
                        isVerifiedDoc
                          ? 'border-emerald-200 bg-emerald-50/30'
                          : isRejectedDoc
                          ? 'border-rose-200 bg-rose-50/30'
                          : 'border-amber-200 bg-amber-50/30'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-sm text-navy">
                              {doc.title}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-lavender text-muted uppercase">
                              {doc.type}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isVerifiedDoc
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isRejectedDoc
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {isVerifiedDoc
                                ? '✓ Verified'
                                : isRejectedDoc
                                ? '✕ Rejected'
                                : '● Review Pending'}
                            </span>
                          </div>

                          <div className="text-xs text-muted flex items-center gap-2 flex-wrap pt-0.5">
                            {doc.documentNumber && (
                              <span>
                                Document ID: <strong className="text-navy font-mono">{doc.documentNumber}</strong>
                              </span>
                            )}
                            <span>·</span>
                            <span>{doc.fileName || 'Document.pdf'} ({doc.fileSize || '1.2 MB'})</span>
                            <span>·</span>
                            <span>Uploaded {new Date(doc.createdAt).toLocaleDateString('en-IN')}</span>
                          </div>

                          {/* Verification Breakdown */}
                          {(doc.verificationSource === 'GSTIN_API' || doc.verificationSource === 'PAN_API') && (
                            <div className="mt-2.5 p-3 rounded-xl bg-white border border-gray-200/80 text-[11px] space-y-1.5 shadow-2xs">
                              <div className="flex items-center justify-between gap-2 flex-wrap border-b border-gray-100 pb-1.5">
                                <span className="font-bold text-navy flex items-center gap-1">
                                  <Icon name="zap" size={13} className="text-amber-500" />
                                  <span>
                                    {doc.type === 'PAN' ? 'Corporate PAN API Result' : 'GSTIN API Result'}
                                  </span>
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {res.confidence && (
                                    <span className="bg-lavender text-navy px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">
                                      Match: {res.confidence}
                                    </span>
                                  )}
                                  {res.matched ? (
                                    <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                      Auto-Matched Name
                                    </span>
                                  ) : (
                                    <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                      Manual Review Needed
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="grid sm:grid-cols-2 gap-x-3 gap-y-1 pt-1">
                                <div>
                                  <span className="text-muted">Legal / Registered Name:</span>{' '}
                                  <strong className="text-navy">{res.legalName || res.registeredName || 'Not returned'}</strong>
                                </div>
                                <div>
                                  <span className="text-muted">Trade / Brand Name:</span>{' '}
                                  <strong className="text-navy">{res.tradeName || 'Not returned'}</strong>
                                </div>
                                <div>
                                  <span className="text-muted">Status:</span>{' '}
                                  <strong className="text-navy">{res.gstinStatus || res.panStatus || 'VALID'}</strong>
                                </div>
                                <div>
                                  <span className="text-muted">Entity / Taxpayer Type:</span>{' '}
                                  <strong className="text-navy">{res.taxpayerType || res.entityType || 'Standard'}</strong>
                                </div>
                                {res.address && (
                                  <div className="sm:col-span-2 text-muted">
                                    <span>Registered Address:</span> <span className="text-navy">{res.address}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {doc.notes && (
                            <p className="text-[11px] text-muted italic mt-1 bg-white/60 p-2 rounded-lg border border-gray-100">
                              {doc.notes}
                            </p>
                          )}
                        </div>

                        {/* Document Action Buttons */}
                        <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0 self-end sm:self-start">
                          {!isVerifiedDoc && (
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() => handleVerify(true, doc._id)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-xs transition cursor-pointer disabled:opacity-50"
                            >
                              Approve Doc
                            </button>
                          )}
                          {!isRejectedDoc && (
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() => handleVerify(false, doc._id)}
                              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                            >
                              Reject Doc
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 px-4 bg-slate-50 border-2 border-dashed border-gray-200 rounded-2xl space-y-1">
                <div className="font-bold text-navy">No documents submitted yet</div>
                <p className="text-xs text-muted max-w-sm mx-auto">
                  The vendor has not uploaded their GST Registration Certificate or Corporate PAN Card.
                </p>
              </div>
            )}
          </div>

          {/* Admin Decision & Notes Form */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-gray-200 space-y-3">
            <h4 className="font-extrabold text-navy text-xs">Admin Decision & Verification Notes</h4>
            <textarea
              rows={2}
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="e.g. Verified legal entity name against MCA registry and official GST portal."
              className="w-full bg-white border border-gray-200 rounded-xl p-3 font-medium text-navy text-xs outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={processing}
                onClick={() => handleVerify(false)}
                className="px-4 py-2.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                Reject Overall KYC
              </button>
              <button
                type="button"
                disabled={processing}
                onClick={() => handleVerify(true)}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition cursor-pointer disabled:opacity-50"
              >
                Approve Overall KYC
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
