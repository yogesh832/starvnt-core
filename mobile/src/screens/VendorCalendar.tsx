import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import { EventDateField } from "../EventFields";
import {
  Button,
  Card,
  Choice,
  Empty,
  ErrorNotice,
  Field,
  MultiChoice,
  Page,
  Pill,
  Txt,
  confirm,
  date,
  human,
  id,
  money,
  useAction,
  usePalette,
  useResource,
} from "../ui";

const iso = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const dayKey = (value: unknown) => String(value || "").split("T")[0];
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function VendorCalendar({ navigation }: any) {
  const c = usePalette();
  const bookings = useResource(external, "/vendor/bookings");
  const blockouts = useResource(external, "/vendor/availability/blockouts");
  const slots = useResource(external, "/vendor/availability/bookings");
  const services = useResource(external, "/vendor/services");
  const resources = useResource(external, "/vendor/resources");
  const action = useAction();
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState(() => iso(new Date()));
  const [mode, setMode] = useState("");
  const [allDay, setAllDay] = useState("yes");
  const [form, setForm] = useState<Data>({
    date: iso(new Date()),
    startTime: "09:00",
    endTime: "18:00",
    reason: "",
    vendorServiceId: "",
    city: "",
    locality: "",
    address: "",
    assignedResources: [],
  });
  const field = (key: string) => ({
    value: String(form[key] || ""),
    onChangeText: (value: string) =>
      setForm((current) => ({ ...current, [key]: value })),
  });
  const refresh = () => {
    bookings.refresh();
    blockouts.refresh();
    slots.refresh();
  };
  const rows: Data[] = [
    ...(bookings.data.bookings || []).map((booking: Data) => ({
      ...booking,
      calendarKind: "booking",
      calendarDate: dayKey(booking.eventDate || booking.date),
    })),
    ...(blockouts.data.blockouts || []).map((blockout: Data) => ({
      ...blockout,
      calendarKind: "blockout",
      calendarDate: dayKey(blockout.date),
    })),
    ...(slots.data.bookings || []).map((slot: Data) => ({
      ...slot,
      calendarKind: "slot",
      calendarDate: dayKey(slot.date),
    })),
  ];
  const selectedRows = rows.filter((row) => row.calendarDate === selected);
  const firstDay = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const moveMonth = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setSelected(iso(next));
  };
  const availableResources: Data[] = (resources.data.resources || []).filter(
    (resource: Data) => resource.status !== "RETIRED",
  );
  async function save() {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(form.date) ||
      Number.isNaN(new Date(`${form.date}T12:00:00`).getTime()) ||
      iso(new Date(`${form.date}T12:00:00`)) !== form.date
    )
      throw new Error("Choose a valid date.");
    if (
      (mode === "slot" || allDay === "no") &&
      (!timePattern.test(form.startTime) ||
        !timePattern.test(form.endTime) ||
        form.startTime >= form.endTime)
    )
      throw new Error(
        "Enter start and end times as HH:mm, with the end after the start.",
      );
    if (mode === "blockout") {
      await external.call("/vendor/availability/blockouts", "POST", {
        date: form.date,
        allDay: allDay === "yes",
        startTime: allDay === "yes" ? "00:00" : form.startTime,
        endTime: allDay === "yes" ? "23:59" : form.endTime,
        reason: form.reason.trim() || "Unavailable",
      });
    } else {
      if (!form.vendorServiceId)
        throw new Error("Choose the service for this calendar commitment.");
      await external.call("/vendor/availability/bookings", "POST", {
        vendorServiceId: form.vendorServiceId,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        serviceLocation: {
          city: form.city.trim(),
          locality: form.locality.trim(),
          address: form.address.trim(),
        },
        assignedResources: form.assignedResources,
      });
    }
    setSelected(form.date);
    const chosen = new Date(`${form.date}T12:00:00`);
    setMonth(new Date(chosen.getFullYear(), chosen.getMonth(), 1));
    setMode("");
    refresh();
  }
  return (
    <Page
      title="Your calendar"
      subtitle="Bookings, team commitments and unavailable time in one place."
      loading={bookings.loading && blockouts.loading && slots.loading}
      refresh={refresh}
      refreshing={
        bookings.refreshing || blockouts.refreshing || slots.refreshing
      }
    >
      <ErrorNotice
        message={
          bookings.error || blockouts.error || slots.error || action.error
        }
        retry={refresh}
      />
      <Card>
        <Txt bold size={23}>
          {month.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </Txt>
        <View
          style={{
            flexDirection: "row",
            flexWrap: 'wrap',
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <Button
            title="Previous month"
            secondary
            onPress={() => moveMonth(-1)}
          />
          <Button title="Next month" secondary onPress={() => moveMonth(1)} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <View key={day} style={{ width: "14.285%", paddingVertical: 9 }}>
              <Txt muted size={11} style={{ textAlign: "center" }}>
                {day}
              </Txt>
            </View>
          ))}
          {Array.from({ length: firstDay }, (_, index) => (
            <View
              key={`blank-${index}`}
              style={{ width: "14.285%", height: 52 }}
            />
          ))}
          {Array.from({ length: days }, (_, index) => {
            const number = index + 1;
            const key = iso(
              new Date(month.getFullYear(), month.getMonth(), number),
            );
            const entries = rows.filter((row) => row.calendarDate === key);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${date(key)}, ${entries.length} calendar entries`}
                accessibilityState={{ selected: key === selected }}
                key={key}
                onPress={() => setSelected(key)}
                style={{ width: "14.285%", minHeight: 52, padding: 2 }}
              >
                <View
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    backgroundColor: key === selected ? c.accent : c.card,
                  }}
                >
                  <Txt
                    bold={key === selected}
                    size={14}
                    style={{ color: key === selected ? c.onAccent : c.ink }}
                  >
                    {number}
                  </Txt>
                  <View style={{ height: 5, flexDirection: "row", gap: 3 }}>
                    {entries.some((row) => row.calendarKind !== "blockout") && (
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 5,
                          backgroundColor:
                            key === selected ? c.onAccent : "#059669",
                        }}
                      />
                    )}
                    {entries.some((row) => row.calendarKind === "blockout") && (
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 5,
                          backgroundColor:
                            key === selected ? c.onAccent : c.danger,
                        }}
                      />
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Txt muted size={12}>
          Green: bookings or commitments · Red: unavailable time
        </Txt>
      </Card>
      <Txt bold size={21}>
        {date(selected)}
      </Txt>
      {selectedRows.map((row, index) => (
        <Card key={`${row.calendarKind}-${id(row) || index}`}>
          <Pill>
            {row.calendarKind === "blockout"
              ? "UNAVAILABLE"
              : row.calendarKind === "slot"
                ? "CALENDAR COMMITMENT"
                : human(row.bookingStatus || row.status || "Booking")}
          </Pill>
          <Txt bold>
            {row.calendarKind === "blockout"
              ? row.reason || "Unavailable"
              : row.serviceName || row.vendorService?.name || "Booked service"}
          </Txt>
          {row.customerName && <Txt>{row.customerName}</Txt>}
          <Txt muted>
            {row.allDay
              ? "All day"
              : row.startTime && row.endTime
                ? `${row.startTime} – ${row.endTime}`
                : "Event booking"}
          </Txt>
          {!!row.totalAmount && <Txt bold>{money(row.totalAmount)}</Txt>}
          {row.calendarKind === "booking" && (
            <Button
              title="Open booking"
              secondary
              onPress={() =>
                navigation.navigate("VendorBooking", { booking: row })
              }
            />
          )}
          {row.calendarKind === "blockout" && (
            <Button
              title="Remove unavailable time"
              secondary
              busy={action.busy}
              onPress={() =>
                confirm(
                  "Remove unavailable time?",
                  "This time will become available for matching again.",
                  () => {
                    void action.run(async () => {
                      await external.call(
                        `/vendor/availability/blockouts/${encodeURIComponent(id(row))}`,
                        "DELETE",
                      );
                      refresh();
                    });
                  },
                )
              }
            />
          )}
        </Card>
      ))}
      {!selectedRows.length && (
        <Empty
          title="No calendar entries for this date"
          description="Your saved bookings and unavailable times will appear here."
        />
      )}
      <Button
        title="Block unavailable time"
        secondary
        onPress={() => {
          setForm((value) => ({ ...value, date: selected }));
          setMode("blockout");
        }}
      />
      <Button
        title="Add calendar commitment"
        secondary
        onPress={() => {
          setForm((value) => ({ ...value, date: selected }));
          setMode("slot");
        }}
      />
      {mode && (
        <Card>
          <Txt bold size={21}>
            {mode === "blockout" ? "Unavailable time" : "Calendar commitment"}
          </Txt>
          <EventDateField
            label="Date"
            value={form.date}
            onChange={(value) =>
              setForm((current) => ({ ...current, date: value }))
            }
          />
          {mode === "blockout" && (
            <>
              <Choice
                label="All day?"
                value={allDay}
                values={["yes", "no"]}
                onChange={setAllDay}
              />
              <Field label="Reason" {...field("reason")} />
            </>
          )}
          {(mode === "slot" || allDay === "no") && (
            <>
              <Field
                label="Start time (HH:mm)"
                {...field("startTime")}
                placeholder="09:00"
                maxLength={5}
              />
              <Field
                label="End time (HH:mm)"
                {...field("endTime")}
                placeholder="18:00"
                maxLength={5}
              />
            </>
          )}
          {mode === "slot" && (
            <>
              <ErrorNotice
                message={services.error || resources.error}
                retry={() => {
                  services.refresh();
                  resources.refresh();
                }}
              />
              <Choice
                label="Service"
                value={form.vendorServiceId}
                values={(services.data.services || []).map((service: Data) =>
                  id(service),
                )}
                labels={Object.fromEntries(
                  (services.data.services || []).map((service: Data) => [
                    id(service),
                    service.name || service.category,
                  ]),
                )}
                onChange={(vendorServiceId) =>
                  setForm((value) => ({ ...value, vendorServiceId }))
                }
              />
              <Field label="City" {...field("city")} />
              <Field label="Locality" {...field("locality")} />
              <Field label="Address" {...field("address")} />
              <MultiChoice
                label="Assigned team & resources"
                values={availableResources.map((resource) => id(resource))}
                labels={Object.fromEntries(
                  availableResources.map((resource) => [
                    id(resource),
                    resource.name || human(resource.type),
                  ]),
                )}
                selected={form.assignedResources}
                onChange={(assignedResources) =>
                  setForm((value) => ({ ...value, assignedResources }))
                }
              />
            </>
          )}
          <ErrorNotice message={action.error} />
          <Button
            title="Save calendar entry"
            busy={action.busy}
            disabled={
              mode === "slot" &&
              (services.loading ||
                resources.loading ||
                !!services.error ||
                !!resources.error)
            }
            onPress={() => {
              void action.run(save);
            }}
          />
          <Button
            title="Cancel"
            secondary
            disabled={action.busy}
            onPress={() => setMode("")}
          />
        </Card>
      )}
    </Page>
  );
}
