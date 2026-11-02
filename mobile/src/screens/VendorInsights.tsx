import { VendorBusinessPage } from './VendorBusiness';
import React, { useState } from "react";
import { Linking } from "react-native";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import {
  reviewText,
  reviewerName,
} from "../vendorInsights";
import {
  Button,
  Card,
  Choice,
  date,
  Empty,
  ErrorNotice,
  id,
  Page,
  Pill,
  Stats,
  Txt,
  useAction,
  useResource,
} from "../ui";

export function VendorAnalytics({ navigation }: any) {
  return <VendorBusinessPage navigation={navigation} mode="analytics" />;
}
export function VendorPayments({ navigation }: any) {
  return <VendorBusinessPage navigation={navigation} mode="payments" />;
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
      {!r.loading && !r.error && <Stats
        items={[
          [
            "Average rating",
            stats.totalReviews ? `${stats.averageRating} / 5` : "—",
          ],
          ["Reviews", stats.totalReviews ?? 0],
          [
            "Recommend",
            stats.totalReviews ? stats.recommendPercentage : "Not available",
          ],
        ]}
      />}
      {!r.loading && !r.error && !stats.totalReviews && <Txt muted>No verified reviews yet.</Txt>}
      <Choice
        label="Review source"
        values={["starvnt", "google"]}
        value={tab}
        onChange={setTab}
      />
      {tab === "starvnt" && !r.loading && !r.error && (
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
                    ? "Reply saved"
                    : "Reply to review"
                }
                secondary
                disabled={Boolean(review.vendorReply?.text)}
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
              title="No verified reviews yet."
              description="Published verified STARVNT reviews will appear here."
            />
          )}
        </>
      )}
      {tab === "google" && !r.loading && !r.error &&
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
