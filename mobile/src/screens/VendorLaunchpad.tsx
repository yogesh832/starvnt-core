import React from 'react';
import { external } from '../api/runtime';
import type { Data } from '../api/client';
import { Button, Card, Page, Txt, useResource } from '../ui';

export function VendorLaunchpad({ navigation }: any) {
  const resource = useResource(external, '/vendor/launchpad');
  const data = resource.data;
  function open(step: Data) {
    if (step.key === 'BUILD_PROFILE') navigation.navigate('Profile');
    else if (step.key === 'COMPLETE_VERIFICATION') navigation.navigate('VendorFinancial');
    else if (step.key === 'CONFIGURE_COVERAGE') navigation.navigate('VendorSetup', { kind: 'coverage' });
    else if (step.key === 'OPERATIONS_READY') navigation.navigate('VendorModule', { module: 'services' });
    else navigation.navigate('VendorModule', { module: step.key === 'ADD_SERVICES' ? 'services' : step.key === 'UPLOAD_PORTFOLIO' ? 'portfolio' : step.key === 'FIRST_QUOTE' ? 'quotes' : step.key === 'FIRST_BOOKING' ? 'bookings' : 'reviews' });
  }
  return <Page {...resource} title="Partner Launchpad" subtitle="Saved setup and verified STARVNT activity. Eligibility and benefits follow separate policies.">
    {!!data.computedAt && <Txt muted>Last successful sync: {new Date(data.computedAt).toLocaleString()}{resource.error ? ' · Saved results may be stale.' : ''}</Txt>}
    {data.partial && <Txt>Some sources are unavailable. Overall progress is unknown.</Txt>}
    {data.historyStatus === 'UNAVAILABLE' && <Txt>Milestone history is unavailable. Pull to refresh and retry.</Txt>}
    {!!data.steps && <Txt bold>{data.progressPercent === null ? 'Progress unknown' : `${data.progressPercent}% complete`}</Txt>}
    {(data.steps || []).map((step: Data) => <Card key={step.key}>
      <Txt bold>{step.label} · {step.status}</Txt>
      <Txt>{step.description}</Txt>
      <Txt muted>Responsible: {step.responsibleRole.replaceAll('_', ' ')}</Txt>
      {!!step.pendingReason && <Txt>{step.pendingReason}</Txt>}
      {!!step.completionObservedAt && <Txt muted>First observed complete: {new Date(step.completionObservedAt).toLocaleString()}. Historical completion time is not established.</Txt>}
      {(step.history || []).map((event: Data, index: number) => <Txt key={index} muted>{new Date(event.at).toLocaleString()} · {event.action} · {event.completed ? 'Complete' : 'Pending'}</Txt>)}
      <Button title="Open this section" secondary onPress={() => open(step)} />
      {step.sourceStatus === 'UNAVAILABLE' && <Button title="Retry evidence" secondary onPress={() => void resource.refresh()} />}
    </Card>)}
  </Page>;
}
