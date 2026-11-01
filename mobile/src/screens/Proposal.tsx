import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { external } from '../api/runtime';
import type { Data } from '../api/client';
import { Button, Card, Empty, ErrorNotice, Field, Page, Pill, Txt, confirm, human, money, useAction, useResource } from '../ui';

const labels: Record<string, string> = { portfolio: 'Actual Approved Portfolio', vendor: 'Vendor-Submitted Reference', customer: 'Customer-Provided Reference', ai: 'AI-Generated Concept', reference: 'Illustrative Reference' };
export function ProposalScreen({ route }: any) {
  const { eventId } = route.params;
  const path = `/customer/events/${encodeURIComponent(eventId)}/proposal`;
  const r = useResource(external, path);
  const a = useAction();
  const [selected, setSelected] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Data | null>(null);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const versions: Data[] = r.data.versions || [];
  const v = versions.find(v => v.id === selected) || versions[0];
  const snapshot = v?.snapshot;
  const readiness = r.data.readiness;
  const current = v?.id === versions[0]?.id;
  async function decide(decision: string) {
    await external.call(`${path}/decision`, 'POST', { revision: r.data.revision, versionId: v.id, decision, message, categories: [] });
    setNotice('Your decision was recorded for this exact proposal version.');
    await r.refresh();
  }
  async function share() {
    const response = await external.download(`${path}/versions/${encodeURIComponent(v.id)}/pdf`);
    const file = new File(Paths.cache, `starvnt-proposal-v${v.number}.pdf`);
    file.create({ overwrite: true }); file.write(new Uint8Array(await response.arrayBuffer()));
    if (!await Sharing.isAvailableAsync()) throw new Error('Document sharing is not available on this device.');
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
  return <Page {...r} title="My Event Proposal" subtitle="From your vision to a beautifully planned celebration.">
    <Card><Pill>PROPOSAL STUDIO · POWERED BY AURA+</Pill><Txt bold size={26}>{r.data.event?.title || 'Your event vision'}</Txt><Txt muted>{r.data.event?.eventDate || 'Date to be confirmed'} · {r.data.event?.city || 'Location to be confirmed'}</Txt></Card>
    <ErrorNotice message={a.error} />{notice ? <Card><Txt>{notice}</Txt></Card> : null}
    {readiness && !readiness.ready && <Card><Txt bold size={21}>A few details are coming together</Txt>{readiness.blockers.map((b: string) => <Txt key={b}>• {b}</Txt>)}</Card>}
    {!snapshot ? <><Card><Pill>PRELIMINARY — NOT A FINAL APPROVED PROPOSAL</Pill><Txt bold size={24}>{r.data.preview?.theme || 'Your event brief'}</Txt><Txt>{r.data.preview?.introduction || 'Your confirmed requirements, approved services and event visuals will come together here.'}</Txt></Card>{(r.data.requirements || []).map((q: Data) => <Card key={q.id}><Txt bold>{q.category}</Txt><Pill>{human(q.status)}</Pill><Txt>{q.providedValue || q.specialRequirements || 'Details pending'}</Txt></Card>)}</> : <>
      <Card><Pill>VERSION {v.number} · {human(v.status)}</Pill><Txt bold size={26}>{snapshot.theme}</Txt><Txt>{snapshot.introduction}</Txt><Txt muted>Valid until {new Date(v.expiresAt).toLocaleDateString('en-IN')}</Txt><Button title="Open or share PDF" busy={a.busy} onPress={() => { void a.run(share); }} /></Card>
      {!current && <Card><Txt>You are viewing an earlier version.</Txt></Card>}
      {snapshot.assets.map((image: Data, i: number) => <Card key={i}><Image source={{ uri: image.url }} accessibilityLabel={image.caption} style={{ width: '100%', height: 230, borderRadius: 12 }} resizeMode="contain" /><Pill>{labels[image.source]}</Pill><Txt>{image.caption}</Txt></Card>)}
      <Txt bold size={23}>The planned experience</Txt>{snapshot.allocations.map((item: Data, i: number) => <Card key={i}><Pill>{item.category}</Pill><Txt bold size={21}>{item.scope}</Txt><Txt>{item.deliverables}</Txt><Txt>Quantity {item.quantity} · {money(item.amount)}</Txt></Card>)}
      <Card><Txt bold size={23}>Your investment</Txt>{snapshot.allocations.map((item: Data, i: number) => <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Txt>{item.category}</Txt><Txt bold>{money(item.amount)}</Txt></View>)}<Txt bold size={22}>Total {money(snapshot.total)}</Txt><Txt bold>Payment schedule</Txt><Txt>{snapshot.paymentTerms}</Txt><Txt bold>Exclusions</Txt><Txt>{snapshot.exclusions}</Txt></Card>
      <Card><Txt bold size={22}>The journey from here</Txt><Txt>{snapshot.roadmap || 'STARVNT will coordinate the event execution roadmap.'}</Txt><Txt muted>Approval of this proposal does not confirm a booking or verify a payment.</Txt></Card>
      {current && <Card><Pill>AURA+ PROPOSAL GUIDE</Pill><Field label="Ask about your approved proposal" value={question} onChangeText={setQuestion} maxLength={1000} /><Button title="Ask Aura+" busy={a.busy} disabled={!question.trim()} onPress={() => { void a.run(async () => setAnswer(await external.call(`${path}/ask`, 'POST', { question }))); }} />{answer && <><Txt bold>{answer.version ? `From approved version ${answer.version}` : 'Proposal status'}</Txt><Txt>{answer.answer}</Txt></>}</Card>}
      {current && v.current && readiness?.ready && v.status === 'SENT_TO_CUSTOMER' && <Card><Txt bold size={23}>Make it yours</Txt><Field label="What would you like to refine?" value={message} onChangeText={setMessage} multiline maxLength={3000} /><Button title="Request changes" secondary busy={a.busy} disabled={!message.trim()} onPress={() => { void a.run(() => decide('CHANGE_REQUESTED')); }} /><Button title={`Approve version ${v.number}`} busy={a.busy} onPress={() => confirm('Approve proposal', `Approve version ${v.number}? Booking and payment remain separate.`, () => { void a.run(() => decide('CUSTOMER_APPROVED')); })} /><Button title="Decline this version" secondary busy={a.busy} onPress={() => confirm('Decline proposal', `Decline version ${v.number}?`, () => { void a.run(() => decide('CUSTOMER_DECLINED')); })} /></Card>}
    </>}
    {!!versions.length && <Card><Txt bold size={22}>Proposal history</Txt>{versions.map(version => <Button key={version.id} secondary title={`Version ${version.number} · ${human(version.status)}`} onPress={() => { setSelected(version.id); setAnswer(null); }} />)}</Card>}
    {(r.data.changes || []).map((change: Data) => <Card key={change.id}><Pill>{human(change.status)}</Pill><Txt>{change.message}</Txt></Card>)}
  </Page>;
}

export function VendorAgreementScreen() {
  const r = useResource(external, '/vendor/proposal-agreements');
  const a = useAction();
  const [notes, setNotes] = useState<Record<string, string>>({});
  function decide(item: Data, decision: string) {
    confirm('Vendor agreement', `${human(decision)} the agreement for ${item.serviceName}?`, () => { void a.run(async () => { await external.call(`/vendor/proposal-agreements/${item.eventId}/decision`, 'POST', { agreementId: item.id, revision: item.revision, decision, note: notes[item.id] || '' }); await r.refresh(); }); });
  }
  return <Page {...r} title="Vendor agreements" subtitle="The commitments behind a customer's event proposal."><ErrorNotice message={a.error} />{!r.data.agreements?.length && !r.loading && <Empty title="No agreements yet" description="STARVNT will send the scope and terms here for your review." />}{(r.data.agreements || []).map((item: Data) => <Card key={item.id}><Pill>{human(item.status)}</Pill><Txt bold size={23}>{item.serviceName}</Txt><Txt>{item.customerScope?.scope}</Txt><Txt>{item.customerScope?.deliverables}</Txt><Txt>{item.terms}</Txt><Txt>Quotation: {money(item.vendorCost)}</Txt><Txt>Valid until {new Date(item.expiresAt).toLocaleDateString('en-IN')}</Txt>{item.status === 'SENT' && new Date(item.expiresAt) > new Date() && <><Field label="Response note" value={notes[item.id] || ''} onChangeText={value => setNotes(n => ({ ...n, [item.id]: value }))} maxLength={1000} /><Button title="Approve agreement" busy={a.busy} onPress={() => decide(item, 'APPROVED')} /><Button title="Request revision" secondary busy={a.busy} onPress={() => decide(item, 'REVISION_REQUESTED')} /><Button title="Reject agreement" secondary busy={a.busy} onPress={() => decide(item, 'REJECTED')} /></>}</Card>)}</Page>;
}
