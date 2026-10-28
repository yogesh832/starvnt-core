import React, { useState } from "react";
import { View } from "react-native";
import { internal } from "../api/runtime";
import { useSession } from "../auth/Session";
import type { Data } from "../api/client";
import { openEvidence } from "./AdminActions";
import {
  Button,
  Card,
  Choice,
  ErrorNotice,
  Field,
  Icon,
  Page,
  Pill,
  Stats,
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

export function AdminBooking({ route, navigation }: any) {
  const r = useResource(
    internal,
    `/operations/bookings/${encodeURIComponent(id(route.params.record))}`,
  );
  const { can } = useSession();
  const a = useAction();
  const c = usePalette();
  const [tab, setTab] = useState("overview");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const b: Data = r.data.booking || {};
  const mutate = (path: string, body: Data, title: string) =>
    confirm(
      title,
      "Core checks the recorded evidence and your permissions before changing this booking.",
      () => {
        void a.run(async () => {
          if (!reason.trim())
            throw new Error("Add review notes for the audit trail.");
          await internal.call(
            `/operations/bookings/${encodeURIComponent(id(b))}/${path}`,
            "POST",
            { ...body, notes: reason.trim(), reason: reason.trim() },
          );
          r.refresh();
        });
      },
    );
  const evidence = b.completionEvidence || [];
  return (
    <Page
      {...r}
      title={b.bookingReference || "Booking detail"}
      subtitle={b.serviceName}
    >
      <Choice
        label="Booking workspace"
        value={tab}
        values={["overview", "financials", "evidence", "actions"]}
        onChange={setTab}
      />
      <ErrorNotice message={a.error} />
      {tab === "overview" && (
        <>
          <Card>
            <Pill>{human(b.bookingStatus || "Pending")}</Pill>
            <Txt bold size={22}>
              {b.serviceName}
            </Txt>
            <Txt>{date(b.eventDate)}</Txt>
            <Txt>Customer: {b.customerName || "Not recorded"}</Txt>
            <Txt>Vendor: {b.vendorName || "Not recorded"}</Txt>
            <Txt muted>
              {[
                b.serviceLocation?.address,
                b.serviceLocation?.locality,
                b.serviceLocation?.city,
              ]
                .filter(Boolean)
                .join(", ")}
            </Txt>
            <Txt>Execution: {human(b.executionStatus || "Not started")}</Txt>
            <Txt>Payment: {human(b.paymentStatus || "Pending")}</Txt>
            <Txt>Settlement: {human(b.settlementStatus || "Not eligible")}</Txt>
          </Card>
          {(b.disputes || []).map((item: Data, index: number) => (
            <Card key={item._id || index}>
              <Pill>DISPUTE</Pill>
              <Txt>{item.reason || item.description || "Dispute recorded"}</Txt>
              <Txt muted>{human(item.status || "")}</Txt>
            </Card>
          ))}
        </>
      )}
      {tab === "financials" && (
        <>
          <Stats
            items={[
              ["Booking total", money(b.totalAmount)],
              ["Paid", money(b.paymentSummary?.paidAmount)],
              ["Balance", money(b.paymentSummary?.balanceAmount)],
              [
                "Vendor payable",
                money(
                  b.taxSummary?.vendorPayable ?? b.vendorSettlement?.amount,
                ),
              ],
            ]}
          />
          {[
            ["Pricing", b.pricing || b.pricingBreakdown],
            ["Payment details", b.paymentSummary],
            ["Tax & fees", b.taxSummary],
            ["Vendor settlement", b.vendorSettlement],
          ].map(
            ([label, object]: any) =>
              object && (
                <Card key={label}>
                  <Txt bold>{label}</Txt>
                  {Object.entries(object)
                    .filter(
                      ([key, value]) =>
                        value != null &&
                        typeof value !== "object" &&
                        key !== "_id",
                    )
                    .map(([key, value]) => (
                      <Txt key={key} size={13}>
                        {human(key.replace(/([a-z])([A-Z])/g, "$1 $2"))}:{" "}
                        {typeof value === "number"
                          ? /percent|percentage/i.test(key)
                            ? `${value}%`
                            : money(value)
                          : String(value)}
                      </Txt>
                    ))}
                </Card>
              ),
          )}
        </>
      )}
      {tab === "evidence" && (
        <>
          {!evidence.length && (
            <Card>
              <Txt>No completion evidence has been submitted.</Txt>
            </Card>
          )}
          {evidence.map((item: Data, index: number) => (
            <Card key={item._id || index}>
              <Pill>COMPLETION EVIDENCE</Pill>
              <Txt muted>{date(item.submittedAt)}</Txt>
              {item.notes && <Txt>{item.notes}</Txt>}
              {(item.checklist || []).map((check: Data, i: number) => (
                <View
                  key={i}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Icon
                    name={check.checked ? "checkmark-circle" : "ellipse-outline"}
                    size={17}
                    color={check.checked ? c.success : c.muted}
                  />
                  <Txt style={{ flex: 1 }}>{check.item}</Txt>
                </View>
              ))}
              {item.deliverablesUrl && (
                <Button
                  title="Open delivery evidence"
                  secondary
                  onPress={() => {
                    void a.run(() => openEvidence(item.deliverablesUrl));
                  }}
                />
              )}
              {(item.files || []).map((file: Data, i: number) => (
                <Button
                  key={file.url || i}
                  title={`Open ${file.name || file.resourceType || "file"}`}
                  secondary
                  onPress={() => {
                    void a.run(() => openEvidence(file.url));
                  }}
                />
              ))}
              {[...(item.photos || []), ...(item.videos || [])]
                .filter(
                  (url) =>
                    !(item.files || []).some((file: Data) => file.url === url),
                )
                .map((url: string, i: number) => (
                  <Button
                    key={`${url}-${i}`}
                    title={`Open evidence asset ${i + 1}`}
                    secondary
                    onPress={() => {
                      void a.run(() => openEvidence(url));
                    }}
                  />
                ))}
            </Card>
          ))}
        </>
      )}
      {tab === "actions" && (
        <>
          <Field
            label="Review notes / reason"
            value={reason}
            onChangeText={setReason}
            multiline
          />
          {can("payments.approve") && (
            <Card>
              <Field
                label="Verified payment ledger reference"
                value={reference}
                onChangeText={setReference}
              />
              <Button
                title="Verify recorded payment"
                busy={a.busy}
                disabled={!reference.trim()}
                onPress={() =>
                  mutate(
                    "verify-payment",
                    { transactionReference: reference.trim() },
                    "Verify this payment evidence?",
                  )
                }
              />
            </Card>
          )}
          {can("operations.manage") && (
            <Card>
              <Txt bold>Completion review</Txt>
              <Txt muted>
                Inspect the submitted files and notes before recording a
                decision.
              </Txt>
              <Button
                title="Validate service completion"
                busy={a.busy}
                disabled={!evidence.length}
                onPress={() =>
                  mutate(
                    "validate-completion",
                    { approved: true },
                    "Validate completion?",
                  )
                }
              />
              <Button
                title="Reject completion evidence"
                secondary
                busy={a.busy}
                disabled={!evidence.length}
                onPress={() =>
                  mutate(
                    "validate-completion",
                    { approved: false },
                    "Reject this completion evidence?",
                  )
                }
              />
            </Card>
          )}
          {[
            ["refund", "payments.refund", "Request refund"],
            ["settle", "settlements.release", "Request settlement release"],
            ["fail-and-reassign", "operations.manage", "Report vendor failure"],
          ].map(
            ([action, permission, title]) =>
              can(permission) && (
                <Button
                  key={action}
                  title={title}
                  secondary
                  onPress={() =>
                    navigation.navigate("AdminFinance", { booking: b, action })
                  }
                />
              ),
          )}
        </>
      )}
    </Page>
  );
}
