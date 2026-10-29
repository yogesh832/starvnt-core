import React, { useMemo, useState } from "react";
import { Linking, View } from "react-native";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import {
  reviewText,
  reviewerName,
  vendorInsightTotals,
} from "../vendorInsights";
import {
  Button,
  Card,
  Choice,
  date,
  Empty,
  ErrorNotice,
  human,
  id,
  Field,
  money,
  Page,
  Pill,
  Stats,
  Txt,
  useAction,
  useResource,
  confirm,
} from "../ui";
import { formatVendorResponseTime, vendorSalesMetrics } from "../vendorInsights";

export function VendorAnalytics() {
  const counts = useResource(external, "/vendor/badge-counts");
  const bookings = useResource(external, "/vendor/bookings");
  const enquiries = useResource(external, "/vendor/opportunities");
  const quotes = useResource(external, "/quotes");
  const [periodDays, setPeriodDays] = useState("30");
  const firstResponse = useResource(external, `/vendor/metrics/first-response?periodDays=${periodDays}`);
  const totals = vendorInsightTotals(bookings.data.bookings || []);
  const cohort = useMemo(() => vendorSalesMetrics({
    enquiries: enquiries.data.opportunities || [],
    quotes: quotes.data.quotes || [],
    bookings: bookings.data.bookings || [],
  }, Number(periodDays)), [enquiries.data, quotes.data, bookings.data, periodDays]);
  return (
    <Page
      {...counts}
      title="Business analytics"
      subtitle="Recorded activity and booking values from your workspace."
    >
      <ErrorNotice message={bookings.error} retry={bookings.refresh} />
      <Stats
        items={[
          ["Enquiries", counts.data.enquiriesCount],
          ["Quotes", counts.data.quotesCount],
          ["Bookings", counts.data.bookingsCount],
          ["Unread messages", counts.data.messagesCount],
        ]}
      />
      {!bookings.loading && !bookings.error && (
        <Stats
          items={[
            ["Advance received", money(totals.advanceReceived)],
            ["Recorded booking value", money(totals.recordedBookingValue)],
          ]}
        />
      )}
      <ErrorNotice message={enquiries.error || quotes.error} retry={() => { enquiries.refresh(); quotes.refresh(); }} />
      <Card>
        <Txt bold size={21}>Conversion pipeline</Txt>
        <Choice label="Matured enquiry cohort" value={periodDays} values={["30", "60", "90"]} onChange={setPeriodDays} />
        <Txt muted>Enquiries received {periodDays}–{Number(periodDays) + 30} days ago. Newer leads are excluded until the 30-day attribution window closes.</Txt>
        {enquiries.error || quotes.error || bookings.error ? <Txt muted>Unavailable: source data failed to load. Retry before relying on these metrics.</Txt> : <Stats items={[
          ["Eligible enquiries", cohort.eligible],
          ["Lead → quote", cohort.quoteRate === null ? "Insufficient data" : `${Math.round(cohort.quoteRate * 100)}%`],
          ["Lead → booking", cohort.bookingRate === null ? "Insufficient data" : `${Math.round(cohort.bookingRate * 100)}%`],
          ["Avg. quote turnaround", formatVendorResponseTime(cohort.avgQuoteMs)],
        ]} />}
        <Txt muted>{cohort.quoted} enquiries with a submitted quote · {cohort.booked} confirmed bookings · quote samples {cohort.quoteSamples}</Txt>
        {Object.keys(cohort.declineReasons).length > 0 && <Txt>Recorded decline reasons: {Object.entries(cohort.declineReasons).sort((a,b) => b[1]-a[1]).slice(0,3).map(([reason, count]) => `${reason} (${count})`).join(" · ")}</Txt>}
        <ErrorNotice message={firstResponse.error} retry={firstResponse.refresh} />
        {firstResponse.data.metrics && <Txt>First response: {formatVendorResponseTime(firstResponse.data.metrics.averageFirstResponseMs ?? null)} · sample {firstResponse.data.metrics.respondedEnquiries ?? 0}{firstResponse.data.metrics.complete === false ? " · partial data" : ""}</Txt>}
        {!firstResponse.error && !firstResponse.loading && !firstResponse.data.metrics && <Txt muted>First-response data is not available yet.</Txt>}
      </Card>
      <VendorBusinessGoals />
      <Txt muted>
        Counts reflect the current backend state. Recorded booking value is not
        the amount released to your bank.
      </Txt>
    </Page>
  );
}

