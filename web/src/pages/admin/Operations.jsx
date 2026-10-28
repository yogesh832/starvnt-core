import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../lib/api.js';
import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';
import { AdminPageHeader, AdminStatCard } from './adminUi.jsx';

const when = (value) => value ? new Date(value).toLocaleString('en-IN') : 'No run recorded';

export default function Operations() {
  const { can } = useAdminAuth();
  const allowed = can('automation.read');
  const [snapshot, setSnapshot] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([
      adminApi.call('/automation/stats', { signal: controller.signal }),
      adminApi.call(`/automation/outbox?limit=50${filter === 'ALL' ? '' : `&status=${filter}`}`, { signal: controller.signal }),
    ]).then(([health, queue]) => {
      if (active) setSnapshot({ stats: health.stats, events: queue.events || [] });
    }).catch((err) => { if (active) setError(err.message || 'Could not load operations.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [allowed, filter, revision]);
  return <div className="space-y-5">
    <AdminPageHeader title="Operations" description="Worker health and recorded automation jobs from Core." action={<button disabled={loading || !allowed} onClick={() => setRevision((n) => n + 1)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Refresh operations</button>} />
    {!allowed ? <div className="rounded-2xl bg-white p-5 text-sm">Queue health requires automation read access. <Link className="text-primary" to="/admin/bookings">Open bookings →</Link></div> : <>
      {error && <div role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      {loading && <div role="status" className="rounded-2xl bg-white p-4 text-sm text-muted">Loading operations…</div>}
      {snapshot && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[['pending','Pending'],['processing','Processing'],['completed','Completed'],['failed','Retry pending'],['deadLetter','Dead letter']].map(([key,label]) => <AdminStatCard key={key} label={label} value={snapshot.stats[key] ?? '—'} tone={key === 'deadLetter' || key === 'failed' ? 'rose' : 'primary'} />)}</div>
        <section className="rounded-2xl bg-white p-4 space-y-3">
          <h2 className="text-base font-bold">Background workers</h2>
          {(snapshot.stats.workers || []).map((worker) => <div key={worker.name} className="rounded-xl border border-gray-100 p-3 text-xs space-y-1">
            <div className="flex justify-between gap-2 font-bold"><span>{worker.name}</span><span>{worker.status}</span></div>
            <div className="text-muted">Last success: {when(worker.lastSuccessAt)}</div>
            {worker.lastError && <div className="break-words text-rose-700">{worker.lastError}</div>}
          </div>)}
          {!snapshot.stats.workers?.length && <p className="text-sm text-muted">No worker heartbeat recorded in this server process.</p>}
        </section>
        <section className="rounded-2xl bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3"><h2 className="mr-auto text-base font-bold">Recent jobs</h2><select aria-label="Filter operation jobs" value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-xs">{['ALL','PENDING','PROCESSING','FAILED','DEAD_LETTER','COMPLETED'].map((status) => <option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select></div>
          {snapshot.events.map((event) => <article key={event._id} className="rounded-xl border border-gray-100 p-3 text-xs space-y-1">
            <div className="flex flex-wrap justify-between gap-2 font-bold"><span>{event.eventType}</span><span>{event.status}</span></div>
            <p className="text-muted">{event.aggregateType} · {event.attempts || 0} attempts · {when(event.updatedAt || event.createdAt)}</p>
            {event.lastError && <p className="break-words text-rose-700">{typeof event.lastError === 'string' ? event.lastError : event.lastError.message || 'Job failed; inspect its automation record.'}</p>}
          </article>)}
          {!loading && !snapshot.events.length && <p className="text-sm text-muted">No jobs match this status.</p>}
          <Link to="/admin/automation" className="inline-block text-sm font-bold text-primary">Open automation records →</Link>
        </section>
      </>}
    </>}
  </div>;
}
