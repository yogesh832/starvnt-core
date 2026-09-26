import { Link, useParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { BackLink, CustomerPageSkeleton, DemoBadge, Empty, categoryIcon, useLoad } from './customerUi.jsx';

const time = (t) => (t ? new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null);

function Step({ label, at }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className={`w-2 h-2 rounded-full ${at ? 'bg-emerald-500' : 'bg-gray-200'}`} />
      <span className={at ? 'text-navy font-semibold' : 'text-muted'}>{label}</span>
      <span className="ml-auto text-muted">{at ? time(at) : 'No update yet'}</span>
    </div>
  );
}

/** Event day: built only from recorded check-in / start / complete times. */
export default function EventDayPage() {
  const { id } = useParams();
  const { data, error, loading } = useLoad(() => customerApi.eventDay(id), [id]);

  if (loading) return <CustomerPageSkeleton cards={3} />;
  if (error) return <div className="text-sm text-red-500">{error.status === 404 ? 'Event not found.' : errorText(error)}</div>;
  const { event, live, services, allCompleted } = data;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <BackLink to={`/customer/events/${id}`}>{event.title}</BackLink>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-extrabold text-navy">Your event today</h1>
        {live && <span className="text-[10px] font-bold uppercase rounded-full px-2 py-0.5 bg-red-500 text-white animate-pulse">Live</span>}
      </div>
      {allCompleted && (
        <div className="rounded-2xl bg-emerald-50 text-emerald-800 text-sm font-bold px-4 py-3">✓ All booked services are completed</div>
      )}
      {services.length === 0 ? (
        <Empty title="No booked services yet">Once services are booked, their event-day progress shows up here.</Empty>
      ) : (
        <div className="space-y-3">
          {services.map((s) => (
            <div key={s.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-primary-soft text-primary grid place-items-center shrink-0"><Icon name={categoryIcon(s.category)} size={15} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-navy truncate">{s.label} {s.isDemo && <DemoBadge />}</div>
                  <div className="text-[11px] text-muted truncate">{s.vendorName}</div>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <Step label="Checked in" at={s.checkedInAt} />
                <Step label="Started" at={s.startedAt} />
                <Step label="Completed" at={s.completedAt} />
              </div>
              {s.evidence && (
                <div className="mt-3 rounded-xl bg-lavender/60 p-3 text-[11px]">
                  {s.evidence.note && <div className="text-ink/80">{s.evidence.note}</div>}
                  {s.evidence.photoUrls?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {s.evidence.photoUrls.map((u, i) => (
                        <a key={u} href={u} target="_blank" rel="noreferrer noopener" className="text-primary font-bold">Photo {i + 1} ↗</a>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Link to={`/customer/events/${id}/circle?booking=${s.id}`} className="inline-flex mt-3 text-[11px] font-bold text-primary">Message about this service →</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
