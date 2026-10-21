import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { activityState } from './auraActivityState.js';

const label = value => String(value || '').replaceAll('_', ' ').toLowerCase();
const money = value => value == null ? null : `₹${Number(value).toLocaleString('en-IN')}`;
export default function AuraActivity({ activity }) {
  const previous = useRef(null);
  const [changes, setChanges] = useState({});
  const scope = JSON.stringify(activity?.scope || null);
  useEffect(() => {
    previous.current = activityState(previous.current, activity);
    setChanges(previous.current?.changes || {});
  }, [activity, scope]);
  if (!activity) return null;
  return <section aria-label="Live activity" className="rounded-2xl border border-primary/20 bg-white/70 dark:bg-slate-900/60 p-3 space-y-2 text-xs">
    <div className="flex items-center justify-between gap-2"><h3 className="font-bold text-navy dark:text-slate-100">Live activity</h3><span className="text-muted">Updates automatically</span></div>
    <div className="flex flex-wrap gap-2 text-muted">{Object.entries(activity.counts || {}).map(([key, value]) => <span key={key}>{key === 'newEnquiries' ? 'New enquiries' : label(key)}: {value}</span>)}</div>
    {!activity.items.length ? <p className="text-muted">No saved activity yet.</p> : <details key={scope} open>
      <summary className="cursor-pointer text-primary py-1">Recent records</summary>
      <div className="max-h-72 overflow-y-auto space-y-2 pt-2">{activity.items.map(row => <Link key={row.id} to={row.href} className="block rounded-xl border border-gray-200 dark:border-slate-700 p-2.5 hover:border-primary/60">
        <div className="flex items-start justify-between gap-2"><span className="font-semibold text-navy dark:text-slate-100 break-words">{row.title || label(row.kind)}</span>{changes[row.id] && <span className="text-primary shrink-0">{changes[row.id]}</span>}</div>
        {row.reference && <div className="text-muted">{row.reference}</div>}
        <div className="text-muted flex flex-wrap gap-x-2 gap-y-1 mt-1"><span>{label(row.kind)} · {label(row.status)}</span>{row.total != null && <span>{money(row.total)}</span>}</div>
        <div className="text-muted flex flex-wrap gap-x-2 gap-y-1 mt-1">{[['Payment',row.paymentStatus],['Work',row.executionStatus],['Settlement',row.settlementStatus],['Paid',money(row.paid)],['Balance',money(row.balance)]].filter(([,value]) => value != null).map(([key,value]) => <span key={key}>{key}: {label(value)}</span>)}</div>
      </Link>)}</div>
    </details>}
  </section>;
}
