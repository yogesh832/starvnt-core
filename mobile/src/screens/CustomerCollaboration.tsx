import React, { useState } from 'react';
import { Share } from 'react-native';
import { external } from '../api/runtime';
import type { Data } from '../api/client';
import { eventRequestKey, pickPrivateEventMedia, openPrivateEventFile } from '../api/eventMedia';
import { Button, Card, Choice, confirm, Empty, ErrorNotice, Field, human, money, Page, Pill, Txt, useAction, useResource } from '../ui';

export function CustomerInvitationsScreen({ navigation }: any) {
  const r = useResource(external, '/customer/circle-invitations', 20000);
  const a = useAction();
  return <Page {...r} title="Your invitations"><ErrorNotice message={a.error} />
    {r.data.emailVerificationRequired && <Txt>Verify your account email to see invitations.</Txt>}
    {(r.data.invitations || []).map((invite: Data) => <Card key={invite.id}><Txt bold size={22}>{invite.eventTitle}</Txt><Pill>{human(invite.role)} · {human(invite.state)}</Pill>
      {invite.state === 'ACTIVE' ? <Button title="Open Event Circle" onPress={() => navigation.navigate('CustomerCollaboration', { eventId: invite.eventId })} /> : <Button title="Accept invitation" busy={a.busy} onPress={() => a.run(async () => {
        await external.call(`/customer/circle-invitations/${invite.id}/accept`, 'POST', { idempotencyKey: eventRequestKey() }); await r.refresh();
      })} />}
    </Card>)}
    {!r.loading && !r.data.emailVerificationRequired && !r.data.invitations?.length && <Empty title="No invitations yet" />}
  </Page>;
}

export function CustomerCollaborationScreen({ route, navigation }: any) {
  const { eventId } = route.params;
  const base = `/customer/events/${encodeURIComponent(eventId)}`;
  const r = useResource(external, `${base}/collaboration`, 20000);
  const [booking, setBooking] = useState(''), [text, setText] = useState(''), [email, setEmail] = useState(''), [role, setRole] = useState('PARTICIPANT');
  const [messageKey, setMessageKey] = useState(eventRequestKey), [inviteKey, setInviteKey] = useState(eventRequestKey);
  const messages = useResource(external, `${base}/circle/messages${booking ? `?bookingId=${booking}` : ''}`, 20000);
  const a = useAction();
  const permissions = r.data.permissions || [];
  const bookingChoices = (r.data.bookings || []).map((b: Data) => ({ id: b.id, label: `${b.serviceName} · ${b.vendorName || 'Booked vendor'} · ${b.reference}` }));
  if (r.error) return <Page {...r} title="Event Circle"><Txt>Event access is unavailable. Pull to refresh and try again.</Txt></Page>;
  return <Page {...r} title="Your Event Circle" subtitle={r.data.event?.title}><ErrorNotice message={a.error} />
    {r.data.unlocked === false && <Empty title="Circle opens after verified booking" description="Continue your service conversations while planning." />}
    {r.data.unlocked && <>
      <Button title="Photos, videos & updates" secondary onPress={() => navigation.navigate('CustomerEventMedia', { eventId })} />
      <Button title="Event Memory" secondary onPress={() => navigation.navigate('CustomerEventMedia', { eventId, memory: true })} />
      {permissions.includes('invite') && <Card>
        <Txt bold size={22}>Invite someone</Txt><Txt muted>They can accept after signing in with this verified email. Invitations expire in seven days.</Txt>
        <Field label="Invited email" autoCapitalize="none" keyboardType="email-address" value={email} editable={!a.busy} onChangeText={value => { setEmail(value); setInviteKey(eventRequestKey()); }} />
        <Choice label="Participant role" values={['VIEWER', 'PARTICIPANT', 'COORDINATOR']} value={role} onChange={value => { setRole(value); setInviteKey(eventRequestKey()); }} />
        <Button title="Send invitation" busy={a.busy} disabled={!email.trim()} onPress={() => a.run(async () => {
          await external.call(`${base}/circle/members`, 'POST', { email, role, idempotencyKey: inviteKey }); setEmail(''); setInviteKey(eventRequestKey()); await r.refresh();
        })} />
        {(r.data.members || []).map((member: Data) => <Card key={member.id}><Txt>{member.email}</Txt><Pill>{human(member.role)} · {human(member.state)}</Pill>{member.state !== 'REVOKED' && <Button title="Revoke access" secondary onPress={() => confirm('Revoke event access?', 'This person will lose access to this event and its files.', () => a.run(async () => { await external.call(`${base}/circle/members/${member.id}/revoke`, 'POST', { idempotencyKey: eventRequestKey() }); await r.refresh(); }))} />}</Card>)}
      </Card>}
      <Card><Txt bold size={22}>Conversations</Txt>
        <Choice label="Conversation" values={['Family & participants', ...bookingChoices.map((b: Data) => b.label)]} value={bookingChoices.find((b: Data) => b.id === booking)?.label || 'Family & participants'} onChange={value => setBooking(bookingChoices.find((b: Data) => b.label === value)?.id || '')} />
        {booking && <Txt>{(r.data.bookings || []).find((b: Data) => b.id === booking)?.serviceName}</Txt>}
        <ErrorNotice message={messages.error} />
        {!messages.error && (messages.data.messages || []).map((m: Data) => <Card key={m.id}><Txt bold>{m.senderName}</Txt><Txt>{m.body}</Txt><Txt muted>{new Date(m.createdAt).toLocaleString()}</Txt></Card>)}
        {!messages.loading && !messages.error && !messages.data.messages?.length && <Txt muted>Start the conversation.</Txt>}
        {permissions.includes('message') && <>
          <Field label="Message" multiline maxLength={2000} value={text} editable={!a.busy} onChangeText={value => { setText(value); setMessageKey(eventRequestKey()); }} />
          <Button title="Send message" busy={a.busy} disabled={!text.trim()} onPress={() => a.run(async () => {
            await external.call(`${base}/circle/messages`, 'POST', { body: text, bookingId: booking || null, idempotencyKey: messageKey }); setText(''); setMessageKey(eventRequestKey()); await messages.refresh();
          })} />
        </>}
      </Card>
    </>}
  </Page>;
}

