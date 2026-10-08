const startedAt = Date.now();
const counters = new Map();
const gauges = new Map();
const histograms = new Map();

function keyOf(name, labels = {}) {
  const pairs = Object.entries(labels)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([name, pairs]);
}

function lineName(name, labels = {}) {
  const pairs = Object.entries(labels)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  if (!pairs.length) return name;
  const body = pairs.map(([k, v]) => `${k}="${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
  return `${name}{${body}}`;
}

export function incrementMetric(name, labels = {}, by = 1) {
  const key = keyOf(name, labels);
  const existing = counters.get(key) || { name, labels, value: 0 };
  existing.value += by;
  counters.set(key, existing);
}

export function setGauge(name, labels = {}, value = 0) {
  gauges.set(keyOf(name, labels), { name, labels, value: Number(value) || 0 });
}

export function observeMetric(name, labels = {}, value = 0) {
  const key = keyOf(name, labels);
  const existing = histograms.get(key) || { name, labels, count: 0, sum: 0, max: 0 };
  const n = Number(value) || 0;
  existing.count += 1;
  existing.sum += n;
  existing.max = Math.max(existing.max, n);
  histograms.set(key, existing);
}

export function metricsMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const route = req.route?.path || req.path || 'unknown';
    const labels = { method: req.method, route, status: res.statusCode };
    incrementMetric('starvnt_http_requests_total', labels);
    observeMetric('starvnt_http_request_duration_ms', labels, Date.now() - start);
  });
  next();
}

export function renderPrometheusMetrics() {
  setGauge('starvnt_process_uptime_seconds', {}, Math.floor((Date.now() - startedAt) / 1000));
  const lines = [
    '# HELP starvnt_http_requests_total HTTP requests handled by this process.',
    '# TYPE starvnt_http_requests_total counter',
  ];
  for (const metric of counters.values()) lines.push(`${lineName(metric.name, metric.labels)} ${metric.value}`);
  lines.push('# HELP starvnt_http_request_duration_ms HTTP request duration summary in milliseconds.');
  lines.push('# TYPE starvnt_http_request_duration_ms summary');
  for (const metric of histograms.values()) {
    lines.push(`${lineName(`${metric.name}_count`, metric.labels)} ${metric.count}`);
    lines.push(`${lineName(`${metric.name}_sum`, metric.labels)} ${metric.sum}`);
    lines.push(`${lineName(`${metric.name}_max`, metric.labels)} ${metric.max}`);
  }
  lines.push('# HELP starvnt_process_uptime_seconds Process uptime in seconds.');
  lines.push('# TYPE starvnt_process_uptime_seconds gauge');
  for (const metric of gauges.values()) lines.push(`${lineName(metric.name, metric.labels)} ${metric.value}`);
  return `${lines.join('\n')}\n`;
}
