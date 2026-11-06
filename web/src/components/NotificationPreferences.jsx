import { useState } from 'react';
import { Link } from 'react-router-dom';
import { externalApi } from '../lib/api.js';
import { useLoad } from '../pages/customer/customerUi.jsx';

export default function NotificationPreferences({ surface = 'customer', eventId }) {
  return <PreferenceEditor key={surface} surface={surface} eventId={eventId} />;
}
function PreferenceEditor({ surface, eventId }) {
  const prefix = `/${surface}`, source = useLoad(() => externalApi.call(`${prefix}/notification-preferences`), [prefix]);
  const [draft, setDraft] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const policy = draft || source.data?.policy;
  function update(value) { setDraft(value); setMessage(''); setError(''); }
  async function save(event) {
    event.preventDefault(); if (!policy || busy) return;
    setBusy(true); setError(''); setMessage('');
    try { const result = await externalApi.call(`${prefix}/notification-preferences`, { method: 'PUT', body: policy }); source.setData({ policy: result.policy }); setDraft(null); setMessage('Notification preferences saved.'); }
    catch (err) { setError(err.data?.message || err.message || 'Preferences could not be saved.'); }
    finally { setBusy(false); }
  }
  return <section className="customer-account bg-white rounded-2xl p-4 border space-y-4"><h2 className="font-extrabold">Notification preferences</h2>
    {source.loading && !policy && <p role="status">Loading saved notification preferences…</p>}
    {source.error && <div role="alert" className="text-sm text-red-600">Preferences could not be loaded. <button className="customer-secondary-action border rounded-xl px-4 py-2" onClick={source.reload}>Retry preferences</button></div>}
    {policy && <form onSubmit={save} className="space-y-3 text-sm"><fieldset disabled={busy || source.loading || Boolean(source.error)} className="space-y-3">
      <p className="text-xs text-muted">The in-app inbox remains available. Quiet hours delay push delivery in the timezone below. Marketing also requires your separate permission for each channel.</p>
      <fieldset><legend>Channel preferences</legend><div className="flex flex-wrap gap-3">{['IN_APP', 'PUSH', 'EMAIL', 'SMS', 'WHATSAPP'].map(channel => <label key={channel} className="flex gap-2 items-center min-h-11"><input type="checkbox" checked={policy.channels?.[channel] ?? ['IN_APP', 'PUSH'].includes(channel)} onChange={event => update({ ...policy, channels: { ...policy.channels, [channel]: event.target.checked } })} />{channel === 'IN_APP' ? 'Optional in-app messages' : channel === 'PUSH' ? 'Push notifications' : channel === 'EMAIL' ? 'Email' : channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}</label>)}</div></fieldset>
      <label className="block">Quiet-hours timezone<input required aria-label="Quiet-hours timezone" className="account-field border rounded-lg p-3 block w-full mt-1" value={policy.timezone || ''} onChange={event => update({ ...policy, timezone: event.target.value })} /></label><p className="text-xs text-muted">Use an IANA timezone, such as Asia/Kolkata or Europe/London. Reminder entry uses your device timezone and shows its resolved offset separately.</p>
      <label className="flex items-center gap-2 min-h-11"><input type="checkbox" checked={Boolean(policy.quietHours?.enabled)} onChange={event => update({ ...policy, quietHours: { ...policy.quietHours, enabled: event.target.checked } })} />Enable quiet hours</label>
      <div className="grid sm:grid-cols-2 gap-3">{['start', 'end'].map(key => <label key={key}>{key === 'start' ? 'Quiet hours start' : 'Quiet hours end'}<input aria-label={key === 'start' ? 'Quiet hours start' : 'Quiet hours end'} type="time" required className="account-field border rounded-lg p-3 block w-full mt-1" value={policy.quietHours?.[key] || ''} onChange={event => update({ ...policy, quietHours: { ...policy.quietHours, [key]: event.target.value } })} /></label>)}</div>
      <fieldset><legend>Notification types</legend><div className="flex flex-wrap gap-3">{(surface === 'vendor' ? ['enquiry', 'quote', 'booking', 'payment', 'message', 'system'] : ['quote', 'booking', 'payment', 'message', 'reminder', 'event_change', 'deadline']).map(type => <label key={type} className="flex gap-2 items-center min-h-11"><input type="checkbox" checked={!(policy.disabledTypes || []).map(value => value.toLowerCase()).includes(type)} onChange={event => update({ ...policy, disabledTypes: event.target.checked ? (policy.disabledTypes || []).filter(value => value.toLowerCase() !== type) : [...(policy.disabledTypes || []), type] })} />{type.replaceAll('_', ' ')}</label>)}</div></fieldset>
      <button disabled={busy || !draft} className="customer-primary-action rounded-lg bg-primary px-4 py-3 text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save preferences'}</button>{draft && <p role="status" className="text-xs">Unsaved preference changes</p>}
    </fieldset></form>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
    {surface === 'customer' && <div className="space-y-2 border-t pt-3"><Link className="customer-secondary-action border rounded-xl inline-flex px-4 py-3" to={`/customer/reminders${eventId ? `?event=${encodeURIComponent(eventId)}` : ''}`}>Manage event reminders</Link><p className="text-xs text-muted">Create, review or cancel your explicitly requested one-off reminders.</p></div>}
  </section>;
}