function EventAsset({ asset, eventId, permissions, refresh }: { asset: Data; eventId: string; permissions: string[]; refresh: () => Promise<void> }) {
  const a = useAction();
  const [privacy, setPrivacy] = useState('no'), [safety, setSafety] = useState('no'), [rights, setRights] = useState('no');
  const [live, setLive] = useState(asset.liveEligible ? 'yes' : 'no'), [memory, setMemory] = useState(asset.memoryIncluded ? 'yes' : 'no'), [highlight, setHighlight] = useState(asset.highlight ? 'yes' : 'no');
  const [reason, setReason] = useState('');
  const decide = (decision: string) => a.run(async () => {
    await external.call(`/customer/events/${eventId}/media/${asset.id}/review`, 'POST', {
      decision, expectedVersion: asset.version, idempotencyKey: eventRequestKey(), reason,
      privacy: privacy === 'yes', safety: safety === 'yes', rights: rights === 'yes',
      liveEligible: live === 'yes', memoryIncluded: memory === 'yes', highlight: highlight === 'yes',
    }); await refresh();
  });
  return <Card><Pill>{human(asset.kind)} · {human(asset.state)}</Pill><Txt>{asset.caption}</Txt><ErrorNotice message={a.error} />
    {asset.kind !== 'UPDATE' && asset.state !== 'WITHDRAWN' && <Button title={asset.kind === 'VIDEO' ? 'Open private video' : 'Open private photo'} secondary busy={a.busy} onPress={() => a.run(() => openPrivateEventFile(asset.id))} />}
    {asset.review?.reason && <Txt>Review note · {asset.review.reason}</Txt>}
    {permissions.includes('moderate') && asset.state === 'PENDING' && <>
      <Txt bold>Review before publishing</Txt>
      <Choice label="Privacy and people shown checked" values={['no', 'yes']} value={privacy} onChange={setPrivacy} />
      <Choice label="Content is safe and appropriate" values={['no', 'yes']} value={safety} onChange={setSafety} />
      <Choice label="Sharing permissions checked" values={['no', 'yes']} value={rights} onChange={setRights} />
      <Field label="Review note" value={reason} onChangeText={setReason} multiline maxLength={1000} />
      <Choice label="Allow on event display" values={['no', 'yes']} value={live} onChange={setLive} />
      {permissions.includes('memory.edit') && <Choice label="Include in Memory" values={['no', 'yes']} value={memory} onChange={setMemory} />}
      <Button title="Approve content" busy={a.busy} disabled={[privacy, safety, rights].some(value => value !== 'yes')} onPress={() => decide('APPROVE')} />
      <Button title="Reject submission" secondary busy={a.busy} onPress={() => decide('REJECT')} />
    </>}
    {permissions.includes('memory.edit') && asset.state === 'PUBLISHED' && <>
      <Choice label="Include in Memory" values={['no', 'yes']} value={memory} onChange={setMemory} />
      <Choice label="Highlight" values={['no', 'yes']} value={highlight} onChange={setHighlight} />
      <Choice label="Allow on event display" values={['no', 'yes']} value={live} onChange={setLive} />
      <Button title="Save curation" secondary busy={a.busy} onPress={() => decide('CURATE')} />
    </>}
    {permissions.includes('upload') && asset.state !== 'WITHDRAWN' && <Button title="Withdraw submission" secondary busy={a.busy} onPress={() => confirm('Withdraw this submission?', 'It will be removed from the event display and Memory.', () => decide('WITHDRAW'))} />}
  </Card>;
}

