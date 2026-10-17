import React, { useState } from "react";
import { Alert, Image, View } from "react-native";
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
  ["quotes", "Quotes", "/vendor/quotes", "quotes", "document-text-outline"],
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
export function VendorHome({ navigation }: any) {
  const r = useResource(external, "/vendor/badge-counts");
  const profile = useResource(external, "/vendor/profile");
  const activation = useResource(external, "/vendor/activation-status");
  return (
    <Page
      {...r}
      title={profile.data.vendor?.businessName || "Your business, in focus."}
      subtitle="A clear view of what’s next."
    >
      <ErrorNotice message={profile.error || activation.error} />
      <Card>
        <Pill>VENDOR OS</Pill>
        <Txt bold size={29}>
          More time for\nwhat you do best.
        </Txt>
        <Button
          title="Ask Aura+ about your business"
          onPress={() => navigation.navigate("Chat")}
        />
      </Card>
      <Stats
        items={[
          ["Enquiries", r.data.enquiriesCount ?? 0],
          ["Quotes", r.data.quotesCount ?? 0],
          ["Bookings", r.data.bookingsCount ?? 0],
          ["Unread", r.data.unreadNotificationsCount ?? 0],
        ]}
      />
      <Card>
        <Txt bold>Workspace readiness</Txt>
        <Pill>
          {human(activation.data.status?.activationState || "Review setup")}
        </Pill>
        <Txt muted>
          Complete your profile, services, portfolio, and verification to become
          commercially active.
        </Txt>
        <Button
          title="Complete business setup"
          secondary
          onPress={() => navigation.navigate("Profile")}
        />
      </Card>
      {vendorModules.slice(0, 3).map(([module, title, , , icon]) => (
        <MenuRow
          key={module}
          title={title}
          icon={icon}
          onPress={() => navigation.navigate("VendorModule", { module })}
        />
      ))}
    </Page>
  );
}
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
  const key = route.params.module;
  const module = vendorModules.find((m) => m[0] === key)!;
  const r = useResource(external, module[2]);
  const a = useAction();
  const [query, setQuery] = useState("");
  const rows: Data[] = (r.data[module[3]] || []).filter((row: Data) =>
    `${row.name || ""} ${row.serviceName || ""} ${row.clientName || ""} ${row.title || ""} ${row.status || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
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
          {key === "enquiries" && (
            <>
              <Txt muted>{row.customer?.fullName || row.clientName}</Txt>
              <Button
                title="Prepare a quote"
                onPress={() =>
                  navigation.navigate("VendorForm", {
                    kind: "quote",
                    item: row,
                  })
                }
              />
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
            </>
          )}
          {key === "quotes" && (
            <>
              <Txt muted>{row.notes}</Txt>
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
  const { kind, item = {}, revise } = route.params;
  const a = useAction();
  const [form, setForm] = useState<Data>({
    name: item.name || "",
    category: item.category || "",
    price: String(
      item.pricing?.basePrice ?? item.pricingBreakdown?.basePrice ?? "",
    ),
    travel: String(item.pricingBreakdown?.travelFee || "0"),
    tax: String(item.pricingBreakdown?.taxAmount || "0"),
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
        Number(form.price) <= 0
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
            pricingType: item.pricing?.pricingType || "FIXED",
            basePrice: Number(form.price),
            unit: item.pricing?.unit || "event",
          },
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
      const basePrice = Number(form.price),
        travelFee = Number(form.travel),
        taxAmount = Number(form.tax);
      if (
        ![basePrice, travelFee, taxAmount].every(Number.isFinite) ||
        basePrice <= 0 ||
        travelFee < 0 ||
        taxAmount < 0
      )
        throw new Error("Enter a valid price and non-negative charges.");
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
          pricingBreakdown: {
            basePrice,
            travelFee,
            additionalFee: taxAmount,
            totalAmount: basePrice + travelFee + taxAmount,
          },
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
          {field("category", "Service category")}
          {field("price", "Base price in ₹", true)}
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
          {field("tax", "Additional charges in ₹", true)}
          {field("notes", "Proposal notes", false, true)}
          <Txt bold>
            Total{" "}
            {money(Number(form.price) + Number(form.travel) + Number(form.tax))}
          </Txt>
        </>
      )}
      {kind === "review" && field("notes", "Your reply", false, true)}
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
export function VendorBooking({ route, navigation }: any) {
  const b = route.params.booking;
  const a = useAction();
  const [notes, setNotes] = useState("");
  const [url, setUrl] = useState("");
  const [asset, setAsset] = useState<Data | null>(null);
  return (
    <Page title={b.serviceName || "Booking"} subtitle={b.bookingReference}>
      <Card>
        <Pill>{human(b.executionStatus)}</Pill>
        <Txt>{date(b.eventDate)}</Txt>
        <Txt muted>{human(b.paymentStatus)}</Txt>
        <Txt bold>
          {money(b.totalAmount || b.pricingBreakdown?.totalAmount)}
        </Txt>
      </Card>
      <ErrorNotice message={a.error} />
      <Button
        title="Open booking conversation"
        secondary
        busy={a.busy}
        onPress={() => {
          void a.run(async () => {
            const d = await external.call(
              `/vendor/bookings/${id(b)}/message-thread`,
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
      <Button
        title="Mark service as started"
        secondary
        busy={a.busy}
        onPress={() =>
          confirm(
            "Start this service?",
            "This records that service delivery has begun and notifies the customer.",
            () => {
              void a.run(async () => {
                await external.call(`/vendor/bookings/${id(b)}/start`, "POST");
                Alert.alert("Service started");
                navigation.goBack();
              });
            },
          )
        }
      />
      <Txt bold size={22}>
        Completion evidence
      </Txt>
      <Field
        label="Delivery / evidence URL"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
      <Field
        label="Completion notes"
        value={notes}
        onChangeText={setNotes}
        multiline
      />
      <Button
        title={asset ? "Evidence uploaded" : "Upload evidence"}
        secondary
        busy={a.busy}
        onPress={() => {
          void a.run(async () => {
            const d = await pickUpload();
            if (d) {
              setAsset(d);
              setUrl(d.url);
            }
          });
        }}
      />
      <Button
        title="Submit completion for review"
        busy={a.busy}
        onPress={() => {
          void a.run(async () => {
            if (!url.trim())
              throw new Error("Add delivery evidence before submitting.");
            await external.call(
              `/vendor/bookings/${id(b)}/submit-completion`,
              "POST",
              {
                deliverablesUrl: url,
                notes,
                files: asset ? [asset.url] : [],
                checklist: [],
              },
            );
            Alert.alert(
              "Evidence submitted",
              "Customer and Core review determine completion and settlement.",
            );
            navigation.goBack();
          });
        }}
      />
    </Page>
  );
}
