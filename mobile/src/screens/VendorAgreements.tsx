import React, { useState } from 'react';
import type { Data } from '../api/client';
import { external } from '../api/runtime';
import { Button, Card, Empty, ErrorNotice, Field, Page, Pill, Txt, confirm, human, money, useAction, useResource } from '../ui';
import { ProposalStructured } from './ProposalStructured';

export function VendorAgreementScreen() {
  const r = useResource(external, '/vendor/proposal-agreements');
  const a = useAction();
  const [notes, setNotes] = useState<Record<string, string>>({});
  function decide(item: Data, decision: string) {
    confirm('Vendor agreement', `${human(decision)} the agreement for ${item.serviceName}?`, () => { void a.run(async () => { await external.call(`/vendor/proposal-agreements/${item.eventId}/decision`, 'POST', { agreementId: item.id, revision: item.revision, decision, note: notes[item.id] || '' }); await r.refresh(); }); });
  }
  return <Page {...r} title="Vendor agreements" subtitle="The commitments behind a customer's event proposal."><ErrorNotice message={a.error} />{!r.data.agreements?.length && !r.loading && <Empty title="No agreements yet" description="STARVNT will send the scope and terms here for your review." />}{(r.data.agreements || []).map((item: Data) => <Card key={item.id}><Pill>{human(item.status)}</Pill><Txt bold size={23}>{item.serviceName}</Txt><Txt>{item.customerScope?.scope}</Txt><Txt>{item.customerScope?.deliverables}</Txt><Txt>{item.terms}</Txt>{item.customerScope?.sections && <ProposalStructured snapshot={{ sections: item.customerScope.sections, checklist: item.customerScope.checklist, assets: item.customerScope.assets || [] }} />}<Txt>Quotation: {money(item.vendorCost)}</Txt><Txt>Valid until {new Date(item.expiresAt).toLocaleDateString('en-IN')}</Txt>{item.status === 'SENT' && new Date(item.expiresAt) > new Date() && <><Field label="Response note" value={notes[item.id] || ''} onChangeText={value => setNotes(n => ({ ...n, [item.id]: value }))} maxLength={1000} /><Button title="Approve agreement" busy={a.busy} onPress={() => decide(item, 'APPROVED')} /><Button title="Request revision" secondary busy={a.busy} onPress={() => decide(item, 'REVISION_REQUESTED')} /><Button title="Reject agreement" secondary busy={a.busy} onPress={() => decide(item, 'REJECTED')} /></>}</Card>)}</Page>;
}
