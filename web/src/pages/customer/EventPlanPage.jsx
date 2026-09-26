import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, CustomerPageSkeleton, Empty, EventMeta, ProgressBar, Tabs, categoryIcon, useLoad } from './customerUi.jsx';
import { formatINR, planStatus } from './format.js';

const TONE = { amber: 'text-amber-600', emerald: 'text-emerald-600', primary: 'text-primary', muted: 'text-muted' };
const LOCKED = ['confirmed', 'booked', 'completed'];

function PlanCard({ eventId, req, busy, onSet }) {
  const [arranging, setArranging] = useState(false);
  const [name, setName] = useState(req.providedValue || '');
  const s = planStatus(req);
  const locked = LOCKED.includes(req.status);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3.5">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl bg-primary-soft text-primary grid place-items-center shrink-0"><Icon name={categoryIcon(req.category)} size={15} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-navy truncate">{req.label}</div>
          <div className={`text-[11px] truncate ${TONE[s.tone]}`}>{s.text}</div>
          {!locked && req.status !== 'customer_provided' && (
            <div className="text-[10px] text-muted truncate">
              {req.optionCount > 0
                ? `${req.optionCount} option${req.optionCount > 1 ? 's' : ''} listed${req.estimatedCost != null ? ` · from ${formatINR(req.estimatedCost)}` : ''}`
                : 'No options listed yet'}
            </div>
          )}
        </div>
      </div>

      {!locked && (
        arranging ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onSet(req.category, { status: 'customer_provided', providedValue: name }).then((ok) => ok && setArranging(false));
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Who is your ${req.label.toLowerCase()}?`}
              className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:border-primary"
            />
            <button disabled={busy || !name.trim()} className="rounded-xl bg-primary text-white text-xs font-bold px-3 disabled:opacity-50">Save</button>
            <button type="button" onClick={() => setArranging(false)} className="text-xs font-bold text-muted px-1">Cancel</button>
          </form>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {req.status !== 'customer_provided' && (
              <Link to={`/customer/events/${eventId}/services?category=${req.category}`} className="text-[11px] font-bold rounded-lg bg-primary text-white px-2.5 py-1.5">
                Find options
              </Link>
            )}
            {req.status !== 'pending' && (
              <button disabled={busy} onClick={() => onSet(req.category, { status: 'pending' })} className="text-[11px] font-bold rounded-lg bg-primary-soft text-primary px-2.5 py-1.5 disabled:opacity-50">
                I need this
              </button>
            )}
            <button disabled={busy} onClick={() => setArranging(true)} className="text-[11px] font-bold rounded-lg border border-gray-200 text-navy px-2.5 py-1.5 disabled:opacity-50">
              {req.status === 'customer_provided' ? 'Change name' : 'I have this arranged'}
            </button>
            {req.status !== 'missing' && (
              <button disabled={busy} onClick={() => onSet(req.category, { status: 'missing' })} className="text-[11px] font-bold text-muted hover:text-navy px-2 py-1.5 disabled:opacity-50">
                Reset
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}

export default function EventPlanPage() {
  const { id } = useParams();
  const { data, error, loading, setData } = useLoad(() => customerApi.requirements(id), [id]);
  const options = useLoad(() => customerApi.planOptions(), []);
  const [tab, setTab] = useState('all');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [adding, setAdding] = useState('');

  async function onSet(category, body) {
    setBusy(true);
    setActionError('');
    try {
      const res = await customerApi.setRequirement(id, category, body);
      setData(res);
      return true;
    } catch (err) {
      setActionError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <CustomerPageSkeleton cards={4} />;
  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <BackLink to={`/customer/events/${id}`}>Event</BackLink>
        <div className="mt-3 text-sm text-red-500">{error.status === 404 ? 'Event not found.' : errorText(error)}</div>
      </div>
    );
  }

  const { event, requirements, counts, summary } = data;
  const closed = ['completed', 'cancelled'].includes(event.status);
  const shown = tab === 'all' ? requirements : requirements.filter((r) => r.tier === tab);
  const inPlan = new Set(requirements.map((r) => r.category));
  const addable = (options.data?.categories || []).filter((c) => !inPlan.has(c.value));

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-6">
      <BackLink to={`/customer/events/${id}`}>{event.title}</BackLink>

      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-navy">Event plan</h1>
            <div className="mt-1"><EventMeta event={event} /></div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-extrabold text-primary">{summary.progressPercent}%</div>
            <div className="text-[10px] text-muted">{summary.essentialsHandled}/{summary.essentialsTotal} essentials</div>
          </div>
        </div>
        <div className="mt-3"><ProgressBar percent={summary.progressPercent} /></div>
        {event.status === 'draft' && (
          <p className="text-[11px] text-amber-600 mt-2">Confirm your event details to build the full plan.</p>
        )}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'all', label: 'All', count: counts.all },
          { key: 'essential', label: 'Essential', count: counts.essential },
          { key: 'recommended', label: 'Recommended', count: counts.recommended },
          { key: 'optional', label: 'Optional', count: counts.optional },
          ...(counts.custom ? [{ key: 'custom', label: 'Added', count: counts.custom }] : []),
        ]}
      />

      {actionError && <div className="text-xs text-red-500">{actionError}</div>}
      {closed && <div className="text-xs text-muted">This event is closed, so the plan is read-only.</div>}

      {shown.length === 0 ? (
        <Empty title="Nothing here yet" />
      ) : (
        <div className="grid sm:grid-cols-2 gap-2.5">
          {shown.map((r) => (closed ? (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-3.5 text-sm font-bold text-navy">{r.label} <span className={`block text-[11px] font-normal ${TONE[planStatus(r).tone]}`}>{planStatus(r).text}</span></div>
          ) : (
            <PlanCard key={r.id} eventId={id} req={r} busy={busy} onSet={onSet} />
          )))}
        </div>
      )}

      {!closed && addable.length > 0 && (
        <form
          className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (adding) onSet(adding, { status: 'pending' }).then((ok) => ok && setAdding(''));
          }}
        >
          <span className="text-xs font-bold text-navy">Add another service</span>
          <select value={adding} onChange={(e) => setAdding(e.target.value)} className="flex-1 min-w-[160px] rounded-xl border border-gray-200 px-3 py-2 text-xs bg-white">
            <option value="">Choose a service…</option>
            {addable.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <button disabled={!adding || busy} className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2 disabled:opacity-50">Add</button>
        </form>
      )}

      {!closed && requirements.some((r) => r.status === 'missing' || r.status === 'pending') && (
        <div className="sticky bottom-20 md:bottom-4 z-20 flex justify-center">
          <Link to={`/customer/events/${id}/services`} className="rounded-2xl bg-primary text-white text-sm font-bold px-6 py-3 shadow-lg shadow-primary/30">
            Find best options for all ✨
          </Link>
        </div>
      )}
    </div>
  );
}
