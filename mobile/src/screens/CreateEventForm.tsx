// 📄 CreateEventForm.tsx – A single form to create an event with all details in one place.
// Uses existing field components and adds branded icons for a polished look.

import React, { useState } from "react";
import { View, ScrollView } from "react-native";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import {
  Button,
  Card,
  Choice,
  ErrorNotice,
  Field,
  Icon,
  Page,
  Txt,
  useAction,
  useResource,
} from "../ui";
import {
  EventDateField,
  LocationFields,
  ServiceFields,
} from "../EventFields";
import { emptyLocation, eventEditPayload, locationFromEvent } from "../eventFormModel";
import { LogoMark } from "../BrandLogo";

/**
 * Creates a new event. All fields are presented in a single scrollable form.
 * The UI mirrors the look‑and‑feel of the existing EditEvent screen but adds
 * a header with the StarVnt logo and section icons.
 */
export function CreateEventForm({ navigation }: any) {
  // Form state mirrors the payload shape expected by the server.
  const [form, setForm] = useState<Data>({});
  const [location, setLocation] = useState<Data>({ ...emptyLocation });

  // Load auxiliary data (event types, service options) from the API.
  const options = useResource(external, "/customer/plan-options");
  const action = useAction();

  // Helper to update a specific field in the form.
  const field = (key: string) => ({
    value: String(form[key] ?? ""),
    onChangeText: (value: string) =>
      setForm((current) => ({ ...current, [key]: value })),
  });

  // Submit handler – builds the payload using the shared helper.
  const submit = async () => {
    const payload = eventEditPayload(form, location, { status: "draft" });
    // If nothing changed, just navigate back.
    if (Object.keys(payload).length) {
      await external.call("/customer/events", "POST", payload);
    }
    navigation.goBack();
  };

  return (
    <Page title="Create Event" subtitle="Fill in all details in one step.">
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        style={{ flex: 1 }}
      >
        {/* Header with logo and a short tagline */}
        <View style={{ alignItems: "center", gap: 8 }}>
          <LogoMark size={48} />
          <Txt bold size={20}>
            New Event – All‑in‑One Form
          </Txt>
        </View>

        {/* Event name & type */}
        <Card>
          <Field label="Event name" {...field("title")} />
          <Choice
            label="Event type"
            value={form.eventType || ""}
            values={(options.data?.eventTypes || []).map((t: Data) => t.value)}
            labels={Object.fromEntries(
              (options.data?.eventTypes || []).map((t: Data) => [t.value, t.label])
            )}
            onChange={(eventType) => setForm((v) => ({ ...v, eventType }))}
          />
          {form.eventType === "other" && (
            <Field label="What kind of event?" {...field("customType")} />
          )}
        </Card>

        {/* Date picker */}
        <Card>
          <Txt bold size={13} style={{ marginBottom: 4 }}>
            <Icon name="calendar" size={14} /> Event date
          </Txt>
          <EventDateField
            value={form.eventDate || ""}
            onChange={(d) => setForm((v) => ({ ...v, eventDate: d }))}
          />
        </Card>

        {/* Location fields */}
        <Card>
          <Txt bold size={13} style={{ marginBottom: 4 }}>
            <Icon name="location" size={14} /> Event location
          </Txt>
          <LocationFields value={location} onChange={setLocation} />
        </Card>

        {/* Guest count, budget, notes */}
        <Card>
          <Field label="Guest count" {...field("guestCount")} keyboardType="number-pad" />
          <Field label="Exact budget (₹)" {...field("budget")} keyboardType="numeric" />
          <Field label="Special requirements" {...field("specialRequirements")} multiline />
          <Field label="Additional notes" {...field("notes")} multiline />
        </Card>

        {/* Service selection – uses the shared ServiceFields component */}
        <Card>
          <Txt bold size={13} style={{ marginBottom: 4 }}>
            <Icon name="layers" size={14} /> Services &amp; preferences
          </Txt>
          <ServiceFields
            category={form.serviceCategory || ""}
            options={options.data || {}}
            value={form.service || {}}
            onChange={(svc) => setForm((v) => ({ ...v, service: svc }))}
            eventLocationLabel="Use event location"
          />
        </Card>

        {/* Error notice and submit button */}
        <ErrorNotice message={action.error || options.error} />
        <Button
          title="Create event"
          busy={action.busy}
          onPress={() => {
            void action.run(async () => {
              await submit();
            });
          }}
        />
      </ScrollView>
    </Page>
  );
}
