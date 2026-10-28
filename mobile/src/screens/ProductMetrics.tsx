import React from 'react';
import { internal } from '../api/runtime';
import { Card, Empty, ErrorNotice, Page, Txt, human, useResource } from '../ui';

function result(key: string, value: any) {
  if (value == null) return 'No observations yet';
  if (typeof value === 'object' && 'percent' in value) return value.percent == null ? 'No observations yet' : `${value.percent}% (${value.numerator}/${value.denominator})`;
  if (typeof value === 'object' && 'meanScore' in value) return value.meanScore == null ? 'No responses yet' : `${Number(value.meanScore).toFixed(2)} / 5 (${value.responses} responses)`;
  if (key.endsWith('Ms')) return `${Math.round(Number(value) / 60000)} minutes`;
  return String(value);
}

export function ProductMetrics() {
  const r = useResource(internal, '/reports/product-metrics');
  const metrics = r.data.metrics || {};
  const entries = Object.entries(metrics).filter(([key]) => !['definitions', 'generatedAt', 'observedSince'].includes(key));
  return <Page {...r} title="Product outcomes" subtitle="Business outcomes and reported usefulness. Empty samples remain unavailable.">
    <ErrorNotice message={r.error} />
    {entries.map(([key, value]) => <Card key={key}><Txt bold>{human(key)}</Txt><Txt size={20}>{result(key, value)}</Txt></Card>)}
    {!r.loading && !entries.length && <Empty title="No product observations available yet" />}
    {!!metrics.generatedAt && <Txt muted>Generated {new Date(metrics.generatedAt).toLocaleString()}. Observation-based metrics since {metrics.observedSince ? new Date(metrics.observedSince).toLocaleString() : 'no observations'}.</Txt>}
    {!!Object.keys(metrics.definitions || {}).length && <Card><Txt bold>Calculation definitions and coverage</Txt>{Object.entries(metrics.definitions).map(([key, value]) => <Txt key={key} muted>{human(key)}: {String(value)}</Txt>)}</Card>}
  </Page>;
}
