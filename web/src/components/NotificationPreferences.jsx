import { useEffect, useState } from 'react';
import { externalApi } from '../lib/api.js';
export default function NotificationPreferences({ surface = 'customer', eventId }) {
  const [policy, setPolicy] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const prefix = `/${surface}`;
  const refreshReminders = async () => { if (surface === 'customer') { const data = await externalApi.call(`${prefix}/reminders`); setReminders(data.reminders || []); } };
  useEffect(() => {
    let live = true;
    externalApi.call(`${prefix}/notification-preferences`).then(data => { if (live) setPolicy(data.policy); }).catch(err => { if (live) setMessage(err.message); });
    refreshReminders().catch(err => { if (live) setMessage(err.message); });
    return () => { live = false; };
  }, [prefix]);
  async function save(e) {
    e.preventDefault(); setBusy(true);
    try { await externalApi.call(`${prefix}/notification-preferences`, { method: 'PUT', body: policy }); setMessage('Notification preferences saved.'); }
    catch (err) { setMessage(err.data?.message || err.message); } finally { setBusy(false); }
  }
  async function addReminder(e) {
    e.preventDefault(); setBusy(true);
    try { await externalApi.call('/customer/reminders', { method: 'POST', body: { eventId, title, dueAt: new Date(dueAt).toISOString(), idempotencyKey: crypto.randomUUID() } }); setTitle(''); setDueAt(''); await refreshReminders(); setMessage('Reminder saved.'); }
    catch (err) { setMessage(err.data?.message || err.message); } finally { setBusy(false); }
  }
  return <section className="bg-white rounded-2xl p-4 border space-y-4"><h2 className="font-extrabold">Notifications & reminders</h2>
    {policy && <form onSubmit={save} className="space-y-3 text-sm">
      <p className="text-xs text-muted">The in-app inbox remains available. Quiet hours delay push delivery in your chosen timezone.</p>
      <label className="flex gap-2"><input type="checkbox" checked={policy.channels?.PUSH !== false} onChange={e => setPolicy({ ...policy, channels: { PUSH: e.target.checked } })} />Push notifications</label>
      <label className="block">Timezone<input required className="border rounded-lg p-2 ml-2" value={policy.timezone} onChange={e => setPolicy({ ...policy, timezone: e.target.value })} /></label>
      <label className="flex gap-2"><input type="checkbox" checked={!!policy.quietHours?.enabled} onChange={e => setPolicy({ ...policy, quietHours: { ...policy.quietHours, enabled: e.target.checked } })} />Enable quiet hours</label>
      <div className="flex flex-wrap gap-3">{['start', 'end'].map(key => <label key={key}>{key === 'start' ? 'From' : 'Until'} <input type="time" required className="border rounded-lg p-2" value={policy.quietHours?.[key] || ''} onChange={e => setPolicy({ ...policy, quietHours: { ...policy.quietHours, [key]: e.target.value } })} /></label>)}</div>
      <fieldset><legend>Notification types</legend><div className="flex flex-wrap gap-3">{(surface === 'vendor' ? ['enquiry', 'quote', 'booking', 'payment', 'message', 'system'] : ['quote', 'booking', 'payment', 'message', 'reminder', 'event_change', 'deadline']).map(type => <label key={type} className="flex gap-2"><input type="checkbox" checked={!policy.disabledTypes?.map(t => t.toLowerCase()).includes(type)} onChange={e => setPolicy({ ...policy, disabledTypes: e.target.checked ? policy.disabledTypes.filter(t => t.toLowerCase() !== type) : [...policy.disabledTypes, type] })} />{type.replaceAll('_', ' ')}</label>)}</div></fieldset>
      <button disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-white">Save preferences</button>
    </form>}
    {eventId && <form onSubmit={addReminder} className="border-t pt-3 grid gap-2 text-sm"><h3 className="font-bold">Remind me about this event</h3><label>Reminder<input required maxLength={140} className="block w-full border p-2 rounded-lg" value={title} onChange={e => setTitle(e.target.value)} /></label><label>When (your device timezone)<input type="datetime-local" required className="block border p-2 rounded-lg" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label><button disabled={busy} className="border rounded-lg p-2">Save reminder</button></form>}
    {!!reminders.length && <ul className="text-sm space-y-2">{reminders.map(row => <li key={row._id}>{row.title} · {new Date(row.dueAt).toLocaleString()} <button className="underline" onClick={async () => { try { await externalApi.call(`/customer/reminders/${row._id}`, { method: 'DELETE' }); await refreshReminders(); } catch (err) { setMessage(err.message); } }}>Cancel</button></li>)}</ul>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
