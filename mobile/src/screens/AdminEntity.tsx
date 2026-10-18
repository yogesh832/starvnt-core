import React, { useState } from "react";
import { internal } from "../api/runtime";
import type { Data } from "../api/client";
import { useSession } from "../auth/Session";
import {
  Button,
  Card,
  Choice,
  ErrorNotice,
  Field,
  Page,
  Txt,
  confirm,
  id,
  useAction,
} from "../ui";

export function AdminEntity({ route, navigation }: any) {
  const { kind, item, action = "edit" } = route.params;
  const vendor = kind === "vendors";
  const { can } = useSession();
  const permission = `${vendor ? "vendors" : "customers"}.${action === "restrict" ? "disable" : action === "deactivate" ? "delete" : "update"}`;
  const allowed = can(permission);
  const path = `/external-users/${vendor ? "organizations" : "customers"}/${encodeURIComponent(id(item))}`;
  const a = useAction();
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("7");
  const [form, setForm] = useState<Data>({
    fullName: item.fullName || "",
    email: item.email || "",
    phone: item.phone || item.owner?.phone || "",
    businessName: item.businessName || "",
    category: item.category || "",
    location: item.location || "",
    website: item.website || "",
    bio: item.bio || "",
    status: item.status || "ACTIVE",
  });
  const field = (key: string, label: string) => (
    <Field
      key={key}
      label={label}
      value={form[key]}
      onChangeText={(value) =>
        setForm((current) => ({ ...current, [key]: value }))
      }
      autoCapitalize={
        key === "email" || key === "website" ? "none" : "sentences"
      }
      keyboardType={
        key === "email"
          ? "email-address"
          : key === "phone"
            ? "phone-pad"
            : "default"
      }
      multiline={key === "bio"}
    />
  );
  async function save() {
    if (!allowed)
      throw new Error("Your account does not have permission for this action.");
    if (!reason.trim()) throw new Error("Add a reason for the audit log.");
    if (action === "restrict") {
      if (!Number.isInteger(Number(days)) || Number(days) < 0)
        throw new Error(
          "Enter a whole number of days, or 0 to remove the restriction.",
        );
      await internal.call(`${path}/restrict`, "POST", {
        days: Number(days),
        reason: reason.trim(),
      });
    } else if (action === "deactivate") {
      await internal.call(path, "DELETE", { reason: reason.trim() });
    } else {
      const keys = vendor
        ? [
            "businessName",
            "category",
            "phone",
            "location",
            "website",
            "bio",
            "status",
          ]
        : ["fullName", "email", "phone", "status"];
      const body = Object.fromEntries(
        keys.map((key) => [key, String(form[key] || "").trim()]),
      );
      if ((vendor && !body.businessName) || (!vendor && !body.fullName))
        throw new Error("Enter the account name.");
      await internal.call(path, "PATCH", { ...body, reason: reason.trim() });
    }
    navigation.popTo("AdminModule", { module: kind });
  }
  return (
    <Page
      title={
        action === "restrict"
          ? "Manage account restriction"
          : action === "deactivate"
            ? "Deactivate account"
            : `Edit ${vendor ? "vendor" : "customer"}`
      }
      subtitle={item.businessName || item.fullName || item.email}
    >
      {!allowed ? (
        <Txt>Your account does not have permission for this action.</Txt>
      ) : (
        <>
          {action === "edit" && (
            <Card>
              {(vendor
                ? [
                    ["businessName", "Business name"],
                    ["category", "Category"],
                    ["phone", "Phone"],
                    ["location", "Location"],
                    ["website", "Website"],
                    ["bio", "Business description"],
                  ]
                : [
                    ["fullName", "Full name"],
                    ["email", "Email address"],
                    ["phone", "Phone"],
                  ]
              ).map(([key, label]) => field(key, label))}
              <Choice
                label="Status"
                value={form.status}
                values={
                  vendor
                    ? [
                        "ACTIVE",
                        "PENDING",
                        "VERIFIED",
                        "PROFILE_INCOMPLETE",
                        "SUSPENDED",
                        "REJECTED",
                      ]
                    : ["ACTIVE", "SUSPENDED", "DISABLED"]
                }
                onChange={(status) =>
                  setForm((value) => ({ ...value, status }))
                }
              />
            </Card>
          )}
          {action === "restrict" && (
            <Card>
              <Txt>
                {item.isRestricted
                  ? "This account is currently restricted."
                  : "Choose how long this account should be restricted."}
              </Txt>
              {item.restrictionReason && (
                <Txt muted>{item.restrictionReason}</Txt>
              )}
              <Choice
                label="Restriction period"
                value={days}
                values={["0", "1", "7", "30", "90"]}
                labels={{
                  "0": "Remove restriction",
                  "1": "1 day",
                  "7": "7 days",
                  "30": "30 days",
                  "90": "90 days",
                }}
                onChange={setDays}
              />
              <Field
                label="Days (0 removes restriction)"
                value={days}
                onChangeText={setDays}
                keyboardType="number-pad"
              />
            </Card>
          )}
          {action === "deactivate" && (
            <Card>
              <Txt>
                This disables account access while retaining linked documents
                and history. Existing sessions are subject to the server’s
                account checks.
              </Txt>
            </Card>
          )}
          <Field
            label="Reason for this change"
            value={reason}
            onChangeText={setReason}
            multiline
          />
          <ErrorNotice message={a.error} />
          <Button
            title={
              action === "edit"
                ? "Save account details"
                : action === "restrict"
                  ? Number(days) === 0
                    ? "Remove restriction"
                    : "Apply restriction"
                  : "Deactivate account"
            }
            busy={a.busy}
            onPress={() => {
              if (action === "edit") void a.run(save);
              else
                confirm(
                  action === "deactivate"
                    ? "Deactivate this account?"
                    : "Change this account’s restriction?",
                  "Core will apply your permissions, preserve linked history, and audit the reason.",
                  () => {
                    void a.run(save);
                  },
                );
            }}
          />
        </>
      )}
    </Page>
  );
}
