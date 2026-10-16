import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageHeader } from './adminUi.jsx';

export default function Notifications({ items, loading, error, refresh, open, markAllRead }) {
  const [tab, setTab] = useState('All');
  const [params] = useSearchParams();
  const search = (params.get('search') || '').trim().toLowerCase();
  const tabs = ['All', 'Unread', ...['Sales', 'Operations', 'Important', 'Activity'].filter((category) => items.some((item) => item.category === category))];
  const active = tabs.includes(tab) ? tab : 'All';
  const filtered = items.filter((item) => (active === 'All' || (active === 'Unread' ? !item.read : item.category === active)) && (!search || `${item.title} ${item.body}`.toLowerCase().includes(search)));
  const count = (category) => items.filter((item) => category === 'All' || (category === 'Unread' ? !item.read : item.category === category)).length;
  return <div className="space-y-5">
    <AdminPageHeader title="Notifications & updates" description="Event follow-ups, platform alerts and staff activity relevant to your role." />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Notification categories">
        {tabs.map((category) => <button key={category} role="tab" aria-selected={active === category} onClick={() => setTab(category)}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${active === category ? 'bg-primary text-white' : 'bg-white text-muted border border-gray-200 dark:bg-slate-900 dark:border-slate-700'}`}>
          {category} {count(category)}
        </button>)}
      </div>
      <div className="flex gap-3 text-sm font-semibold text-primary">
        <button onClick={markAllRead} disabled={!count('Unread')} className="disabled:opacity-40">Mark all read</button>
        <button onClick={refresh} disabled={loading} className="disabled:opacity-40">{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
    </div>
    {error && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">{error}</p>}
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      {filtered.map((item) => <button key={item.id} onClick={() => open(item)} className="flex w-full items-start gap-3 border-b border-gray-100 p-5 text-left last:border-0 hover:bg-lavender/50 dark:border-slate-800 dark:hover:bg-slate-800">
        <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${item.read ? 'bg-slate-400/40' : item.category === 'Important' ? 'bg-rose-500' : 'bg-primary'}`} />
        <span className="min-w-0 flex-1">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-primary">{item.category}{!item.read ? ' · Unread' : ''}</span>
          <span className="block text-sm font-bold text-navy dark:text-slate-100">{item.title}</span>
          <span className="mt-1 block break-words text-sm text-muted dark:text-slate-400">{item.body}</span>
          {item.createdAt && <time className="mt-2 block text-xs text-muted" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>}
        </span>
        <span className="shrink-0 text-xs font-bold text-primary">View →</span>
      </button>)}
      {!filtered.length && <p className="p-8 text-center text-sm text-muted">{loading ? 'Loading notifications…' : error ? 'Notifications could not be fully loaded. Try Refresh.' : active === 'Unread' ? 'You’re all caught up.' : 'No notifications in this category right now.'}</p>}
    </div>
    <p className="text-xs text-muted">Read status is saved in this browser for your staff account.</p>
  </div>;
}
