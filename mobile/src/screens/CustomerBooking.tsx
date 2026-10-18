import React, { useState } from "react";
import { Image, Linking } from "react-native";
import type { Data } from "../api/client";
import { external } from "../api/runtime";
import { completionEvidence } from "../completionEvidence";
import {
  Button,
  Card,
  Choice,
  confirm,
  Empty,
  ErrorNotice,
  Field,
  human,
  id,
  money,
  Page,
  Pill,
  Txt,
  useAction,
  useResource,
} from "../ui";

export function CustomerBookingScreen({ route, navigation }: any) {
  return (
    <CustomerBookingBody
      key={`${route.params.eventId}-${route.params.bookingId}`}
      route={route}
      navigation={navigation}
    />
  );
}
function CustomerBookingBody({ route, navigation }: any) {
  const { eventId, bookingId } = route.params;
  const r = useResource(
    external,
    `/customer/events/${encodeURIComponent(eventId)}/bookings`,
  );
  const booking: Data | undefined = (r.data.bookings || []).find(
    (b: Data) => id(b) === bookingId,
  );
  const evidence = completionEvidence(
    booking?.completionEvidence || booking?.evidence,
  );
  const a = useAction();
  const [acknowledged, setAcknowledged] = useState("no");
  const [notes, setNotes] = useState("");
  const canVerify =
    booking?.executionStatus === "COMPLETION_SUBMITTED" &&
    (evidence.notes.length > 0 ||
      evidence.files.length > 0 ||
      evidence.checklist.length > 0);
  return (
    <Page
      {...r}
      title={booking?.vendorName || "Booking evidence"}
      subtitle={booking?.packageName}
    >
      <ErrorNotice message={a.error} />
      {!booking && (
        <Empty
          title="Booking unavailable"
          description="This booking was not found in your event."
        />
      )}
      {booking && (
        <>
          <Pill>{human(booking.executionStatus || booking.status)}</Pill>
          <Txt>
            Paid: {money(booking.paidAmount)} · Balance:{" "}
            {money(booking.balanceAmount)}
          </Txt>
          <Txt bold size={23}>
            Proof of work
          </Txt>
          {evidence.notes.map((note, index) => (
            <Card key={index}>
              <Txt>{note}</Txt>
            </Card>
          ))}
          {evidence.files.map((file) => (
            <Card key={file.url}>
              {file.image && (
                <Image
                  source={{ uri: file.url }}
                  style={{ width: "100%", height: 230, borderRadius: 16 }}
                  resizeMode="contain"
                  accessibilityLabel={file.label}
                />
              )}
              <Button
                title={`Open ${file.label}`}
                secondary
                onPress={() =>
                  a.run(async () => {
                    await Linking.openURL(file.url);
                  })
                }
              />
            </Card>
          ))}
          {!!evidence.checklist.length && (
            <Card>
              <Txt bold>Vendor's checklist</Txt>
              {evidence.checklist.map((check, index) => (
                <Txt key={index}>
                  {check.checked ? "✓" : "○"}{" "}
                  {check.item || check.label || "Deliverable"}
                </Txt>
              ))}
            </Card>
          )}
          {!evidence.notes.length &&
            !evidence.files.length &&
            !evidence.checklist.length && (
              <Empty
                title="No completion evidence submitted"
                description="The vendor must submit proof of work before completion can be reviewed."
              />
            )}
          {canVerify && (
            <Card>
              <Txt bold>Review before approving</Txt>
              <Txt>
                Confirm only after you have inspected the submitted evidence and
                received the booked service.
              </Txt>
              <Choice
                label="I have reviewed the evidence and received the service"
                values={["no", "yes"]}
                value={acknowledged}
                onChange={setAcknowledged}
              />
              <Field
                label="Completion notes (optional)"
                multiline
                value={notes}
                maxLength={2000}
                onChangeText={setNotes}
                editable={!a.busy}
              />
              <Button
                title="Confirm service completion"
                busy={a.busy}
                disabled={acknowledged !== "yes"}
                onPress={() =>
                  confirm(
                    "Confirm completion?",
                    "This records your approval of the delivered service. Core remains responsible for settlement.",
                    () =>
                      a.run(async () => {
                        await external.call(
                          `/customer/bookings/${encodeURIComponent(bookingId)}/verify-completion`,
                          "POST",
                          { notes: notes.trim() },
                        );
                        setAcknowledged("no");
                        await r.refresh();
                      }),
                  )
                }
              />
            </Card>
          )}
          <Button
            title="Ask the vendor about this booking"
            secondary
            onPress={() =>
              navigation.navigate("Chat", {
                kind: "circle",
                eventId,
                bookingId,
                title: booking.vendorName,
              })
            }
          />
        </>
      )}
    </Page>
  );
}
