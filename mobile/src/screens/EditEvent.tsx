import React, { useEffect, useState } from "react";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import { EventDateField, LocationFields } from "../EventFields";
import {
  emptyLocation,
  eventEditPayload,
  locationFromEvent,
} from "../eventFormModel";
import {
  Button,
  Card,
  Choice,
  ErrorNotice,
  Field,
  Page,
  Pill,
  Txt,
  human,
  useAction,
  useResource,
} from "../ui";

export function EditEvent({ route, navigation }: any) {
  const { eventId } = route.params;
  const path = `/customer/events/${encodeURIComponent(eventId)}`;
  const r = useResource(external, path);
  const options = useResource(external, "/customer/plan-options");
  const action = useAction();
  const [form, setForm] = useState<Data>({});
  const [location, setLocation] = useState<Data>({ ...emptyLocation });
  useEffect(() => {
    if (r.data.event) {
      setForm({ ...r.data.event });
      setLocation(locationFromEvent(r.data.event));
    }
  }, [r.data]);
  const field = (key: string) => ({
    value: String(form[key] ?? ""),
    onChangeText: (value: string) =>
      setForm((current) => ({ ...current, [key]: value })),
  });
  const closed = ["completed", "cancelled"].includes(r.data.event?.status);
  return (
    <Page
      {...r}
      title="Make it yours"
      subtitle="Update the details behind your event."
    >
      {closed ? (
        <Card>
          <Pill>{human(r.data.event.status)}</Pill>
          <Txt>
            This event is closed and its planning details can no longer be
            changed.
          </Txt>
        </Card>
      ) : (
        <>
          <Card>
            <Pill>YOUR OCCASION</Pill>
            <Field label="Event name" {...field("title")} />
            {r.data.event?.status === "draft" ? (
              <Choice
                label="Event type"
                value={form.eventType || ""}
                values={(options.data.eventTypes || []).map(
                  (type: Data) => type.value,
                )}
                labels={Object.fromEntries(
                  (options.data.eventTypes || []).map((type: Data) => [
                    type.value,
                    type.label,
                  ]),
                )}
                onChange={(eventType) =>
                  setForm((value) => ({ ...value, eventType }))
                }
              />
            ) : (
              <Txt muted>{human(form.eventType)}</Txt>
            )}
            {form.eventType === "other" && (
              <Field label="What kind of event?" {...field("customType")} />
            )}
            <EventDateField
              value={form.eventDate || ""}
              onChange={(eventDate) =>
                setForm((value) => ({ ...value, eventDate }))
              }
            />
            <Field
              label="Guest count"
              {...field("guestCount")}
              keyboardType="number-pad"
            />
            {r.data.event?.budgetRangeLabel && (
              <Txt muted size={13}>
                Current budget range: {r.data.event.budgetRangeLabel}. Leave the
                exact amount unchanged to keep this range.
              </Txt>
            )}
            <Field
              label="Exact budget in ₹"
              {...field("budget")}
              keyboardType="numeric"
            />
          </Card>
          <Card>
            <Pill>EVENT LOCATION</Pill>
            <LocationFields value={location} onChange={setLocation} />
          </Card>
          <Card>
            <Field
              label="Special requirements"
              {...field("specialRequirements")}
              multiline
            />
            <Field label="Notes" {...field("notes")} multiline />
          </Card>
          <ErrorNotice message={action.error || options.error} />
          <Button
            title="Save event details"
            busy={action.busy}
            onPress={() => {
              void action.run(async () => {
                const payload = eventEditPayload(form, location, r.data.event);
                if (Object.keys(payload).length)
                  await external.call(path, "PATCH", payload);
                navigation.goBack();
              });
            }}
          />
        </>
      )}
    </Page>
  );
}
