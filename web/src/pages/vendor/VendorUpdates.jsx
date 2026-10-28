import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { externalApi } from '../../lib/api.js';
import Messages from './pages/Messages.jsx';
import VendorNotifications from './VendorNotifications.jsx';
import { isImportantNotification } from './vendorNotificationUi.js';

const VALID_TABS = ['all', 'messages', 'aura', 'important'];

export default function VendorUpdates({ notificationProps, onMessagesRead, onOpenAura }) {
  const [params, setParams] = useSearchParams();
  const tab = VALID_TABS.includes(params.get('tab')) ? params.get('tab') : 'all';
  const [threads, setThreads] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sourceError, setSourceError] = useState('');
  const generation = useRef(0);
  const loadSources = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    const results = await Promise.allSettled([
      externalApi.call('/vendor/messages/threads'),
      externalApi.call('/vendor/aura/sessions'),
    ]);
    if (request !== generation.current) return;
    const errors = [];
    if (results[0].status === 'fulfilled' && results[0].value.ok) setThreads(results[0].value.threads || []);
    else errors.push('customer conversations');
    if (results[1].status === 'fulfilled' && results[1].value.ok) setSessions(results[1].value.sessions || []);
    else errors.push('Aura+ conversations');
    setSourceError(errors.length ? `Could not refresh ${errors.join(' and ')}. Please try again.` : '');
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSources();
    const timer = setInterval(loadSources, 15000);
    window.addEventListener('vendorAuraUpdated', loadSources);
    window.addEventListener('vendorBadgesRefresh', loadSources);
    return () => {
      generation.current += 1;
      clearInterval(timer);
      window.removeEventListener('vendorAuraUpdated', loadSources);
      window.removeEventListener('vendorBadgesRefresh', loadSources);
    };
  }, [loadSources]);

  const messageItems = threads.map((t) => ({
    _id: `thread:${t._id}`, type: 'MESSAGE', synthetic: true,
    title: t.clientName || 'Customer conversation', message: t.lastMessageText || 'Open this conversation to view messages.',
    createdAt: t.lastMessageAt || t.updatedAt, isRead: !t.unreadVendorCount,
    metadata: { eventName: t.eventName },
    link: `/vendor/updates?tab=messages&thread=${encodeURIComponent(t._id)}`,
  }));
  const auraItems = sessions.map((session) => ({
    _id: `aura:${session.sessionId}`, type: 'AURA', synthetic: true, sessionId: session.sessionId,
    title: session.title || 'Business conversation with Aura+', message: session.preview,
    createdAt: session.updatedAt, isRead: true, priority: session.confirmationPending ? 'HIGH' : 'NORMAL',
    link: '/vendor/updates?tab=aura',
  }));
  const allItems = [...notificationProps.notifications, ...messageItems, ...auraItems]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const important = allItems.filter(isImportantNotification);
  const unreadMessageThreads = messageItems.filter((item) => !item.isRead).length;
  const unreadAllItems = allItems.filter((item) => !item.isRead).length;
  const unreadImportantItems = important.filter((item) => !item.isRead).length;
  const selectedItems = tab === 'aura' ? auraItems : tab === 'important' ? important : allItems;

  function changeTab(next) {
    setParams(next === 'all' ? {} : { tab: next });
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-navy">Messages &amp; updates</h1>
          <p className="text-xs text-muted mt-1">Real-time alerts, enquiries, customer chats and Aura+ sessions.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(notificationProps.unreadCount > 0 || notificationProps.unreadConversationCount > 0) && <button type="button" onClick={notificationProps.onReadAll} disabled={notificationProps.markingAll} className="rounded-xl border border-primary/30 bg-primary-soft text-primary px-3 py-2 text-xs font-bold disabled:opacity-50">{notificationProps.markingAll ? 'Marking…' : 'Mark all read'}</button>}
          <button type="button" onClick={() => { notificationProps.onRefresh(); loadSources(); }} disabled={loading || notificationProps.loading} aria-label="Refresh messages and updates" className="w-9 h-9 rounded-xl border border-gray-200 bg-white text-muted grid place-items-center disabled:opacity-50"><Icon name="trend" size={15} /></button>
        </div>
      </div>
      <nav aria-label="Messages and updates tabs" className="flex gap-1 bg-white border border-gray-100 rounded-2xl p-1 shadow-xs overflow-x-auto">
        {[
          ['all', 'All', unreadAllItems], ['messages', 'Messages', unreadMessageThreads],
          ['aura', 'Aura+', sessions.length], ['important', 'Important', unreadImportantItems],
        ].map(([key, label, count]) => (
          <button key={key} type="button" aria-current={tab === key ? 'page' : undefined} onClick={() => changeTab(key)} className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-primary ${tab === key ? 'bg-primary text-white' : 'text-muted hover:text-primary'}`}>
            {label}{count > 0 && <span className="ml-1.5 tabular-nums">{count}</span>}
          </button>
        ))}
      </nav>
      {sourceError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{sourceError}</div>}
      {tab === 'messages' ? (
        <Messages key={params.get('thread') || 'messages'} embedded initialThreadId={params.get('thread')} onMessagesRead={onMessagesRead} />
      ) : (
        <>
          {tab === 'aura' && <button type="button" onClick={() => onOpenAura({ newChat: true })} className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary-soft text-primary py-3.5 text-xs font-bold"><Icon name="plus" size={15} />Start a new Aura+ conversation</button>}
          <VendorNotifications {...notificationProps} embedded notifications={selectedItems} loading={loading || notificationProps.loading} onAction={(item) => onOpenAura({ sessionId: item.sessionId })}
            emptyTitle={tab === 'aura' ? 'No Aura+ conversations yet' : tab === 'important' ? 'No important updates' : 'No updates yet'}
            emptyDescription={tab === 'aura' ? 'Start a conversation with Aura+. Saved chats will appear here to review or resume.' : tab === 'important' ? 'Urgent alerts and pending Aura+ confirmations will appear here.' : 'Customer conversations, business alerts and Aura+ chats will appear here.'}
          />
        </>
      )}
    </div>
  );
}
