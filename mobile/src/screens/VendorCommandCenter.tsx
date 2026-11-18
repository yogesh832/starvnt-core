import React, { useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { external } from '../api/runtime';
import type { Data } from '../api/client';
import { useSession } from '../auth/Session';
import { vendorDestination } from '../vendorDestination';
import { Button, Card, Choice, Field, Page, Txt, useResource } from '../ui';

export function VendorSearch({ navigation }: any) {
  const { user, logoutRevision } = useSession();
  const api = useMemo(() => ({ ...external }), [user?._id, user?.id, logoutRevision]);
  const [query, setQuery] = useState(''), [category, setCategory] = useState('All sources'), [page, setPage] = useState(1);
  const [needle, setNeedle] = useState('');
  useEffect(() => { const timer = setTimeout(() => setNeedle(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  const valid = needle.length >= 2 && needle === query.trim();
  const path = `/vendor/search?q=${encodeURIComponent(needle)}&page=${page}${category === 'All sources' ? '' : `&type=${category}`}`;
  const resource = useResource(api, path, 0, valid);
  const data = valid ? resource.data : {};
  const sections: Data[] = data.sections || [];
  const partial = sections.some(section => section.status !== 'READY');
  return <Page {...resource} error={valid ? resource.error : ''} refresh={valid ? resource.refresh : undefined} loading={valid && resource.loading} title="Search Vendor OS" subtitle="Search records you are authorized to access.">
    <Field label="Search Vendor OS" value={query} maxLength={100} onChangeText={value => { setQuery(value); setPage(1); }} />
    <Choice label="Search category" value={category} values={['All sources', 'leads', 'quotes', 'bookings', 'payments', 'documents', 'services', 'portfolio', 'customers']} onChange={value => { setCategory(value); setPage(1); }} />
    {!valid && <Txt>Enter at least two characters.</Txt>}
    {valid && partial && <><Txt>Some sources are unavailable or incomplete. Available results remain usable.</Txt><Button title="Retry search sources" secondary onPress={resource.refresh} /></>}
    {valid && !resource.loading && !resource.error && sections.length > 0 && !partial && !sections.some(section => section.results?.length) && <Txt>{page === 1 ? 'No matching records.' : 'No matching records on this page.'}</Txt>}
    {sections.map(section => <Card key={section.type}><Txt bold>{section.type}</Txt>
      {section.status === 'UNAVAILABLE' && <Txt>Source unavailable.</Txt>}
      {(section.results || []).map((record: Data) => {
        const target = vendorDestination(record.url);
        return <Card key={record.id}><Txt bold>{record.title}</Txt><Txt>{[record.status, record.date, record.reference, record.invoiceReference].filter(Boolean).join(' · ')}</Txt>
          {target && <Button title={`Open ${record.title}`} secondary onPress={() => navigation.navigate(target.screen, target.params)} />}
          {section.type === 'customers' && <Button title="Open customer directory on web" secondary onPress={() => void Linking.openURL('https://vendor.starvnt.com/vendor/customers')} />}
        </Card>;
      })}
    </Card>)}
    {!!data.computedAt && <><Txt>Page {page} · Updated {new Date(data.computedAt).toLocaleString()}</Txt><Button title="Previous search page" secondary disabled={resource.loading || page === 1} onPress={() => setPage(value => value - 1)} /><Button title="Next search page" secondary disabled={resource.loading || page >= 100 || !sections.some(section => section.hasMore)} onPress={() => setPage(value => value + 1)} />{page === 100 && sections.some(section => section.hasMore) && <Txt>Search limit reached. Refine the query or category.</Txt>}</>}
  </Page>;
}

export function VendorReadiness({ navigation }: any) {
  const { user, logoutRevision } = useSession();
  const api = useMemo(() => ({ ...external }), [user?._id, user?.id, logoutRevision]);
  const resource = useResource(api, '/vendor/activation-status');
  const status = resource.error ? null : resource.data.status;
  return <Page {...resource} title="Business readiness" subtitle="Profile, onboarding, verification and activation are separate decisions.">
    <Button title="Refresh readiness" secondary disabled={resource.loading || resource.refreshing} onPress={resource.refresh} />
    {status && <>
      <Txt>Business profile: {status.profileCompletion == null ? 'Unavailable' : `${status.profileCompletion}%`} · Three business identity fields</Txt>
      <Txt>Onboarding: {status.completionPercentage == null ? 'Unavailable' : `${status.completionPercentage}%`} · Six operating setup groups</Txt>
      {(status.metrics || []).map((metric: Data) => {
        const target = vendorDestination(metric.nextAction || '');
        return <Card key={metric.key}><Txt bold>{metric.label}: {typeof metric.value === 'number' ? `${metric.value}%` : String(metric.value ?? 'Unavailable').replaceAll('_', ' ')}</Txt><Txt>{metric.definition}</Txt><Txt muted>Sources: {(metric.source || []).join(', ')}</Txt><Txt muted>Calculated {new Date(metric.computedAt).toLocaleString()} · {metric.calculationVersion}</Txt>{metric.pendingReason && <Txt>{metric.pendingReason}</Txt>}{target && <Button title={`Review ${metric.label}`} secondary onPress={() => navigation.navigate(target.screen, target.params)} />}</Card>;
      })}
      <Txt>Profile completion does not verify identity or approve matching. Eligibility follows current Core checks and authorized activation.</Txt>
    </>}
    {!resource.loading && resource.error && <Txt>Current readiness is unavailable. No eligibility is inferred from saved percentages.</Txt>}
  </Page>;
}
