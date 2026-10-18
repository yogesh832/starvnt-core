import React from "react";
import { View } from "react-native";
import type { Data } from "../api/client";
import { external } from "../api/runtime";
import {
  Button,
  Card,
  Empty,
  human,
  id,
  money,
  Page,
  Pill,
  Stats,
  Txt,
  usePalette,
  useResource,
} from "../ui";

export function MyVendorsScreen({ route, navigation }: any) {
  const { eventId } = route.params;
  const bookings = useResource(
    external,
    `/customer/events/${encodeURIComponent(eventId)}/bookings`,
  );
  const plan = useResource(
    external,
    `/customer/events/${encodeURIComponent(eventId)}/requirements`,
  );
  const booked: Data[] = bookings.data.bookings || [];
  const chosen: Data[] = (plan.data.requirements || []).filter(
    (requirement: Data) =>
      requirement.selectedOption && requirement.status === "pending",
  );
  return (
    <Page
      title="My vendors"
      subtitle={bookings.data.event?.title}
      loading={bookings.loading || plan.loading}
      error={bookings.error || plan.error}
      refresh={() => {
        bookings.refresh();
        plan.refresh();
      }}
    >
      {!!booked.length && (
        <Txt bold size={22}>
          Booked vendors
        </Txt>
      )}
      {booked.map((booking) => (
        <Card key={id(booking)}>
          <Txt bold size={21}>
            {booking.vendorName}
          </Txt>
          <Pill>{human(booking.status)}</Pill>
          {booking.isDemo && <Pill>DEMO LISTING</Pill>}
          <Txt>
            {booking.label} · {booking.packageName}
          </Txt>
          <Txt>Total: {money(booking.packageTotal ?? booking.amount)}</Txt>
          <Txt>Paid: {money(booking.paidAmount ?? booking.amount)}</Txt>
          <Button
            title="Message about this booking"
            secondary
            onPress={() =>
              navigation.navigate("Chat", {
                kind: "circle",
                eventId,
                bookingId: id(booking),
                title: booking.vendorName,
              })
            }
          />
          <Button
            title="Review booking & evidence"
            secondary
            onPress={() =>
              navigation.navigate("CustomerBooking", {
                eventId,
                bookingId: id(booking),
              })
            }
          />
        </Card>
      ))}
      {!!chosen.length && (
        <Txt bold size={22}>
          Chosen · awaiting booking
        </Txt>
      )}
      {chosen.map((requirement) => (
        <Card key={id(requirement) || requirement.category}>
          <Txt bold size={21}>
            {requirement.selectedOption.vendorName}
          </Txt>
          {requirement.selectedOption.isDemo && <Pill>DEMO LISTING</Pill>}
          <Txt>
            {requirement.label} · {requirement.selectedOption.packageName}
          </Txt>
          <Txt>{money(requirement.selectedOption.price)}</Txt>
          <Button
            title="Review quotes"
            onPress={() =>
              navigation.navigate("EventSection", {
                eventId,
                section: "quotes",
                title: "Plans & quotes",
              })
            }
          />
        </Card>
      ))}
      {!bookings.loading &&
        !plan.loading &&
        !booked.length &&
        !chosen.length && (
          <Empty
            title="No vendors yet"
            description="Vendors appear here when you choose or book an option."
          />
        )}
      <Button
        title="Find vendor options"
        secondary
        onPress={() =>
          navigation.navigate("EventSection", {
            eventId,
            section: "services",
            title: "Discover vendors",
          })
        }
      />
    </Page>
  );
}

export function CircleScreen({ route, navigation }: any) {
  const { eventId } = route.params;
  const r = useResource(
    external,
    `/customer/events/${encodeURIComponent(eventId)}/circle`,
    20000,
  );
  const contexts: Data[] = r.data.contexts || [];
  return (
    <Page {...r} title="Event Circle" subtitle={r.data.event?.title}>
      <Txt muted>
        Keep whole-event, service and booking conversations in their own
        threads.
      </Txt>
      {contexts.map((context) => (
        <Card key={context.key}>
          <Txt bold size={21}>
            {context.label}
          </Txt>
          <Txt muted>{(context.path || []).join(" › ")}</Txt>
          {context.status && <Pill>{human(context.status)}</Pill>}
          <Txt>{context.messageCount || 0} messages</Txt>
          <Button
            title="Open conversation"
            onPress={() =>
              navigation.navigate("Chat", {
                kind: "circle",
                eventId,
                bookingId: context.bookingId,
                requirementId: context.requirementId,
                title: context.label,
              })
            }
          />
        </Card>
      ))}
      {!contexts.length && (
        <Empty
          title="No conversations available"
          description="Refresh your event to load its conversation contexts."
        />
      )}
    </Page>
  );
}

