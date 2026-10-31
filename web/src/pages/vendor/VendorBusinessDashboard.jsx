import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { externalApi } from '../../lib/api.js';

const panel = 'bg-white rounded-3xl p-4 sm:p-6 border border-gray-100 shadow-xs min-w-0';
const button = 'min-h-11 rounded-xl border border-primary/30 px-3 py-2 text-sm font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50';
const input = 'min-h-11 w-full min-w-0 rounded-xl border border-gray-300 p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';
const number = value => value == null ? 'Unavailable' : value.toLocaleString('en-IN');
const money = value => value == null ? 'Unavailable' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const duration = value => value == null ? 'Insufficient data' : `${Math.round(value / 60000).toLocaleString('en-IN')} min`;
const day = value => new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
const range = period => `${day(period.start)} – ${day(new Date(new Date(period.end).getTime() - 1))}`;

function Metric({ label, value, detail, to }) {
  return <Link to={to} className="block rounded-2xl border border-gray-200 p-4 min-w-0 hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
    <div className="text-xs font-semibold text-muted">{label}</div>
    <div className="mt-2 text-xl sm:text-2xl font-extrabold text-navy break-words">{value}</div>
    <p className="mt-2 text-xs text-muted">{detail}</p>
  </Link>;
}

export function VendorGoals() {
  const [goals, setGoals] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const empty = { name: '', metric: 'SUBMITTED_QUOTES', targetValue: '', startDate: '', endDate: '' };
  const [form, setForm] = useState(empty);
  const load = useCallback(async () => {
    try {
      const result = await externalApi.call('/vendor/goals');
      if (!result.ok || !Array.isArray(result.goals)) throw new Error('Could not retrieve goals.');
      setGoals(result.goals); setError('');
    } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function mutate(path, method, body) {
    setBusy(true); setError('');
    try {
      const result = await externalApi.call(path, { method, ...(body ? { body } : {}) });
      if (!result.ok) throw new Error(result.message || result.error || 'Goal could not be saved.');
      setEditing(null); setForm(empty); await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const field = key => ({ value: form[key], onChange: event => setForm(previous => ({ ...previous, [key]: event.target.value })) });
  return <section className={panel} aria-labelledby="vendor-goals-title" aria-busy={busy}>
    <h2 id="vendor-goals-title" className="font-extrabold text-lg text-navy">Your business goals</h2>
    <p className="text-xs text-muted mt-1">Up to three active goals. Targets count saved records within the dates you choose (UTC). Editing dates or targets recalculates progress; changes are audited. Historical baselines are unavailable.</p>
    {error && <p role="alert" className="my-3 text-sm text-red-700">{error} <button className={button} onClick={load} disabled={busy}>Retry</button></p>}
    {goals === null && !error && <p role="status" className="mt-3 text-sm">Loading goals…</p>}
    {goals?.length === 0 && <p className="mt-3 text-sm text-muted">No goals configured yet.</p>}
    <div className="space-y-3 mt-4">{goals?.map(goal => <article key={goal.id} className="rounded-2xl border border-gray-200 p-3">
      <h3 className="font-bold break-words">{goal.name}</h3>
      <p className="text-xs text-muted">{goal.metric.replaceAll('_', ' ')} · {goal.periodStart} – {goal.periodEnd} UTC · {goal.status}</p>
      <p className="text-sm mt-2">{goal.metricAvailable ? `${number(goal.currentValue)} / ${number(goal.targetValue)} (${goal.progressPercent}%)` : 'Progress unavailable — retry to refresh the source.'}</p>
      {goal.metricAvailable && <progress className="w-full mt-2" max="100" value={goal.progressPercent} aria-label={`${goal.name} progress`} />}
      <p className="text-xs text-muted">Measured {new Date(goal.measuredAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
      <div className="flex flex-wrap gap-2 mt-3">
        <button className={button} disabled={busy} onClick={() => { setEditing(goal.id); setForm({ name: goal.name, metric: goal.metric, targetValue: goal.targetValue, startDate: goal.periodStart, endDate: goal.periodEnd }); }}>Edit</button>
        {goal.status !== 'COMPLETED' && <button className={button} disabled={busy || (goal.status !== 'ACTIVE' && goals.filter(row => row.status === 'ACTIVE').length >= 3)} onClick={() => mutate(`/vendor/goals/${goal.id}`, 'PATCH', { status: goal.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' })}>{goal.status === 'ACTIVE' ? 'Pause' : 'Resume'}</button>}
        {goal.status !== 'COMPLETED' && <button className={button} disabled={busy || !goal.targetReached} onClick={() => mutate(`/vendor/goals/${goal.id}`, 'PATCH', { status: 'COMPLETED' })}>Mark completed</button>}
        <button className={button} disabled={busy} onClick={() => mutate(`/vendor/goals/${goal.id}`, 'DELETE')}>Remove</button>
      </div>
    </article>)}</div>
    <form className="grid sm:grid-cols-2 gap-3 mt-5" onSubmit={event => { event.preventDefault(); mutate(editing ? `/vendor/goals/${editing}` : '/vendor/goals', editing ? 'PATCH' : 'POST', { ...form, targetValue: Number(form.targetValue) }); }}>
      <h3 className="sm:col-span-2 font-bold">{editing ? 'Edit goal' : 'Add a goal'}</h3>
      <label className="text-xs font-semibold">Goal name<input className={input} required minLength={2} maxLength={80} {...field('name')} /></label>
      <label className="text-xs font-semibold">Metric<select aria-label="Goal metric" className={input} {...field('metric')}><option value="SUBMITTED_QUOTES">Quotations submitted</option><option value="CONFIRMED_BOOKINGS">Core confirmed bookings</option><option value="COMPLETED_BOOKINGS">Verified completed bookings</option></select></label>
      <label className="text-xs font-semibold">Target (record count)<input className={input} type="number" min="1" max="1000000" step="1" required {...field('targetValue')} /></label>
      <label className="text-xs font-semibold">Start date (UTC)<input className={input} type="date" required {...field('startDate')} /></label>
      <label className="text-xs font-semibold">End date (inclusive, UTC)<input className={input} type="date" min={form.startDate || undefined} required {...field('endDate')} /></label>
      <div className="flex flex-wrap items-end gap-2"><button className={button} disabled={busy || goals === null || (!editing && goals.filter(row => row.status === 'ACTIVE').length >= 3)} type="submit">{busy ? 'Saving…' : editing ? 'Save changes' : 'Create goal'}</button>{editing && <button className={button} type="button" onClick={() => { setEditing(null); setForm(empty); }}>Cancel edit</button>}</div>
    </form>
  </section>;
}

export default function VendorBusinessDashboard({ analyticsOnly = false, financialOnly = false }) {
  const [periodDays, setPeriodDays] = useState(30);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true); setError(''); setDashboard(null);
    externalApi.call(`/vendor/dashboard?periodDays=${periodDays}`).then(result => {
      if (!result.ok || !result.dashboard) throw new Error('Dashboard data is unavailable.');
      if (live) setDashboard(result.dashboard);
    }).catch(err => { if (live) setError(err.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [periodDays, revision]);
  const retry = () => setRevision(value => value + 1);
  const sales = dashboard?.sales;
  const financial = dashboard?.financial;
  const quality = dashboard?.quality;
  const readiness = dashboard?.readiness;
  const partial = dashboard && Object.values(dashboard.sourceStates).some(state => state !== 'AVAILABLE');
  return <div className="space-y-5 min-w-0">
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-semibold">Measurement period<select className={input} value={periodDays} onChange={event => setPeriodDays(Number(event.target.value))}>{[7, 30, 60, 90].map(days => <option key={days} value={days}>Last {days} complete days</option>)}</select></label>
      <button className={button} disabled={loading} onClick={retry}>{loading ? 'Refreshing…' : 'Refresh data'}</button>
      {dashboard && <p className="text-xs text-muted">Updated {new Date(dashboard.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST. Refresh for latest state.</p>}
    </div>
    {loading && <p role="status">Loading authorized business data…</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 p-4 text-red-700">{error} <button className={button} onClick={retry}>Retry</button></p>}
    {partial && <p role="status" className="rounded-xl bg-amber-50 text-amber-900 p-3 text-sm">Some sources are unavailable or exceed the safe record limit: {Object.entries(dashboard.sourceStates).filter(([, state]) => state !== 'AVAILABLE').map(([key]) => key).join(', ')}. Affected metrics are unavailable. <button className={button} onClick={retry}>Retry</button></p>}
    {dashboard && <>
      {!analyticsOnly && !financialOnly && <>
        <section className={panel} aria-labelledby="business-actions-title">
          <h2 className="font-extrabold text-lg text-navy" id="business-actions-title">Today’s Action Center</h2>
          <p className="text-xs text-muted mt-1">Current saved status · preparation, customer responses, then documentation · showing up to 20 actions. Only saved response SLA deadlines are shown.</p>
          {dashboard.actions.length ? <ul className="divide-y divide-gray-100 mt-3">{dashboard.actions.map(action => <li key={action.id} className="py-3 flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="font-bold text-sm">{action.title}</h3><p className="text-xs text-muted break-words">{action.reason}</p><p className="text-xs mt-1">{action.module} · {action.sourceId.slice(-8)} · {action.status.replaceAll('_', ' ')} · Needs attention{action.dueAt ? ` · Response SLA ${new Date(action.dueAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST` : ''}</p></div><Link className={button} to={action.href}>Open record</Link></li>)}</ul> : <p className="mt-3 text-sm text-muted">{partial ? 'No actions established from the available sources.' : 'No actions requiring attention in the supported records.'}</p>}
        </section>
        <section className={panel} aria-labelledby="business-health-title"><h2 id="business-health-title" className="font-extrabold text-lg text-navy">Business Health Snapshot</h2><p className="text-xs text-muted mt-1">Current state across all saved records</p><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          <Metric label="Enquiries requiring action" value={number(dashboard.snapshot.actionableEnquiries)} detail="New or viewed enquiries awaiting a response" to="/vendor/enquiries" />
          <Metric label="Quotes awaiting action" value={number(dashboard.snapshot.pendingQuotes)} detail="Draft quotations awaiting vendor submission" to="/vendor/quotes" />
          <Metric label="Upcoming confirmed bookings" value={number(dashboard.snapshot.upcomingBookings)} detail="Today or later in IST; excludes verified completion" to="/vendor/bookings" />
        </div></section>
        <section className={panel} aria-labelledby="business-upcoming-title"><h2 id="business-upcoming-title" className="font-extrabold text-lg text-navy">Upcoming Confirmed Bookings</h2>{dashboard.upcomingBookings === null ? <p role="status" className="mt-3">Booking data unavailable.</p> : dashboard.upcomingBookings.length === 0 ? <p className="mt-3 text-sm text-muted">No upcoming confirmed bookings.</p> : <ul className="mt-3 space-y-3">{dashboard.upcomingBookings.map(booking => <li key={booking.id} className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">{booking.eventDate} · {booking.status.replaceAll('_', ' ')} · {booking.id.slice(-8)}</p><Link className={button} to={booking.href}>Open booking</Link></li>)}</ul>}<p className="mt-3 text-xs text-muted">Next five saved confirmed contracts, ordered by event date (IST).</p></section>
      </>}
      {!financialOnly && <section className={panel} aria-labelledby="business-sales-title">
        <h2 className="font-extrabold text-lg text-navy" id="business-sales-title">Lead & Sales Performance</h2>
        <p className="text-xs text-muted mt-1">Enquiry cohort: {range(dashboard.periods.cohort)} IST. Each enquiry has a 30-day attribution window; the latest 30 days are excluded so cohorts can mature. Current cancelled bookings are excluded. Confirmation uses Core contract creation time.</p>
        {!sales.available ? <p className="mt-3" role="status">Insufficient data: {sales.reason}</p> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          <Metric label="Enquiries received" value={number(sales.enquiries)} detail="Distinct enquiries created in cohort" to="/vendor/enquiries" />
          <Metric label="Enquiries with submitted quotes" value={number(sales.quotedEnquiries)} detail="First recorded submission within 30 days; one per enquiry" to="/vendor/quotes" />
          <Metric label="Enquiries with accepted quotes" value={number(sales.acceptedEnquiries)} detail="Recorded APPROVED transition; acceptance does not confirm booking" to="/vendor/quotes" />
          <Metric label="Enquiries with confirmed bookings" value={number(sales.convertedEnquiries)} detail="Linked Core confirmed contract within 30 days; one per enquiry" to="/vendor/bookings" />
          <Metric label="Enquiry → booking conversion" value={sales.conversionPercent == null ? 'Insufficient data' : `${sales.conversionPercent}%`} detail={`${sales.convertedEnquiries} converted ÷ ${sales.enquiries} eligible enquiries`} to="/vendor/bookings" />
          <Metric label="Average first response" value={duration(sales.averageFirstResponseMs)} detail={`${sales.responseSamples} timestamped samples; non-responders excluded`} to="/vendor/enquiries" />
          <Metric label="Average quotation turnaround" value={duration(sales.averageQuoteTurnaroundMs)} detail={`${sales.turnaroundSamples} enquiry-to-first-submission samples`} to="/vendor/quotes" />
          <Metric label="Declined with recorded reason" value={number(sales.declinedWithReason)} detail="Current declined enquiries with a saved reason; no inferred loss reasons" to="/vendor/enquiries" />
        </div>}
      </section>}
      {!analyticsOnly && <section className={panel} aria-labelledby="business-finance-title">
        <h2 className="font-extrabold text-lg text-navy" id="business-finance-title">Financial Clarity</h2>
        <p className="text-xs text-muted mt-1">{range(dashboard.periods.selected)} IST · INR. Contract metrics describe current confirmed contracts created in this period; ledger totals use posting dates. Payments are verified amounts on those contracts, not period cash flow.</p>
        {!financial.available && <p role="status" className="text-sm mt-3">{financial.reason}</p>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {[
            ['Confirmed booking value', financial.bookingValue, 'Distinct current Core contracts'],
            ['Vendor contracted amount', financial.contractedAmount, 'Stored invoiced vendor payable; unavailable for legacy records without a snapshot'],
            ['Verified payments received', financial.verifiedPayments, 'Core PAYMENT_VERIFIED only; refunded snapshots require reconciliation'],
            ['Outstanding customer amount', financial.outstanding, 'Contract gross minus verified payments; unavailable when refunded or inconsistent'],
            ['Settlement eligible', financial.settlementEligible, 'Saved SETTLEMENT_ELIGIBLE contracts; not a completed payout'],
            ['Settlement releases recorded', financial.settlementReleased, 'Existing finance ledger releases; bank transfer completion is not certified'],
            ['Refunds recorded', financial.refunds, 'Existing ledger REFUND entries posted in the period'],
            ['Adjustments recorded', financial.adjustments, 'Existing ledger ADJUSTMENT entries; shown separately, not netted without account semantics'],
          ].map(([label, value, detail]) => <Metric key={label} label={label} value={money(value)} detail={detail} to="/vendor/payments" />)}
        </div>
        <p className="mt-3 text-xs text-muted">Settlement initiation is unavailable in the current lifecycle. Profit cannot be calculated because actual direct costs are not recorded reliably.</p>
      </section>}
      {!analyticsOnly && !financialOnly && <>
        <section className={panel} aria-labelledby="business-quality-title"><h2 id="business-quality-title" className="font-extrabold text-lg text-navy">Service Quality & Customer Trust</h2><div className="grid sm:grid-cols-2 gap-3 mt-4">
          <Metric label="Verified STARVNT rating" value={quality.rating == null ? quality.reviewCount === 0 ? 'No verified reviews yet.' : 'Unavailable' : `${quality.rating} / 5`} detail={`${number(quality.reviewCount)} published verified reviews · all time`} to="/vendor/reviews" />
          <Metric label="Unresolved booking issues" value={number(quality.unresolvedIssues)} detail="Authorized Core protection states; open the booking workflow to review" to="/vendor/bookings" />
          <Metric label="Completed bookings" value={number(quality.completedBookings)} detail="Core COMPLETION_VERIFIED · all time" to="/vendor/bookings" />
        </div>{quality.recent.length > 0 && <ul className="mt-3 text-sm space-y-2">{quality.recent.map(review => <li key={review.id}><Link to="/vendor/reviews">{review.rating} / 5 · {day(review.createdAt)} · {review.replied ? 'Reply saved' : 'Open review to respond'}</Link></li>)}</ul>}<p className="text-xs text-muted mt-3">On-time execution and feedback trends: insufficient evidence for a reliable assessment. Missing history is not a service failure.</p></section>
        <section className={panel} aria-labelledby="business-readiness-title"><h2 id="business-readiness-title" className="font-extrabold text-lg text-navy">Profile & Operating Readiness</h2>{readiness ? <><dl className="grid sm:grid-cols-2 gap-3 mt-4 text-sm">{[
          ['Profile completion', `${readiness.completionPercentage}%`], ['Business verification', readiness.readiness.verificationStatus], ['Account activation', readiness.activationState], ['Matching eligibility', readiness.matchingEligible ? 'ELIGIBLE' : 'LOCKED'], ['Active service readiness', readiness.checklist.services ? 'CONFIGURED' : 'INCOMPLETE'], ['Availability', readiness.readiness.availabilityStatus], ['Service coverage', readiness.checklist.coverage ? 'CONFIGURED' : 'MISSING'], ['Identity and bank verification', readiness.checklist.verified ? 'VERIFIED' : 'PENDING'],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-gray-200 p-3"><dt className="text-xs text-muted">{label}</dt><dd className="font-bold break-words mt-1">{value.replaceAll('_', ' ')}</dd></div>)}</dl>{!readiness.matchingEligible && <p className="mt-3 text-sm">Matching is locked. Complete the requirements below; verification and activation require authorized staff approval. <Link className="text-primary underline" to="/vendor/profile">Review profile and approval status</Link></p>}</> : <p role="status" className="mt-3">Readiness unavailable. Retry to retrieve the authorized status.</p>}</section>
      </>}
      {!financialOnly && <section className={panel} aria-labelledby="business-weekly-title"><h2 id="business-weekly-title" className="font-extrabold text-lg text-navy">Weekly Performance Review</h2><p className="text-xs text-muted mt-1">Last complete Monday–Sunday week: {range(dashboard.periods.week)} IST. Previous: {range(dashboard.periods.previousWeek)} IST. Counts use creation, first submission or completion verification timestamps. No growth claims for missing data.</p>{dashboard.weekly.current.available && dashboard.weekly.previous.available ? <div className="overflow-x-auto mt-4"><table className="w-full text-sm text-left"><caption className="sr-only">Weekly recorded operational counts compared with the previous complete week</caption><thead><tr><th scope="col" className="p-2">Metric</th><th scope="col" className="p-2">Last week</th><th scope="col" className="p-2">Previous</th></tr></thead><tbody>{[['Enquiries', 'enquiries'], ['Quotations submitted', 'submittedQuotes'], ['Core confirmed contracts', 'confirmedBookings'], ['Verified completions', 'completedBookings'], ['Verified reviews', 'verifiedReviews']].map(([label, key]) => <tr key={key}><th scope="row" className="p-2 font-medium">{label}</th><td className="p-2">{number(dashboard.weekly.current[key])}</td><td className="p-2">{number(dashboard.weekly.previous[key])}</td></tr>)}</tbody></table></div> : <p role="status" className="mt-3">Insufficient data for comparable weeks.</p>}<p className="mt-3 text-xs text-muted">Weekly conversion and response comparisons are not shown while the enquiry cohorts are immature. Use the matured cohort above. Settlement status is shown separately under Financial Clarity.</p></section>}
      {!analyticsOnly && !financialOnly && <section className={panel} aria-labelledby="business-improvements-title"><h2 id="business-improvements-title" className="font-extrabold text-lg text-navy">Vendor Improvement</h2><p className="text-xs text-muted mt-1">Recommendations from saved readiness findings. One item per requirement; resolved conditions disappear on refresh. No expansion recommendations are inferred.</p>{dashboard.recommendations.length > 0 ? <ul className="mt-3 space-y-3">{dashboard.recommendations.map(item => <li key={item.id} className="flex flex-wrap gap-2 items-center justify-between"><div className="text-sm flex-1 min-w-0"><p>{item.title}</p><p className="text-xs text-muted">Needs attention · {item.source}</p></div><Link className={button} to={item.href}>{item.action}</Link></li>)}</ul> : <p className="mt-3 text-sm">{readiness ? 'No missing readiness requirements recorded.' : 'Insufficient data for recommendations.'}</p>}</section>}
    </>}
    {!analyticsOnly && !financialOnly && <VendorGoals />}
  </div>;
}
