import React, { useState } from "react";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import { EventDateField, LocationFields, ServiceFields } from "../EventFields";
import {
  detailsPayload,
  emptyLocation,
  emptyServiceLocation,
  locationPayload,
  serviceLocationPayload,
} from "../eventFormModel";
import {
  Button,
  Card,
  Choice,
  ErrorNotice,
  Field,
  MultiChoice,
  Page,
  Pill,
  Txt,
  human,
  id,
  useAction,
  useResource,
} from "../ui";

export function NewEvent({ navigation }: any) {
  const [eventType, setEventType] = useState("wedding");
  const options = useResource(
    external,
    `/customer/plan-options?eventType=${encodeURIComponent(eventType)}`,
  );
  const [form, setForm] = useState<Data>({
    title: "",
    customType: "",
    eventDate: "",
    guestCount: "",
    specialRequirements: "",
    notes: "",
  });
  const [location, setLocation] = useState<Data>({ ...emptyLocation });
  const [budgetMode, setBudgetMode] = useState("range");
  const [budget, setBudget] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [services, setServices] = useState<Data>({});
  const [expanded, setExpanded] = useState("");
  const [key] = useState(
    () => `native-event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const action = useAction();
  const field = (name: string) => ({
    value: form[name] || "",
    onChangeText: (text: string) =>
      setForm((value) => ({ ...value, [name]: text })),
  });
  const categories: Data[] = options.data.categories || [];
  const categoryLabels = Object.fromEntries(
    categories.map((c) => [c.value, c.label]),
  );
  const ranges: Data[] = Array.isArray(options.data.budgetRanges)
    ? options.data.budgetRanges
    : [];
  const label = [location.venueName, location.area, location.city]
    .filter(Boolean)
    .join(", ");
  return (
    <Page
      title="Create your event plan"
      subtitle="The same planning details, made comfortable for your phone."
      loading={options.loading}
      error={options.error}
      refresh={options.refresh}
    >
      <ErrorNotice message={action.error} />
      <Card>
        <Pill>01 · YOUR OCCASION</Pill>
        <Field
          label="Event name"
          {...field("title")}
          placeholder="A celebration to remember"
        />
        <Choice
          label="What are we celebrating?"
          value={eventType}
          values={(options.data.eventTypes || []).map(
            (type: Data) => type.value,
          )}
          labels={Object.fromEntries(
            (options.data.eventTypes || []).map((type: Data) => [
              type.value,
              type.label,
            ]),
          )}
          onChange={(next) => {
            setEventType(next);
            setBudgetRange("");
          }}
        />
        {eventType === "other" && (
          <Field label="What type of occasion?" {...field("customType")} />
        )}
        <EventDateField
          value={form.eventDate}
          onChange={(eventDate) => setForm((v) => ({ ...v, eventDate }))}
          minimumDate={new Date()}
        />
        <Field
          label="Number of guests (optional)"
          {...field("guestCount")}
          keyboardType="number-pad"
        />
      </Card>
      <Card>
        <Pill>02 · LOCATION</Pill>
        <LocationFields value={location} onChange={setLocation} />
      </Card>
      <Card>
        <Pill>03 · BUDGET</Pill>
        <Choice
          label="Choose how to budget"
          value={budgetMode}
          values={["range", "exact"]}
          labels={{ range: "Budget range", exact: "Exact amount" }}
          onChange={setBudgetMode}
        />
        {budgetMode === "range" ? (
          <Choice
            label="Your budget range (optional)"
            value={budgetRange}
            values={["", ...ranges.map((range) => range.id)]}
            labels={{
              "": "Decide later",
              ...Object.fromEntries(
                ranges.map((range) => [range.id, range.label]),
              ),
            }}
            onChange={setBudgetRange}
          />
        ) : (
          <Field
            label="Budget in ₹ (optional)"
            value={budget}
            onChangeText={setBudget}
            keyboardType="numeric"
          />
        )}
      </Card>
      <Card>
        <Pill>04 · YOUR SERVICES</Pill>
        <Txt muted size={13}>
          Choose services you need help with or have already arranged. You can
          add more later.
        </Txt>
        <MultiChoice
          label="Select services"
          values={categories.map((category) => category.value)}
          labels={categoryLabels}
          selected={Object.keys(services)}
          onChange={(selected) =>
            setServices((current) =>
              Object.fromEntries(
                selected.map((category) => [
                  category,
                  current[category] || {
                    status: "pending",
                    details: {},
                    serviceLocation: { ...emptyServiceLocation },
                    specialRequirements: "",
                  },
                ]),
              ),
            )
          }
        />
      </Card>
      {Object.entries(services).map(([category, service]: [string, any]) => (
        <Card key={category}>
          <Txt bold size={20}>
            {categoryLabels[category] || human(category)}
          </Txt>
          {options.data.template?.essential?.includes(category) && (
            <Pill>ESSENTIAL</Pill>
          )}
          <Choice
            label="How are you arranging this?"
            value={service.status}
            values={["pending", "customer_provided"]}
            labels={{
              pending: "Need help",
              customer_provided: "Already arranged",
            }}
            onChange={(status) =>
              setServices((v) => ({
                ...v,
                [category]: { ...v[category], status },
              }))
            }
          />
          {service.status === "customer_provided" && (
            <Field
              label="Who / what have you arranged?"
              value={service.providedValue || ""}
              onChangeText={(providedValue) =>
                setServices((v) => ({
                  ...v,
                  [category]: { ...v[category], providedValue },
                }))
              }
            />
          )}
          <Button
            title={
              expanded === category
                ? "Hide details & location"
                : "Details & location"
            }
            secondary
            onPress={() =>
              setExpanded((current) => (current === category ? "" : category))
            }
          />
          {expanded === category && (
            <ServiceFields
              category={category}
              options={options.data}
              value={service}
              eventLocationLabel={label}
              onChange={(value) =>
                setServices((v) => ({ ...v, [category]: value }))
              }
            />
          )}
        </Card>
      ))}
      <Card>
        <Pill>05 · PREFERENCES & NOTES</Pill>
        <Field
          label="Special requirements"
          {...field("specialRequirements")}
          multiline
        />
        <Field label="Notes" {...field("notes")} multiline />
      </Card>
      <Button
        title="Create my event plan"
        busy={action.busy}
        disabled={options.loading || !!options.error}
        onPress={() => {
          void action.run(async () => {
            if (!location.city?.trim() || !form.eventDate)
              throw new Error("Add the city and date to continue.");
            if (
              form.guestCount &&
              (!Number.isInteger(Number(form.guestCount)) ||
                Number(form.guestCount) < 1)
            )
              throw new Error("Guest count must be a positive whole number.");
            if (
              budgetMode === "exact" &&
              budget &&
              (!Number.isFinite(Number(budget)) || Number(budget) <= 0)
            )
              throw new Error("Enter a valid positive budget.");
            const result = await external.call("/customer/events", "POST", {
              eventType,
              title: form.title.trim(),
              eventDate: form.eventDate,
              ...(eventType === "other"
                ? { customType: form.customType.trim() || null }
                : {}),
              location: locationPayload(location),
              ...(form.guestCount
                ? { guestCount: Number(form.guestCount) }
                : {}),
              ...(budgetMode === "exact" && budget
                ? { budget: Number(budget) }
                : {}),
              ...(budgetMode === "range" && budgetRange ? { budgetRange } : {}),
              specialRequirements: form.specialRequirements.trim() || null,
              notes: form.notes.trim() || null,
              idempotencyKey: key,
              services: Object.entries(services).map(
                ([category, service]: [string, any]) => ({
                  category,
                  status: service.status,
                  providedValue: service.providedValue?.trim() || undefined,
                  details: detailsPayload(service.details),
                  serviceLocation: serviceLocationPayload(
                    service.serviceLocation,
                  ),
                  specialRequirements:
                    service.specialRequirements?.trim() || null,
                }),
              ),
            });
            navigation.replace("Event", { eventId: id(result.event) });
          });
        }}
      />
    </Page>
  );
}
