import { BookingWorkflow } from '../BookingWorkflow';
import React from "react";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import {
  Button,
  Card,
  Empty,
  ErrorNotice,
  Field,
  Icon,
  MultiChoice,
  Page,
  Pill,
  Txt,
  confirm,
  date,
  human,
  id,
  money,
  useAction,
  usePalette,
  useResource,
} from "../ui";

export function VendorBooking({ route, navigation }: any) {
  return (
    <VendorBookingBody
      key={id(route.params.booking || {})}
      route={route}
      navigation={navigation}
    />
  );
}
function VendorBookingBody({ route, navigation }: any) {
  const initial: Data = route.params.booking;
  const r = useResource(external, "/vendor/bookings");
  const a = useAction();
  const c = usePalette();
  const booking: Data | undefined = (r.data.bookings || []).find(
    (row: Data) => id(row) === id(initial),
  );
  const b = booking || initial;
  const paymentReady =
    b.paymentStatus === "PAYMENT_VERIFIED" && b.bookingStatus === "CONFIRMED";
  return (
    <Page
      {...r}
      title={b.serviceName || "Booking"}
      subtitle={b.bookingReference}
    >
      {!booking ? (
        <Empty
          title="This booking is no longer available"
          description="Return to your bookings and refresh the list."
        />
      ) : (
        <>
          <Card>
            <Pill>{human(b.executionStatus || "Scheduled")}</Pill>
            <Txt>{date(b.eventDate)}</Txt>
            <Txt muted>{human(b.paymentStatus)}</Txt>
            {b.payoutReviewAt && b.settlementStatus !== 'SETTLEMENT_ELIGIBLE' && <Txt muted>Payout review opens {date(b.payoutReviewAt)}. Core will validate settlement eligibility then.</Txt>}
            <Txt bold>
              {money(b.totalAmount || b.pricingBreakdown?.totalAmount)}
            </Txt>
            {b.customerName && <Txt>{b.customerName}</Txt>}
            {b.serviceLocation && (
              <Txt muted>
                {[
                  b.serviceLocation.address,
                  b.serviceLocation.locality,
                  b.serviceLocation.city,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </Txt>
            )}
          </Card>
          <ErrorNotice message={a.error} />
          {!paymentReady && (
            <Txt muted>
              Payment verification is required before you can start or complete
              this service.
            </Txt>
          )}
          <Button
            title="Open booking conversation"
            secondary
            busy={a.busy}
            onPress={() => {
              void a.run(async () => {
                const result = await external.call(
                  `/vendor/bookings/${encodeURIComponent(id(b))}/message-thread`,
                  "POST",
                );
                navigation.navigate("Chat", {
                  kind: "thread",
                  threadId: id(result.thread),
                  vendor: true,
                });
              });
            }}
          />
          <BookingWorkflow bookingId={id(b)} />
        </>
      )}
    </Page>
  );
}
