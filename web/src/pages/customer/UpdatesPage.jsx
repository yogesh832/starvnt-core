import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';
import { Empty, PageSkeleton, Tabs, useLoad } from './customerUi.jsx';

const when = (t) => {
  if (!t) return '';
  const d = new Date(t);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const TONE = {
  payment: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  booking: 'bg-blue-50 text-blue-700 border-blue-100',
  completion: 'bg-teal-50 text-teal-700 border-teal-100',
  cancellation: 'bg-rose-50 text-rose-700 border-rose-100',
  message: 'bg-primary-soft text-primary border-primary/20',
  event_day: 'bg-violet-50 text-violet-700 border-violet-100',
  quote: 'bg-amber-50 text-amber-700 border-amber-100',
  enquiry: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  system: 'bg-gray-100 text-gray-700 border-gray-200',
};

const ICONS = {
  payment: 'payments',
  booking: 'calendar',
  completion: 'check',
  cancellation: 'close',
  message: 'message',
  event_day: 'star',
  quote: 'quotes',
  enquiry: 'message',
  system: 'bell',
};

function getSafeNotificationLink(n) {
  if (n.to) return n.to;
  if (!n.eventId) return '/customer';
  const type = String(n.type || '').toLowerCase();
  if (['booking', 'payment', 'completion'].includes(type)) {
    return `/customer/events/${n.eventId}/bookings`;
  }
  if (type === 'quote') {
    return `/customer/events/${n.eventId}/quotes`;
  }
  if (type === 'message') {
    return `/customer/events/${n.eventId}/circle`;
  }
  if (type === 'event_day') {
    return `/customer/events/${n.eventId}/event-day`;
  }
  return `/customer/events/${n.eventId}`;
}

/** Messages & Updates Page: real-time notifications, vendor threads, and Aura+ chats. */
export default function UpdatesPage({ onRead }) {
  const { data, error, loading, reload, setData } = useLoad(() => customerApi.updates(), []);
  const [tab, setTab] = useState('all');
  const [markingRead, setMarkingRead] = useState(false);

  const handleMarkAllRead = async () => {
    try {
      setMarkingRead(true);
      await customerApi.readAll();
      onRead?.();
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          unread: 0,
          notifications: (prev.notifications || []).map((n) => ({ ...n, read: true })),
          threads: (prev.threads || []).map((t) => ({ ...t, unreadCount: 0 })),
        };
      });
    } catch {
      // ignore
    } finally {
      setMarkingRead(false);
    }
  };

  if (loading) return <PageSkeleton title="Updates" count={4} type="list" />;

  if (error) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 py-8">
        <div className="rounded-3xl bg-white border border-red-100 p-6 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 grid place-items-center mx-auto">
            <Icon name="help" size={20} />
          </div>
          <div className="text-sm font-extrabold text-navy">Could not load updates</div>
          <p className="text-xs text-muted max-w-sm mx-auto">{errorText(error)}</p>
          <button
            onClick={reload}
            className="rounded-xl bg-primary text-white text-xs font-bold px-4 py-2 hover:bg-primary-dark transition cursor-pointer"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const notifications = Array.isArray(data?.notifications) ? data.notifications : [];
  const threads = Array.isArray(data?.threads) ? data.threads : [];
  const vendorMessages = Array.isArray(data?.vendorMessages) ? data.vendorMessages : [];
  const auraConversations = Array.isArray(data?.auraConversations) ? data.auraConversations : [];
  const important = notifications.filter((n) => n.important);

  // Deduplicate between notifications and direct messages
  const notifSignatures = new Set(notifications.map((n) => `${n.title}|${n.body}`));
  const uniqueMessageItems = vendorMessages
    .filter((m) => !notifSignatures.has(`${m.senderName} replied|${m.body}`))
    .map((m) => ({
      id: `msg:${m.id}`,
      type: 'message',
      title: m.senderType === 'customer' ? 'You sent a message' : `${m.senderName || 'Vendor'} replied`,
      body: m.body,
      eventId: m.eventId,
      eventTitle: m.eventTitle,
      createdAt: m.createdAt,
      read: true,
      to: m.to || (m.eventId ? `/customer/events/${m.eventId}/circle` : '/customer/events'),
    }));

  const allItems = [...notifications, ...uniqueMessageItems].sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );

  const renderNotificationList = (items) =>
    items.length === 0 ? (
      <Empty title="No updates yet">Booking, payment, quote and vendor updates will appear here.</Empty>
    ) : (
      <div className="space-y-2.5">
        {items.map((n, idx) => {
          const typeKey = String(n.type || 'system').toLowerCase();
          const typeLabel = String(n.type || 'update').replace(/_/g, ' ');
          const targetUrl = getSafeNotificationLink(n);

          return (
            <Link
              key={n.id || `notif-${idx}`}
              to={targetUrl}
              className={`block bg-white rounded-2xl border border-gray-100 hover:border-primary/40 shadow-xs hover:shadow-sm p-4 transition group ${
                !n.read ? 'ring-1 ring-primary/40 bg-white' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full px-2.5 py-0.5 border ${
                    TONE[typeKey] || TONE.system
                  }`}
                >
                  <Icon name={ICONS[typeKey] || 'bell'} size={12} />
                  <span>{typeLabel}</span>
                </span>
                <div className="flex items-center gap-2">
                  {!n.read && <span className="w-2 h-2 rounded-full bg-primary" title="Unread" />}
                  <span className="text-[10px] text-muted">{when(n.createdAt)}</span>
                </div>
              </div>
              <div className="text-sm font-bold text-navy group-hover:text-primary transition mt-2">{n.title}</div>
              {n.body && <p className="text-xs text-ink/80 mt-1 leading-relaxed">{n.body}</p>}
              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-50">
                <span className="text-[11px] font-medium text-muted truncate">
                  {n.eventTitle ? `📍 ${n.eventTitle}` : 'STARVNT Core'}
                </span>
                <span className="text-xs font-bold text-primary group-hover:translate-x-0.5 transition flex items-center gap-0.5">
                  <span>View</span>
                  <Icon name="chevronRight" size={13} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    );

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header with Title and Quick Actions */}
      <div className="flex items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-xl font-extrabold text-navy">Messages & updates</h1>
          <p className="text-xs text-muted mt-0.5">Real-time alerts, bookings, vendor chats and Aura+ sessions.</p>
        </div>
        <div className="flex items-center gap-2">
          {data?.unread > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingRead}
              className="rounded-xl border border-primary/30 bg-primary-soft hover:bg-primary text-primary hover:text-white px-3 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer"
            >
              {markingRead ? 'Marking...' : 'Mark all read'}
            </button>
          )}
          <button
            onClick={reload}
            className="w-8 h-8 rounded-xl border border-gray-200 hover:bg-white text-muted hover:text-navy grid place-items-center transition cursor-pointer"
            title="Refresh updates"
            aria-label="Refresh updates"
          >
            <Icon name="trend" size={14} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'all', label: 'All', count: allItems.length },
          { key: 'messages', label: 'Messages', count: threads.length || vendorMessages.length },
          { key: 'aura', label: 'Aura+', count: auraConversations.length },
          { key: 'important', label: 'Important', count: important.length },
        ]}
      />

      {/* Tab Contents */}
      {tab === 'all' && renderNotificationList(allItems)}
      {tab === 'important' && renderNotificationList(important)}

      {/* Messages Tab: active conversation threads with vendor partners */}
      {tab === 'messages' && (
        <div className="space-y-3">
          {threads.length === 0 && vendorMessages.length === 0 ? (
            <Empty title="No messages yet">
              Messages with your vendors and Event Circle discussions will appear here.
            </Empty>
          ) : threads.length > 0 ? (
            <div className="space-y-2.5">
              {threads.map((t) => (
                <Link
                  key={t.id}
                  to={t.to}
                  className={`block bg-white rounded-2xl border border-gray-100 hover:border-primary/40 shadow-xs hover:shadow-sm p-4 transition group ${
                    t.unreadCount > 0 ? 'ring-1 ring-primary/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-2xl bg-primary-soft text-primary grid place-items-center shrink-0 font-extrabold text-sm">
                        {(t.vendorName || 'V').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-navy group-hover:text-primary transition">
                            {t.vendorName}
                          </span>
                          {t.vendorCategory && (
                            <span className="text-[10px] font-semibold bg-lavender text-navy px-2 py-0.5 rounded-full">
                              {t.vendorCategory}
                            </span>
                          )}
                          {t.unreadCount > 0 && (
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                          )}
                        </div>
                        {t.lastMessageText && (
                          <p className="text-xs text-ink/80 mt-1 line-clamp-2 leading-relaxed">
                            {t.lastMessageText}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-[10px] text-muted mt-2">
                          <span>{t.eventName}</span>
                          <span>·</span>
                          <span>{when(t.lastMessageAt)}</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-primary group-hover:translate-x-0.5 transition flex items-center gap-1 shrink-0 self-center">
                      <span>Chat</span>
                      <Icon name="chevronRight" size={14} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              {vendorMessages.map((m) => (
                <Link
                  key={m.id}
                  to={m.to}
                  className="block bg-white rounded-2xl border border-gray-100 hover:border-primary/40 shadow-xs p-4 transition group"
                >
                  <div className="flex justify-between items-center text-[10px] text-muted mb-1">
                    <span className="font-semibold text-primary">{m.eventTitle || 'Event Message'}</span>
                    <span>{when(m.createdAt)}</span>
                  </div>
                  <div className="text-sm font-bold text-navy group-hover:text-primary transition">
                    {m.senderType === 'customer' ? 'You' : m.senderName}
                  </div>
                  <p className="text-xs text-ink/80 mt-1">{m.body}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Aura+ Planning Conversations Tab */}
      {tab === 'aura' && (
        <div className="space-y-3">
          <Link
            to="/customer/aura?new=1"
            className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/30 bg-primary-soft/30 hover:bg-primary-soft/60 text-primary text-xs font-bold py-3.5 transition"
          >
            <Icon name="bolt" size={16} />
            <span>+ Start a New Aura+ Planning Session</span>
          </Link>
          {auraConversations.length === 0 ? (
            <Empty title="No Aura+ conversations yet">
              Conversations with Aura+ will be saved here so you can review or resume them anytime.
            </Empty>
          ) : (
            <div className="space-y-2.5">
              {auraConversations.map((c) => (
                <Link
                  key={c.sessionId}
                  to={
                    c.eventId
                      ? `/customer/aura?event=${c.eventId}&session=${c.sessionId}`
                      : `/customer/aura?session=${c.sessionId}`
                  }
                  className="block bg-white rounded-2xl border border-gray-100 hover:border-primary/40 shadow-xs hover:shadow-sm p-4 transition group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center shrink-0 shadow-xs">
                        <Icon name="bolt" size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-navy group-hover:text-primary transition truncate">
                          {c.eventTitle || 'Event Planning with Aura+'}
                        </div>
                        <div className="text-[11px] text-muted mt-0.5">Last active {when(c.updatedAt)}</div>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-primary group-hover:translate-x-0.5 transition flex items-center gap-1 shrink-0">
                      <span>Resume</span>
                      <Icon name="chevronRight" size={14} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
