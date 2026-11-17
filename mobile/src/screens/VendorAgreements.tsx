import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { external } from '../api/runtime';
import { openPrivateMedia } from '../privateMedia';
import type { Data } from '../api/client';
import { Button, Card, Empty, ErrorNotice, Field, Page, Pill, Txt, date, useAction, useResource } from '../ui';

export function VendorAgreements() {
  const resource = useResource(external, '/vendor/agreements');
  const action = useAction();
  const [selected, setSelected] = useState<Data | null>(null);
  const [name, setName] = useState('');
  const [authority, setAuthority] = useState(false);
  const [notice, setNotice] = useState('');
  const rows: Data[] | undefined = resource.data.agreements;
  async function open(row: Data) {
    setSelected(null); setName(''); setAuthority(false); setNotice('');
    const result = await external.call(`/vendor/agreements/${row._id}`);
    setSelected(result.agreement);
  }
  return <Page {...resource} title="Business & Legal · Agreements" subtitle="Review assigned versions and keep the exact accepted copy.">
    <Txt muted>Agreement acceptance, identity verification and matching eligibility are separate.</Txt>
    <ErrorNotice message={action.error} />
    {!!notice && <Txt>{notice}</Txt>}
    {!resource.loading && !resource.error && rows?.length === 0 && <Empty title="No agreements assigned" description="Only approved documents assigned by STARVNT appear here." />}
    {resource.data.hasMore && <Txt muted>The latest 100 agreements are shown. Contact support for older records.</Txt>}
    {rows?.map(row => <Card key={row._id}>
      <Txt bold>{row.snapshot.title}</Txt><Pill>{row.state}</Pill>
      <Txt>{row.relationshipType} · Version {row.snapshot.version} · Effective {date(row.snapshot.effectiveFrom)}</Txt>
      <Button title="Review exact version" secondary busy={action.busy} onPress={() => void action.run(() => open(row))} />
    </Card>)}
    {selected && <Card>
      <Txt bold size={21}>{selected.snapshot.title} · v{selected.snapshot.version}</Txt>
      <Txt>{selected.snapshot.body}</Txt>
      <Txt muted>Document hash: {selected.snapshot.contentHash}</Txt>
      <Txt muted>Scope hash: {selected.scopeHash}</Txt>
      <Txt>Relationship: {selected.relationshipType}</Txt>
      {!!selected.scope.bookingId && <>
        <Txt>Booking: {selected.scope.bookingId}</Txt>
        <Txt>Agreed amount: {selected.scope.currency} {(selected.scope.amountMinor / 100).toFixed(2)}</Txt>
        <Txt>{JSON.stringify(selected.scope.disclosedScope, null, 2)}</Txt>
      </>}
      <Button title="Download exact copy" secondary busy={action.busy} onPress={() => void action.run(() => openPrivateMedia(external, `/vendor/agreements/${selected._id}/document`, selected._id))} />
      {selected.state === 'ACCEPTED' && <Txt>Accepted {date(selected.acceptance.acceptedAt)}. This historical copy cannot be edited.</Txt>}
      {selected.state === 'ASSIGNED' && <>
        <Field label="Authorized signatory full name" value={name} onChangeText={setName} maxLength={200} editable={!action.busy} />
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Txt style={{ flex: 1 }}>I am authorized to bind this vendor and accept this exact document and displayed scope.</Txt>
          <Switch accessibilityLabel="Confirm signatory authority and acceptance of the reviewed version" value={authority} onValueChange={setAuthority} disabled={action.busy} />
        </View>
        <Button title="Accept reviewed version" busy={action.busy} disabled={!authority || !name.trim()} onPress={() => void action.run(async () => {
          const result = await external.call(`/vendor/agreements/${selected._id}/accept`, 'POST', {
            signatoryFullName: name.trim(), authorityConfirmed: authority, idempotencyKey: `vendor-accept:${selected._id}:${selected.revision}`,
            expectedHash: selected.snapshot.contentHash, expectedScopeHash: selected.scopeHash, expectedVersionId: selected.versionId, expectedRevision: selected.revision,
          });
          setSelected(result.agreement); setAuthority(false); setName('');
          setNotice('Acceptance recorded for this exact document and scope.');
          await resource.refresh();
        })} />
      </>}
    </Card>}
  </Page>;
}
