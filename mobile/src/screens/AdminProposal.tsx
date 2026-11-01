import { ProposalContentEditor } from './ProposalContentEditor';
import { ProposalVisualStudio } from './ProposalVisualStudio';
import { removeProposalAsset } from '../../../shared/proposalContent.js';
import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { internal } from '../api/runtime';
import { useSession } from '../auth/Session';
import type { Data } from '../api/client';
import { Button, Card, Choice, ErrorNotice, Field, Page, Pill, Txt, human, id, money, useAction, useResource } from '../ui';

const blank: Data = { theme: 'Soft Ivory Editorial', introduction: '', allocations: [], total: 0, paymentTerms: '', exclusions: '', roadmap: '', assets: [] };
const expiry = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
export function AdminProposalStudio() {
  const r = useResource(internal, '/proposals');
  const [selected, setSelected] = useState('');
  if (selected) return <Editor key={selected} eventId={selected} close={() => setSelected('')} />;
  return <Page {...r} title="Proposal Studio" subtitle="STARVNT Core · Internal workspace">{(r.data.events || []).map((e: Data) => <Card key={id(e)} onPress={() => setSelected(id(e))}><Txt bold size={23}>{e.title || e.eventType}</Txt><Txt muted>{e.eventDate || 'Date pending'} · {e.city}</Txt><Button title="Open proposal workspace" secondary onPress={() => setSelected(id(e))} /></Card>)}{!r.loading && !r.data.events?.length && <Card><Txt>No active customer events yet.</Txt></Card>}</Page>;
}