function VendorBusinessGoals() {
  const r = useResource(external, "/vendor/goals");
  const action = useAction();
  const [editing, setEditing] = useState<Data | null>(null);
  const [name, setName] = useState("");
  const [metric, setMetric] = useState("SUBMITTED_QUOTES");
  const [target, setTarget] = useState("3");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => { const end = new Date(); end.setDate(end.getDate() + 7); return end.toISOString().slice(0, 10); });
  const goals: Data[] = r.data.goals || [];
  const activeCount = goals.filter((goal) => goal.status === "ACTIVE").length;
  const reset = () => { setEditing(null); setName(""); setMetric("SUBMITTED_QUOTES"); setTarget("3"); };
  const refresh = () => { void r.refresh(); };
  const save = () => action.run(async () => {
    const result = await external.call(editing ? `/vendor/goals/${id(editing)}` : "/vendor/goals", editing ? "PATCH" : "POST", { name, metric, targetValue: Number(target), startDate, endDate });
    if (result?.error || result?.ok === false) throw new Error(result.message || result.error || "Goal could not be saved.");
    reset(); await r.refresh();
  });
  const changeStatus = (goal: Data, status: string) => action.run(async () => {
    const result = await external.call(`/vendor/goals/${id(goal)}`, "PATCH", { status });
    if (result?.error || result?.ok === false) throw new Error(result.message || result.error || "Goal could not be updated.");
    await r.refresh();
  });
  const remove = (goal: Data) => confirm("Remove goal?", `Remove “${goal.name}” from your goal list?`, () => action.run(async () => {
    const result = await external.call(`/vendor/goals/${id(goal)}`, "DELETE");
    if (result?.error || result?.ok === false) throw new Error(result.message || result.error || "Goal could not be removed.");
    await r.refresh();
  }));
  return <Card>
    <Txt bold size={21}>Business goals</Txt>
    <Txt muted>Track progress from saved platform records. Up to three goals may be active ({activeCount}/3).</Txt>
    <ErrorNotice message={r.error || action.error} retry={r.refresh} />
    {goals.map((goal) => <Card key={id(goal)}>
      <Txt bold>{goal.name}</Txt><Pill>{human(goal.status)}</Pill>
      <Txt muted>{human(goal.metric)} · {String(goal.periodStart).slice(0,10)} to {String(goal.periodEnd).slice(0,10)}</Txt>
      <Txt>{goal.metricAvailable ? `${goal.currentValue} / ${goal.targetValue} · ${goal.progressPercent}%` : "Progress unavailable"}</Txt>
      <Txt muted>{goal.metricAvailable ? "Measured from saved platform records." : "Source records could not be measured; no zero value is substituted."}</Txt>
      <View style={{ gap: 8 }}>
        {goal.status !== "COMPLETED" && <Button title="Edit goal" secondary onPress={() => { setEditing(goal); setName(goal.name); setMetric(goal.metric); setTarget(String(goal.targetValue)); setStartDate(String(goal.periodStart).slice(0,10)); setEndDate(String(goal.periodEnd).slice(0,10)); }} />}
        {goal.status === "ACTIVE" && <Button title={goal.targetReached ? "Mark complete" : "Pause goal"} secondary onPress={() => changeStatus(goal, goal.targetReached ? "COMPLETED" : "PAUSED")} />}
        {goal.status === "PAUSED" && <Button title="Resume goal" secondary onPress={() => changeStatus(goal, "ACTIVE")} />}
        <Button title="Remove goal" danger secondary onPress={() => remove(goal)} />
      </View>
    </Card>)}
    {!r.loading && !goals.length && <Empty title="No goals saved" description="Create a goal to track submitted quotes, confirmed bookings, or completed bookings." />}
    <Field label="Goal name" value={name} onChangeText={setName} maxLength={80} />
    <Choice label="Metric" value={metric} values={["SUBMITTED_QUOTES", "CONFIRMED_BOOKINGS", "COMPLETED_BOOKINGS"]} onChange={setMetric} />
    <Field label="Target count" keyboardType="number-pad" value={target} onChangeText={setTarget} />
    <Field label="Start date (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} />
    <Field label="End date (YYYY-MM-DD)" value={endDate} onChangeText={setEndDate} />
    <Button title={editing ? "Save goal changes" : "Create business goal"} busy={action.busy} disabled={!editing && activeCount >= 3} onPress={save} />
    {editing && <Button title="Cancel editing" secondary onPress={reset} />}
    <Button title="Refresh goal progress" secondary onPress={refresh} />
  </Card>;
}
export function VendorPayments({ navigation }: any) {
  const bookings = useResource(external, "/vendor/bookings");
  const r = useResource(external, "/vendor/financial-truth");
  const truth = r.data.financialTruth || {};
  const totals = vendorInsightTotals(bookings.data.bookings || []);
  const metrics = truth.metrics || {};
  return (
    <Page
      {...r}
      title="Payments & settlements"
      subtitle="Payment truth from Core. Settlement requires Core validation."
    >
      <ErrorNotice message={bookings.error} retry={bookings.refresh} />
      {!bookings.loading && !bookings.error && (
        <Stats
          items={[
            ["Verified advances", money(totals.verifiedAdvances)],
            ["Released & settled", money(totals.released)],
            ["Expected settlements", money(metrics.expectedSettlements)],
          ]}
        />
      )}
      <Card>
        <Txt bold size={21}>
          Receivables
        </Txt>
        <Stats
          items={[
            ["Expected receivables", money(metrics.expectedReceivables)],
            ["Due this week", money(metrics.dueThisWeek)],
            ["Overdue", money(metrics.overdueAmount)],
          ]}
        />
      </Card>
      <Card>
        <Txt bold size={21}>Settlement states</Txt>
        <Stats items={[
          ["Eligible for settlement", money(metrics.expectedSettlements)],
          ["On hold", money(metrics.settlementHoldAmount)],
          ["Settled", money(metrics.settledAmount)],
        ]} />
        <Txt muted>Eligibility, hold and completed payout are separate Core states.</Txt>
      </Card>
      {truth.agingBreakdown && (
        <Card>
          <Txt bold size={20}>
            Aging breakdown
          </Txt>
          {Object.entries(truth.agingBreakdown).map(([key, value]) => {
            const bucket = value as Data;
            return (
              <Txt key={key}>
                {human(key.replace(/([a-z])([A-Z])/g, "$1 $2"))}:{" "}
                {money(bucket.amount)} · {bucket.count ?? 0} payments
              </Txt>
            );
          })}
        </Card>
      )}
      {!!truth.overdueBookings?.length && (
        <Card>
          <Txt bold size={21}>
            Overdue bookings
          </Txt>
          {truth.overdueBookings.map((booking: Data, index: number) => (
            <Card key={booking.bookingId || index}>
              <Txt bold>{booking.bookingReference || booking.serviceName}</Txt>
              <Txt>
                {booking.customerName} · {booking.daysOverdue} days overdue
              </Txt>
              <Txt bold>{money(booking.amount)}</Txt>
            </Card>
          ))}
        </Card>
      )}
      {(bookings.data.bookings || []).map((booking: Data) => (
        <Card key={id(booking)}>
          <Txt bold size={21}>
            {booking.serviceName}
          </Txt>
          <Txt>{booking.customerName || booking.clientName}</Txt>
          <Pill>{human(booking.paymentStatus)}</Pill>
          <Pill>{human(booking.settlementStatus)}</Pill>
          <Txt>Total: {money(booking.totalAmount)}</Txt>
          <Txt>Paid: {money(booking.paymentSummary?.paidAmount)}</Txt>
          <Txt>Balance: {money(booking.paymentSummary?.balanceAmount)}</Txt>
          <Txt>
            Vendor payable:{" "}
            {money(
              booking.settlementDetails?.vendorPayable ??
                booking.settlementMath?.vendorPayable ??
                booking.vendorPayable,
            )}
          </Txt>
          <Button
            title="Review booking"
            secondary
            onPress={() => navigation.navigate("VendorBooking", { booking })}
          />
        </Card>
      ))}
      {!bookings.loading && !bookings.data.bookings?.length && (
        <Empty
          title="No booking payments yet"
          description="Recorded booking payments and settlement states will appear here."
        />
      )}
    </Page>
  );
}
export function VendorReviews({ navigation }: any) {
  const r = useResource(external, "/vendor/reviews");
  const a = useAction();
  const [tab, setTab] = useState("starvnt");
  const google = r.data.googleRating;
  const stats = r.data.stats || {};
  return (
    <Page
      {...r}
      title="Reviews & reputation"
      subtitle="Customer reviews and public Google ratings."
    >
      <ErrorNotice message={a.error} />
      <Stats
        items={[
          [
            "Average rating",
            stats.totalReviews ? `${stats.averageRating} / 5` : "No reviews",
          ],
          ["Reviews", stats.totalReviews ?? 0],
          [
            "Recommend",
            stats.totalReviews ? stats.recommendPercentage : "Not available",
          ],
        ]}
      />
      <Choice
        label="Review source"
        values={["starvnt", "google"]}
        value={tab}
        onChange={setTab}
      />
      {tab === "starvnt" && (
        <>
          {!!stats.totalReviews && (
            <Card>
              <Txt bold>Rating distribution</Txt>
              {[5, 4, 3, 2, 1].map((stars) => (
                <Txt key={stars}>
                  {stars} stars: {stats.distribution?.[stars] || 0}
                </Txt>
              ))}
            </Card>
          )}
          {(r.data.reviews || []).map((review: Data) => (
            <Card key={id(review)}>
              <Txt bold size={20}>
                {reviewerName(review)}
              </Txt>
              {review.isVerified && <Pill>VERIFIED BOOKING</Pill>}
              <Txt bold>{review.rating} / 5</Txt>
              <Txt muted>
                {review.serviceName} ·{" "}
                {date(review.eventDate || review.createdAt)}
              </Txt>
              <Txt>{reviewText(review)}</Txt>
              {!!review.vendorReply?.text && (
                <Card>
                  <Txt bold>Your reply</Txt>
                  <Txt>{review.vendorReply.text}</Txt>
                  <Txt muted>{date(review.vendorReply.repliedAt)}</Txt>
                </Card>
              )}
              <Button
                title={
                  review.vendorReply?.text
                    ? "Edit your reply"
                    : "Reply to review"
                }
                secondary
                onPress={() =>
                  navigation.navigate("VendorForm", {
                    kind: "review",
                    item: { ...review, notes: review.vendorReply?.text || "" },
                  })
                }
              />
            </Card>
          ))}
          {!r.data.reviews?.length && (
            <Empty
              title="No STARVNT reviews yet"
              description="Published reviews from your customers will appear here."
            />
          )}
        </>
      )}
      {tab === "google" &&
        (google ? (
          <>
            <Card>
              <Txt bold size={24}>
                {google.rating} / 5
              </Txt>
              <Txt>{google.reviewCount} public reviews</Txt>
              <Txt muted>{google.address}</Txt>
              {google.googleMapsUrl && (
                <Button
                  title="Open Google listing"
                  secondary
                  onPress={() =>
                    a.run(async () => {
                      if (!/^https?:\/\//i.test(google.googleMapsUrl))
                        throw new Error("This listing link is unavailable.");
                      await Linking.openURL(google.googleMapsUrl);
                    })
                  }
                />
              )}
            </Card>
            {(google.reviews || []).map((review: Data, index: number) => (
              <Card key={index}>
                <Txt bold>
                  {reviewerName(review)} · {review.rating} / 5
                </Txt>
                <Txt muted>{review.relativePublishTimeDescription}</Txt>
                <Txt>{reviewText(review)}</Txt>
              </Card>
            ))}
          </>
        ) : (
          <Empty
            title="No Google rating linked"
            description="Link your Google place in your business profile to show public ratings."
          />
        ))}
    </Page>
  );
}
