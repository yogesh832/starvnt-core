import React, { useState } from "react";
import { Linking } from "react-native";
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
  money,
  Page,
  Pill,
  Stats,
  Txt,
  useAction,
  useResource,
} from "../ui";

export function VendorAnalytics() {
  const counts = useResource(external, "/vendor/badge-counts");
  const bookings = useResource(external, "/vendor/bookings");
  const totals = vendorInsightTotals(bookings.data.bookings || []);
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
      <Txt muted>
        Counts reflect the current backend state. Recorded booking value is not
        the amount released to your bank.
      </Txt>
    </Page>
  );
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
            ["In escrow", money(totals.escrow)],
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
