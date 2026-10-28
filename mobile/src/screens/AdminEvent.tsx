import React, { useState } from "react";
import { internal } from "../api/runtime";
import type { Data } from "../api/client";
import {
  Card,
  Choice,
  date,
  Empty,
  human,
  id,
  MenuRow,
  money,
  Page,
  Pill,
  Stats,
  Txt,
  useResource,
} from "../ui";
import { serviceLocationText } from "../eventFormModel";

export function AdminEvent({ route, navigation }: any) {
  const eventId = id(route.params.record);
  const r = useResource(internal, `/events/${encodeURIComponent(eventId)}`);
  const [tab, setTab] = useState("overview");
  const event = r.data.event;
  const requirements: Data[] = r.data.requirements || [];
  return (
    <Page
      {...r}
      title={event?.title || "Event workspace"}
      subtitle={
        event
          ? `${human(event.eventType)} · ${date(event.eventDate)}`
          : undefined
      }
    >
      <Choice
        label="Event workspace"
        value={tab}
        values={[
          "overview",
          "services",
          ...(r.data.canReadBookings ? ["bookings"] : []),
          "history",
        ]}
        onChange={setTab}
      />
      {event && tab === "overview" && (
        <>
          <Card>
            <Pill>{human(event.status)}</Pill>
            <Txt bold size={23}>
              {event.customer?.fullName || "Customer"}
            </Txt>
            <Txt>{event.customer?.email}</Txt>
            <Txt>{event.customer?.phone}</Txt>
            <Txt>
              {[
                event.location?.venueName,
                event.location?.address,
                event.location?.locality,
                event.city,
              ]
                .filter(Boolean)
                .join(", ")}
            </Txt>
            <Txt>Guests: {event.guestCount ?? "Not specified"}</Txt>
            <Txt>
              Budget:{" "}
              {event.budget != null
                ? money(event.budget)
                : event.budgetMin != null || event.budgetMax != null
                  ? `${money(event.budgetMin)} – ${money(event.budgetMax)}`
                  : "Not specified"}
            </Txt>
            {event.notes && <Txt>{event.notes}</Txt>}
            {event.specialRequirements && (
              <Txt>{event.specialRequirements}</Txt>
            )}
          </Card>
          <Stats
            items={[
              ["Services", requirements.length],
              [
                "Booked / completed",
                requirements.filter((row) =>
                  ["booked", "completed"].includes(row.status),
                ).length,
              ],
              [
                "Needs arranging",
                requirements.filter((row) => row.status === "pending").length,
              ],
            ]}
          />
        </>
      )}
      {tab === "services" &&
        requirements.map((row) => (
          <Card key={id(row)}>
            <Txt bold size={21}>
              {row.label}
            </Txt>
            <Pill>{human(row.status)}</Pill>
            {row.providedValue && <Txt>{row.providedValue}</Txt>}
            {row.selectedOption && (
              <>
                <Txt>
                  {row.selectedOption.vendorName} ·{" "}
                  {row.selectedOption.packageName}
                </Txt>
                <Txt>{money(row.selectedOption.price)}</Txt>
              </>
            )}
            <Txt muted>
              {serviceLocationText(row.serviceLocation, event?.city)}
            </Txt>
            {Object.entries(row.preferences || {}).map(([key, value]) => (
              <Txt key={key}>
                {human(key)}:{" "}
                {Array.isArray(value)
                  ? value.join(", ")
                  : typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
              </Txt>
            ))}
            {row.specialRequirements && <Txt>{row.specialRequirements}</Txt>}
          </Card>
        ))}
      {tab === "bookings" && r.data.canReadBookings && (
        <>
          {(r.data.bookings || []).map((booking: Data) => (
            <MenuRow
              key={id(booking)}
              title={booking.serviceName}
              subtitle={`${booking.vendorName} · ${human(booking.executionStatus)} · ${money(booking.totalAmount)}`}
              onPress={() =>
                navigation.navigate("AdminRecord", {
                  module: "bookings",
                  record: booking,
                })
              }
            />
          ))}
          {!r.data.bookings?.length && (
            <Empty title="No linked Core bookings" />
          )}
        </>
      )}
      {tab === "history" && (
        <>
          {(r.data.history || []).map((entry: Data) => (
            <Card key={id(entry)}>
              <Txt bold>{human(entry.action)}</Txt>
              <Txt muted>
                {human(entry.actorType)} · {date(entry.createdAt)}
              </Txt>
              {Object.entries(entry.details || {}).map(([key, value]) => (
                <Txt key={key}>
                  {human(key)}:{" "}
                  {typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
                </Txt>
              ))}
            </Card>
          ))}
          {!r.data.history?.length && (
            <Empty title="No recorded event history" />
          )}
        </>
      )}
    </Page>
  );
}
