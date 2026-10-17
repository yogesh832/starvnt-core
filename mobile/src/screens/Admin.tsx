import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { internal } from "../api/runtime";
import type { Data } from "../api/client";
import { useSession } from "../auth/Session";
import { openEvidence } from "./AdminActions";
import { adminModules, visibleModules } from "../adminModules";
import {
  loadAdminNotifications,
  notificationReadKey,
} from "../../../web/src/lib/adminNotifications";
import {
  Button,
  Card,
  Choice,
  confirm,
  date,
  Empty,
  ErrorNotice,
  Field,
  human,
  id,
  MenuRow,
  money,
  Page,
  Pill,
  Stats,
  Txt,
  useAction,
  useResource,
} from "../ui";

export function AdminHome({ navigation }: any) {
  const { admin, can } = useSession();
  const modules = visibleModules(admin);
  const report = can("analytics.read") || can("reports.read");
  const r = useResource(internal, report ? "/reports/summary" : "/auth/me");
  return (
    <Page
      {...r}
      title="A clear view of Core."
      subtitle={`Welcome, ${admin?.fullName || "team"}.`}
    >
      <Pill>{human(admin?.role)}</Pill>
      {report && (
        <Stats
          items={[
            ["Customers · 30 days", r.data.metrics?.newCustomers ?? "—"],
            ["Bookings · 30 days", r.data.metrics?.bookings ?? "—"],
            [
              "Platform fees · 30 days",
              r.data.metrics?.revenue == null
                ? "—"
                : money(r.data.metrics.revenue),
            ],
            ["Average review", r.data.metrics?.averageRating ?? "No reviews"],
          ]}
        />
      )}
      {modules.map((m) => (
        <MenuRow
          key={m.key}
          title={m.title}
          onPress={() => navigation.navigate("AdminModule", { module: m.key })}
        />
      ))}
      {!modules.length && (
        <Empty
          title="No modules assigned"
          description="Your administrator can grant access to the modules you need."
        />
      )}
    </Page>
  );
}
export function AdminNotifications({ navigation }: any) {
  const { admin, can } = useSession();
  const source = useMemo(
    () => ({
      ...internal,
      call: async () =>
        loadAdminNotifications(can, (path) => internal.call(path)),
    }),
    [admin],
  );
  const r = useResource(source, "notifications");
  const [read, setRead] = useState<string[]>([]);
  return (
    <Page
      {...r}
      title="Core updates"
      subtitle="The same permission-aware queues as the web console."
    >
      {r.data.incomplete && (
        <ErrorNotice message="Some sources could not be refreshed. Available updates are shown below." />
      )}
      <Button
        title="Mark current updates as read"
        secondary
        onPress={() => setRead((r.data.items || []).map(notificationReadKey))}
      />
      {(r.data.items || []).map((item: any) => (
        <Card
          key={item.id}
          onPress={() => {
            setRead((v) => [...v, notificationReadKey(item)]);
            const key = item.to.split("?")[0].split("/").pop();
            if (adminModules.some((m) => m.key === key))
              navigation.navigate("AdminModule", { module: key });
          }}
        >
          <Pill>
            {read.includes(notificationReadKey(item)) ? "READ" : "NEW"}
          </Pill>
          <Txt bold>{item.title}</Txt>
          <Txt muted>{item.body}</Txt>
        </Card>
      ))}
      {!r.data.items?.length && <Empty title="No new Core activity" />}
    </Page>
  );
}
export function AdminModule({ route, navigation }: any) {
  const { admin, can } = useSession();
  const module = adminModules.find((m) => m.key === route.params.module)!;
  const allowed = visibleModules(admin).includes(module);
  if (!allowed)
    return (
      <Page title="Access unavailable">
        <Txt>Your account does not have access to this module.</Txt>
      </Page>
    );
  return <AdminModuleBody module={module} navigation={navigation} can={can} />;
}
function AdminModuleBody({ module, navigation, can }: any) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const path = `${module.path}?limit=20${module.paged ? `&skip=${page * 20}&search=${encodeURIComponent(applied)}` : ""}`;
  const r = useResource(internal, path);
  const rows: Data[] = r.data[module.collection] || [];
  const editable =
    module.key === "users" ||
    (module.key === "coupons" && can("settings.update"));
  return (
    <Page
      {...r}
      title={module.title}
      subtitle="Permission controlled. Every action is verified by Core."
    >
      {editable && (
        <Button
          title={module.key === "users" ? "Create admin" : "Create coupon"}
          onPress={() =>
            navigation.navigate(
              module.key === "users" ? "AdminAccess" : "AdminForm",
              { kind: module.key },
            )
          }
        />
      )}
      {module.paged && (
        <>
          <Field
            label="Search"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={() => {
              setApplied(query.trim());
              setPage(0);
            }}
          />
          <Button
            title="Search records"
            secondary
            onPress={() => {
              setApplied(query.trim());
              setPage(0);
            }}
          />
        </>
      )}
      {r.data.stats && (
        <Stats
          items={Object.entries(r.data.stats)
            .filter(([k, v]) => typeof v === "number" && !/Count$/.test(k))
            .map(([k, v]) => [
              human(k.replace(/([a-z])([A-Z])/g, "$1 $2")),
              money(v),
            ])}
        />
      )}
      {rows.map((row, index) => (
        <Card
          key={id(row) || row.key || index}
          onPress={() =>
            navigation.navigate("AdminRecord", {
              module: module.key,
              record: row,
            })
          }
        >
          <Pill>
            {human(
              row.status ||
                row.bookingStatus ||
                row.role ||
                row.discountType ||
                "Record",
            )}
          </Pill>
          <Txt bold size={20}>
            {row.businessName ||
              row.fullName ||
              row.title ||
              row.bookingReference ||
              row.report ||
              row.code ||
              row.label ||
              row.eventType ||
              row.action ||
              row.type ||
              module.title}
          </Txt>
          <Txt muted>
            {row.email ||
              row.serviceName ||
              row.description ||
              row.reason ||
              row.actorEmail ||
              ""}
          </Txt>
          {row.eventDate && <Txt>{date(row.eventDate)}</Txt>}
          {row.totalAmount != null && <Txt bold>{money(row.totalAmount)}</Txt>}
          {row.value != null && typeof row.value !== "object" && (
            <Txt>{String(row.value)}</Txt>
          )}
        </Card>
      ))}
      {!rows.length && <Empty title="No records to show" />}
      {module.paged && (
        <View style={{ gap: 10 }}>
          <Txt muted>
            Page {page + 1} · {r.data.total ?? rows.length} records
          </Txt>
          {page > 0 && (
            <Button
              title="Previous page"
              secondary
              onPress={() => setPage((v) => v - 1)}
            />
          )}
          <Button
            title="Next page"
            secondary
            disabled={
              r.data.total != null
                ? (page + 1) * 20 >= r.data.total
                : rows.length < 20
            }
            onPress={() => setPage((v) => v + 1)}
          />
        </View>
      )}
    </Page>
  );
}
export function AdminRecord({ route, navigation }: any) {
  const { module, record: row } = route.params;
  const { can, admin } = useSession();
  const a = useAction();
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const details = Object.entries(row).filter(
    ([k, v]) =>
      typeof v !== "object" && v != null && !["_id", "__v", "id"].includes(k),
  );
  const mutate = (title: string, path: string, body: Data = {}) =>
    confirm(
      title,
      "Core validates your permissions, records the change, and enforces the applicable business rules.",
      () => {
        void a.run(async () => {
          if (!reason.trim())
            throw new Error("Add a reason before applying this action.");
          await internal.call(path, "POST", { reason, notes: reason, ...body });
          navigation.goBack();
        });
      },
    );
  return (
    <Page
      title={
        row.businessName ||
        row.fullName ||
        row.bookingReference ||
        row.title ||
        row.code ||
        "Record details"
      }
    >
      <Card>
        {details.map(([k, v]) => (
          <View key={k} style={{ gap: 3 }}>
            <Txt muted size={12}>
              {human(k.replace(/([a-z])([A-Z])/g, "$1 $2"))}
            </Txt>
            <Txt>{typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}</Txt>
          </View>
        ))}
      </Card>
      <Field
        label="Reason / review notes"
        value={reason}
        onChangeText={setReason}
        multiline
      />
      <ErrorNotice message={a.error} />
      {module === "users" &&
        admin?.role === "SUPER_ADMIN" &&
        row.role !== "SUPER_ADMIN" && (
          <Button
            title={row.status === "ACTIVE" ? "Disable admin" : "Enable admin"}
            secondary
            busy={a.busy}
            onPress={() =>
              mutate(
                "Change admin access?",
                `/users/${id(row)}/${row.status === "ACTIVE" ? "disable" : "enable"}`,
              )
            }
          />
        )}
      {module === "users" &&
        admin?.role === "SUPER_ADMIN" &&
        row.role !== "SUPER_ADMIN" && (
          <Button
            title="Edit role & permissions"
            secondary
            onPress={() => navigation.navigate("AdminAccess", { item: row })}
          />
        )}
      {module === "bookings" &&
        [
          ["refund", "payments.refund", "Request refund"],
          ["settle", "settlements.release", "Request settlement"],
          ["fail-and-reassign", "operations.manage", "Report vendor failure"],
        ].map(([action, permission, title]) =>
          can(permission) ? (
            <Button
              key={action}
              title={title}
              secondary
              onPress={() =>
                navigation.navigate("AdminFinance", { booking: row, action })
              }
            />
          ) : null,
        )}
      {module === "vendors" && can("vendors.read") && (
        <Button
          title="Review verification documents"
          onPress={() => navigation.navigate("AdminKyc", { vendorId: id(row) })}
        />
      )}
      {module === "customers" && can("customers.update") && (
        <Button
          title={row.isFlagged ? "Remove customer flag" : "Flag customer"}
          secondary
          busy={a.busy}
          onPress={() =>
            mutate(
              "Change customer flag?",
              `/external-users/customers/${id(row)}/flag`,
              { isFlagged: !row.isFlagged },
            )
          }
        />
      )}
      {module === "vendors" && can("vendors.update") && (
        <Button
          title={row.isFlagged ? "Remove vendor flag" : "Flag vendor"}
          secondary
          busy={a.busy}
          onPress={() =>
            mutate(
              "Change vendor flag?",
              `/external-users/organizations/${id(row)}/flag`,
              { isFlagged: !row.isFlagged },
            )
          }
        />
      )}
      {module === "bookings" && (
        <>
          {can("payments.approve") && (
            <>
              <Field
                label="Verified payment ledger reference"
                value={reference}
                onChangeText={setReference}
              />
              <Button
                title="Verify recorded payment"
                secondary
                busy={a.busy}
                onPress={() =>
                  mutate(
                    "Verify payment evidence?",
                    `/operations/bookings/${id(row)}/verify-payment`,
                    { transactionReference: reference },
                  )
                }
              />
            </>
          )}
          {can("operations.manage") && (
            <Button
              title="Validate service completion"
              secondary
              busy={a.busy}
              onPress={() =>
                mutate(
                  "Approve completion?",
                  `/operations/bookings/${id(row)}/validate-completion`,
                  { approved: true },
                )
              }
            />
          )}
        </>
      )}
      {module === "approvals" &&
        (can("settlements.approve") || can("payments.refund")) &&
        row.status === "PENDING" && (
          <>
            <Button
              title="Approve request"
              busy={a.busy}
              onPress={() =>
                mutate(
                  "Approve finance request?",
                  `/operations/approvals/${id(row)}/approve`,
                )
              }
            />
            <Button
              title="Reject request"
              secondary
              busy={a.busy}
              onPress={() =>
                mutate(
                  "Reject finance request?",
                  `/operations/approvals/${id(row)}/reject`,
                )
              }
            />
          </>
        )}
      {module === "automation" && can("automation.manage") && (
        <Button
          title="Retry delivery"
          secondary
          busy={a.busy}
          onPress={() =>
            mutate(
              "Retry this delivery?",
              `/automation/outbox/${id(row)}/retry`,
            )
          }
        />
      )}
      {module === "settings" && can("settings.update") && (
        <Button
          title="Edit setting"
          secondary
          onPress={() =>
            navigation.navigate("AdminForm", { kind: "settings", item: row })
          }
        />
      )}
      {module === "coupons" && can("settings.update") && (
        <Button
          title="Edit coupon"
          secondary
          onPress={() =>
            navigation.navigate("AdminForm", { kind: "coupons", item: row })
          }
        />
      )}
    </Page>
  );
}
export function AdminKyc({ route }: any) {
  const { vendorId } = route.params;
  const r = useResource(
    internal,
    `/external-users/organizations/${vendorId}/documents`,
  );
  const { can } = useSession();
  const a = useAction();
  const [notes, setNotes] = useState("");
  return (
    <Page {...r} title="Vendor verification">
      <Field
        label="Review notes"
        value={notes}
        onChangeText={setNotes}
        multiline
      />
      <ErrorNotice message={a.error} />
      {(r.data.documents || []).map((doc: Data) => (
        <Card key={id(doc)}>
          <Txt bold>{doc.title}</Txt>
          <Pill>{human(doc.status)}</Pill>
          <Txt>
            {doc.type} · {doc.documentNumber}
          </Txt>
          <Txt muted>{doc.notes}</Txt>
          {doc.fileUrl && (
            <Button
              title="Open submitted evidence"
              secondary
              busy={a.busy}
              onPress={() => {
                void a.run(() => openEvidence(doc.fileUrl));
              }}
            />
          )}
          {can("vendors.approve") && (
            <>
              <Button
                title="Approve document"
                busy={a.busy}
                onPress={() =>
                  confirm(
                    "Approve this document?",
                    "Confirm you have reviewed the submitted evidence.",
                    () => {
                      void a.run(async () => {
                        await internal.call(
                          `/external-users/organizations/${vendorId}/verification`,
                          "POST",
                          { documentId: id(doc), approved: true, notes },
                        );
                        r.refresh();
                      });
                    },
                  )
                }
              />
              <Button
                title="Reject document"
                secondary
                busy={a.busy}
                onPress={() => {
                  void a.run(async () => {
                    if (!notes.trim()) throw new Error("Add review notes.");
                    await internal.call(
                      `/external-users/organizations/${vendorId}/manual-review`,
                      "POST",
                      {
                        documentId: id(doc),
                        status: "REJECTED",
                        reason: notes,
                        notes,
                      },
                    );
                    r.refresh();
                  });
                }}
              />
            </>
          )}
        </Card>
      ))}
    </Page>
  );
}
export function AdminForm({ route, navigation }: any) {
  const { kind, item = {} } = route.params;
  const { admin, can } = useSession();
  const a = useAction();
  const [form, setForm] = useState<Data>({
    fullName: "",
    email: "",
    password: "",
    permissions: "",
    code: item.code || "",
    discountType: item.discountType || "PERCENTAGE",
    discountValue: String(item.discountValue || ""),
    minOrderAmount: String(item.minOrderAmount || "0"),
    value: item.value || "",
    reason: "",
  });
  const allowed =
    kind === "users" ? admin?.role === "SUPER_ADMIN" : can("settings.update");
  const field = (key: string, label: string, secure = false) => (
    <Field
      key={key}
      label={label}
      value={form[key]}
      onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
      secureTextEntry={secure}
      autoCapitalize={key === "email" || secure ? "none" : "sentences"}
    />
  );
  return (
    <Page
      title={
        kind === "users"
          ? "Create admin access"
          : kind === "settings"
            ? item.label
            : "Coupon details"
      }
    >
      {kind === "users" && (
        <>
          {field("fullName", "Full name")}
          {field("email", "Email address")}
          {field("password", "Initial password", true)}
          {field("permissions", "Permissions (comma separated)")}
          <Txt muted>
            Use exact permissions such as customers.read, vendors.read. The
            server validates the list.
          </Txt>
        </>
      )}
      {kind === "settings" && field("value", "Setting value")}
      {kind === "coupons" && (
        <>
          {field("code", "Coupon code")}
          <Choice
            label="Discount type"
            value={form.discountType}
            values={["PERCENTAGE", "AMOUNT"]}
            onChange={(v) => setForm((f) => ({ ...f, discountType: v }))}
          />
          {field("discountValue", "Discount value")}
          {field("minOrderAmount", "Minimum order amount")}
        </>
      )}
      {field("reason", "Reason for this change")}
      <ErrorNotice message={a.error} />
      <Button
        title="Save changes"
        disabled={!allowed}
        busy={a.busy}
        onPress={() => {
          void a.run(async () => {
            if (!allowed)
              throw new Error(
                "You do not have permission to perform this action.",
              );
            if (!form.reason.trim())
              throw new Error("Enter a reason for the audit log.");
            if (kind === "users")
              await internal.call("/users", "POST", {
                fullName: form.fullName,
                email: form.email,
                password: form.password,
                permissions: form.permissions
                  .split(",")
                  .map((p: string) => p.trim())
                  .filter(Boolean),
                reason: form.reason,
              });
            else if (kind === "settings")
              await internal.call(
                `/settings/${encodeURIComponent(item.key)}`,
                "PUT",
                { value: form.value, reason: form.reason },
              );
            else
              await internal.call(
                `/coupons${id(item) ? `/${id(item)}` : ""}`,
                id(item) ? "PUT" : "POST",
                {
                  ...item,
                  code: form.code,
                  discountType: form.discountType,
                  discountValue: Number(form.discountValue),
                  minOrderAmount: Number(form.minOrderAmount),
                  isActive: item.isActive ?? true,
                  reason: form.reason,
                },
              );
            navigation.goBack();
          });
        }}
      />
    </Page>
  );
}
