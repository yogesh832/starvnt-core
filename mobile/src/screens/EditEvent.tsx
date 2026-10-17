import React, { useEffect, useState } from "react";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import {
  Button,
  ErrorNotice,
  Field,
  Page,
  useAction,
  useResource,
} from "../ui";

export function EditEvent({ route, navigation }: any) {
  const { eventId } = route.params;
  const path = `/customer/events/${encodeURIComponent(eventId)}`;
  const r = useResource(external, path);
  const a = useAction();
  const [form, setForm] = useState<Data>({});
  useEffect(() => {
    if (r.data.event)
      setForm({
        ...r.data.event,
        venueName: r.data.event.location?.venueName || "",
        address: r.data.event.location?.address || "",
      });
  }, [r.data]);
  const fields = [
    ["title", "Event name"],
    ["eventDate", "Event date (YYYY-MM-DD)"],
    ["city", "City"],
    ["venueName", "Venue name"],
    ["address", "Venue address"],
    ["guestCount", "Guest count"],
    ["budget", "Budget in ₹"],
    ["notes", "Notes"],
  ];
  return (
    <Page
      {...r}
      title="Make it yours"
      subtitle="Update the details behind your event."
    >
      {fields.map(([key, label]) => (
        <Field
          key={key}
          label={label}
          value={String(form[key] ?? "")}
          multiline={key === "notes"}
          keyboardType={
            ["guestCount", "budget"].includes(key) ? "number-pad" : "default"
          }
          onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
        />
      ))}
      <ErrorNotice message={a.error} />
      <Button
        title="Save event details"
        busy={a.busy}
        onPress={() => {
          void a.run(async () => {
            await external.call(path, "PATCH", {
              title: form.title,
              eventDate: form.eventDate,
              city: form.city,
              guestCount:
                form.guestCount === "" ? null : Number(form.guestCount),
              ...(form.budget !== "" && form.budget != null
                ? { budget: Number(form.budget) }
                : {}),
              notes: form.notes,
              location: { venueName: form.venueName, address: form.address },
            });
            navigation.goBack();
          });
        }}
      />
    </Page>
  );
}