export function CustomerEventMediaScreen({ route, navigation }: any) {
  const { eventId, memory = false } = route.params;
  const r = useResource(external, `/customer/events/${eventId}/${memory ? 'memory' : 'media'}`, 20000);
  const a = useAction();
  const [caption, setCaption] = useState(''), [rights, setRights] = useState('no'), [view, setView] = useState('All');
  const [requestKey, setRequestKey] = useState(eventRequestKey);
  const permissions = r.data.permissions || [];
  const assets = (r.data.assets || []).filter((asset: Data) => view === 'All' || (view === 'Highlights' ? asset.highlight : asset.kind === { Photos: 'PHOTO', Videos: 'VIDEO', Updates: 'UPDATE' }[view]));
  async function publish(liveEnabled: boolean, memoryShared: boolean) {
    await a.run(async () => {
      const result = await external.call(`/customer/events/${eventId}/publication`, 'PUT', { liveEnabled, memoryShared, expectedVersion: r.data.publication?.version || 0, idempotencyKey: eventRequestKey() });
      await r.refresh();
      if (result.shareToken) await Share.share({ message: `https://starvnt.com/event-share/${result.shareToken}/${memoryShared ? 'memory' : 'live'}` });
    });
  }
  if (r.error) return <Page {...r} title="Event content"><Txt>Event access is unavailable. Pull to refresh and try again.</Txt></Page>;
  return <Page {...r} title={memory ? 'Your event story' : 'Moments, together'} subtitle={r.data.event?.title}><ErrorNotice message={a.error} />
    <Button title="Your retained event list" secondary onPress={() => navigation.navigate('Main', { screen: 'Events' })} />
    <Button title={memory ? 'Manage event content' : 'Open Event Memory'} secondary onPress={() => navigation.push('CustomerEventMedia', { eventId, memory: !memory })} />
    {permissions.includes('memory.edit') && <Button title="Open retained event records" secondary onPress={() => navigation.navigate('EventSection', { eventId, section: 'history', title: 'Event timeline' })} />}
    {!memory && permissions.includes('upload') && <Card><Txt bold size={23}>Add to your event</Txt>
      <Field label="Caption or update" multiline maxLength={2000} value={caption} onChangeText={value => { setCaption(value); setRequestKey(eventRequestKey()); }} />
      <Choice label="I have permission to share this content and the people shown" values={['no', 'yes']} value={rights} onChange={setRights} />
      <Txt muted>New submissions stay pending until an authorized privacy, safety and sharing review.</Txt>
      <Button title="Add photo or MP4 video" disabled={rights !== 'yes'} busy={a.busy} onPress={() => a.run(async () => {
        const result = await pickPrivateEventMedia(eventId, { caption, rightsConfirmed: true, idempotencyKey: eventRequestKey() });
        if (result) { setCaption(''); await r.refresh(); }
      })} />
      <Button title="Submit update for review" disabled={rights !== 'yes' || !caption.trim()} busy={a.busy} onPress={() => a.run(async () => {
        await external.call(`/customer/events/${eventId}/media`, 'POST', { caption, rightsConfirmed: true, idempotencyKey: requestKey }); setCaption(''); setRequestKey(eventRequestKey()); await r.refresh();
      })} />
    </Card>}
    {permissions.includes('publish') && <Card><Txt bold>Sharing & event display</Txt><Txt>Memory is {r.data.publication?.memoryShared ? 'shared by link' : 'private'}. Event display is {r.data.publication?.liveEnabled ? 'enabled' : 'off'}.</Txt>
      <Button title="Share Memory link" secondary busy={a.busy} onPress={() => confirm('Share approved Memory?', 'Anyone with the new link can view approved, selected content until you revoke it.', () => publish(Boolean(r.data.publication?.liveEnabled), true))} />
      <Button title="Enable and share event display" secondary busy={a.busy} onPress={() => confirm('Enable event display?', 'Anyone with the new link can view approved display content until you revoke it.', () => publish(true, false))} />
      <Button title="Revoke all event sharing" secondary busy={a.busy} onPress={() => publish(false, false)} />
    </Card>}
    {memory && (r.data.story || []).map((item: Data) => <Card key={item.id}><Txt>{human(item.action)} · {new Date(item.at).toLocaleDateString()}</Txt></Card>)}
    <Choice label="Content" values={['All', 'Highlights', 'Photos', 'Videos', 'Updates']} value={view} onChange={setView} />
    {assets.map((asset: Data) => <EventAsset key={`${asset.id}:${asset.version}`} asset={asset} eventId={eventId} permissions={permissions} refresh={r.refresh} />)}
    {!r.loading && !assets.length && <Empty title={memory ? 'Your chosen memories will appear here' : 'No submissions in this view'} description="Your retained event records stay available." />}
  </Page>;
}