export function BudgetScreen({ route, navigation }: any) {
  const { eventId } = route.params;
  const r = useResource(
    external,
    `/customer/events/${encodeURIComponent(eventId)}/dashboard`,
  );
  const c = usePalette();
  const budget = r.data.summary?.budget;
  const truth = r.data.financialTruth?.metrics || {};
  const total = budget
    ? Number(budget.committedCost) + Number(budget.estimatedCost)
    : null;
  const percentage =
    budget?.target > 0 && total != null
      ? Math.min(100, Math.max(0, (total / budget.target) * 100))
      : 0;
  const items: Data[] = (r.data.summary?.items || []).filter(
    (item: Data) => item.tier === "essential" || item.status !== "missing",
  );
  return (
    <Page {...r} title="Your event budget" subtitle={r.data.event?.title}>
      {budget && (
        <>
          <Card>
            <Txt muted>Estimated total</Txt>
            <Txt bold size={30}>
              {money(total)}
            </Txt>
            <Txt>
              Budget:{" "}
              {budget.target == null
                ? "Not set"
                : budget.isRange
                  ? budget.rangeLabel
                  : money(budget.target)}
            </Txt>
            {budget.target != null && (
              <>
                <View
                  accessibilityRole="progressbar"
                  accessibilityLabel="Estimated budget usage"
                  accessibilityValue={{
                    min: 0,
                    max: 100,
                    now: Math.round(percentage),
                  }}
                  style={{
                    height: 9,
                    borderRadius: 8,
                    backgroundColor: c.soft,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: `${percentage}%`,
                      height: 9,
                      backgroundColor: c.accent,
                    }}
                  />
                </View>
                <Txt bold>
                  {budget.remaining < 0
                    ? `${money(-budget.remaining)} over budget`
                    : `${money(budget.remaining)} remaining`}
                  {budget.isRange
                    ? " · compared with the top of your range"
                    : ""}
                </Txt>
              </>
            )}
            <Stats
              items={[
                ["Booked", money(budget.committedCost)],
                ["Still to arrange (estimate)", money(budget.estimatedCost)],
                ["Paid", money(truth.paidAmount)],
                ["Upcoming", money(truth.upcomingAmount)],
                ["Overdue", money(truth.overdueAmount)],
                ["Projected total", money(truth.projectedTotal ?? total)],
              ]}
            />
            {budget.estimateUsesDemoData && (
              <Pill>SOME ESTIMATES USE DEMO LISTINGS</Pill>
            )}
            {!!budget.servicesWithoutEstimate?.length && (
              <Txt muted>
                No listed price yet: {budget.servicesWithoutEstimate.join(", ")}
              </Txt>
            )}
          </Card>
          {items.map((item) => (
            <Card key={item.category}>
              <Txt bold size={19}>
                {item.label}
              </Txt>
              {item.bookedCost != null ? (
                <>
                  <Pill>BOOKED</Pill>
                  <Txt bold>{money(item.bookedCost)}</Txt>
                  <Txt muted>{item.vendorName}</Txt>
                </>
              ) : item.status === "customer_provided" ? (
                <>
                  <Pill>ARRANGED BY YOU</Pill>
                  <Txt>{item.providedValue}</Txt>
                </>
              ) : item.estimatedCost != null ? (
                <>
                  <Txt bold>Estimate: {money(item.estimatedCost)}</Txt>
                  <Txt muted>
                    Lowest listed option
                    {item.estimateIsDemo ? " · demo listing" : ""}
                  </Txt>
                </>
              ) : (
                <Txt muted>
                  {item.optionCount
                    ? `${item.optionCount} options, no fixed price`
                    : "No options listed yet"}
                </Txt>
              )}
              <Button
                title="Review service"
                secondary
                onPress={() =>
                  navigation.navigate("EventSection", {
                    eventId,
                    section: "services",
                    category: item.category,
                    title: item.label,
                  })
                }
              />
            </Card>
          ))}
        </>
      )}
      {!budget && !r.loading && (
        <Empty
          title="No budget breakdown available"
          description="Add your event requirements to see booked amounts and estimates."
        />
      )}
      <Button
        title="Ask Aura+ for ways to save"
        secondary
        onPress={() =>
          navigation.navigate("Chat", {
            eventId,
            initialPrompt: "How can I save on my budget?",
          })
        }
      />
    </Page>
  );
}
