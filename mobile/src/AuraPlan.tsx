import React, { useState } from "react";
import { View } from "react-native";
import type { Data } from "./api/client";
import { Button, Card, date, id, money, Pill, Txt } from "./ui";

export function AuraPlan({
  event,
  understanding,
  navigation,
  busy,
  onConfirm,
  onAsk,
}: {
  event: Data | null;
  understanding: Data | null;
  navigation: any;
  busy: boolean;
  onConfirm: () => void;
  onAsk?: (message: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (!event || !understanding) return null;
  if (understanding.confirmed)
    return (
      <Card>
        <Pill>YOUR PLAN IS READY</Pill>
        <Txt bold>{event.title}</Txt>
        <Button
          title="Open event plan"
          onPress={() => navigation.navigate("Event", { eventId: id(event) })}
        />
      </Card>
    );
  if (collapsed)
    return (
      <Button
        title="Show what Aura+ understood"
        secondary
        onPress={() => setCollapsed(false)}
      />
    );
  const facts = understanding.facts || {};
  const factRows: [string, Data | undefined, any][] = [
    ["Occasion", facts.eventType, facts.eventType?.label],
    [
      "Date",
      facts.date,
      facts.date?.value ? date(facts.date.value) : "Not specified",
    ],
    ["Guests", facts.guestCount, facts.guestCount?.value],
    [
      "Location",
      facts.location || facts.city,
      facts.location?.value || facts.city?.value,
    ],
    [
      "Budget",
      facts.budget,
      facts.budget?.value != null
        ? money(facts.budget.value)
        : facts.budget?.rangeLabel,
    ],
  ];
  const services = understanding.services || {};
  return (
    <Card>
      <Pill>NOT CONFIRMED YET</Pill>
      <Txt bold size={23}>
        Here’s what I understood
      </Txt>
      {factRows.map(([label, fact, display]) => (
        <View key={label} style={{ gap: 3 }}>
          <Txt muted size={12}>
            {label}
          </Txt>
          <Txt bold>
            {fact?.state === "MISSING" || display == null || display === ""
              ? "Not specified"
              : String(display)}
          </Txt>
          {fact?.state === "INFERRED" && (
            <Txt muted size={12}>
              Assumed — {fact.note || "please check this detail"}
            </Txt>
          )}
        </View>
      ))}
      <Txt bold>Services</Txt>
      {(services.needed || []).map((service: Data) => (
        <Txt key={service.category}>
          {service.label}: need help
          {service.location ? ` · ${service.location}` : ""}
        </Txt>
      ))}
      {(services.provided || []).map((service: Data) => (
        <Txt key={service.category}>
          ✓ {service.label}: arranged by you
          {service.value ? ` · ${service.value}` : ""}
          {service.location ? ` · ${service.location}` : ""}
        </Txt>
      ))}
      {!services.needed?.length && !services.provided?.length && (
        <Txt muted>Not specified</Txt>
      )}
      {!!services.suggested?.length && (
        <>
          <Txt muted>May be useful — you decide:</Txt>
          {services.suggested.map((service: Data) =>
            onAsk ? (
              <Button
                key={service.category}
                title={`Add ${service.label}`}
                secondary
                disabled={busy}
                onPress={() =>
                  onAsk(`I need ${String(service.label).toLowerCase()}`)
                }
              />
            ) : (
              <Txt muted key={service.category}>
                {service.label}
              </Txt>
            ),
          )}
        </>
      )}
      {!!understanding.missingInfo?.length && (
        <View style={{ gap: 5 }}>
          <Txt bold>Still missing</Txt>
          {understanding.missingInfo.map((fact: Data) => (
            <Txt muted key={fact.field}>
              • {fact.label}
            </Txt>
          ))}
        </View>
      )}
      {!!understanding.inferred?.length && (
        <View style={{ gap: 5 }}>
          <Txt bold>Assumed — please check</Txt>
          {understanding.inferred.map((fact: Data) => (
            <Txt key={fact.field}>
              {fact.label}: {fact.note}
            </Txt>
          ))}
        </View>
      )}
      {!understanding.canConfirm && (
        <Txt muted>
          To build your plan:{" "}
          {(understanding.missingForConfirm || [])
            .map((fact: Data) => fact.label)
            .join(", ") || "review the missing details above"}
          .
        </Txt>
      )}
      <Button
        title="Build my event plan"
        busy={busy}
        disabled={!understanding.canConfirm}
        onPress={onConfirm}
      />
      <Button
        title="Edit details"
        secondary
        disabled={busy}
        onPress={() => navigation.navigate("EditEvent", { eventId: id(event) })}
      />
      <Button
        title="Ask me later"
        secondary
        onPress={() => setCollapsed(true)}
      />
    </Card>
  );
}
