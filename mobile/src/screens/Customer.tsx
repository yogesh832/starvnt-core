import { NotificationPreferences } from '../NotificationPreferences';
import { ProductFeedback } from '../ProductFeedback';
import React, { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { DiscoveryOptions } from "./CustomerDiscovery";
import { BudgetScreen, MyVendorsScreen } from "./CustomerWorkspace";
import { AuraPlan } from "../AuraPlan";
export { NewEvent } from "./CustomerPlanning";
import { ServiceFields } from "../EventFields";
import {
  detailsPayload,
  emptyServiceLocation,
  serviceLocationPayload,
  serviceLocationText,
} from "../eventFormModel";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import { useSession } from "../auth/Session";
import {
  Button,
  Card,
  Choice,
  MultiChoice,
  date,
  Empty,
  ErrorNotice,
  Field,
  human,
  Icon,
  id,
  MenuRow,
  money,
  Page,
  Pill,
  Stats,
  styles,
  Txt,
  useAction,
  useResource,
  confirm,
} from "../ui";

const eventPath = (eventId: string) =>
  `/customer/events/${encodeURIComponent(eventId)}`;
export function EventCard({
  event,
  navigation,
}: {
  event: Data;
  navigation: any;
}) {
  return (
    <Card onPress={() => navigation.navigate("Event", { eventId: id(event) })}>
      <View style={styles.row}>
        <Icon name="calendar-outline" />
        <Pill>{human(event.status)}</Pill>
      </View>
      <Txt size={22} bold>
        {event.title || human(event.eventType)}
      </Txt>
      <Txt muted>
        {date(event.eventDate)} · {event.city || "Location to be decided"}
      </Txt>
      {event.guestCount != null && (
        <Txt size={12} muted>
          {event.guestCount} guests
        </Txt>
      )}
      <View style={styles.row}>
        <Txt bold size={13}>
          Open your event
        </Txt>
        <Icon name="arrow-forward" size={17} />
      </View>
    </Card>
  );
}
export function CustomerHome({ navigation }: any) {
  const r = useResource(external, "/customer/home");
  const { user } = useSession();
  const events: Data[] = r.data.activeEvents || [];
  return (
    <Page
      {...r}
      title={`Hello, ${user?.fullName?.split(" ")[0] || "there"}.`}
      subtitle="Let’s make something worth remembering."
    >
      <Card>
        <Pill>YOUR NEXT GREAT MOMENT</Pill>
        <Txt bold size={30}>
          {'Big ideas.\nBeautifully brought to life.'}
        </Txt>
        <Txt muted>Meet Aura+, your event planning companion.</Txt>
        <Button
          title="Start with Aura+  ✦"
          onPress={() => navigation.navigate("AuraTab")}
        />
      </Card>
      <Stats
        items={[
          ["Active events", events.length],
          ["Unread updates", r.data.unreadUpdates ?? 0],
        ]}
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Txt size={21} bold>
            Your events
          </Txt>
        </View>
        <Button
          title="+ New event"
          secondary
          onPress={() => navigation.navigate("NewEvent")}
        />
      </View>
      {events.map((e) => (
        <EventCard key={id(e)} event={e} navigation={navigation} />
      ))}
      {!events.length && (
        <Empty
          title="Your calendar is a blank canvas"
          description="Create your first event, or tell Aura+ what you have in mind."
        />
      )}
      {(r.data.attention || []).map((a: Data, i: number) => (
        <Card key={i}>
          <Pill>NEEDS YOUR ATTENTION</Pill>
          <Txt bold>{a.title || a.message}</Txt>
          {(a.detail || a.body) && <Txt muted>{a.detail || a.body}</Txt>}
          {a.eventId && (
            <Button
              title={
                a.type === "quote_awaiting_decision"
                  ? "Review quote"
                  : ["payment_failed", "reservation_awaiting_payment"].includes(
                        a.type,
                      )
                    ? "Review booking & payment"
                    : "Open event"
              }
              secondary
              onPress={() =>
                a.type === "draft_to_confirm"
                  ? navigation.navigate("Event", { eventId: a.eventId })
                  : navigation.navigate("EventSection", {
                      eventId: a.eventId,
                      section:
                        a.type === "quote_awaiting_decision"
                          ? "quotes"
                          : "bookings",
                      title: a.title,
                    })
              }
            />
          )}
        </Card>
      ))}
    </Page>
  );
}
export function EventsScreen({ navigation }: any) {
  const r = useResource(external, "/customer/events");
  const [q, setQ] = useState("");
  const events = (r.data.events || []).filter((e: Data) =>
    `${e.title} ${e.city}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <Page
      {...r}
      title="Your events"
      subtitle="From the first idea to the final memory."
    >
      <Button
        title="Create an event"
        onPress={() => navigation.navigate("NewEvent")}
      />
      <Field
        label="Find an event"
        value={q}
        onChangeText={setQ}
        placeholder="Search by name or city"
      />
      {events.map((e: Data) => (
        <EventCard key={id(e)} event={e} navigation={navigation} />
      ))}
      {!events.length && (
        <Empty title={q ? "No matching events" : "Plan your first event"} />
      )}
    </Page>
  );
}
const sections = [
  ["Plan & services", "requirements", "grid-outline"],
  ["Discover vendors", "services", "search-outline"],
  ["Plans & quotes", "quotes", "document-text-outline"],
  ["Bookings & payments", "bookings", "wallet-outline"],
  ["My vendors", "vendors", "people-outline"],
  ["Budget", "financial-truth", "pie-chart-outline"],
  ["Event Circle", "messages", "chatbubbles-outline"],
  ["Event day", "event-day", "sunny-outline"],
  ["Timeline", "history", "time-outline"],
];
export function EventScreen({ route, navigation }: any) {
  const { eventId } = route.params;
  const r = useResource(external, `${eventPath(eventId)}/dashboard`, 30000);
  const e = r.data.event || {};
  const a = useAction();
  return (
    <Page
      {...r}
      title={e.title || "Your event"}
      subtitle={`${date(e.eventDate)} · ${e.city || ""}`}
    >
      <Pill>{r.data.experience?.lifecycle || human(e.status)}</Pill>
      {r.data.experience?.daysUntilEvent != null && <Txt>{r.data.experience.daysUntilEvent} days from the event date</Txt>}
      {!!r.data.experience?.proposedRequirements?.length && <Card><Txt bold>Confirm Aura suggestions</Txt><Txt muted>These do not count as completed requirements until you confirm.</Txt>{r.data.experience.proposedRequirements.map((row: Data) => <View key={row.category}><Txt>{human(row.category)} · {human(row.status)} {row.value || ''}</Txt><Button title="Confirm this requirement" busy={a.busy} onPress={() => { void a.run(async () => { await external.call(`${eventPath(eventId)}/requirements/${row.category}/confirm`, 'POST'); r.refresh(); }); }} /></View>)}</Card>}
      <NotificationPreferences eventId={eventId} />
      <ProductFeedback kind="EVENT" reference={eventId} />
      <Stats
        items={[
          ["Services planned", r.data.counts?.services ?? 0],
          ["Arranged", r.data.counts?.handled ?? 0],
          ["Bookings", r.data.counts?.bookings ?? 0],
          ["Need your help", r.data.counts?.needHelp ?? 0],
        ]}
      />
      <MenuRow
        title="Plan with Aura+"
        subtitle="Ideas, recommendations, and your next step."
        icon="sparkles-outline"
        onPress={() => navigation.navigate("Chat", { eventId })}
      />
      {["draft", "planning"].includes(e.status) && (
        <MenuRow
          title="Edit event details"
          icon="create-outline"
          onPress={() => navigation.navigate("EditEvent", { eventId })}
        />
      )}
      {e.status === "draft" && r.data.understanding && (
        <AuraPlan
          event={e}
          understanding={r.data.understanding}
          navigation={navigation}
          busy={a.busy}
          onConfirm={() =>
            a.run(async () => {
              await external.call(`${eventPath(eventId)}/confirm`, "POST");
              await r.refresh();
            })
          }
        />
      )}
      {e.status === "draft" && !r.data.understanding && (
        <Button
          title="Confirm event details"
          busy={a.busy}
          onPress={() =>
            confirm(
              "Confirm these event details?",
              `${e.title || human(e.eventType)} · ${date(e.eventDate)} · ${e.city || ""}`,
              () => {
                void a.run(async () => {
                  await external.call(`${eventPath(eventId)}/confirm`, "POST");
                  r.refresh();
                });
              },
            )
          }
        />
      )}
      <ErrorNotice message={a.error} />
      {e.status === "draft" && (
        <Button
          title="Delete draft event"
          danger
          busy={a.busy}
          onPress={() =>
            confirm(
              `Delete ${e.title || "this draft event"}?`,
              "This permanently deletes its plan and linked Aura conversations. It cannot be undone.",
              () => {
                void a.run(async () => {
                  await external.call(eventPath(eventId), "DELETE");
                  navigation.goBack();
                });
              },
            )
          }
        />
      )}
      {sections.map(([title, section, icon]) => (
        <MenuRow
          key={section}
          title={title}
          icon={icon}
          onPress={() =>
            navigation.navigate(
              section === "messages" ? "Circle" : "EventSection",
              { eventId, section, title, kind: "circle" },
            )
          }
        />
      ))}
    </Page>
  );
}
export function EventSection(props: any) {
  if (props.route.params.section === "vendors")
    return <MyVendorsScreen {...props} />;
  return props.route.params.section === "financial-truth" ? (
    <BudgetScreen {...props} />
  ) : (
    <EventSectionBody
      key={`${props.route.params.eventId}-${props.route.params.section}-${props.route.params.category || ""}`}
      {...props}
    />
  );
}
function EventSectionBody({ route, navigation }: any) {
  const { eventId, section, category, title } = route.params;
  const path = `${eventPath(eventId)}/${section}${category ? `?category=${encodeURIComponent(category)}` : ""}`;
  const r = useResource(external, path);
  const a = useAction();
  const act = (path: string, body?: Data) =>
    a.run(async () => {
      await external.call(path, "POST", body);
      r.refresh();
    });
  let content: React.ReactNode = null;
  if (section === "requirements" || (section === "services" && !category)) {
    const rows: Data[] = r.data.requirements || r.data.categories || [];
    content = (
      <>
        {rows.map((row) => (
          <Card key={row.category}>
            <Pill>{human(row.status || "Explore")}</Pill>
            <Txt bold size={20}>
              {row.label || human(row.category)}
            </Txt>
            {!!serviceLocationText(row.serviceLocation, r.data.event?.city) && (
              <Txt muted size={13}>
                {serviceLocationText(row.serviceLocation, r.data.event?.city)}
              </Txt>
            )}
            {row.selectedOption?.vendorName && (
              <Txt muted>
                {row.selectedOption.vendorName} ·{" "}
                {money(row.selectedOption.price)}
              </Txt>
            )}
            <Button
              title="Explore options"
              secondary
              onPress={() =>
                navigation.push("EventSection", {
                  eventId,
                  section: "services",
                  category: row.category,
                  title: row.label || human(row.category),
                })
              }
            />
            <Button
              title="Edit needs & arrangements"
              secondary
              busy={a.busy}
              disabled={
                !["missing", "pending", "customer_provided"].includes(
                  row.status,
                )
              }
              onPress={() =>
                navigation.navigate("Requirement", {
                  eventId,
                  category: row.category,
                })
              }
            />
          </Card>
        ))}
        {section === "requirements" &&
          !["completed", "cancelled"].includes(r.data.event?.status) && (
            <AddRequirement
              eventId={eventId}
              eventType={r.data.event?.eventType}
              existing={rows.map((row) => row.category)}
              navigation={navigation}
            />
          )}
        {!rows.length && (
          <Empty
            title="Add your first service"
            description="Tell Aura+ what you need for this event, then return to your plan."
          />
        )}
      </>
    );
  } else if (section === "services") {
    content = (
      <DiscoveryOptions
        data={r.data}
        eventId={eventId}
        navigation={navigation}
        refresh={r.refresh}
      />
    );
  } else if (section === "quotes") {
    content = (
      <>
        <Button
          title="Request quotes from selected vendors"
          busy={a.busy}
          onPress={() => {
            void a.run(async () => {
              const d = await external.call(
                `${eventPath(eventId)}/vendor-quote-requests`,
                "POST",
              );
              Alert.alert(
                "Quote requests",
                `${d.requestedCount || 0} sent${d.problems?.length ? ". Some requests could not be sent; review your selections." : "."}`,
              );
              r.refresh();
            });
          }}
        />
        <Button
          title="Build plan quote"
          secondary
          busy={a.busy}
          onPress={() => {
            void act(`${eventPath(eventId)}/quotes`);
          }}
        />
        <MenuRow
          title="Vendor offers"
          subtitle="Review, negotiate, and pay advances."
          onPress={() => navigation.navigate("VendorOffers", { eventId })}
        />
        {(r.data.quotes || []).map((q: Data) => (
          <Card key={id(q)}>
            <Pill>{human(q.status)}</Pill>
            <Txt bold size={24}>
              {money(q.total)}
            </Txt>
            {q.includesDemo && <Pill>INCLUDES DEMO SERVICES</Pill>}
            <Txt muted>Valid until {date(q.validUntil)}</Txt>
            {(q.items || []).map((item: Data) => (
              <Txt key={id(item)}>
                {item.vendorName} · {item.packageName} · {money(item.price)}
              </Txt>
            ))}
            {q.status === "draft" && (
              <Button
                title="Accept quote & reserve"
                busy={a.busy}
                onPress={() =>
                  confirm(
                    "Reserve these services?",
                    "This creates time-limited holds. A booking is confirmed after the backend verifies payment and availability.",
                    () => {
                      void act(`/customer/quotes/${id(q)}/accept`);
                    },
                  )
                }
              />
            )}
          </Card>
        ))}
        {!r.data.quotes?.length && (
          <Empty
            title="Your quotes will live here"
            description="Choose your service options, then request quotes."
          />
        )}
      </>
    );
  } else if (section === "bookings") {
    content = (
      <>
        <Txt muted>
          A reservation holds a service temporarily. Payment and availability
          are verified by STARVNT before a booking is confirmed.
        </Txt>
        {(r.data.reservations || []).map((b: Data) => (
          <Card key={id(b)}>
            <Pill>{human(b.status)}</Pill>
            <Txt bold size={19}>
              {b.vendorName}
            </Txt>
            <Txt muted>{b.packageName}</Txt>
            <Txt>
              Advance {money(b.advanceAmount)} · Total {money(b.packageTotal)}
            </Txt>
            <Txt size={12} muted>
              Hold expires {date(b.expiresAt)}
            </Txt>
            {(b.status === "pending_payment" ||
              (["converted", "pending_balance"].includes(b.status) &&
                Number(b.balanceAmount) > 0)) && (
              <Button
                title={
                  b.status === "pending_payment"
                    ? "Review & pay"
                    : "Review balance payment"
                }
                onPress={() =>
                  navigation.navigate("Checkout", { eventId, reservation: b })
                }
              />
            )}
          </Card>
        ))}
        {(r.data.bookings || []).map((b: Data) => (
          <Card key={id(b)}>
            <Pill>{human(b.status)}</Pill>
            <Txt bold size={20}>
              {b.vendorName}
            </Txt>
            <Txt>{b.packageName}</Txt>
            <Txt muted>
              Paid {money(b.paidAmount)} · Balance {money(b.balanceAmount)}
            </Txt>
            <Txt>{human(b.executionStatus)}</Txt>
            {b.underReviewReason && <Txt muted>{b.underReviewReason}</Txt>}
            <Button
              title="Event conversation"
              secondary
              onPress={() =>
                navigation.navigate("Chat", {
                  eventId,
                  kind: "circle",
                  bookingId: id(b),
                })
              }
            />
            <Button
              title="Review completion evidence"
              secondary
              busy={a.busy}
              onPress={() =>
                navigation.navigate("CustomerBooking", {
                  eventId,
                  bookingId: id(b),
                })
              }
            />
            <Button
              title="Request cancellation"
              secondary
              busy={a.busy}
              onPress={() =>
                confirm(
                  "Cancel this booking?",
                  "The server will apply the booking’s cancellation rules.",
                  () => {
                    void a.run(async () => {
                      await external.call(
                        `/customer/bookings/${id(b)}`,
                        "DELETE",
                      );
                      r.refresh();
                    });
                  },
                )
              }
            />
          </Card>
        ))}
        {(r.data.payments || []).map((p: Data) => (
          <Card key={id(p)}>
            <Txt bold>{money(p.amount)}</Txt>
            <Pill>{human(p.status)}</Pill>
            <Txt muted>{date(p.createdAt)}</Txt>
            {p.failureReason && <Txt>{p.failureReason}</Txt>}
          </Card>
        ))}
        {!(
          r.data.reservations?.length ||
          r.data.bookings?.length ||
          r.data.payments?.length
        ) && (
          <Empty
            title="No bookings yet"
            description="Your holds, verified bookings, and payment status will appear here."
          />
        )}
      </>
    );
  } else if (section === "event-day") {
    content = (
      <>
        {(r.data.services || []).map((b: Data) => (
          <Card key={id(b)}>
            <Txt bold size={20}>
              {b.vendorName}
            </Txt>
            <Txt>{b.packageName}</Txt>
            <Pill>{human(b.executionStatus)}</Pill>
          </Card>
        ))}
        {!r.data.services?.length && (
          <Empty
            title="Your event day, at a glance"
            description="Confirmed services and their recorded progress will appear here."
          />
        )}
      </>
    );
  } else if (section === "history") {
    content = (
      <>
        {(r.data.history || []).map((h: Data, i: number) => (
          <Card key={id(h) || i}>
            <Txt bold>{h.title || h.message || human(h.action || h.type)}</Txt>
            {h.description && <Txt muted>{h.description}</Txt>}
            <Txt muted size={12}>
              {date(h.createdAt || h.at)}
            </Txt>
          </Card>
        ))}
        {!r.data.history?.length && (
          <Empty title="Your story is just beginning" />
        )}
      </>
    );
  } else if (section === "financial-truth") {
    content = <FinancialSummary truth={r.data.financialTruth || {}} />;
  }
  return (
    <Page {...r} title={title}>
      <ErrorNotice message={a.error} />
      {content}
    </Page>
  );
}
export function FinancialSummary({ truth }: { truth: Data }) {
  const entries = Object.entries(truth.metrics || truth).filter(
    ([key, value]) => typeof value === "number",
  );
  return entries.length ? (
    <Stats
      items={entries.map(([key, value]) => [
        human(key.replace(/([a-z])([A-Z])/g, "$1 $2")),
        money(value),
      ])}
    />
  ) : (
    <Empty
      title="No financial summary yet"
      description="Amounts will appear after your event has quotes and payments."
    />
  );
}
export function RequirementScreen({ route, navigation }: any) {
  const { eventId, category } = route.params;
  const r = useResource(external, `${eventPath(eventId)}/requirements`);
  const options = useResource(
    external,
    `/customer/plan-options?eventType=${encodeURIComponent(r.data.event?.eventType || "other")}`,
  );
  const [name, setName] = useState("");
  const [status, setStatus] = useState("pending");
  const [draft, setDraft] = useState<Data>({
    details: {},
    serviceLocation: { ...emptyServiceLocation },
    specialRequirements: "",
  });
  const a = useAction();
  const req = r.data.requirements?.find((v: Data) => v.category === category);
  const locked =
    ["confirmed", "booked", "completed"].includes(req?.status) ||
    ["completed", "cancelled"].includes(r.data.event?.status);
  useEffect(() => {
    if (req) {
      setName(req.providedValue || "");
      setStatus(req.status);
      setDraft({
        details: { ...req.preferences },
        serviceLocation: { ...emptyServiceLocation, ...req.serviceLocation },
        specialRequirements: req.specialRequirements || "",
      });
    }
  }, [r.data, category]);
  const eventLocationLabel = [
    r.data.event?.location?.venueName,
    r.data.event?.location?.locality,
    r.data.event?.city,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Page
      {...r}
      title={req?.label || human(category)}
      subtitle="Make the details work for your event."
    >
      {locked ? (
        <Card>
          <Pill>{human(req?.status || r.data.event?.status)}</Pill>
          <Txt>
            This service can no longer be changed from the planning form.
          </Txt>
          <Txt muted>
            {serviceLocationText(req?.serviceLocation, eventLocationLabel)}
          </Txt>
        </Card>
      ) : (
        <>
          <Choice
            label="How are you arranging this?"
            value={status}
            values={["pending", "customer_provided", "missing"]}
            labels={{
              pending: "I need help",
              customer_provided: "Arranged elsewhere",
              missing: "Decide later",
            }}
            onChange={setStatus}
          />
          {status === "customer_provided" && (
            <Field
              label="Who is arranging this?"
              value={name}
              onChangeText={setName}
            />
          )}
          <ServiceFields
            category={category}
            options={options.data}
            value={draft}
            onChange={setDraft}
            eventLocationLabel={eventLocationLabel}
          />
          <ErrorNotice message={a.error || options.error} />
          <Button
            title="Save service details"
            busy={a.busy}
            disabled={options.loading || !!options.error}
            onPress={() => {
              void a.run(async () => {
                await external.call(
                  `${eventPath(eventId)}/requirements/${encodeURIComponent(category)}`,
                  "PATCH",
                  {
                    status,
                    providedValue: name.trim(),
                    details: detailsPayload(draft.details),
                    serviceLocation: serviceLocationPayload(
                      draft.serviceLocation,
                    ),
                    specialRequirements:
                      draft.specialRequirements.trim() || null,
                  },
                );
                navigation.goBack();
              });
            }}
          />
        </>
      )}
    </Page>
  );
}
export { ServiceScreen, CompareScreen } from "./CustomerDiscovery";

function AddRequirement({
  eventId,
  eventType,
  existing,
  navigation,
}: {
  eventId: string;
  eventType?: string;
  existing: string[];
  navigation: any;
}) {
  const options = useResource(
    external,
    `/customer/plan-options?eventType=${encodeURIComponent(eventType || "other")}`,
  );
  const [category, setCategory] = useState("");
  const categories: Data[] = (options.data.categories || []).filter(
    (item: Data) => !existing.includes(item.value),
  );
  if (!categories.length && !options.error) return null;
  return (
    <Card>
      <Txt bold size={20}>
        Add another service
      </Txt>
      <ErrorNotice message={options.error} />
      <Choice
        label="Choose a service"
        value={category}
        values={categories.map((item) => item.value)}
        labels={Object.fromEntries(
          categories.map((item) => [item.value, item.label]),
        )}
        onChange={setCategory}
      />
      <Button
        title="Add details & location"
        disabled={!category || options.loading || !!options.error}
        onPress={() =>
          navigation.navigate("Requirement", { eventId, category })
        }
      />
    </Card>
  );
}
