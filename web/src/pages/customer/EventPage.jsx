import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import {
  AskBox,
  BackLink,
  CustomerPageSkeleton,
  Empty,
  EventMeta,
  EventStatusPill,
  ProgressBar,
  ProgressRing,
  StepTracker,
  Tabs,
  categoryIcon,
  useLoad,
} from './customerUi.jsx';
import UnderstandingCard, { EditForm } from './UnderstandingCard.jsx';
import { attentionLink, formatINR, planStatus } from './format.js';

const TONE = { amber: 'text-amber-600', emerald: 'text-emerald-600', primary: 'text-primary', muted: 'text-muted' };

function Cover({ event, onEdit, editable }) {
  return (
    <section className="rounded-3xl p-5 bg-gradient-to-br from-primary to-[#9b6dff] text-white shadow-lg shadow-primary/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-white/80">{event.eventTypeLabel}</div>
          <h1 className="text-xl font-extrabold truncate">{event.title}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="bg-white rounded-full"><EventStatusPill status={event.status} /></span>
          {editable && (
            <button onClick={onEdit} className="text-[11px] font-bold bg-white/15 hover:bg-white/25 rounded-lg px-2.5 py-1 inline-flex items-center gap-1">
              <Icon name="edit" size={11} /> Edit
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 [&_*]:text-white/90"><EventMeta event={event} /></div>
    </section>
  );
}

function ServiceTiles({ eventId, items }) {
  // Essentials first, then anything the customer asked for.
  const shown = items.filter((i) => i.tier === 'essential' || i.status !== 'missing');
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {shown.map((i) => {
          const s = planStatus(i);
          const line = i.status === 'missing' || i.status === 'pending'
            ? i.optionCount > 0 ? `${i.optionCount} option${i.optionCount > 1 ? 's' : ''} listed` : 'No options listed yet'
            : null;
          return (
            <Link
              key={i.category}
              to={line ? `/customer/events/${eventId}/services?category=${i.category}` : `/customer/events/${eventId}/requirements`}
              className="bg-white rounded-2xl border border-gray-100 p-3 hover:shadow-sm transition min-w-0">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-primary-soft text-primary grid place-items-center shrink-0"><Icon name={categoryIcon(i.category)} size={13} /></span>
                <span className="text-xs font-bold text-navy truncate">{i.label}</span>
              </div>
              <div className={`text-[10px] mt-1.5 truncate ${TONE[s.tone]}`}>{s.text}</div>
              {line && <div className="text-[10px] text-muted truncate">{line}</div>}
            </Link>
          );
        })}
      </div>
      <Link to={`/customer/events/${eventId}/requirements`} className="inline-flex text-xs font-bold text-primary">Open full event plan →</Link>
    </div>
  );
}

function Timeline({ eventId, rows }) {
  if (!rows.length) return <Empty title="Nothing recorded yet" />;
  return (
    <div className="bg-white rounded-2xl p-4 space-y-3">
      {rows.map((h, idx) => (
        <div key={idx} className="flex gap-3 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-navy font-semibold">{h.text}</div>
            <div className="text-[10px] text-muted">{h.actor} · {new Date(h.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
          </div>
        </div>
      ))}
      <Link to={`/customer/events/${eventId}/history`} className="inline-flex text-xs font-bold text-primary">View full timeline →</Link>
    </div>
  );
}

function BudgetCard({ eventId, budget }) {
  const spentOrPlanned = budget.committedCost + budget.estimatedCost;
  const pct = budget.target ? Math.min(100, Math.round((spentOrPlanned / budget.target) * 100)) : 0;
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="text-sm font-bold text-navy">Budget overview</div>
      {budget.target == null ? (
        <p className="text-xs text-muted mt-2">No budget set yet. Tell Aura+ your budget to track it here.</p>
      ) : (
        <>
          <div className="text-[11px] text-muted mt-1">
            Budget {budget.isRange ? `${budget.rangeLabel} (up to ${formatINR(budget.target)})` : formatINR(budget.target)}
          </div>
          <div className="mt-2"><ProgressBar percent={pct} /></div>
          <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
            <div><div className="text-muted">Booked</div><div className="font-bold text-navy">{formatINR(budget.committedCost)}</div></div>
            <div><div className="text-muted">Est. lowest options</div><div className="font-bold text-navy">{formatINR(budget.estimatedCost)}</div></div>
          </div>
          <div className={`text-[11px] font-bold mt-2 ${budget.remaining < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
            {budget.remaining < 0 ? `${formatINR(-budget.remaining)} over` : `${formatINR(budget.remaining)} remaining`}
          </div>
        </>
      )}
      {budget.servicesWithoutEstimate.length > 0 && (
        <p className="text-[10px] text-muted mt-2">No price listed yet for: {budget.servicesWithoutEstimate.join(', ')}</p>
      )}
      <div className="flex flex-wrap gap-3 mt-3">
        <Link to={`/customer/events/${eventId}/budget`} className="text-xs font-bold text-primary">Full budget →</Link>
        <Link to={`/customer/aura?event=${eventId}&ask=${encodeURIComponent('Budget check')}`} className="text-xs font-bold text-primary">Ask Aura+ →</Link>
      </div>
    </div>
  );
}

export default function EventPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useLoad(() => customerApi.dashboard(id), [id]);
  const [tab, setTab] = useState('plan');
  const [editing, setEditing] = useState(false);

  if (loading && !data) return <CustomerPageSkeleton cards={4} />;
  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <BackLink to="/customer/events">All events</BackLink>
        <div className="mt-3 text-sm text-red-500">{error.status === 404 ? 'Event not found.' : errorText(error)}</div>
      </div>
    );
  }
  const { event, summary, attention, attentionCount, steps, understanding, recentHistory, bookings = [], payments = [] } = data;

  if (event.status === 'draft') {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <BackLink to="/customer/events">All events</BackLink>
        <Cover event={event} />
        <UnderstandingCard understanding={understanding} event={event} onChanged={reload} />
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-sm font-bold text-navy mb-2">Tell Aura+ more</div>
          <AskBox eventId={event.id} placeholder="e.g. We need a photographer and the venue is…" />
        </div>
      </div>
    );
  }

  if (event.status === 'completed') {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <BackLink to="/customer/events">All events</BackLink>
        <Cover event={event} />
        <div className="bg-white rounded-3xl shadow-sm p-6 text-center">
          <div className="text-3xl">🎉</div>
          <div className="mt-2 text-lg font-extrabold text-navy">Your {event.eventTypeLabel?.toLowerCase()} is complete</div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to={`/customer/events/${event.id}/history`} className="rounded-xl border border-gray-200 text-xs font-bold px-4 py-2.5 text-navy">View event summary</Link>
            <Link to="/customer/aura?new=1" className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2.5">Plan another event</Link>
          </div>
        </div>
      </div>
    );
  }

  const editable = event.status === 'planning';
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <BackLink to="/customer/events">All events</BackLink>
      <Cover event={event} editable={editable} onEdit={() => setEditing((v) => !v)} />
      {event.status === 'in_progress' && (
        <Link to={`/customer/events/${event.id}/event-day`} className="flex items-center gap-2 rounded-2xl bg-red-50 text-red-600 px-4 py-3 text-sm font-bold">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Your event is live — follow it on Event day →
        </Link>
      )}
      {editing && (
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-sm font-bold text-navy">Edit event details</div>
          <EditForm event={event} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-base font-extrabold text-navy">Your {event.eventTypeLabel?.toLowerCase()} is taking shape!</div>
                <div className="text-xs text-muted mt-1">
                  {attentionCount > 0 ? `${attentionCount} decision${attentionCount > 1 ? 's' : ''} need your attention` : 'Nothing needs your decision right now'}
                </div>
                <div className="text-[11px] text-muted mt-1">{summary.essentialsHandled} of {summary.essentialsTotal} essentials handled</div>
              </div>
              <ProgressRing percent={summary.progressPercent} />
            </div>
            <div className="mt-4"><StepTracker steps={steps} /></div>
          </div>

          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'plan', label: 'Plan' },
              { key: 'vendors', label: 'Vendors' },
              { key: 'payments', label: 'Payments' },
              { key: 'timeline', label: 'Timeline' },
            ]}
          />
          {tab === 'plan' && <ServiceTiles eventId={event.id} items={summary.items} />}
          {tab === 'vendors' &&
            (bookings.length === 0 ? (
              <Empty title="No vendors booked yet">When you book a service, the vendor shows up here.</Empty>
            ) : (
              <div className="space-y-2">
                {bookings.map((b) => (
                  <Link key={b.id} to={`/customer/events/${event.id}/circle?booking=${b.id}`} className="bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-primary-soft text-primary grid place-items-center shrink-0"><Icon name={categoryIcon(b.category)} size={13} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-navy truncate">{b.vendorName}{b.isDemo ? ' (demo)' : ''}</div>
                      <div className="text-[10px] text-muted">{b.label} · {formatINR(b.amount)}</div>
                    </div>
                    <span className={`text-[10px] font-bold ${b.status === 'confirmed' ? 'text-emerald-600' : b.status === 'pending' ? 'text-amber-600' : 'text-muted'}`}>
                      {b.status === 'confirmed' ? '✓ Confirmed' : b.status === 'pending' ? 'Under review' : 'Cancelled'}
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          {tab === 'payments' &&
            (payments.length === 0 ? (
              <Empty title="No payments yet">Payments appear here once you reserve an option. Nothing is charged without you.</Empty>
            ) : (
              <div className="bg-white rounded-2xl p-4 space-y-2">
                {[
                  ['Verified', payments.filter((p) => p.status === 'verified')],
                  ['Awaiting verification', payments.filter((p) => ['processing', 'paid'].includes(p.status))],
                  ['Failed', payments.filter((p) => p.status === 'failed')],
                ].map(([label, rows]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-muted">{label} ({rows.length})</span>
                    <span className="font-bold text-navy">{formatINR(rows.reduce((s, p) => s + p.amount, 0))}</span>
                  </div>
                ))}
                <Link to={`/customer/events/${event.id}/bookings`} className="inline-flex text-xs font-bold text-primary pt-1">All bookings & payments →</Link>
              </div>
            ))}
          {tab === 'timeline' && <Timeline eventId={event.id} rows={recentHistory} />}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-sm font-bold text-navy mb-2">Ask STARVNT anything</div>
            <AskBox eventId={event.id} placeholder="Ask about this event…" chips={['What am I missing?', 'Budget check', 'Is everything on track?']} />
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-sm font-bold text-navy mb-2">Upcoming actions</div>
            {attention.length === 0 ? (
              <p className="text-xs text-muted">You're all caught up.</p>
            ) : (
              <ul className="space-y-2">
                {attention.map((a, i) => (
                  <li key={i}>
                    <Link to={attentionLink(a)} className="block rounded-xl bg-lavender/60 hover:bg-primary-soft p-2.5 text-xs">
                      <b className="text-navy">{a.title}</b>
                      <div className="text-muted text-[11px]">{a.detail}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <BudgetCard eventId={event.id} budget={summary.budget} />

          <div className="bg-white rounded-2xl shadow-sm p-2">
            {[
              ['services', 'Event plan', `/customer/events/${event.id}/requirements`],
              ['vendors', 'Find options', `/customer/events/${event.id}/services`],
              ['quotes', 'Quotes', `/customer/events/${event.id}/quotes`],
              ['payments', 'Bookings & payments', `/customer/events/${event.id}/bookings`],
              ['wallet', 'Budget', `/customer/events/${event.id}/budget`],
              ['message', 'Event Circle', `/customer/events/${event.id}/circle`],
              ['operations', 'Event day', `/customer/events/${event.id}/event-day`],
              ['calendar', 'Event timeline', `/customer/events/${event.id}/history`],
              ['star', 'Chat with Aura+ about this event', `/customer/aura?event=${event.id}`],
            ].map(([icon, label, to]) => (
              <Link key={label} to={to} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-lavender text-xs font-semibold text-navy">
                <Icon name={icon} size={14} className="text-primary" /> {label}
                <span className="ml-auto text-muted">›</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
