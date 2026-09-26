import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { customerApi, errorText } from './customerApi.js';
import { CustomerPageSkeleton, Empty, Tabs, useLoad } from './customerUi.jsx';

const when = (t) => new Date(t).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const TONE = {
  payment: 'bg-amber-50 text-amber-600',
  booking: 'bg-emerald-50 text-emerald-600',
  completion: 'bg-emerald-50 text-emerald-700',
  cancellation: 'bg-red-50 text-red-500',
  message: 'bg-primary-soft text-primary',
  event_day: 'bg-violet-50 text-violet-600',
};

/** Messages & Updates. Opening the page marks everything read. */
export default function UpdatesPage({ onRead }) {
  const { data, error, loading } = useLoad(() => customerApi.updates(), []);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    if (data?.unread) customerApi.readAll().then(() => onRead?.()).catch(() => {});
  }, [data, onRead]);

  if (loading) return <CustomerPageSkeleton cards={4} />;
  if (error) return <div className="text-sm text-red-500">{errorText(error)}</div>;
  const { notifications, vendorMessages, auraConversations } = data;
  const important = notifications.filter((n) => n.important);

  const list = (items) =>
    items.length === 0 ? (
      <Empty title="No updates yet">Booking, payment and vendor updates will show up here.</Empty>
    ) : (
      <div className="space-y-2">
        {items.map((n) => (
          <Link key={n.id} to={n.eventId ? `/customer/events/${n.eventId}` : '/customer'} className={`block bg-white rounded-2xl shadow-sm p-4 ${n.read ? '' : 'ring-1 ring-primary/30'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[9px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${TONE[n.type] || 'bg-gray-100 text-muted'}`}>{n.type.replace('_', ' ')}</span>
              <span className="text-[10px] text-muted">{when(n.createdAt)}</span>
            </div>
            <div className="text-sm font-bold text-navy mt-2">{n.title}</div>
            {n.body && <p className="text-xs text-ink/80 mt-0.5">{n.body}</p>}
            {n.eventTitle && <div className="text-[10px] text-muted mt-1">{n.eventTitle}</div>}
          </Link>
        ))}
      </div>
    );

  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-extrabold text-navy">Messages & updates</h1>
        <p className="text-xs text-muted mt-0.5">Only what needs your attention — no noise.</p>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'all', label: 'All', count: notifications.length },
          { key: 'vendors', label: 'Vendors', count: vendorMessages.length },
          { key: 'aura', label: 'Aura+', count: auraConversations.length },
          { key: 'important', label: 'Important', count: important.length },
        ]}
      />
      {tab === 'all' && list(notifications)}
      {tab === 'important' && list(important)}
      {tab === 'vendors' &&
        (vendorMessages.length === 0 ? (
          <Empty title="No vendor messages yet" />
        ) : (
          <div className="space-y-2">
            {vendorMessages.map((m) => (
              <Link
                key={m.id}
                to={`/customer/events/${m.eventId}/circle${m.bookingId ? `?booking=${m.bookingId}` : m.requirementId ? `?service=${m.requirementId}` : ''}`}
                className="block bg-white rounded-2xl shadow-sm p-4"
              >
                <div className="flex justify-between text-[10px] text-muted"><span>{m.eventTitle}</span><span>{when(m.createdAt)}</span></div>
                <div className="text-sm font-bold text-navy mt-1">{m.senderName}</div>
                <p className="text-xs text-ink/80">{m.body}</p>
              </Link>
            ))}
          </div>
        ))}
      {tab === 'aura' && (
        <div className="space-y-2">
          <Link to="/customer/aura?new=1" className="block text-center rounded-2xl border border-dashed border-primary/40 text-primary text-xs font-bold py-3">+ New conversation</Link>
          {auraConversations.map((c) => (
            <Link key={c.sessionId} to={c.eventId ? `/customer/aura?event=${c.eventId}` : '/customer/aura'} className="block bg-white rounded-2xl shadow-sm p-4">
              <div className="text-sm font-bold text-navy">{c.eventTitle || 'Conversation with Aura+'}</div>
              <div className="text-[10px] text-muted">Last active {when(c.updatedAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
