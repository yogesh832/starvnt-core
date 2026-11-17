import React, { useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { internal, external } from './api/runtime';
import type { Data } from './api/client';
import { useSession } from './auth/Session';
import { openPrivateMedia } from './privateMedia';
import { Button, Card, ErrorNotice, Field, MultiChoice, Txt, useAction, useResource } from './ui';

export function EventCollaboration({ eventId, bookingId, admin = false }: { eventId: string; bookingId: string; admin?: boolean }) {
  const api = admin ? internal : external;
  const base = admin ? '/collaboration' : '/vendor/collaboration';
  const media = useResource(api, `${base}/events/${eventId}/media`);
  const messages = useResource(api, `${base}/events/${eventId}/messages?bookingId=${encodeURIComponent(bookingId)}`);
  const session = useSession(), action = useAction();
  const [text, setText] = useState(''), [checks, setChecks] = useState<string[]>([]);
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  async function command(path: string, body: Data) {
    const fingerprint = JSON.stringify({ path, body });
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: Crypto.randomUUID() };
    await api.call(`${base}${path}`, 'POST', { ...body, idempotencyKey: intent.current.key });
    intent.current = null;
    await Promise.all([media.refresh(), messages.refresh()]);
  }
  async function upload() {
    if (!checks.includes('Permission to share this content')) throw new Error('Confirm your permission to share before uploading.');
    const picked = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'video/mp4'], copyToCacheDirectory: true });
    if (picked.canceled) return;
    const file = picked.assets[0], form = new FormData();
    form.append('file', Platform.OS === 'web' && file.file ? file.file : new File(file.uri));
    form.append('bookingId', bookingId); form.append('rightsConfirmed', 'true'); form.append('caption', text); form.append('idempotencyKey', Crypto.randomUUID());
    await api.call(`${base}/events/${eventId}/media`, 'POST', form);
    await media.refresh();
  }
  const review = ['Privacy review passed', 'Safety review passed', 'Rights review passed'];
  return <Card><Txt bold size={20}>Event Circle and media review</Txt>
    <ErrorNotice message={action.error || media.error || messages.error} />
    <Txt>{media.data.event?.title || 'Booked service conversation'}</Txt>
    <Field label="Message, caption or review reason" multiline value={text} onChangeText={setText} />
    <Button title="Send service message" disabled={!text.trim() || (admin && !session.can('operations.manage'))} busy={action.busy} onPress={() => void action.run(() => command(`/events/${eventId}/messages`, { body: text, bookingId }))} />
    {(messages.data.messages || []).map((message: Data) => <Txt key={message.id}>{message.senderName} · {message.body}</Txt>)}
    <MultiChoice label="Sharing permissions" values={['Permission to share this content', ...(admin ? review : [])]} selected={checks} onChange={setChecks} />
    <Button title="Submit event photo or video" secondary busy={action.busy} disabled={!checks.includes('Permission to share this content')} onPress={() => void action.run(upload)} />
    {(media.data.assets || []).map((asset: Data) => <Card key={asset.id}><Txt>{asset.caption || asset.kind} · {asset.state}</Txt>
      {asset.kind !== 'UPDATE' && <Button title="Review private file" secondary busy={action.busy} onPress={() => void action.run(() => openPrivateMedia(api, `${base}/media/${asset.id}/file`, asset.id))} />}
      {(admin && session.can('operations.manage') ? ['APPROVE', 'REJECT', 'WITHDRAW'] : ['WITHDRAW']).map(decision => <Button key={decision} title={decision.toLowerCase()} secondary busy={action.busy} disabled={decision === 'APPROVE' && !review.every(check => checks.includes(check))} onPress={() => void action.run(() => command(`/events/${eventId}/media/${asset.id}`, {
        decision, expectedVersion: asset.version, reason: text, privacy: checks.includes(review[0]), safety: checks.includes(review[1]), rights: checks.includes(review[2]), liveEligible: decision === 'APPROVE', memoryIncluded: decision === 'APPROVE',
      }))} />)}
    </Card>)}
  </Card>;
}
