import { VendorCategoryPicker } from "../VendorCategoryPicker";
import React, { useState } from "react";
import { Alert, Image, Linking, View } from "react-native";
import { quotePricing } from "../vendorCommerce";
import { vendorCollections, vendorPipeline } from "../dashboardData";
import { VendorMessageField } from "../VendorMessageField";
import { VendorPortfolio } from "./VendorPortfolio";
import {
  VendorAnalytics,
  VendorPayments,
  VendorReviews,
} from "./VendorInsights";
import { external } from "../api/runtime";
import { pickUpload } from "../api/upload";
import type { Data } from "../api/client";
import { FinancialSummary } from "./Customer";
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

export const vendorModules = [
  [
    "enquiries",
    "Enquiries",
    "/vendor/opportunities",
    "opportunities",
    "chatbox-ellipses-outline",
  ],
  [
    "quotes",
    "Quotes",
    vendorCollections.quotes.path,
    "quotes",
    "document-text-outline",
  ],
  ["bookings", "Bookings", "/vendor/bookings", "bookings", "calendar-outline"],
  ["services", "Services", "/vendor/services", "services", "grid-outline"],
  [
    "availability",
    "Availability",
    "/vendor/availability/blockouts",
    "blockouts",
    "time-outline",
  ],
  ["portfolio", "Portfolio", "/vendor/portfolio", "items", "images-outline"],
  ["payments", "Payments", "/vendor/financial-truth", "", "wallet-outline"],
  ["reviews", "Reviews", "/vendor/reviews", "reviews", "star-outline"],
  ["analytics", "Analytics", "/vendor/badge-counts", "", "bar-chart-outline"],
  [
    "documents",
    "Documents & KYC",
    "/vendor/documents",
    "documents",
    "folder-outline",
  ],
];
export { VendorHome } from "./Dashboards";
export function VendorWork({ navigation }: any) {
  return (
    <Page
      title="Your workspace"
      subtitle="Everything behind a brilliant event."
    >
      {[
        ["origins", "Operating locations"],
        ["resources", "Team & resources"],
        ["capacity", "Capabilities & capacity"],
        ["coverage", "Service coverage"],
        ["hours", "Working hours"],
        ["travel", "Travel policy"],
      ].map(([kind, title]) => (
        <MenuRow
          key={kind}
          title={title}
          icon="options-outline"
          onPress={() => navigation.navigate("VendorSetup", { kind })}
        />
      ))}
      <MenuRow
        title="Calendar & availability"
        icon="calendar-outline"
        onPress={() => navigation.navigate("VendorCalendar")}
      />
      {vendorModules.map(([module, title, , , icon]) => (
        <MenuRow
          key={module}
          title={title}
          icon={icon}
          onPress={() => navigation.navigate("VendorModule", { module })}
        />
      ))}
      <MenuRow
        title="Profile & Hub"
        icon="business-outline"
        onPress={() => navigation.navigate("Profile")}
      />
    </Page>
  );
}
export function VendorModule({ route, navigation }: any) {
  if (route.params.module === "portfolio") return <VendorPortfolio />;
  if (route.params.module === "analytics") return <VendorAnalytics />;
  if (route.params.module === "payments")
    return <VendorPayments navigation={navigation} />;
  if (route.params.module === "reviews")
    return <VendorReviews navigation={navigation} />;
  return (
    <VendorModuleBody
      key={route.params.module}
      route={route}
      navigation={navigation}
    />
  );
}
function VendorModuleBody({ route, navigation }: any) {
  const key = route.params.module;
  const module = vendorModules.find((m) => m[0] === key)!;
  const config = vendorCollections[key as keyof typeof vendorCollections];
  const r = useResource(external, config?.path || module[2]);
  const a = useAction();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("All");
  const rows = vendorPipeline(
    r.data[config?.collection || module[3]] || [],
    stage,
    query,
  );
  const add = ["services", "availability", "portfolio", "documents"].includes(
    key,
  );
  return (
    <Page
      {...r}
      title={module[1]}
      subtitle="Connected to your STARVNT workspace."
    >
      <ErrorNotice message={a.error} />
      {key === "documents" && (
        <Button
          title="PAN, GST & bank verification"
          secondary
          onPress={() => navigation.navigate("VendorFinancial")}
        />
      )}
      {key === "availability" && (
        <Button
          title="Open calendar & partial-day availability"
          secondary
          onPress={() => navigation.navigate("VendorCalendar")}
        />
      )}
      {add && (
        <Button
          title={`Add ${key === "availability" ? "unavailable date" : key === "services" ? "service" : key === "portfolio" ? "portfolio project" : "document"}`}
          onPress={() => navigation.navigate("VendorForm", { kind: key })}
        />
      )}
      {key === "payments" && (
        <FinancialSummary truth={r.data.financialTruth || r.data} />
      )}
      {key === "analytics" && (
        <Stats
          items={Object.entries(r.data)
            .filter(([k, v]) => typeof v === "number")
            .map(([k, v]) => [
              human(k.replace(/([a-z])([A-Z])/g, "$1 $2")),
              Number(v),
            ])}
        />
      )}
      {module[3] && (
        <Field
          label="Search this section"
          value={query}
          onChangeText={setQuery}
        />
      )}
      {key === "quotes" && (
        <Choice
          label="Quote pipeline"
          value={stage}
          values={[
            "All",
            "DRAFT",
            "SUBMITTED",
            "APPROVED",
            "REJECTED",
            "EXPIRED",
          ]}
          onChange={setStage}
        />
      )}
      {rows.map((row) => (
        <Card key={id(row)}>
          <Pill>{human(row.status || row.visibility || "Available")}</Pill>
          {key === "portfolio" && row.url && (
            <Image
              source={{ uri: row.thumbnailUrl || row.url }}
              style={{ width: "100%", height: 200, borderRadius: 16 }}
              accessibilityLabel={row.title || "Portfolio image"}
            />
          )}
          <Txt bold size={21}>
            {row.name ||
              row.title ||
              row.serviceName ||
              row.projectName ||
              row.clientName ||
              row.reason ||
              "Service"}
          </Txt>
          {row.eventDate || row.date ? (
            <Txt muted>{date(row.eventDate || row.date)}</Txt>
          ) : null}
          {row.pricingBreakdown && (
            <Txt bold>{money(row.pricingBreakdown.totalAmount)}</Txt>
          )}
          {row.pricing && (
            <Txt bold>
              {money(row.pricing.basePrice)} / {row.pricing.unit || "event"}
            </Txt>
          )}
          {row.executionStatus && <Txt muted>{human(row.executionStatus)}</Txt>}
          {key === "documents" && (
            <>
              <Txt muted>
                {human(row.type)} · {row.fileName}
              </Txt>
              {!!row.notes && <Txt>{row.notes}</Txt>}
              {!!row.expiryDate && <Txt>Expires: {date(row.expiryDate)}</Txt>}
              {!!row.manualReview?.required && (
                <Txt muted>
                  Review: {human(row.manualReview.status)} ·{" "}
                  {row.manualReview.reason}
                </Txt>
              )}
              {!!row.fileUrl && (
                <Button
                  title="Open document"
                  secondary
                  busy={a.busy}
                  onPress={() => {
                    void a.run(async () => {
                      if (!/^https?:\/\//i.test(row.fileUrl))
                        throw new Error("This document link is unavailable.");
                      await Linking.openURL(row.fileUrl);
                    });
                  }}
                />
              )}
              <Button
                title="Remove document record"
                secondary
                busy={a.busy}
                onPress={() =>
                  confirm(
                    "Remove this document record?",
                    "Your verification status is determined by the server.",
                    () => {
                      void a.run(async () => {
                        await external.call(
                          `/vendor/documents/${id(row)}`,
                          "DELETE",
                        );
                        r.refresh();
                      });
                    },
                  )
                }
              />
            </>
          )}
          {key === "enquiries" && (
            <>
              <Txt muted>{row.customer?.fullName || row.clientName}</Txt>
              {["NEW", "VIEWED"].includes(row.status) && (
                <Button
                  title="Prepare a quote"
                  onPress={() =>
                    navigation.navigate("VendorForm", {
                      kind: "quote",
                      item: row,
                    })
                  }
                />
              )}
              {row.status !== "DECLINED" && row.status !== "EXPIRED" && (
                <Button
                  title="Open conversation"
                  secondary
                  busy={a.busy}
                  onPress={() => {
                    void a.run(async () => {
                      const d = await external.call(
                        `/vendor/messages/context/opportunity/${id(row)}`,
                        "POST",
                      );
                      navigation.navigate("Chat", {
                        kind: "thread",
                        threadId: id(d.thread),
                        vendor: true,
                      });
                    });
                  }}
                />
              )}
              {["NEW", "VIEWED"].includes(row.status) && (
                <Button
                  title="Decline enquiry"
                  secondary
                  busy={a.busy}
                  onPress={() =>
                    confirm(
                      "Decline this enquiry?",
                      "The customer will no longer receive a quote from your business for this request.",
                      () => {
                        void a.run(async () => {
                          await external.call(
                            `/vendor/opportunities/${encodeURIComponent(id(row))}/decline`,
                            "POST",
                          );
                          await r.refresh();
                        });
                      },
                    )
                  }
                />
              )}
            </>
          )}
          {key === "quotes" && (
            <>
              <Txt muted>{row.notes}</Txt>
              <Txt muted>{row.customer?.fullName || row.customer?.email}</Txt>
              <Button
                title="Review quote & history"
                secondary
                onPress={() =>
                  navigation.navigate("VendorQuote", { quoteId: id(row) })
                }
              />
              {["DRAFT", "SUBMITTED"].includes(row.status) && (
                <Button
                  title="Revise offer"
                  secondary
                  onPress={() =>
                    navigation.navigate("VendorForm", {
                      kind: "quote",
                      item: row,
                      revise: true,
                    })
                  }
                />
              )}
            </>
          )}
          {key === "bookings" && (
            <>
              <Txt>{row.bookingReference}</Txt>
              <Txt muted>{human(row.paymentStatus)}</Txt>
              <Button
                title="Booking actions"
                onPress={() =>
                  navigation.navigate("VendorBooking", { booking: row })
                }
              />
            </>
          )}
          {key === "reviews" && (
            <>
              <Txt bold>{row.rating} / 5</Txt>
              <Txt>{row.comment || row.text}</Txt>
              {row.vendorReply ? (
                <Txt muted>Your reply: {row.vendorReply.text}</Txt>
              ) : null}
              <Button
                title="Reply to review"
                secondary
                onPress={() =>
                  navigation.navigate("VendorForm", {
                    kind: "review",
                    item: row,
                  })
                }
              />
            </>
          )}
          {key === "services" && (
            <Button
              title="Edit service"
              secondary
              onPress={() =>
                navigation.navigate("VendorForm", {
                  kind: "services",
                  item: row,
                })
              }
            />
          )}
          {["services", "availability"].includes(key) && (
            <Button
              title={
                key === "availability"
                  ? "Make this date available"
                  : "Remove service"
              }
              secondary
              busy={a.busy}
              onPress={() =>
                confirm(
                  "Confirm this change?",
                  key === "availability"
                    ? "This removes the unavailable date from your calendar."
                    : "The server will apply this change to your service catalogue.",
                  () => {
                    void a.run(async () => {
                      await external.call(`${module[2]}/${id(row)}`, "DELETE");
                      r.refresh();
                    });
                  },
                )
              }
            />
          )}
        </Card>
      ))}
      {module[3] && !rows.length && (
        <Empty
          title={query ? "No matches" : `No ${module[1].toLowerCase()} yet`}
        />
      )}
    </Page>
  );
}
export function VendorForm({ route, navigation }: any) {
  return (
    <VendorFormBody
      key={`${route.params.kind}-${id(route.params.item || {})}-${!!route.params.revise}`}
      route={route}
      navigation={navigation}
    />
  );
}
function VendorFormBody({ route, navigation }: any) {
  const { kind, item = {}, revise } = route.params;
  const a = useAction();
  const [form, setForm] = useState<Data>({
    name: item.name || "",
    category: item.category || "",
    pricingType: item.pricing?.pricingType || "FIXED",
    unit: item.pricing?.unit || "event",
    leadTimeDays: String(item.leadTimeDays ?? 7),
    serviceStatus: item.status || "ACTIVE",
    taxIncluded: item.pricing?.taxIncluded === false ? "no" : "yes",
    price: String(
      item.pricing?.basePrice ?? item.pricingBreakdown?.basePrice ?? "",
    ),
    travel: String(item.pricingBreakdown?.travelFee || "0"),
    tax: String(
      item.pricingBreakdown?.additionalFee ??
        item.pricingBreakdown?.taxAmount ??
        "0",
    ),
    equipment: String(item.pricingBreakdown?.equipmentFee || "0"),
    setup: String(item.pricingBreakdown?.setupFee || "0"),
    notes: item.notes || "",
    date: "",
    reason: "",
    type: "OTHER",
    documentNumber: "",
    title: "",
    description: "",
  });
  const [asset, setAsset] = useState<Data | null>(null);
  const field = (
    key: string,
    label: string,
    numeric = false,
    multiline = false,
  ) => (
    <Field
      key={key}
      label={label}
      value={form[key]}
      keyboardType={numeric ? "decimal-pad" : "default"}
      multiline={multiline}
      onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
    />
  );
  async function submit() {
    if (kind === "services") {
      if (
        !form.name.trim() ||
        !form.category.trim() ||
        !Number.isFinite(Number(form.price)) ||
        Number(form.price) < 0 ||
        !form.price.trim() ||
        !Number.isInteger(Number(form.leadTimeDays)) ||
        Number(form.leadTimeDays) < 0 ||
        !form.leadTimeDays.trim() ||
        !form.unit.trim()
      )
        throw new Error("Enter a service name, category, and valid price.");
      await external.call(
        `/vendor/services${id(item) ? `/${id(item)}` : ""}`,
        id(item) ? "PUT" : "POST",
        {
          name: form.name.trim(),
          category: form.category.trim(),
          pricing: {
            ...item.pricing,
            pricingType: form.pricingType,
            basePrice: Number(form.price),
            unit: form.unit.trim(),
            taxIncluded: form.taxIncluded === "yes",
          },
          leadTimeDays: Number(form.leadTimeDays),
          status: form.serviceStatus,
        },
      );
    } else if (kind === "availability") {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(form.date) ||
        Number.isNaN(Date.parse(form.date))
      )
        throw new Error("Enter a valid date in YYYY-MM-DD format.");
      await external.call("/vendor/availability/blockouts", "POST", {
        date: form.date,
        allDay: true,
        reason: form.reason,
      });
    } else if (kind === "quote") {
      const pricingBreakdown = quotePricing({
        basePrice: form.price,
        travelFee: form.travel,
        equipmentFee: form.equipment,
        setupFee: form.setup,
        additionalFee: form.tax,
      });
      await external.call(
        revise ? `/vendor/quotes/${id(item)}/revise` : "/quotes",
        "POST",
        {
          opportunityId: revise ? undefined : id(item),
          customerId: item.customer?._id || item.customer,
          vendorServiceId: item.vendorService,
          serviceName: item.serviceName,
          eventDate: item.eventDate,
          serviceLocation: item.serviceLocation,
          notes: form.notes,
          pricingBreakdown,
          status: "SUBMITTED",
        },
      );
    } else if (kind === "review") {
      if (!form.notes.trim()) throw new Error("Write a reply before sending.");
      await external.call(`/vendor/reviews/${id(item)}/reply`, "POST", {
        text: form.notes,
      });
    } else if (kind === "documents") {
      if (!form.title.trim()) throw new Error("Enter a document title.");
      await external.call("/vendor/documents", "POST", {
        title: form.title,
        type: form.type,
        documentNumber: form.documentNumber,
        fileUrl: asset?.url,
        fileName: asset?.filename,
        fileSize: asset?.fileSize,
        notes: form.notes,
      });
    } else if (kind === "portfolio") {
      if (!asset?.url || !form.title.trim())
        throw new Error("Add a project title and upload a photo or video.");
      await external.call("/vendor/portfolio/item", "POST", {
        title: form.title,
        projectName: form.title,
        description: form.description,
        url: asset.url,
        thumbnailUrl: asset.thumbnailUrl,
        mediaType: asset.resourceType,
        visibility: "PUBLIC",
      });
    }
    navigation.goBack();
  }
  return (
    <Page
      title={
        kind === "quote"
          ? revise
            ? "Refine your offer"
            : "Make a great first offer"
          : `Your ${kind === "availability" ? "unavailable date" : kind === "review" ? "review reply" : human(kind)}`
      }
    >
      {kind === "services" && (
        <>
          {field("name", "Service name")}
          <VendorCategoryPicker label="Service category" value={form.category || ""} onChange={(category) => setForm(current => ({ ...current, category }))} />
          {field("price", "Base price in ₹", true)}
          <Choice
            label="Pricing model"
            values={["FIXED", "HOURLY", "PER_PERSON", "TIERED", "CUSTOM"]}
            value={form.pricingType}
            onChange={(v) => setForm((f) => ({ ...f, pricingType: v }))}
          />
          {field("unit", "Price unit (event, hour, guest…)")}
          <Choice
            label="Tax included"
            values={["yes", "no"]}
            value={form.taxIncluded}
            onChange={(v) => setForm((f) => ({ ...f, taxIncluded: v }))}
          />
          {field("leadTimeDays", "Lead time in days", true)}
          <Choice
            label="Service status"
            values={["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]}
            value={form.serviceStatus}
            onChange={(v) => setForm((f) => ({ ...f, serviceStatus: v }))}
          />
        </>
      )}
      {kind === "availability" && (
        <>
          {field("date", "Date (YYYY-MM-DD)")}
          {field("reason", "Reason")}
        </>
      )}
      {kind === "quote" && (
        <>
          <Card>
            <Txt bold>{item.serviceName}</Txt>
            <Txt muted>{date(item.eventDate)}</Txt>
          </Card>
          {field("price", "Base price in ₹", true)}
          {field("travel", "Travel fee in ₹", true)}
          {field("equipment", "Equipment fee in ₹", true)}
          {field("setup", "Setup fee in ₹", true)}
          {field("tax", "Additional charges in ₹", true)}
          <VendorMessageField
            label="Proposal notes"
            value={form.notes}
            onChange={(notes) => setForm((current) => ({ ...current, notes }))}
            context={{ type: revise ? "quote" : "opportunity", id: id(item) }}
            disabled={a.busy}
          />
          <Txt bold>
            Total{" "}
            {money(
              Number(form.price) +
                Number(form.travel) +
                Number(form.equipment) +
                Number(form.setup) +
                Number(form.tax),
            )}
          </Txt>
        </>
      )}
      {kind === "review" && (
        <VendorMessageField
          label="Your reply"
          value={form.notes}
          onChange={(notes) => setForm((current) => ({ ...current, notes }))}
          context={{ type: "review", id: id(item) }}
          disabled={a.busy}
        />
      )}
      {["portfolio", "documents"].includes(kind) && (
        <>
          {field(
            "title",
            kind === "portfolio" ? "Project title" : "Document title",
          )}
          {kind === "portfolio" ? (
            field("description", "Project description", false, true)
          ) : (
            <>
              <Choice
                label="Document type"
                value={form.type}
                values={["OTHER", "PAN", "GST"]}
                onChange={(v) => setForm((f) => ({ ...f, type: v }))}
              />
              {field("documentNumber", "Document number")}
              {field("notes", "Notes", false, true)}
            </>
          )}
          <Button
            title={
              asset ? `Uploaded: ${asset.filename}` : "Choose & upload a file"
            }
            secondary
            busy={a.busy}
            onPress={() => {
              void a.run(async () => {
                const d = await pickUpload(kind === "portfolio");
                if (d) setAsset(d);
              });
            }}
          />
        </>
      )}
      <ErrorNotice message={a.error} />
      <Button
        title={kind === "quote" ? "Send offer to customer" : "Save changes"}
        busy={a.busy}
        onPress={() => {
          void a.run(submit);
        }}
      />
    </Page>
  );
}
export { VendorBooking } from "./VendorBooking";