function Editor({ eventId, close }: { eventId: string; close: () => void }) {
  const base = `/proposals/${encodeURIComponent(eventId)}`;
  const r = useResource(internal, base);
  const a = useAction();
  const { can } = useSession();
  const [draft, setDraft] = useState<Data>(blank);
  const [quoteId, setQuote] = useState('');
  const [terms, setTerms] = useState('');
  const [expiresAt, setExpiry] = useState(expiry);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { if (r.data.dossier) setDraft({ ...blank, ...r.data.dossier.draft }); }, [r.data]);
  const d = r.data.dossier || {};
  const source = r.data.source || {};
  const readiness = r.data.readiness;
  const dirty = JSON.stringify(draft) !== JSON.stringify({ ...blank, ...d.draft });
  const set = (key: string, value: unknown) => setDraft(d => ({ ...d, [key]: value }));
  const patch = (key: string, index: number, value: Data) => setDraft(d => ({ ...d, [key]: d[key].map((a: Data, i: number) => i === index ? { ...a, ...value } : a) }));
  function act(endpoint: string, body: Data = {}, method = 'POST') {
    void a.run(async () => { await internal.call(`${base}/${endpoint}`, method, { ...body, revision: d.revision }); setNotice(endpoint === 'generate' ? 'The final PDF was delivered to the customer workspace.' : 'Saved.'); await r.refresh(); });
  }
  async function upload() {
    const selected = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg'], copyToCacheDirectory: true });
    if (selected.canceled) return;
    const asset = selected.assets[0];
    if (asset.size && asset.size > 1024 * 1024) throw new Error('Choose an image under 1 MB.');
    const body = new FormData(); body.append('file', Platform.OS === 'web' && asset.file ? asset.file : new File(asset.uri));
    const result = await internal.call('/proposals/assets/upload', 'POST', body);
    setDraft(d => ({ ...d, assets: [...d.assets, { url: result.url, source: 'reference', caption: asset.name, rights: '', category: '' }] }));
  }
  return <Page {...r} title="Proposal Studio" subtitle={source.event?.title}>
    <Button title="Choose another event" secondary onPress={close} /><ErrorNotice message={a.error} />{notice ? <Card><Txt>{notice}</Txt></Card> : null}
    <Card><Pill>01 / EVENT MANIFEST</Pill><Txt bold size={23}>{source.event?.title}</Txt><Txt>{source.event?.eventType} · {source.event?.eventDate} · {source.event?.city}</Txt><Txt>{source.event?.guestCount || '—'} guests · {source.event?.location?.venueName || 'Venue pending'}</Txt>{(source.requirements || []).map((q: Data) => <Txt key={q.id}>{q.category} · {human(q.status)} · {q.providedValue}</Txt>)}</Card>
    <Card><Pill>02 / VENDOR AGREEMENTS</Pill><Txt muted>Save the customer service scope below before sending its agreement.</Txt><Choice label="Vendor quotation" value={quoteId} values={(source.quotes || []).map((q: Data) => q._id)} labels={Object.fromEntries((source.quotes || []).map((q: Data) => [q._id, `${q.serviceName} · ${q.status} · ${money(q.pricingBreakdown?.totalAmount)}`]))} onChange={setQuote} /><Field label="Agreement terms: scope, payment and cancellation" multiline value={terms} onChangeText={setTerms} maxLength={6000} /><Field label="Approval valid until (YYYY-MM-DD)" value={expiresAt} onChangeText={setExpiry} /><Button title="Send agreement to vendor" busy={a.busy} disabled={!can('proposals.update') || !quoteId || !terms.trim()} onPress={() => act('agreements', { quoteId, terms, expiresAt })} />{(d.agreements || []).map((item: Data) => <View key={item.id} style={{ gap: 7 }}><Txt bold>{item.serviceName}</Txt><Pill>{human(item.status)}</Pill><Txt>{item.terms}</Txt></View>)}</Card>
    <Card><Pill>03 / PROPOSAL BUILDER</Pill><Field label="Visual theme" value={draft.theme} onChangeText={v => set('theme', v)} maxLength={80} /><Field label="Personal introduction" multiline value={draft.introduction} onChangeText={v => set('introduction', v)} maxLength={1600} /></Card>
    {draft.allocations.map((item: Data, i: number) => <Card key={i}><Txt bold>Service {i + 1}</Txt><Field label="Category" value={item.category} onChangeText={v => patch('allocations', i, { category: v })} /><Field label="Approved customer scope" multiline value={item.scope} onChangeText={v => patch('allocations', i, { scope: v })} maxLength={1800} /><Field label="Deliverables" multiline value={item.deliverables} onChangeText={v => patch('allocations', i, { deliverables: v })} maxLength={1800} /><Field label="Quantity" keyboardType="numeric" value={String(item.quantity)} onChangeText={v => patch('allocations', i, { quantity: Number(v) })} /><Field label="Customer allocation (INR)" keyboardType="decimal-pad" value={String(item.amount)} onChangeText={v => patch('allocations', i, { amount: Number(v) })} /><Button title="Remove service" secondary onPress={() => set('allocations', draft.allocations.filter((_: unknown, j: number) => j !== i))} /></Card>)}
    <Button title="Add service" secondary disabled={draft.allocations.length >= 30} onPress={() => set('allocations', [...draft.allocations, { category: source.requirements?.[draft.allocations.length]?.category || '', scope: '', deliverables: '', quantity: 1, amount: 0 }])} />
    <Card><Field label="Approved package total (INR)" keyboardType="decimal-pad" value={String(draft.total)} onChangeText={v => set('total', Number(v))} /><Field label="Payment schedule" multiline value={draft.paymentTerms} onChangeText={v => set('paymentTerms', v)} maxLength={3000} /><Field label="Exclusions" multiline value={draft.exclusions} onChangeText={v => set('exclusions', v)} maxLength={3000} /><Field label="Execution roadmap" multiline value={draft.roadmap} onChangeText={v => set('roadmap', v)} maxLength={3000} /></Card>
    {can('proposals.update') && <><ProposalContentEditor draft={draft} setDraft={setDraft} /><ProposalVisualStudio eventId={eventId} workspace={r.data} draft={draft} setDraft={setDraft} dirty={dirty} disabled={a.busy} /></>}
    <Card><Pill>04 / VISUAL ASSETS</Pill><Txt>Use authorized PNG or JPEG images under 1 MB. Label concepts and references accurately.</Txt><Button title="Upload authorized image" secondary disabled={!can('proposals.update') || draft.assets.length >= 48} busy={a.busy} onPress={() => { void a.run(upload); }} /><Button title="Add image from STARVNT storage" secondary disabled={draft.assets.length >= 48} onPress={() => set('assets', [...draft.assets, { url: '', source: 'reference', caption: '', rights: '', category: '' }])} /></Card>
    {draft.assets.map((asset: Data, i: number) => <Card key={i}><Field label="STARVNT image URL" value={asset.url} onChangeText={v => patch('assets', i, { url: v })} autoCapitalize="none" /><Choice label="Source" value={asset.source} values={["portfolio", "vendor", "customer", "ai", "reference"]} labels={{ portfolio: "Actual Approved Portfolio", vendor: "Vendor-Submitted Reference", customer: "Customer-Provided Reference", ai: "AI-Generated Concept", reference: "Illustrative Reference" }} onChange={v => patch('assets', i, { source: v })} /><Field label="Caption" value={asset.caption} onChangeText={v => patch('assets', i, { caption: v })} /><Field label="Permission or license reference" value={asset.rights} onChangeText={v => patch('assets', i, { rights: v })} /><Field label="Service category (blank for moodboard)" value={asset.category} onChangeText={v => patch('assets', i, { category: v })} /><Button title="Remove image" secondary onPress={() => setDraft(d => removeProposalAsset(d, i))} /></Card>)}
    <Button title="Save proposal draft" busy={a.busy} disabled={!can('proposals.update') || !dirty} onPress={() => act('draft', { draft }, 'PUT')} />
    <Card><Pill>05 / COMMERCIAL REVIEW & FINAL APPROVAL</Pill>{readiness?.commercialReview && <><Txt>Saved internal cost: {money(readiness.commercialReview.totalCost)}</Txt><Txt>Planned commercial margin: {money(readiness.commercialReview.plannedMargin)}</Txt><Txt muted>Based on recorded costs and approved commitments; not verified profit.</Txt></>}<Txt>Approved vendor commitments: {money((d.agreements || []).filter((item: Data) => item.status === "APPROVED" && item.sourceHash === source.hash).reduce((sum: number, item: Data) => sum + Number(item.vendorCost || 0), 0))}</Txt><Txt>Customer package: {money(d.draft?.total)}</Txt><Txt muted>Review logistics, operational costs, contingency and commercial margin. Remaining allocation is not verified profit.</Txt>{readiness?.blockers.map((b: string) => <Txt key={b}>• {b}</Txt>)}{readiness?.ready && <Txt bold>Approval checks passed.</Txt>}<Field label="Internal commercial review note" multiline value={note} onChangeText={setNote} /><Field label="Commercial approval expiry (YYYY-MM-DD)" value={expiresAt} onChangeText={setExpiry} /><Button title="Approve saved commercial plan" busy={a.busy} disabled={dirty || !can('proposals.approve')} onPress={() => act('commercial-approval', { expiresAt, note })} /><Button title="Generate & deliver final PDF" busy={a.busy} disabled={dirty || !readiness?.ready || !can('proposals.generate')} onPress={() => act('generate', { idempotencyKey: `proposal-${eventId}-${d.revision}` })} /></Card>
    <Card><Pill>06 / HISTORY & CHANGES</Pill>{(d.versions || []).slice().reverse().map((v: Data) => <Txt key={v.id}>Version {v.number} · {human(v.status)} · {v.createdAt}</Txt>)}{(d.changes || []).map((c: Data) => <View key={c.id}><Pill>{human(c.status)}</Pill><Txt>{c.message}</Txt></View>)}</Card>
    <Card><Txt bold>Audit & document access</Txt>{(r.data.access || []).map((entry: Data) => <Txt key={id(entry)} size={12}>{entry.createdAt} · CUSTOMER · {entry.action}</Txt>)}{(d.audit || []).slice().reverse().slice(0, 60).map((entry: Data) => <Txt key={entry.id} size={12}>{entry.at} · {entry.role} · {entry.action}</Txt>)}</Card>
  </Page>;
}
