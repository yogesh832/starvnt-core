import React, { useState } from "react";
import { Image, Linking, View } from "react-native";
import { external } from "../api/runtime";
import { pickUploads } from "../api/upload";
import type { Data } from "../api/client";
import { completionPayload } from "../vendorCommerce";
import { VendorMessageField } from "../VendorMessageField";
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
  const [notes, setNotes] = useState("");
  const [url, setUrl] = useState("");
  const [assets, setAssets] = useState<Data[]>([]);
  const [extraItem, setExtraItem] = useState("");
  const [checklist, setChecklist] = useState<Data[]>([
    { item: "Service executed and on-site scope completed", checked: false },
    { item: "Deliverables and evidence attached", checked: false },
    { item: "Client walkthrough / handover completed", checked: false },
  ]);
  const b = booking || initial;
  const done = ["COMPLETION_SUBMITTED", "COMPLETION_VERIFIED"].includes(
    b.executionStatus,
  );
  const closed =
    done ||
    ["CANCELLED", "CANCELED", "REFUNDED"].includes(b.bookingStatus || b.status);
  const paymentReady =
    b.paymentStatus === "PAYMENT_VERIFIED" && b.bookingStatus === "CONFIRMED";
  const open = (value: string) => {
    void a.run(async () => {
      if (!/^https?:\/\//i.test(value))
        throw new Error("This evidence link is not available.");
      await Linking.openURL(value);
    });
  };
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
          {!closed && b.executionStatus !== "SERVICE_STARTED" && (
            <Button
              title="Mark service as started"
              disabled={!paymentReady}
              secondary
              busy={a.busy}
              onPress={() =>
                confirm(
                  "Start this service?",
                  "This records that service delivery has begun and notifies the customer.",
                  () => {
                    void a.run(async () => {
                      await external.call(
                        `/vendor/bookings/${encodeURIComponent(id(b))}/start`,
                        "POST",
                      );
                      r.refresh();
                    });
                  },
                )
              }
            />
          )}
          {(b.completionEvidence || []).map((entry: Data, index: number) => (
            <Card key={entry._id || index}>
              <Pill>SUBMITTED EVIDENCE</Pill>
              <Txt muted size={12}>
                {date(entry.submittedAt)}
              </Txt>
              {entry.notes && <Txt>{entry.notes}</Txt>}
              {(entry.checklist || []).map((item: Data, i: number) => (
                <View
                  key={i}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Icon
                    name={item.checked ? "checkmark-circle" : "ellipse-outline"}
                    size={17}
                    color={item.checked ? c.success : c.muted}
                  />
                  <Txt key={i} size={13} style={{ flex: 1 }}>
                    {item.item}
                  </Txt>
                </View>
              ))}
              {entry.deliverablesUrl && (
                <Button
                  title="Open delivery link"
                  secondary
                  onPress={() => open(entry.deliverablesUrl)}
                />
              )}
              {(entry.files || []).map((file: Data, i: number) => (
                <Button
                  key={file.url || i}
                  title={`Open ${file.name || (file.resourceType === "VIDEO" ? "video" : "evidence file")}`}
                  secondary
                  onPress={() => open(file.url)}
                />
              ))}
            </Card>
          ))}
          {done && (
            <Card>
              <Txt bold>
                {b.executionStatus === "COMPLETION_VERIFIED"
                  ? "Completion verified"
                  : "Completion submitted for review"}
              </Txt>
              <Txt muted>
                Customer and Core review control verification and settlement.
                Your submission stays available in this booking.
              </Txt>
            </Card>
          )}
          {!closed &&
            paymentReady &&
            b.executionStatus === "SERVICE_STARTED" && (
              <>
                <Card>
                  <Txt bold size={22}>
                    Completion evidence
                  </Txt>
                  <Field
                    label="Delivery / evidence URL (optional)"
                    value={url}
                    onChangeText={setUrl}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                  <VendorMessageField
                    label="Completion notes"
                    value={notes}
                    onChange={setNotes}
                    context={{ type: "booking", id: id(b) }}
                    disabled={a.busy}
                  />
                  <Button
                    title="Upload photos, videos or files"
                    secondary
                    busy={a.busy}
                    onPress={() => {
                      void a.run(async () => {
                        const result = await pickUploads();
                        setAssets((current) => [...current, ...result.uploads]);
                        if (result.failures.length)
                          throw new Error(
                            `Some files could not upload. Successfully uploaded files were kept. ${result.failures.join(" · ")}`,
                          );
                      });
                    }}
                  />
                  {assets.map((asset, index) => (
                    <Card key={`${asset.publicId || asset.url}-${index}`}>
                      {asset.resourceType === "IMAGE" &&
                        /\.(png|jpe?g|webp|gif)(?:\?|$)/i.test(
                          asset.filename || asset.url,
                        ) && (
                          <Image
                            source={{ uri: asset.thumbnailUrl || asset.url }}
                            style={{
                              width: "100%",
                              height: 170,
                              borderRadius: 14,
                            }}
                            resizeMode="cover"
                          />
                        )}
                      <Txt bold>{asset.filename || "Uploaded evidence"}</Txt>
                      <Pill>{human(asset.resourceType || "File")}</Pill>
                      <Button
                        title="Preview file"
                        secondary
                        onPress={() => open(asset.url)}
                      />
                      <Button
                        title="Remove from this draft"
                        secondary
                        disabled={a.busy}
                        onPress={() =>
                          setAssets((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      />
                    </Card>
                  ))}
                </Card>
                <Card>
                  <Txt bold size={20}>
                    Execution checklist
                  </Txt>
                  <Txt muted size={13}>
                    Check only the items that are complete.
                  </Txt>
                  <MultiChoice
                    label="Completed items"
                    values={checklist.map((_, index) => String(index))}
                    labels={Object.fromEntries(
                      checklist.map((item, index) => [
                        String(index),
                        item.item,
                      ]),
                    )}
                    selected={checklist.flatMap((item, index) =>
                      item.checked ? [String(index)] : [],
                    )}
                    onChange={(selected) =>
                      setChecklist((current) =>
                        current.map((item, index) => ({
                          ...item,
                          checked: selected.includes(String(index)),
                        })),
                      )
                    }
                  />
                  <Field
                    label="Additional checklist item"
                    value={extraItem}
                    onChangeText={setExtraItem}
                    maxLength={160}
                  />
                  <Button
                    title="Add checklist item"
                    secondary
                    disabled={!extraItem.trim()}
                    onPress={() => {
                      setChecklist((current) => [
                        ...current,
                        { item: extraItem.trim(), checked: false },
                      ]);
                      setExtraItem("");
                    }}
                  />
                </Card>
                <ErrorNotice message={a.error} />
                <Button
                  title="Submit completion for review"
                  busy={a.busy}
                  onPress={() => {
                    void a.run(async () => {
                      await external.call(
                        `/vendor/bookings/${encodeURIComponent(id(b))}/submit-completion`,
                        "POST",
                        completionPayload(url, notes, assets, checklist),
                      );
                      setAssets([]);
                      setNotes("");
                      setUrl("");
                      r.refresh();
                    });
                  }}
                />
              </>
            )}
        </>
      )}
    </Page>
  );
}
