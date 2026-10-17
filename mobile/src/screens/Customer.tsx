import React, { useEffect, useState } from "react";
import { Alert, Image, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
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
          Big ideas.\nBeautifully brought to life.
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
          {a.body && <Txt muted>{a.body}</Txt>}
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
export function NewEvent({ navigation }: any) {
  const options = useResource(external, "/customer/plan-options");
  const [form, setForm] = useState({
    title: "",
    city: "",
    guestCount: "",
    eventType: "wedding",
    budget: "",
    eventDate: "",
  });
  const [showDate, setShowDate] = useState(false);
  const [key] = useState(
    () => `native-event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const a = useAction();
  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));
  return (
    <Page
      title="Make it an occasion"
      subtitle="Start with the essentials. Make it yours as you go."
    >
      <Field
        label="Give your event a name"
        value={form.title}
        onChangeText={(v) => update("title", v)}
        placeholder="A celebration to remember"
      />
      <Choice
        label="What are we celebrating?"
        value={form.eventType}
        values={[
          "wedding",
          "birthday",
          "corporate",
          "conference",
          "club",
          "cultural",
          "institutional",
          "puja",
          "anniversary",
          "social",
          "other",
        ]}
        onChange={(v) => update("eventType", v)}
      />
      <Button
        title={form.eventDate ? date(form.eventDate) : "Choose event date"}
        secondary
        onPress={() => setShowDate(true)}
      />
      {showDate && (
        <DateTimePicker
          value={
            form.eventDate ? new Date(`${form.eventDate}T12:00:00`) : new Date()
          }
          minimumDate={new Date()}
          mode="date"
          onChange={(_, d) => {
            setShowDate(false);
            if (d)
              update(
                "eventDate",
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
              );
          }}
        />
      )}
      <Field
        label="City"
        value={form.city}
        onChangeText={(v) => update("city", v)}
      />
      <Field
        label="Number of guests (optional)"
        value={form.guestCount}
        keyboardType="number-pad"
        onChangeText={(v) => update("guestCount", v)}
      />
      <Field
        label="Budget in ₹ (optional)"
        value={form.budget}
        keyboardType="number-pad"
        onChangeText={(v) => update("budget", v)}
      />
      <ErrorNotice message={a.error || options.error} />
      <Button
        title="Create your event"
        busy={a.busy}
        onPress={() => {
          void a.run(async () => {
            if (!form.city.trim() || !form.eventDate)
              throw new Error("Add the city and date to continue.");
            const d = await external.call("/customer/events", "POST", {
              ...form,
              guestCount: form.guestCount ? Number(form.guestCount) : undefined,
              budget: form.budget ? Number(form.budget) : undefined,
              idempotencyKey: key,
              services: [],
            });
            navigation.replace("Event", { eventId: id(d.event) });
          });
        }}
      />
    </Page>
  );
}
const sections = [
  ["Plan & services", "requirements", "grid-outline"],
  ["Discover vendors", "services", "search-outline"],
  ["Plans & quotes", "quotes", "document-text-outline"],
  ["Bookings & payments", "bookings", "wallet-outline"],
  ["Budget", "financial-truth", "pie-chart-outline"],
  ["Event Circle", "messages", "chatbubbles-outline"],
  ["Event day", "event-day", "sunny-outline"],
  ["Timeline", "history", "time-outline"],
];
export function EventScreen({ route, navigation }: any) {
  const { eventId } = route.params;
  const r = useResource(external, `${eventPath(eventId)}/dashboard`);
  const e = r.data.event || {};
  const a = useAction();
  return (
    <Page
      {...r}
      title={e.title || "Your event"}
      subtitle={`${date(e.eventDate)} · ${e.city || ""}`}
    >
      <Pill>{human(e.status)}</Pill>
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
      {e.status === "draft" && (
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
      {sections.map(([title, section, icon]) => (
        <MenuRow
          key={section}
          title={title}
          icon={icon}
          onPress={() =>
            navigation.navigate(
              section === "messages" ? "Chat" : "EventSection",
              { eventId, section, title, kind: "circle" },
            )
          }
        />
      ))}
    </Page>
  );
}
export function EventSection({ route, navigation }: any) {
  const { eventId, section, category, title } = route.params;
  const path = `${eventPath(eventId)}/${section}${category ? `?category=${encodeURIComponent(category)}` : ""}`;
  const r = useResource(external, path);
  const a = useAction();
  const [selected, setSelected] = useState<string[]>([]);
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
        {!rows.length && (
          <Empty
            title="Add your first service"
            description="Tell Aura+ what you need for this event, then return to your plan."
          />
        )}
      </>
    );
  } else if (section === "services") {
    const rows: Data[] = r.data.options || [];
    content = (
      <>
        {selected.length >= 2 && (
          <Button
            title={`Compare ${selected.length} options`}
            onPress={() =>
              navigation.push("Compare", { eventId, ids: selected })
            }
          />
        )}
        {rows.map((row) => (
          <Card key={id(row)}>
            {row.isDemo && <Pill>DEMO LISTING</Pill>}
            <Txt bold size={22}>
              {row.vendorName}
            </Txt>
            <Txt muted>{row.packageName}</Txt>
            <Txt bold size={22}>
              {money(row.price)}
            </Txt>
            <Txt size={12} muted>
              {row.availability?.label || "Availability is not confirmed"}
            </Txt>
            <Button
              title="View vendor & package"
              onPress={() =>
                navigation.navigate("Service", { eventId, optionId: id(row) })
              }
            />
            <Button
              title={
                selected.includes(id(row))
                  ? "Remove from comparison"
                  : "Add to comparison"
              }
              secondary
              onPress={() =>
                setSelected((s) =>
                  s.includes(id(row))
                    ? s.filter((v) => v !== id(row))
                    : s.length < 3
                      ? [...s, id(row)]
                      : s,
                )
              }
            />
          </Card>
        ))}
        {!rows.length && (
          <Empty
            title="No options for this service yet"
            description="Try another service, or ask Aura+ to help refine your requirements."
          />
        )}
      </>
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
              title="Verify completion"
              secondary
              busy={a.busy}
              onPress={() =>
                confirm(
                  "Verify completion?",
                  "Confirm only when the booked service has been delivered.",
                  () => {
                    void act(`/customer/bookings/${id(b)}/verify-completion`, {
                      notes: "",
                    });
                  },
                )
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
    `/customer/plan-options?eventType=${r.data.event?.eventType || "other"}`,
  );
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("pending");
  const [details, setDetails] = useState<Data>({});
  const a = useAction();
  useEffect(() => {
    const req = r.data.requirements?.find((v: Data) => v.category === category);
    if (req) {
      setName(req.providedValue || "");
      setNotes(req.specialRequirements || "");
      setStatus(req.status);
      setDetails(req.preferences || {});
    }
  }, [r.data, category]);
  const fields: Data[] = options.data.serviceFields?.[category] || [];
  return (
    <Page
      {...r}
      title={human(category)}
      subtitle="Make the details work for your event."
    >
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
      {fields.map((f) =>
        f.type === "multiselect" ? (
          <MultiChoice
            key={f.key}
            label={f.label}
            values={f.options}
            selected={details[f.key] || []}
            onChange={(v) => setDetails((d) => ({ ...d, [f.key]: v }))}
          />
        ) : f.type === "select" ? (
          <Choice
            key={f.key}
            label={f.label}
            value={details[f.key] || ""}
            values={f.options}
            onChange={(v) => setDetails((d) => ({ ...d, [f.key]: v }))}
          />
        ) : (
          <Field
            key={f.key}
            label={f.label}
            value={String(details[f.key] ?? "")}
            keyboardType={f.type === "number" ? "number-pad" : "default"}
            onChangeText={(v) =>
              setDetails((d) => ({
                ...d,
                [f.key]:
                  f.type === "number" ? (v === "" ? null : Number(v)) : v,
              }))
            }
          />
        ),
      )}
      <Field
        label="Special requirements"
        value={notes}
        onChangeText={setNotes}
        multiline
      />
      <ErrorNotice message={a.error || options.error} />
      <Button
        title="Save service details"
        busy={a.busy}
        onPress={() => {
          void a.run(async () => {
            await external.call(
              `${eventPath(eventId)}/requirements/${encodeURIComponent(category)}`,
              "PATCH",
              {
                status,
                providedValue: name.trim(),
                details,
                specialRequirements: notes,
              },
            );
            navigation.goBack();
          });
        }}
      />
    </Page>
  );
}
export function ServiceScreen({ route, navigation }: any) {
  const { eventId, optionId } = route.params;
  const r = useResource(
    external,
    `${eventPath(eventId)}/services/${encodeURIComponent(optionId)}`,
  );
  const o = r.data.option || {};
  const a = useAction();
  return (
    <Page {...r} title={o.vendorName} subtitle={o.packageName}>
      {o.isDemo && <Pill>DEMO LISTING</Pill>}
      <Txt bold size={30}>
        {money(o.price)}
      </Txt>
      <Txt muted>{o.description || r.data.vendorProfile?.bio}</Txt>
      <Txt muted>Availability must be confirmed before booking.</Txt>
      {(o.inclusions || []).map((t: string) => (
        <Txt key={t}>✓ {t}</Txt>
      ))}
      <ErrorNotice message={a.error} />
      <Button
        title={
          r.data.selected ? "Selected for your plan" : "Select for your plan"
        }
        busy={a.busy}
        disabled={r.data.selected}
        onPress={() => {
          void a.run(async () => {
            await external.call(
              `${eventPath(eventId)}/requirements/${encodeURIComponent(o.category)}/select`,
              "POST",
              { optionId },
            );
            navigation.goBack();
          });
        }}
      />
      <Button
        title="Save to favorites"
        secondary
        busy={a.busy}
        onPress={() => {
          void a.run(async () => {
            await external.call("/customer/favorites", "POST", {
              eventId,
              optionId,
              vendorId: o.vendorId,
              vendorName: o.vendorName,
              category: o.category,
              packageName: o.packageName,
              price: o.price,
            });
            Alert.alert("Saved to favorites");
          });
        }}
      />
      {(r.data.portfolio || []).map((p: Data) =>
        p.url || p.mediaUrl ? (
          <Image
            key={id(p)}
            source={{ uri: p.url || p.mediaUrl }}
            accessibilityLabel={p.title || "Vendor portfolio"}
            style={{ width: "100%", height: 230, borderRadius: 20 }}
          />
        ) : null,
      )}
      <Txt bold size={20}>
        Reviews
      </Txt>
      {(r.data.reviews || []).map((review: Data) => (
        <Card key={id(review)}>
          <Txt bold>{review.rating} / 5</Txt>
          <Txt>{review.text || review.comment}</Txt>
        </Card>
      ))}
      {!r.data.reviews?.length && <Txt muted>No reviews yet.</Txt>}
    </Page>
  );
}
export function CompareScreen({ route, navigation }: any) {
  const { eventId, ids } = route.params;
  const r = useResource(
    external,
    `${eventPath(eventId)}/services/compare?ids=${ids.map(encodeURIComponent).join(",")}`,
  );
  return (
    <Page
      {...r}
      title="Find your perfect fit"
      subtitle="Compare the details that matter to your event."
    >
      {(r.data.options || []).map((o: Data) => (
        <Card key={id(o)}>
          <Txt bold size={22}>
            {o.vendorName}
          </Txt>
          <Txt>{o.packageName}</Txt>
          <Txt bold>{money(o.price)}</Txt>
          {o.isDemo && <Pill>DEMO LISTING</Pill>}
          {(o.inclusions || []).map((t: string) => (
            <Txt key={t}>✓ {t}</Txt>
          ))}
          <Button
            title="View & select"
            secondary
            onPress={() =>
              navigation.navigate("Service", { eventId, optionId: id(o) })
            }
          />
        </Card>
      ))}
    </Page>
  );
}
