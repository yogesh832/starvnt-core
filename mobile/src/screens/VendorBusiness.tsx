import React, { useState } from 'react';
import { Linking } from 'react-native';
import { external } from '../api/runtime';
import type { Data } from '../api/client';
import { vendorDestination } from '../vendorDestination';
import { emptyGoal, goalMetrics, goalPayload, istTimestamp, metricDuration, metricMoney, metricNumber, metricPeriod } from '../vendorBusiness';
import { VENDOR_SUPPORT } from '../../../shared/vendorSupport.js';
import { Button, Card, Choice, Empty, ErrorNotice, Field, human, id, Page, Pill, Txt, useAction, useResource } from '../ui';

function Metric({ label, value, detail, destination, open }: { label: string; value: string; detail: string; destination: string; open: (path: string) => void }) {
  return <Card><Txt muted size={13}>{label}</Txt><Txt bold size={23}>{value}</Txt><Txt muted size={12}>{detail}</Txt><Button title={`View ${label.toLowerCase()}`} secondary onPress={() => open(destination)} /></Card>;
}

export function VendorGoals() {
  const r = useResource(external, '/vendor/goals');
  const a = useAction();
  const [form, setForm] = useState(emptyGoal);
  const [editing, setEditing] = useState<string | null>(null);
  const goals: Data[] | null = !r.error && !r.loading && Array.isArray(r.data.goals) ? r.data.goals : null;
  const active = goals?.filter(goal => goal.status === 'ACTIVE').length ?? 0;
  const mutate = (path: string, method: string, body?: Data) => {
    void a.run(async () => {
      await external.call(path, method, body);
      setEditing(null); setForm(emptyGoal()); await r.refresh();
    });
  };
  return <Card>
    <Txt bold size={22}>Your business goals</Txt>
    <Txt muted>Up to three active count-based goals. Dates use UTC, independently of the dashboard’s IST periods. Editing dates or targets recalculates progress; changes are audited. Historical baselines are unavailable.</Txt>
    <ErrorNotice message={r.error} retry={r.refresh} /><ErrorNotice message={a.error} />
    <Button title={r.loading || r.refreshing ? 'Refreshing goals…' : 'Refresh goals'} secondary disabled={r.loading || r.refreshing || a.busy} onPress={r.refresh} />
    {r.loading && <Txt>Loading goals…</Txt>}
    {goals?.length === 0 && <Txt muted>No goals configured yet.</Txt>}
    {goals?.map(goal => <Card key={goal.id}>
      <Txt bold size={19}>{goal.name}</Txt><Pill>{human(goal.status)}</Pill>
      <Txt muted>{goalMetrics[goal.metric] || goal.metric} · {goal.periodStart} – {goal.periodEnd} UTC</Txt>
      <Txt bold>{goal.metricAvailable ? `${metricNumber(goal.currentValue)} / ${metricNumber(goal.targetValue)} (${goal.progressPercent}%)` : 'Progress unavailable — refresh to retry the source.'}</Txt>
      <Txt muted>Measured {istTimestamp(goal.measuredAt)} IST</Txt>
      <Button title={`Edit ${goal.name}`} secondary disabled={a.busy} onPress={() => { setEditing(goal.id); setForm({ name: goal.name, metric: goal.metric, targetValue: String(goal.targetValue), startDate: goal.periodStart, endDate: goal.periodEnd }); }} />
      {goal.status !== 'COMPLETED' && <>
        <Button title={goal.status === 'ACTIVE' ? `Pause ${goal.name}` : `Resume ${goal.name}`} secondary disabled={a.busy || (goal.status !== 'ACTIVE' && active >= 3)} onPress={() => mutate(`/vendor/goals/${goal.id}`, 'PATCH', { status: goal.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' })} />
        <Button title={`Mark ${goal.name} completed`} secondary disabled={a.busy || !goal.targetReached} onPress={() => mutate(`/vendor/goals/${goal.id}`, 'PATCH', { status: 'COMPLETED' })} />
      </>}
      <Button title={`Remove ${goal.name}`} secondary disabled={a.busy} onPress={() => mutate(`/vendor/goals/${goal.id}`, 'DELETE')} />
    </Card>)}
    <Txt bold size={19}>{editing ? 'Edit goal' : 'Add a goal'}</Txt>
    <Field label="Goal name" value={form.name} maxLength={80} onChangeText={name => setForm(previous => ({ ...previous, name }))} />
    <Choice label="Goal metric" values={Object.keys(goalMetrics)} labels={goalMetrics} value={form.metric} onChange={metric => setForm(previous => ({ ...previous, metric }))} />
    <Field label="Target (record count)" keyboardType="number-pad" value={form.targetValue} onChangeText={targetValue => setForm(previous => ({ ...previous, targetValue }))} />
    <Field label="Start date (UTC, YYYY-MM-DD)" autoCapitalize="none" placeholder="YYYY-MM-DD" value={form.startDate} onChangeText={startDate => setForm(previous => ({ ...previous, startDate }))} />
    <Field label="End date (inclusive, UTC, YYYY-MM-DD)" autoCapitalize="none" placeholder="YYYY-MM-DD" value={form.endDate} onChangeText={endDate => setForm(previous => ({ ...previous, endDate }))} />
    <Button title={editing ? 'Save goal changes' : 'Create goal'} busy={a.busy} disabled={goals === null || (!editing && active >= 3)} onPress={() => { void a.run(async () => { const payload = goalPayload(form); await external.call(editing ? `/vendor/goals/${editing}` : '/vendor/goals', editing ? 'PATCH' : 'POST', payload); setEditing(null); setForm(emptyGoal()); await r.refresh(); }); }} />
    {editing && <Button title="Cancel edit" secondary disabled={a.busy} onPress={() => { setEditing(null); setForm(emptyGoal()); }} />}
  </Card>;
}

function PaymentRecords({ open }: { open: (path: string) => void }) {
  const r = useResource(external, '/vendor/bookings');
  return <Card><Txt bold size={22}>Booking-level payment records</Txt><ErrorNotice message={r.error} retry={r.refresh} />
    {r.loading && <Txt>Loading booking records…</Txt>}
    {!r.loading && !r.error && <>
      {(r.data.bookings || []).map((booking: Data) => <Card key={id(booking)}>
        <Txt bold>{booking.bookingReference || booking.serviceName}</Txt><Txt muted>{human(booking.bookingStatus)} · {human(booking.paymentStatus)} · {human(booking.settlementStatus)}</Txt>
        <Txt>Contract gross: {metricMoney(booking.totalAmount)}</Txt>
        <Txt>Invoiced vendor payable: {metricMoney(booking.taxSummary?.invoiceNumber ? booking.taxSummary.vendorPayable : null)}</Txt>
        <Txt>Verified payment snapshot: {metricMoney(booking.paymentStatus === 'PAYMENT_VERIFIED' ? booking.paymentSummary?.paidAmount : booking.paymentStatus === 'PENDING' ? 0 : null)}</Txt>
        <Button title={`Review booking ${booking.bookingReference || id(booking)}`} secondary onPress={() => open(`/vendor/bookings?record=${encodeURIComponent(id(booking))}`)} />
      </Card>)}
      {r.data.bookings?.length === 0 && <Empty title="No payment records yet" description="Recorded Core contract and payment snapshots will appear here." />}
    </>}
    <Txt muted>Gross is not earnings or profit. Refunds and adjustments require ledger reconciliation. No payment deadline is inferred from event or creation dates.</Txt>
  </Card>;
}

export function VendorBusinessPage({ navigation, mode = 'home' }: { navigation: any; mode?: 'home' | 'analytics' | 'payments' }) {
  const [period, setPeriod] = useState('30');
  const r = useResource(external, `/vendor/dashboard?periodDays=${period}`);
  const a = useAction();
  const d: Data | null = !r.loading && !r.error && r.data.ok && r.data.dashboard ? r.data.dashboard : null;
  const open = (path: string) => { const destination = vendorDestination(path); if (destination) navigation.navigate(destination.screen, destination.params); };
  const metric = (label: string, value: string, detail: string, destination: string) => <Metric key={label} label={label} value={value} detail={detail} destination={destination} open={open} />;
  const readiness = d?.readiness;
  const home = mode === 'home';
  return <Page {...r} error={undefined} loading={false} title={home ? readiness?.businessName || 'Your business, in focus.' : mode === 'analytics' ? 'Business analytics' : 'Payments & settlements'} subtitle="Authoritative business performance and operations. Pull to refresh saved data.">
    <ErrorNotice message={r.error} retry={r.refresh} />
    {r.loading && <Txt>Loading authorized business data…</Txt>}
    <Choice label="Measurement period" values={['7', '30', '60', '90']} labels={{ '7': '7 days', '30': '30 days', '60': '60 days', '90': '90 days' }} value={period} onChange={setPeriod} />
    <Button title={r.refreshing ? 'Refreshing business data…' : 'Refresh business data'} secondary disabled={r.loading || r.refreshing} onPress={r.refresh} />
    {!r.loading && !r.error && !d && <ErrorNotice message="Business data is unavailable. Retry to retrieve the saved dashboard." retry={r.refresh} />}
    {d && <>
      <Txt muted>Updated {istTimestamp(d.generatedAt)} IST. Refresh for the latest saved status.</Txt>
      {Object.values(d.sourceStates).some(state => state !== 'AVAILABLE') && <ErrorNotice message={`Some sources are unavailable or exceed the safe record limit: ${Object.entries(d.sourceStates).filter(([, state]) => state !== 'AVAILABLE').map(([key]) => key).join(', ')}. Affected metrics are unavailable.`} retry={r.refresh} />}
      {home && <>
        <Card><Txt bold size={23}>Today’s Action Center</Txt><Txt muted>Current statuses, ordered by priority. Only saved response SLA deadlines are shown. Up to 20 deduplicated actions.</Txt>
          {d.actions.map((action: Data) => <Card key={action.id}><Txt bold size={18}>{action.title}</Txt><Txt>{action.reason}</Txt><Txt muted>{human(action.module)} · {action.sourceId.slice(-8)} · {human(action.status)} · Needs attention</Txt>{action.dueAt && <Txt muted>Response SLA: {istTimestamp(action.dueAt)} IST</Txt>}<Button title={`Open ${action.module} record ${action.sourceId.slice(-8)}`} secondary onPress={() => open(action.href)} /></Card>)}
          {!d.actions.length && <Txt muted>{Object.values(d.sourceStates).some(state => state !== 'AVAILABLE') ? 'No actions established from the available sources.' : 'No actions requiring attention in the supported records.'}</Txt>}
        </Card>
        <Card><Txt bold size={23}>Business Health Snapshot</Txt><Txt muted>Current state across saved records.</Txt>
          {metric('Enquiries requiring action', metricNumber(d.snapshot.actionableEnquiries), 'New or viewed enquiries awaiting response', '/vendor/enquiries')}
          {metric('Quotes awaiting action', metricNumber(d.snapshot.pendingQuotes), 'Saved draft quotations awaiting submission', '/vendor/quotes')}
          {metric('Upcoming confirmed bookings', metricNumber(d.snapshot.upcomingBookings), 'Today or later in IST; excludes verified completion', '/vendor/bookings')}
        </Card>
        <Card><Txt bold size={23}>Upcoming Confirmed Bookings</Txt>
          {d.upcomingBookings === null ? <Txt>Booking data unavailable.</Txt> : d.upcomingBookings.length === 0 ? <Txt muted>No upcoming confirmed bookings.</Txt> : d.upcomingBookings.map((booking: Data) => <Card key={booking.id}><Txt>{booking.eventDate} · {human(booking.status)}</Txt><Button title={`Open booking ${booking.id.slice(-8)}`} secondary onPress={() => open(booking.href)} /></Card>)}
          <Txt muted>Next five confirmed contracts, ordered by event date (IST).</Txt>
        </Card>
      </>}
      {mode !== 'payments' && <Card><Txt bold size={23}>Lead & Sales Performance</Txt><Txt muted>Enquiry cohort: {metricPeriod(d.periods.cohort)}. A 30-day attribution window is allowed for each enquiry, so the latest 30 days are excluded. Cancelled contracts are excluded; confirmation uses Core contract creation time.</Txt>
        {!d.sales.available ? <Txt>Insufficient data: {d.sales.reason}</Txt> : <>
          {metric('Enquiries received', metricNumber(d.sales.enquiries), 'Distinct enquiries created in the mature cohort', '/vendor/enquiries')}
          {metric('Enquiries with submitted quotes', metricNumber(d.sales.quotedEnquiries), 'Recorded submission within 30 days; one per enquiry', '/vendor/quotes')}
          {metric('Enquiries with accepted quotes', metricNumber(d.sales.acceptedEnquiries), 'Recorded approval; quote acceptance does not confirm booking', '/vendor/quotes')}
          {metric('Enquiries with confirmed bookings', metricNumber(d.sales.convertedEnquiries), 'Linked Core confirmed contract within 30 days; one per enquiry', '/vendor/bookings')}
          {metric('Enquiry → booking conversion', d.sales.conversionPercent == null ? 'Insufficient data' : `${d.sales.conversionPercent}%`, `${d.sales.convertedEnquiries} converted ÷ ${d.sales.enquiries} eligible enquiries`, '/vendor/bookings')}
          {metric('Average first response', metricDuration(d.sales.averageFirstResponseMs), `${d.sales.responseSamples} timestamped samples; non-responders excluded`, '/vendor/enquiries')}
          {metric('Average quotation turnaround', metricDuration(d.sales.averageQuoteTurnaroundMs), `${d.sales.turnaroundSamples} enquiry-to-first-submission samples`, '/vendor/quotes')}
          {metric('Declined with recorded reason', metricNumber(d.sales.declinedWithReason), 'No inferred loss reasons', '/vendor/enquiries')}
        </>}
      </Card>}
      {mode !== 'analytics' && <Card><Txt bold size={23}>Financial Clarity</Txt><Txt muted>{metricPeriod(d.periods.selected)} · INR. Contract metrics describe current confirmed contracts created in this period; ledger totals use posting dates. Verified payments on these contracts are not period cash flow.</Txt>
        {!d.financial.available && <Txt>{d.financial.reason}</Txt>}
        {[
          ['Confirmed booking value', 'bookingValue', 'Distinct current confirmed contracts'],
          ['Vendor contracted amount', 'contractedAmount', 'Stored invoiced vendor payable; unavailable for missing legacy snapshots'],
          ['Verified payments received', 'verifiedPayments', 'Verified Core payment snapshots only; refunds require reconciliation'],
          ['Outstanding customer amount', 'outstanding', 'Gross minus verified payments; unavailable when refunded, adjusted or inconsistent'],
          ['Settlement eligible', 'settlementEligible', 'Saved eligibility; not a completed payout'],
          ['Settlement releases recorded', 'settlementReleased', 'Ledger releases; bank transfer completion is not certified'],
          ['Refunds recorded', 'refunds', 'Refund ledger entries posted in the selected period'],
          ['Adjustments recorded', 'adjustments', 'Shown separately without inventing netting rules'],
        ].map(([label, key, detail]) => metric(label, metricMoney(d.financial[key]), detail, '/vendor/payments'))}
        <Txt muted>Separate settlement initiation is unavailable in the existing lifecycle. Profit cannot be calculated without reliable actual direct costs.</Txt>
      </Card>}
      {home && <>
        <Card><Txt bold size={23}>Service Quality & Customer Trust</Txt>
          {metric('Verified STARVNT rating', d.quality.rating == null ? d.quality.reviewCount === 0 ? 'No verified reviews yet.' : 'Unavailable' : `${d.quality.rating} / 5`, `${metricNumber(d.quality.reviewCount)} published verified reviews · all time`, '/vendor/reviews')}
          {metric('Completed bookings', metricNumber(d.quality.completedBookings), 'Core verified completion · all time', '/vendor/bookings')}
          {metric('Unresolved booking issues', metricNumber(d.quality.unresolvedIssues), 'Authorized Core protection workflow', '/vendor/bookings')}
          {d.quality.recent.map((review: Data) => <Card key={review.id}><Txt>{review.rating} / 5 · {istTimestamp(review.createdAt)} IST</Txt><Txt muted>{review.replied ? 'Reply saved' : 'Open review to respond'}</Txt><Button title="Open verified reviews" secondary onPress={() => open('/vendor/reviews')} /></Card>)}
          <Txt muted>On-time execution and feedback trends: insufficient evidence. Missing history is not a service failure.</Txt>
        </Card>
        <Card><Txt bold size={23}>Profile & Operating Readiness</Txt>
          {!readiness ? <Txt>Readiness unavailable. Refresh to retry.</Txt> : <>
            {[
              ['Profile completion', `${readiness.completionPercentage}%`], ['Business verification', readiness.readiness.verificationStatus],
              ['Account activation', readiness.activationState], ['Matching eligibility', readiness.matchingEligible ? 'ELIGIBLE' : 'LOCKED'],
              ['Active service readiness', readiness.checklist.services ? 'CONFIGURED' : 'INCOMPLETE'], ['Availability', readiness.readiness.availabilityStatus],
              ['Service coverage', readiness.checklist.coverage ? 'CONFIGURED' : 'MISSING'], ['Identity and bank verification', readiness.checklist.verified ? 'VERIFIED' : 'PENDING'],
            ].map(([label, value]) => <Txt key={label}>{label}: {human(value)}</Txt>)}
            {!!readiness.reviewFeedback && <Txt>{readiness.reviewFeedback}</Txt>}
            {!readiness.matchingEligible && <Txt>Matching is locked. Complete the missing requirements; verification and activation require authorized staff approval.</Txt>}
            <Button title="Review business setup" secondary onPress={() => navigation.navigate('Work')} />
            {['DRAFT', 'PROFILE_INCOMPLETE'].includes(readiness.activationState) && readiness.commercialReadiness && <Button title="Submit profile for review" busy={a.busy} onPress={() => { void a.run(async () => { await external.call('/vendor/activation-review', 'POST'); await r.refresh(); }); }} />}
          </>}
        </Card>
      </>}
      {mode !== 'payments' && <Card><Txt bold size={23}>Weekly Performance Review</Txt><Txt muted>Last complete week: {metricPeriod(d.periods.week)}. Previous: {metricPeriod(d.periods.previousWeek)}. Recorded creation, first submission, review creation and completion verification timestamps; no fabricated growth percentages.</Txt>
        {d.weekly.current.available && d.weekly.previous.available ? [['Enquiries', 'enquiries'], ['Quotations submitted', 'submittedQuotes'], ['Core confirmed contracts', 'confirmedBookings'], ['Verified completions', 'completedBookings'], ['Verified reviews', 'verifiedReviews']].map(([label, key]) => <Card key={key}><Txt bold>{label}</Txt><Txt>Last week: {metricNumber(d.weekly.current[key])}</Txt><Txt>Previous week: {metricNumber(d.weekly.previous[key])}</Txt></Card>) : <Txt>Insufficient data for comparable weeks.</Txt>}
        <Txt muted>Weekly conversion and response comparisons are withheld while cohorts are immature. Use the mature cohort above. Settlement status is shown under Financial Clarity.</Txt>
      </Card>}
      {home && <Card><Txt bold size={23}>Vendor Improvement</Txt><Txt muted>Recommendations use saved readiness findings, one per requirement. Resolved conditions disappear on refresh. No expansion recommendations are inferred.</Txt>
        {d.recommendations.map((item: Data) => <Card key={item.id}><Txt bold>{item.title}</Txt><Txt muted>Needs attention · {item.source}</Txt><Button title={item.action} secondary onPress={() => open(item.href)} /></Card>)}
        {!d.recommendations.length && <Txt muted>{readiness ? 'No missing readiness requirements recorded.' : 'Insufficient data for recommendations.'}</Txt>}
      </Card>}
    </>}
    {home && <>
      <VendorGoals />
      <Button title="Ask Aura+ about your business" onPress={() => navigation.navigate('Chat')} />
      <Button title="Messages & updates" secondary onPress={() => open('/vendor/updates')} />
      <Button title="Calendar & availability" secondary onPress={() => navigation.navigate('VendorCalendar')} />
      <ErrorNotice message={a.error} />
      {(['WHATSAPP', 'CALL'] as const).map(action => <Button key={action} title={action === 'WHATSAPP' ? 'WhatsApp Support' : `Call Support ${VENDOR_SUPPORT.number}`} secondary busy={a.busy} onPress={() => { void a.run(async () => { try { await Linking.openURL(action === 'WHATSAPP' ? VENDOR_SUPPORT.whatsapp : VENDOR_SUPPORT.phone); await external.call('/vendor/support-actions', 'POST', { action, outcome: 'OPENED' }).catch(() => {}); } catch (error) { await external.call('/vendor/support-actions', 'POST', { action, outcome: 'FAILED' }).catch(() => {}); throw error; } }); }} />)}
    </>}
    {mode === 'payments' && <PaymentRecords open={open} />}
  </Page>;
}
