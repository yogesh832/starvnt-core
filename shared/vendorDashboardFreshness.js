// Presentation-only freshness. This never changes eligibility or backend records.
export const vendorDashboardWidgets = {
  actions: { sources: ['opportunities', 'quotes', 'bookings', 'threads'], cache: false },
  snapshot: { sources: ['opportunities', 'quotes', 'bookings'], cache: true },
  upcomingBookings: { sources: ['bookings'], cache: true },
  sales: { sources: ['opportunities', 'quotes', 'bookings', 'threads'], cache: true, atomic: true },
  financial: { sources: ['bookings', 'ledger'], cache: true },
  quality: { sources: ['reviews', 'bookings'], cache: true },
  readiness: { sources: ['readiness'], cache: false },
  weekly: { sources: ['opportunities', 'quotes', 'bookings', 'reviews'], cache: true, atomic: true },
  recommendations: { sources: ['readiness'], cache: false },
};

export function isVendorDashboard(value) {
  const validDate = date => (typeof date === 'string' || date instanceof Date) && Number.isFinite(new Date(date).getTime());
  const validPeriod = period => period && validDate(period.start) && validDate(period.end) && new Date(period.end) > new Date(period.start);
  return Boolean(value && typeof value === 'object' && ['selected', 'cohort', 'week', 'previousWeek'].every(key => validPeriod(value.periods?.[key])) && value.snapshot && value.sales && value.financial && value.quality && Array.isArray(value.quality.recent) && value.weekly?.current && value.weekly?.previous && Array.isArray(value.actions) && Array.isArray(value.recommendations) && (value.upcomingBookings === null || Array.isArray(value.upcomingBookings)) && ['opportunities', 'quotes', 'bookings', 'threads', 'reviews', 'ledger', 'readiness'].every(key => ['AVAILABLE', 'UNAVAILABLE', 'INSUFFICIENT_DATA'].includes(value.sourceStates?.[key])) && validDate(value.generatedAt));
}

export function dashboardSnapshot(previous, dashboard, scope) {
  const periodKey = JSON.stringify(dashboard.periods);
  const same = previous?.scope === scope && previous?.periodKey === periodKey;
  const widgets = {}, view = { ...dashboard };
  for (const [key, rule] of Object.entries(vendorDashboardWidgets)) {
    const statuses = rule.sources.map(source => dashboard.sourceStates[source]);
    const ready = statuses.every(status => status === 'AVAILABLE');
    const unavailable = statuses.every(status => status !== 'AVAILABLE') || (rule.atomic && !ready);
    const currentStatus = ready ? 'READY' : unavailable ? 'UNAVAILABLE' : 'PARTIAL';
    const old = same ? previous.widgets[key] : null;
    const lastSuccessfulSync = ready ? dashboard.generatedAt : old?.lastSuccessfulSync || null;
    const saved = ready ? dashboard[key] : old?.saved;
    // Only source failure can show a marked historical value. A bounded or
    // inconsistent source is not repaired by silently reusing an old number.
    const stale = !ready && unavailable && rule.cache && saved !== undefined && statuses.includes('UNAVAILABLE') && !statuses.includes('INSUFFICIENT_DATA');
    widgets[key] = { status: stale ? 'STALE' : currentStatus, sources: rule.sources, lastSuccessfulSync, saved, measuredAt: stale ? lastSuccessfulSync : dashboard.generatedAt };
    if (stale) view[key] = saved;
  }
  return { scope, periodKey, dashboard, view, widgets };
}

export function dashboardWidgetMessage(widget, requestFailed = false) {
  if (!widget) return 'Source status unavailable.';
  const at = widget.lastSuccessfulSync ? new Date(widget.lastSuccessfulSync).toLocaleString() : 'Not yet established';
  const status = requestFailed || widget.status === 'STALE' ? 'Saved data; current source unavailable.' : widget.status === 'PARTIAL' ? 'Partial data; affected values are unavailable.' : widget.status === 'UNAVAILABLE' ? 'Source unavailable or incomplete.' : 'Current source loaded.';
  return `${status} Last successful sync: ${at}`;
}
