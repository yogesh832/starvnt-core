import React, { useEffect, useState } from 'react';
import { external } from './api/runtime';
import type { Data } from './api/client';
import { Button, Card, Choice, ErrorNotice, Field, Txt, useAction, useResource } from './ui';

export function NotificationPreferences({ surface = 'customer', eventId }: { surface?: string; eventId?: string }) {
  const source = useResource(external, `/${surface}/notification-preferences`);
  const reminders = useResource(external, "/customer/reminders", 30000, surface === "customer");
  const [policy, setPolicy] = useState<Data | null>(null);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [message, setMessage] = useState('');
  const action = useAction();
  useEffect(() => { if (source.data.policy) setPolicy(source.data.policy); }, [source.data.policy]);
  const types = surface === 'vendor' ? ['enquiry', 'quote', 'booking', 'payment', 'message', 'system'] : ['quote', 'booking', 'payment', 'message', 'reminder', 'event_change', 'deadline'];
  return <Card>
    <Txt bold size={21}>Notification preferences</Txt>
    <ErrorNotice message={source.error || action.error} retry={source.refresh} />
    {policy && <>
      <Txt muted>The inbox stays available. Quiet hours delay push delivery.</Txt>
      <Choice label="Push delivery" value={policy.channels?.PUSH === false ? 'off' : 'on'} values={['on', 'off']} onChange={value => setPolicy({ ...policy, channels: { PUSH: value === 'on' } })} />
      <Field label="Timezone" value={policy.timezone} onChangeText={timezone => setPolicy({ ...policy, timezone })} />
      <Choice label="Quiet hours" value={policy.quietHours?.enabled ? 'on' : 'off'} values={['on', 'off']} onChange={value => setPolicy({ ...policy, quietHours: { ...policy.quietHours, enabled: value === 'on' } })} />
      {['start', 'end'].map(key => <Field key={key} label={key === 'start' ? 'Quiet from (HH:mm)' : 'Quiet until (HH:mm)'} value={policy.quietHours?.[key] || ''} onChangeText={value => setPolicy({ ...policy, quietHours: { ...policy.quietHours, [key]: value } })} />)}
      {types.map(type => <Choice key={type} label={type.replaceAll('_', ' ')} value={policy.disabledTypes?.map((t: string) => t.toLowerCase()).includes(type) ? 'off' : 'on'} values={['on', 'off']} onChange={value => setPolicy({ ...policy, disabledTypes: value === 'on' ? policy.disabledTypes.filter((t: string) => t.toLowerCase() !== type) : [...policy.disabledTypes, type] })} />)}
      <Button title="Save preferences" busy={action.busy} onPress={() => { void action.run(async () => { await external.call(`/${surface}/notification-preferences`, 'PUT', policy); setMessage('Preferences saved.'); }); }} />
    </>}
    {eventId && <>
      <Txt bold>Remind me about this event</Txt>
      <Field label="Reminder" value={title} onChangeText={setTitle} maxLength={140} />
      <Field label="When (ISO date and time with timezone, e.g. 2027-01-01T18:00+05:30)" value={dueAt} onChangeText={setDueAt} />
      <Button title="Save reminder" busy={action.busy} onPress={() => { void action.run(async () => { const date = new Date(dueAt); if (!title.trim() || !Number.isFinite(date.getTime())) throw new Error('Enter a reminder and valid date/time.'); await external.call('/customer/reminders', 'POST', { eventId, title, dueAt: date.toISOString(), idempotencyKey: `${Date.now()}-${Math.random()}` }); setMessage('Reminder saved.'); setTitle(''); setDueAt(''); reminders.refresh(); }); }} />
    </>}
    {surface === 'customer' && (reminders.data.reminders || []).map((row: Data) => <Card key={row._id}><Txt>{row.title} · {new Date(row.dueAt).toLocaleString()}</Txt><Button title="Cancel reminder" secondary busy={action.busy} onPress={() => { void action.run(async () => { await external.call(`/customer/reminders/${row._id}`, 'DELETE'); reminders.refresh(); }); }} /></Card>)}
    {!!message && <Txt>{message}</Txt>}
  </Card>;
}
