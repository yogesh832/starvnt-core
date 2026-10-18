import React, { useState } from "react";
import { Alert, Linking } from "react-native";
import { approvedFinanceExecution } from "../adminOperations";
import { internal } from "../api/runtime";
import { useSession } from "../auth/Session";
import {
  Button,
  Card,
  Choice,
  confirm,
  ErrorNotice,
  Field,
  id,
  MultiChoice,
  Page,
  Txt,
  useAction,
  useResource,
} from "../ui";

export async function openEvidence(url: string) {
  if (!/^https?:\/\//i.test(url || ""))
    throw new Error("This evidence link is not available.");
  await Linking.openURL(url);
}
export function AdminAccess({ route, navigation }: any) {
  const { item = {} } = route.params || {};
  const { admin } = useSession();
  const r = useResource(internal, "/permissions/catalog");
  const a = useAction();
  const [roleKey, setRoleKey] = useState(item.roleKey || "");
  const [permissions, setPermissions] = useState<string[]>(
    item.permissions || [],
  );
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    reason: "",
  });
  const field = (key: keyof typeof form, label: string) => (
    <Field
      label={label}
      value={form[key]}
      secureTextEntry={key === "password"}
      autoCapitalize={
        key === "email" || key === "password" ? "none" : "sentences"
      }
      onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
    />
  );
  return (
    <Page
      {...r}
      title={id(item) ? "Update staff access" : "Welcome someone to the team"}
    >
      {!id(item) && (
        <>
          {field("fullName", "Full name")}
          {field("email", "Email address")}
          {field("password", "Initial password")}
        </>
      )}
      <Choice
        label="Role"
        value={roleKey}
        values={["", ...Object.keys(r.data.rolePresets || {})]}
        labels={{
          "": "Custom permissions",
          ...Object.fromEntries(
            Object.entries(r.data.rolePresets || {}).map(
              ([key, value]: [string, any]) => [key, value.label],
            ),
          ),
        }}
        onChange={setRoleKey}
      />
      {roleKey ? (
        <Card>
          <Txt>{r.data.rolePresets?.[roleKey]?.description}</Txt>
          {(r.data.rolePresets?.[roleKey]?.permissions || []).map(
            (p: string) => (
              <Txt key={p} size={12}>
                {p}
              </Txt>
            ),
          )}
        </Card>
      ) : (
        <MultiChoice
          label="Assigned permissions"
          values={r.data.all || []}
          selected={permissions}
          onChange={setPermissions}
        />
      )}
      {field("reason", "Reason for this access change")}
      <ErrorNotice message={a.error} />
      <Button
        title="Save staff access"
        busy={a.busy}
        disabled={admin?.role !== "SUPER_ADMIN"}
        onPress={() => {
          void a.run(async () => {
            if (admin?.role !== "SUPER_ADMIN")
              throw new Error("Super admin access is required.");
            if (!form.reason.trim())
              throw new Error("Add a reason for the audit log.");
            const body = { ...form, roleKey, permissions };
            await internal.call(
              id(item) ? `/users/${id(item)}/permissions` : "/users",
              id(item) ? "PATCH" : "POST",
              body,
            );
            navigation.goBack();
          });
        }}
      />
    </Page>
  );
}
export function AdminFinance({ route, navigation }: any) {
  const { booking, approval, action: requestedAction } = route.params;
  const action = approval
    ? approval.type === "REFUND"
      ? "refund"
      : "settle"
    : requestedAction;
  const { can, admin } = useSession();
  const a = useAction();
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const allowed =
    (!approval ||
      (approval.status === "APPROVED" &&
        approval.requestedByEmail?.toLowerCase() !==
          admin?.email?.toLowerCase())) &&
    can(
      action === "refund"
        ? "payments.refund"
        : action === "settle"
          ? "settlements.release"
          : "operations.manage",
    );
  return (
    <Page
      title={
        approval
          ? action === "refund"
            ? "Execute approved refund"
            : "Execute approved settlement"
          : action === "refund"
            ? "Request a refund"
            : action === "settle"
              ? "Request settlement release"
              : "Report vendor failure"
      }
      subtitle={booking.bookingReference}
    >
      <Card>
        <Txt bold>{booking.serviceName}</Txt>
        <Txt muted>
          Core enforces payment evidence, completion state, and approval
          separation.
        </Txt>
      </Card>
      {approval && (
        <Card>
          <Txt bold>Approved request</Txt>
          <Txt>Requested by: {approval.requestedByEmail}</Txt>
          <Txt>
            Approved by: {approval.approvedByEmail || "Recorded by Core"}
          </Txt>
          <Txt>
            Reference:{" "}
            {approval.payload?.reference ||
              approval.payload?.transactionReference}
          </Txt>
          {approval.type === "REFUND" && (
            <Txt>Approved amount: ₹{approval.payload?.amount}</Txt>
          )}
          <Txt muted>{approval.reason}</Txt>
          <Txt muted>
            The approved amount and transfer reference are fixed for this
            execution.
          </Txt>
        </Card>
      )}
      {!approval && action !== "fail-and-reassign" && (
        <Field
          label="Real provider / transfer reference"
          value={reference}
          onChangeText={setReference}
        />
      )}
      {!approval && action === "refund" && (
        <Field
          label="Refund amount in ₹"
          keyboardType="number-pad"
          value={amount}
          onChangeText={setAmount}
        />
      )}
      <Field
        label="Reason and supporting notes"
        value={reason}
        onChangeText={setReason}
        multiline
      />
      <ErrorNotice message={a.error} />
      <Button
        title={
          approval
            ? action === "refund"
              ? "Execute approved refund"
              : "Execute approved settlement"
            : action === "fail-and-reassign"
              ? "Report failure & discover alternatives"
              : "Submit for independent approval"
        }
        busy={a.busy}
        disabled={!allowed}
        onPress={() =>
          confirm(
            approval
              ? "Execute this approved finance request?"
              : "Submit this action?",
            approval
              ? "Core will post the approved finance action using its recorded amount and reference. The requesting admin cannot execute their own request."
              : "The server validates this request and records it for audit. Finance requests require a different authorized admin’s approval.",
            () => {
              void a.run(async () => {
                if (!allowed)
                  throw new Error(
                    "You do not have permission for this action.",
                  );
                if (approval) {
                  if (!reason.trim())
                    throw new Error("Add execution notes for the audit trail.");
                  const execution = approvedFinanceExecution(
                    approval,
                    admin?.email || "",
                    reason,
                  );
                  await internal.call(execution.path, "POST", execution.body);
                  Alert.alert(
                    "Approved finance action recorded",
                    "Review the updated booking and ledger for the result.",
                  );
                  navigation.popTo("AdminModule", { module: "approvals" });
                  return;
                }
                if (
                  !reason.trim() ||
                  (action !== "fail-and-reassign" && !reference.trim())
                )
                  throw new Error("Complete the reference and reason.");
                if (
                  action === "refund" &&
                  (!Number.isFinite(Number(amount)) || Number(amount) <= 0)
                )
                  throw new Error("Enter a valid refund amount.");
                const data = await internal.call(
                  `/operations/bookings/${id(booking)}/${action}`,
                  "POST",
                  {
                    reason,
                    notes: reason,
                    reference,
                    transactionReference: reference,
                    ...(action === "refund" ? { amount: Number(amount) } : {}),
                  },
                );
                Alert.alert(
                  data.pendingApproval ? "Approval requested" : "Core updated",
                  data.message ||
                    "Review the refreshed booking and audit history for the recorded result.",
                );
                navigation.goBack();
              });
            },
          )
        }
      />
    </Page>
  );
}
