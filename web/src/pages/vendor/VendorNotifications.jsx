import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { NOTIFICATION_TYPES, isImportantNotification, notificationAction, notificationDate } from './vendorNotificationUi.js';

export default function VendorNotifications({ notifications, unreadCount, loading, error, busyIds, markingAll, onRead, onReadAll, onRefresh, compact = false, onClose, embedded = false, filterOverride, onAction, emptyTitle, emptyDescription }) {
  const [selectedFilter, setFilter] = useState('all');
  const filter = filterOverride || selectedFilter;
  const [category, setCategory] = useState('all');
  const filtered = notifications.filter((n) => (
    (filter !== 'unread' || !n.isRead) &&
    (filter !== 'important' || isImportantNotification(n)) &&
    (category === 'all' || n.type === category)
  ));
  const importantCount = notifications.filter(isImportantNotification).length;

  return (
    <section aria-label="Vendor notifications" className={compact || embedded ? '' : 'p-4 sm:p-6 max-w-4xl mx-auto space-y-4'}>
      {!embedded && <>
      <div className={`flex items-start justify-between gap-3 ${compact ? 'p-4 pb-3' : ''}`}>
        <div>
          <h2 className={`${compact ? 'text-base' : 'text-2xl'} font-extrabold text-navy`}>Notifications</h2>
          <p className="text-xs text-muted mt-1">{unreadCount > 0 ? `${unreadCount} unread` : 'You’re all caught up'} · Business activity</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onRefresh} disabled={loading} title="Refresh notifications" aria-label="Refresh notifications" className="w-8 h-8 rounded-xl grid place-items-center text-muted hover:bg-lavender disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">
            <Icon name="trend" size={15} />
          </button>
          {compact && <button type="button" onClick={onClose} aria-label="Close notifications" className="w-8 h-8 rounded-xl grid place-items-center text-muted hover:bg-lavender"><Icon name="close" size={16} /></button>}
        </div>
      </div>

      <div className={`${compact ? 'px-4 pb-3' : ''} flex flex-wrap gap-2 items-center`}>
        <div className="flex items-center gap-1 rounded-xl bg-lavender p-1" role="group" aria-label="Filter notifications">
          {[
            ['all', 'All', notifications.length],
            ['unread', 'Unread', unreadCount],
            ['important', 'Important', importantCount],
          ].map(([key, label, count]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-2 focus-visible:outline-primary ${filter === key ? 'bg-white text-primary shadow-xs' : 'text-muted hover:text-primary'}`}>
              {label} <span className="ml-1 tabular-nums">{count}</span>
            </button>
          ))}
        </div>
        {!compact && (
          <select aria-label="Notification category" value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-gray-200 bg-white text-navy px-3 py-2 text-xs">
            <option value="all">All categories</option>
            {Object.entries(NOTIFICATION_TYPES).map(([key, type]) => <option key={key} value={key}>{type.label}</option>)}
          </select>
        )}
        {unreadCount > 0 && <button type="button" onClick={onReadAll} disabled={markingAll} className="ml-auto text-[11px] text-primary font-bold hover:underline disabled:opacity-50">{markingAll ? 'Marking…' : 'Mark all read'}</button>}
      </div>

      </>}

      {error && <div role="alert" className={`${compact ? 'mx-4 mb-3' : ''} rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700`}>{error}</div>}

      <div className={compact ? 'max-h-[min(55dvh,440px)] overflow-y-auto overscroll-contain border-y border-gray-100 px-3 py-2 space-y-2' : 'space-y-3'} aria-busy={loading}>
        {loading && notifications.length === 0 ? (
          <div role="status" className="p-8 text-center text-sm text-muted">Loading notifications…</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 px-4 text-center">
            <span className="w-11 h-11 rounded-2xl bg-lavender text-primary grid place-items-center mx-auto mb-3"><Icon name="bell" size={20} /></span>
            <p className="text-sm font-bold text-navy">{emptyTitle || (filter === 'unread' ? 'No unread notifications' : filter === 'important' ? 'No important notifications' : 'No notifications here yet')}</p>
            <p className="text-xs text-muted mt-1">{emptyDescription || (filter === 'all' ? 'Enquiries, quotes, bookings, payments and messages will appear here.' : 'Try All to see your recent business activity.')}</p>
          </div>
        ) : filtered.map((n) => {
          const action = notificationAction(n);
          const busy = busyIds.includes(n._id) || markingAll;
          const details = [n.metadata?.customerName, n.metadata?.eventName, n.metadata?.serviceName].filter((value) => typeof value === 'string' && value.trim());
          return (
            <article key={n._id} className={`rounded-2xl border p-3.5 transition ${!n.isRead ? 'border-primary/30 bg-primary-soft/30' : 'border-gray-100 bg-white'}`}>
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl bg-lavender text-primary grid place-items-center shrink-0"><Icon name={action.icon} size={17} /></span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[10px]">
                    <span className="font-bold text-primary uppercase tracking-wide">{action.label}</span>
                    {isImportantNotification(n) && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-bold text-amber-700">{n.priority === 'CRITICAL' ? 'Urgent' : 'Important'}</span>}
                    <span className="ml-auto text-muted">{n.type === 'AURA' ? 'Saved' : n.isRead ? 'Read' : 'Unread'}</span>
                  </div>
                  <h3 className="text-[13px] font-bold text-navy mt-1.5 break-words">{n.title}</h3>
                  <p className={`text-xs text-ink/80 leading-relaxed mt-1 whitespace-pre-wrap break-words ${compact ? 'line-clamp-3' : ''}`}>{n.message}</p>
                  {details.length > 0 && <p className="text-[11px] text-muted mt-2 break-words">{[...new Set(details)].join(' · ')}</p>}
                  <time dateTime={n.createdAt} className="block text-[10px] text-muted mt-2">{notificationDate(n.createdAt)}</time>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-gray-100">
                {n.synthetic ? <span className="text-[10px] text-muted">{n.type === 'AURA' ? (n.priority === 'HIGH' ? 'Confirmation pending' : 'Saved conversation') : n.isRead ? 'Read' : 'Open to read'}</span> : !n.isRead ? <button type="button" onClick={() => onRead(n._id)} disabled={busy} className="text-[11px] font-semibold text-muted hover:text-primary disabled:opacity-50">{busy ? 'Marking…' : 'Mark as read'}</button> : <span className="text-[10px] text-muted flex items-center gap-1"><Icon name="check" size={12} /> Read</span>}
                <Link to={action.to} onClick={(event) => { if (n.type === 'AURA' && onAction) { event.preventDefault(); onAction(n); } if (!n.synthetic) onRead(n._id); onClose?.(); }} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary rounded-lg px-2 py-1 hover:bg-lavender focus-visible:outline-2 focus-visible:outline-primary">
                  {action.action}<Icon name="chevronRight" size={13} />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      <div className={`${compact ? 'p-3' : 'pt-2'} flex flex-wrap items-center justify-between gap-2`}>
        <span className="text-[10px] text-muted">Latest {notifications.length} updates · Refreshes automatically</span>
        {compact && <Link to="/vendor/updates" onClick={onClose} className="text-xs font-bold text-primary inline-flex items-center gap-1">Messages &amp; updates <Icon name="chevronRight" size={14} /></Link>}
      </div>
    </section>
  );
}
