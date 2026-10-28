import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { externalApi } from '../lib/api.js';
import { SUPPORT_CONTACT } from '../config/support.js';

const MESSAGES = {
  DRAFT: 'Complete your profile and submit the required information for review.',
  REGISTERED: 'Complete your operating profile to begin verification.',
  PROFILE_INCOMPLETE: 'Your profile has outstanding requirements. Complete them before activation review.',
  VERIFICATION_PENDING: 'Identity or bank verification is pending. Complete the required verification steps.',
  UNDER_REVIEW: 'Your profile is under review. Our team will review your submission and update your activation status. If you need assistance, contact our support team.',
  VERIFIED: 'Verification is complete. Finish your operating profile for activation review.',
  ELIGIBLE: 'Your operating profile is ready for activation review.',
  ACTIVE: 'Your profile is approved and currently eligible for customer matching. Availability and service rules still apply.',
  REJECTED: 'Your profile has been rejected. Review the feedback below and contact support for assistance.',
  SUSPENDED: 'Your profile is suspended. Review the feedback below and contact support about the next steps.',
};
export default function ProfileStatus({ status: supplied }) {
  const [status, setStatus] = useState(supplied || null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (supplied) { setStatus(supplied); return; }
    let cancelled = false;
    const refresh = async () => {
      try { const data = await externalApi.call('/vendor/activation-status'); if (!cancelled) { setStatus(data.status); setError(''); } }
      catch (err) { if (!cancelled) setError(err.message); }
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [supplied]);
  const state = status?.activationState;
  return <section className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 sm:p-7 space-y-5" aria-label="Profile status">
    <div className="flex justify-between items-center gap-3"><h2 className="text-xl font-extrabold text-navy">Profile Status</h2><span className={`rounded-full px-4 py-2 text-sm font-bold ${state === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{state ? state.replaceAll('_', ' ') : 'Loading'}</span></div>
    {error && <p role="alert" className="text-red-700">Could not refresh profile status: {error}</p>}
    <div className="rounded-2xl bg-orange-50 p-5 text-sm text-gray-800 space-y-3">
      <p>{state === 'DRAFT' && status?.commercialReadiness ? 'Your profile is ready. Submit it for activation review.' : state ? MESSAGES[state] || 'The profile status needs review. Contact support for assistance.' : 'Loading the current profile status…'}</p>
      {['DRAFT', 'PROFILE_INCOMPLETE'].includes(state) && status?.commercialReadiness && <button disabled={submitting} className="rounded-xl bg-primary text-white px-4 py-2" onClick={async () => { setSubmitting(true); try { const data = await externalApi.call('/vendor/activation-review', { method: 'POST' }); setStatus(data.status); setError(''); } catch (err) { setError(err.message); } finally { setSubmitting(false); } }}>Submit profile for review</button>}
      {status?.reviewFeedback && <p><b>Review feedback: </b>{status.reviewFeedback}</p>}
      {!!status?.missingRequirements?.length && <><ul className="list-disc pl-5">{status.missingRequirements.map(item => <li key={item}>{item}</li>)}</ul><Link className="text-primary underline" to="/vendor/profile">Review profile requirements</Link></>}
      {status?.lastStatusUpdate && <p className="text-xs text-muted">Last updated: {new Date(status.lastStatusUpdate).toLocaleString()}</p>}
    </div>
    <div className="rounded-2xl border border-gray-100 p-4 flex flex-wrap justify-between items-center gap-3"><b>Need Support?</b><div className="flex flex-wrap gap-3"><a className="rounded-xl bg-green-50 text-green-800 px-4 py-3 font-bold text-sm" target="_blank" rel="noopener noreferrer" href={SUPPORT_CONTACT.whatsapp} onClick={() => { externalApi.call('/vendor/support-actions', { method: 'POST', body: { action: 'WHATSAPP', outcome: 'OPEN_REQUESTED' } }).catch(() => {}); }}>WhatsApp Support</a><a className="rounded-xl bg-blue-50 text-blue-800 px-4 py-3 font-bold text-sm" href={SUPPORT_CONTACT.phone} onClick={() => { externalApi.call('/vendor/support-actions', { method: 'POST', body: { action: 'CALL', outcome: 'OPEN_REQUESTED' } }).catch(() => {}); }}>Call Support</a></div><span className="text-xs text-muted w-full">{SUPPORT_CONTACT.number}</span></div>
  </section>;
}
