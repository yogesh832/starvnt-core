import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api.js';
export default function ProductMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');
  async function load() { try { const data = await adminApi.call('/reports/product-metrics'); setMetrics(data.metrics); setError(''); } catch (err) { setError(err.message); } }
  useEffect(() => { load(); }, []);
  const label = key => key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
  const value = (key, metric) => {
    if (metric == null) return 'No observations yet';
    if (typeof metric === 'object' && 'percent' in metric) return metric.percent == null ? 'No observations yet' : `${metric.percent}% (${metric.numerator}/${metric.denominator})`;
    if (typeof metric === 'object' && 'meanScore' in metric) return metric.meanScore == null ? 'No responses yet' : `${metric.meanScore.toFixed(2)} / 5 (${metric.responses} responses)`;
    if (key.endsWith('Ms')) return `${Math.round(metric / 60000)} minutes`;
    return String(metric);
  };
  return <div className="space-y-4"><div className="flex justify-between"><h1 className="text-xl font-extrabold">Product outcomes</h1><button className="border rounded-xl px-4 py-2" onClick={load}>Refresh</button></div><p className="text-sm">Business outcomes and reported usefulness. Empty samples remain unavailable.</p>{error && <p role="alert" className="text-red-700">{error}</p>}{metrics && <><div className="overflow-auto bg-white rounded-2xl border"><table className="w-full text-sm"><thead><tr><th className="p-3 text-left">Metric</th><th className="p-3 text-left">Result</th></tr></thead><tbody>{Object.entries(metrics).filter(([key]) => !['definitions', 'generatedAt', 'observedSince'].includes(key)).map(([key, metric]) => <tr key={key} className="border-t"><td className="p-3">{label(key)}</td><td className="p-3">{value(key, metric)}</td></tr>)}</tbody></table></div><p className="text-xs text-muted">Generated {new Date(metrics.generatedAt).toLocaleString()}. Observation-based metrics since {metrics.observedSince ? new Date(metrics.observedSince).toLocaleString() : 'no observations'}.</p><details><summary>Calculation definitions and coverage</summary>{Object.entries(metrics.definitions).map(([key, text]) => <p key={key} className="text-sm mt-2"><b>{label(key)}: </b>{text}</p>)}</details></>}</div>;
}