export function CustomerReplacementsScreen({ route, navigation }: any) {
  const { eventId, bookingId } = route.params;
  const r = useResource(external, `/customer/bookings/${bookingId}/replacements?eventId=${eventId}`);
  const booking = useResource(external, `/customer/bookings/${bookingId}/workflow?eventId=${eventId}`);
  const a = useAction();
  return <Page {...r} title="Replacement options"><ErrorNotice message={a.error || booking.error} />
    {r.data.matchSummary?.missing?.length > 0 && <Txt>Saved service details need review · {r.data.matchSummary.missing.map(human).join(', ')}. Contact the event team for help.</Txt>}
    {(r.data.alternativeCandidates || []).map((option: Data) => <Card key={option.serviceId}><Txt bold size={23}>{option.businessName}</Txt><Txt>{option.serviceName}</Txt><Txt>Calculated estimate · {money(option.validatedTotalCost)}</Txt><Txt>Travel estimate · {money(option.cost?.travelCost)}</Txt><Txt muted>The vendor will confirm the full price and applicable charges in a quote.</Txt>
      <Button title="Request confirmed replacement quote" disabled={!booking.data.booking} busy={a.busy} onPress={() => confirm('Request this replacement quote?', 'STARVNT will use your saved service requirements. Review the vendor-confirmed price before approving a new booking.', () => a.run(async () => {
        await external.call(`/customer/bookings/${bookingId}/replacements/select`, 'POST', { eventId, vendorServiceId: option.serviceId, expectedVersion: booking.data.booking.version, idempotencyKey: eventRequestKey() }); navigation.navigate('VendorOffers', { eventId });
      }))} />
    </Card>)}
    {!r.loading && !r.error && !r.data.matchSummary?.missing?.length && !r.data.alternativeCandidates?.length && <Empty title="No eligible alternatives confirmed yet" />}
  </Page>;
}
