const notificationTypes = [
  ['quote', 'Quotes'], ['booking', 'Bookings'], ['payment', 'Payments'],
  ['message', 'Messages'], ['reminder', 'Reminders'], ['event_change', 'Event changes'],
  ['deadline', 'Deadlines'],
];
const optionalChannels = [
  ['IN_APP', 'Optional in-app messages'], ['EMAIL', 'Email'], ['SMS', 'SMS'], ['WHATSAPP', 'WhatsApp'],
];
const fieldClass = 'mt-1.5 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base dark:border-slate-600 dark:bg-slate-900';
const choiceClass = 'flex min-h-11 items-center gap-2';

export default function CustomerNotificationForm({ policy, pushAvailable, busy, canSave = true, onChange, onSave }) {
  const quietHours = policy.quietHours || {};
  const disabledTypes = policy.disabledTypes || [];
  const channels = policy.channels || {};
  const availableChannels = optionalChannels.filter(([key]) => Object.hasOwn(channels, key));

  function setChannel(channel, enabled) {
    onChange({ ...policy, channels: { ...channels, [channel]: enabled } });
  }

  function setType(type, enabled) {
    const next = disabledTypes.filter(value => value.toLowerCase() !== type);
    onChange({ ...policy, disabledTypes: enabled ? next : [...next, type] });
  }

  return (
    <form onSubmit={onSave} className="text-sm">
      <fieldset disabled={busy} className="space-y-4">
        <p className="text-muted">Your inbox stays available in Updates. Quiet hours delay push delivery to connected devices.</p>
        {pushAvailable && (
          <label className={choiceClass}>
            <input type="checkbox" checked={channels.PUSH !== false} onChange={event => setChannel('PUSH', event.target.checked)} />
            Push notifications on registered devices
          </label>
        )}
        <div className="rounded-xl border border-slate-200 px-3 dark:border-slate-700">
          <label className={`${choiceClass} font-semibold`}>
            <input type="checkbox" checked={Boolean(quietHours.enabled)} onChange={event => onChange({
              ...policy,
              timezone: policy.timezone || 'Asia/Kolkata',
              quietHours: { start: quietHours.start || '22:00', end: quietHours.end || '08:00', enabled: event.target.checked },
            })} />
            Enable quiet hours
          </label>
          {quietHours.enabled && (
            <div className="space-y-3 pb-3">
              <label className="block">Timezone
                <input required className={fieldClass} value={policy.timezone || ''} onChange={event => onChange({ ...policy, timezone: event.target.value })} />
              </label>
              <p className="text-xs text-muted">Use a timezone such as Asia/Kolkata or Europe/London.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {['start', 'end'].map(key => (
                  <label key={key} className="min-w-0">{key === 'start' ? 'From' : 'Until'}
                    <input required type="time" className={fieldClass} value={quietHours[key] || ''} onChange={event => onChange({ ...policy, quietHours: { ...quietHours, [key]: event.target.value } })} />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <details className="rounded-xl border border-slate-200 px-3 dark:border-slate-700">
          <summary className="cursor-pointer py-3 font-semibold">Advanced preferences</summary>
          <div className="space-y-3 pb-3">
            <fieldset>
              <legend className="font-semibold">Notification types</legend>
              <div className="grid sm:grid-cols-2">
                {notificationTypes.map(([type, label]) => (
                  <label key={type} className={choiceClass}>
                    <input type="checkbox" checked={!disabledTypes.some(value => value.toLowerCase() === type)} onChange={event => setType(type, event.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {availableChannels.length > 0 && (
              <fieldset>
                <legend className="font-semibold">Optional channels</legend>
                <div className="grid sm:grid-cols-2">
                  {availableChannels.map(([channel, label]) => (
                    <label key={channel} className={choiceClass}>
                      <input type="checkbox" checked={channels[channel] === true} onChange={event => setChannel(channel, event.target.checked)} />
                      {label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted">Marketing also requires separate permission.</p>
              </fieldset>
            )}
          </div>
        </details>
        <button type="submit" disabled={busy || !canSave} className="min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50">
          {busy ? 'Saving…' : 'Save preferences'}
        </button>
      </fieldset>
    </form>
  );
}
