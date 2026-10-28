import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, Empty, PageSkeleton, Tabs, useLoad } from './customerUi.jsx';
import { milestones } from './historyMilestones.js';
export { milestones } from './historyMilestones.js';

const when = (t) => new Date(t).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/** Milestones reached so far, derived only from recorded history. */
/** Event Timeline: milestones + full activity log in plain language. */
export default function EventHistoryPage() {
  const { id } = useParams();
  const { data, error, loading } = useLoad(() => customerApi.history(id), [id]);
  const [filter, setFilter] = useState('all');

  if (loading) return <PageSkeleton title="Event Timeline" count={4} type="list" />;
  if (error) return <div className="text-sm text-red-500">{error.status === 404 ? 'Event not found.' : errorText(error)}</div>;
  const history = data.history;
  const shown = filter === 'all' ? history : history.filter((h) => h.group === filter);
  const ms = milestones(history);
  const next = ms.find(([, done]) => !done);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <BackLink to={`/customer/events/${id}`}>Event</BackLink>
      <h1 className="text-xl font-extrabold text-navy">Event timeline</h1>

      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
        {ms.map(([label, done]) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold ${done ? 'bg-primary text-white' : 'bg-gray-100 text-muted'}`}>{done ? '✓' : ''}</span>
            <span className={done ? 'text-navy font-semibold' : 'text-muted'}>{label}</span>
            <span className="ml-auto text-[10px] text-muted">{done ? when(done.at) : 'Upcoming'}</span>
          </div>
        ))}
        {next && <div className="text-[11px] text-primary font-bold pt-1">Next step: {next[0].replace(/ \(.*\)$/, '')}</div>}
      </div>

      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'planning', label: 'Planning' },
          { key: 'booking', label: 'Booking' },
          { key: 'execution', label: 'Execution' },
        ]}
      />
      {shown.length === 0 ? (
        <Empty title="Nothing recorded yet" />
      ) : (
        <ol className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          {shown.map((h, i) => (
            <li key={i} className="flex gap-3 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              <div>
                <div className="text-navy font-semibold">{h.text}</div>
                <div className="text-[10px] text-muted">{h.actor} · {when(h.at)}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
