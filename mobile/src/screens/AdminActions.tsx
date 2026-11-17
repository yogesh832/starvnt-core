import { BookingWorkflow } from '../BookingWorkflow';
import * as Crypto from 'expo-crypto';
import { openPrivateMedia } from '../privateMedia';
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
  if (/^asset:[a-f0-9]{24}$/i.test(url || '')) return openPrivateMedia(internal, `/collaboration/media/${url.slice(6)}/file`, url.slice(6));
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
export function AdminFinance({ route }: any) {
  const { booking, approval, action: requestedAction } = route.params;
  const action = useAction();
  const [reason, setReason] = useState('');
  const { can } = useSession();
  return <Page title="Finance processing and reconciliation" subtitle={booking.bookingReference}>
    {approval && <Card><Txt>Legacy approval {approval._id} remains in the audit history. A finance operation with independent evidence and reconciliation is required to record an actual outcome.</Txt></Card>}
    {requestedAction === 'fail-and-reassign' && can('operations.manage') && <Card>
      <Field label="Failure reason" value={reason} onChangeText={setReason} multiline />
      <ErrorNotice message={action.error} />
      <Button title="Report failure and discover alternatives" busy={action.busy} disabled={!reason.trim()} onPress={() => void action.run(() => internal.call(`/operations/bookings/${id(booking)}/fail-and-reassign`, 'POST', { reason, idempotencyKey: Crypto.randomUUID() }))} />
    </Card>}
    <BookingWorkflow bookingId={id(booking)} admin />
  </Page>;
}
