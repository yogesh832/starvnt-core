import React, { useState } from "react";
import { Platform, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { Data } from "./api/client";
import { Button, Choice, Field, MultiChoice, Txt, date } from "./ui";
import { emptyLocation, emptyServiceLocation } from "./eventFormModel";

export function EventDateField({
  value,
  onChange,
  minimumDate,
  label = "Event date",
}: {
  value: string;
  onChange: (value: string) => void;
  minimumDate?: Date;
  label?: string;
}) {
  const [show, setShow] = useState(false);
  if (Platform.OS === "web")
    return (
      <Field
        label={`${label} (YYYY-MM-DD)`}
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        maxLength={10}
      />
    );
  const selected = new Date(`${value}T12:00:00`);
  return (
    <View style={{ gap: 10 }}>
      <Txt bold size={13}>
        {label}
      </Txt>
      <Button
        title={value ? date(value) : "Choose date"}
        secondary
        onPress={() => setShow(true)}
      />
      {show && (
        <DateTimePicker
          value={Number.isNaN(selected.getTime()) ? new Date() : selected}
          minimumDate={minimumDate}
          mode="date"
          onChange={(event, next) => {
            if (Platform.OS === "android") setShow(false);
            if (event.type !== "dismissed" && next)
              onChange(
                `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`,
              );
          }}
        />
      )}
      {show && Platform.OS === "ios" && (
        <Button
          title="Done choosing date"
          secondary
          onPress={() => setShow(false)}
        />
      )}
    </View>
  );
}

export function LocationFields({
  value,
  onChange,
}: {
  value: Data;
  onChange: (value: Data) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const fields = [
    ["city", "City"],
    ["venueName", "Venue name"],
    ["area", "Area / locality"],
    ["address", "Full address"],
    ["state", "State"],
    ["country", "Country"],
    ["pincode", "Pincode"],
    ["landmark", "Landmark"],
    ["notes", "Location notes"],
  ];
  return (
    <View style={{ gap: 14 }}>
      {fields
        .filter(([key]) => expanded || ["city", "venueName"].includes(key))
        .map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={String(value[key] || "")}
            onChangeText={(text) =>
              onChange({ ...emptyLocation, ...value, [key]: text })
            }
            keyboardType={
              key === "pincode" ? "numbers-and-punctuation" : "default"
            }
            multiline={["address", "notes"].includes(key)}
          />
        ))}
      <Button
        title={
          expanded
            ? "Show fewer address fields"
            : "Add full address & location notes"
        }
        secondary
        onPress={() => setExpanded((v) => !v)}
      />
    </View>
  );
}

export function ServiceFields({
  category,
  options,
  value,
  onChange,
  eventLocationLabel,
}: {
  category: string;
  options: Data;
  value: Data;
  onChange: (value: Data) => void;
  eventLocationLabel?: string;
}) {
  const details = value.details || {};
  const location = { ...emptyServiceLocation, ...value.serviceLocation };
  const route = (options.routeCategories || []).includes(category);
  const fields: Data[] = options.serviceFields?.[category] || [];
  const updateLocation = (patch: Data) =>
    onChange({ ...value, serviceLocation: { ...location, ...patch } });
  const locationMode =
    route && location.mode === "custom" && location.dropIsEventLocation
      ? "event"
      : location.mode;
  return (
    <View style={{ gap: 17 }}>
      {fields.map((field) => {
        const change = (next: any) =>
          onChange({ ...value, details: { ...details, [field.key]: next } });
        return field.type === "multiselect" ? (
          <MultiChoice
            key={field.key}
            label={field.label}
            values={field.options || []}
            selected={details[field.key] || []}
            onChange={change}
          />
        ) : field.type === "select" ? (
          <Choice
            key={field.key}
            label={field.label}
            value={details[field.key] || ""}
            values={["", ...(field.options || [])]}
            labels={{ "": "Not specified" }}
            onChange={change}
          />
        ) : (
          <Field
            key={field.key}
            label={field.label}
            value={String(details[field.key] ?? "")}
            keyboardType={field.type === "number" ? "numeric" : "default"}
            onChangeText={(text) =>
              change(
                field.type === "number"
                  ? text === ""
                    ? null
                    : Number(text)
                  : text,
              )
            }
          />
        );
      })}
      <Choice
        label="Where will this happen?"
        value={locationMode}
        values={["event", "custom", "unspecified"]}
        labels={{
          event: route ? "Drop at event location" : "Use event location",
          custom: route ? "Set pickup / drop" : "Different location",
          unspecified: "Not specified yet",
        }}
        onChange={(mode) =>
          updateLocation(
            route && mode === "event"
              ? { mode: "custom", dropIsEventLocation: true }
              : { mode, dropIsEventLocation: false },
          )
        }
      />
      {(location.mode === "event" || location.dropIsEventLocation) && (
        <Txt muted size={13}>
          {eventLocationLabel || "At the event location"}
        </Txt>
      )}
      {location.mode === "custom" &&
        (route ? (
          <>
            <Field
              label="Pickup location"
              value={location.pickup || ""}
              onChangeText={(pickup) => updateLocation({ pickup })}
            />
            {!location.dropIsEventLocation && (
              <Field
                label="Drop location"
                value={location.drop || ""}
                onChangeText={(drop) => updateLocation({ drop })}
              />
            )}
            <Choice
              label="Drop at the event location"
              value={location.dropIsEventLocation ? "yes" : "no"}
              values={["yes", "no"]}
              onChange={(next) =>
                updateLocation({ dropIsEventLocation: next === "yes" })
              }
            />
          </>
        ) : (
          <Field
            label="Service place / address"
            value={location.place || ""}
            onChangeText={(place) => updateLocation({ place })}
            placeholder={
              category === "makeup" ? "Bride's hotel" : "Place or address"
            }
          />
        ))}
      <Field
        label="Special requirements"
        value={value.specialRequirements || ""}
        onChangeText={(specialRequirements) =>
          onChange({ ...value, specialRequirements })
        }
        multiline
        placeholder="Anything the vendor should know"
      />
    </View>
  );
}
