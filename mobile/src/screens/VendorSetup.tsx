import React, { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import {
  Button,
  Card,
  Choice,
  confirm,
  Empty,
  ErrorNotice,
  Field,
  human,
  id,
  Page,
  Pill,
  Txt,
  useAction,
  useResource,
} from "../ui";

const configs: Record<
  string,
  { title: string; path: string; collection: string }
> = {
  origins: {
    title: "Operating locations",
    path: "/vendor/locations",
    collection: "locations",
  },
  resources: {
    title: "Team & resources",
    path: "/vendor/resources",
    collection: "resources",
  },
  coverage: {
    title: "Where you work",
    path: "/vendor/coverage",
    collection: "coverages",
  },
  capacity: {
    title: "Capabilities & capacity",
    path: "/vendor/services",
    collection: "services",
  },
  travel: {
    title: "Travel policy",
    path: "/vendor/travel-policy",
    collection: "",
  },
  hours: {
    title: "Working hours",
    path: "/vendor/availability/hours",
    collection: "",
  },
};
export function VendorSetup({ route }: any) {
  const { kind } = route.params;
  const config = configs[kind];
  const r = useResource(external, config.path);
  const services = useResource(external, "/vendor/services");
  const a = useAction();
  const [form, setForm] = useState<Data>({
    name: "",
    label: "",
    city: "",
    state: "",
    address: "",
    lat: "",
    lng: "",
    type: "TEAM_MEMBER",
    capacityUnits: "1",
    vendorServiceId: "",
    radiusKm: "40",
    styles: "",
    equipment: "",
    teamSize: "2",
    simultaneousEventLimit: "1",
    format: "Full day",
    freeRadiusKm: "",
    perKmRate: "",
    equipmentTransitFee: "",
    outstationDailyAllowance: "",
    accommodationRequiredBeyondKm: "",
  });
  const [hours, setHours] = useState<Data>({});
  const [outstation, setOutstation] = useState(false);
  const [tolls, setTolls] = useState(false);
  const [places, setPlaces] = useState<Data[]>([]);
  const [editingLocation, setEditingLocation] = useState("");
  useEffect(() => {
    if (kind === "travel" && r.data.travelPolicy) {
      setForm((f) => ({
        ...f,
        ...Object.fromEntries(
          Object.entries(r.data.travelPolicy)
            .filter(([, v]) => typeof v === "number")
            .map(([k, v]) => [k, String(v)]),
        ),
      }));
      setTolls(!!r.data.travelPolicy.tollAndParkingIncluded);
    }
    if (kind === "hours") setHours(r.data.workingHours || {});
  }, [r.data, kind]);
  const set = (key: string, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  const field = (key: string, label: string, numeric = false) => (
    <Field
      key={key}
      label={label}
      value={form[key] || ""}
      onChangeText={(v) => set(key, v)}
      keyboardType={numeric ? "decimal-pad" : "default"}
    />
  );
  const numeric = (key: string, min = 0) => {
    const value = Number(form[key]);
    if (!Number.isFinite(value) || value < min)
      throw new Error(
        `Enter a valid ${human(key.replace(/([a-z])([A-Z])/g, "$1 $2")).toLowerCase()}.`,
      );
    return value;
  };
  async function save() {
    if (kind === "origins") {
      if (
        !form.city.trim() ||
        !form.lat.trim() ||
        !form.lng.trim() ||
        !Number.isFinite(Number(form.lat)) ||
        !Number.isFinite(Number(form.lng)) ||
        Math.abs(Number(form.lat)) > 90 ||
        Math.abs(Number(form.lng)) > 180
      )
        throw new Error(
          "Choose a location from search, or enter a city and valid coordinates.",
        );
      await external.call(
        editingLocation ? `${config.path}/${editingLocation}` : config.path,
        editingLocation ? "PUT" : "POST",
        {
          label: form.label || "Main location",
          city: form.city,
          state: form.state,
          address: form.address,
          coordinates: { lat: Number(form.lat), lng: Number(form.lng) },
        },
      );
      setEditingLocation("");
      setForm((f) => ({
        ...f,
        label: "",
        city: "",
        state: "",
        address: "",
        lat: "",
        lng: "",
      }));
    } else if (kind === "resources") {
      if (!form.name.trim()) throw new Error("Add a resource name.");
      await external.call(config.path, "POST", {
        name: form.name,
        type: form.type,
        capacityUnits: numeric("capacityUnits", 1),
      });
    } else if (kind === "coverage") {
      if (!form.vendorServiceId)
        throw new Error("Choose the service you want to cover.");
      await external.call(config.path, "POST", {
        vendorServiceId: form.vendorServiceId,
        coverageType: "RADIUS",
        city: form.city,
        state: form.state,
        radiusKm: numeric("radiusKm"),
        outstationAllowed: outstation,
      });
    } else if (kind === "capacity") {
      if (!form.vendorServiceId) throw new Error("Choose a service first.");
      await external.call("/vendor/capabilities", "POST", {
        vendorServiceId: form.vendorServiceId,
        styles: form.styles
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean),
        equipment: form.equipment
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean),
        format: form.format,
        teamSize: numeric("teamSize", 1),
        simultaneousEventLimit: numeric("simultaneousEventLimit", 1),
      });
    } else if (kind === "travel") {
      const keys = [
        "freeRadiusKm",
        "perKmRate",
        "equipmentTransitFee",
        "outstationDailyAllowance",
        "accommodationRequiredBeyondKm",
      ];
      await external.call(config.path, "PUT", {
        ...Object.fromEntries(keys.map((k) => [k, numeric(k)])),
        tollAndParkingIncluded: tolls,
      });
    } else if (kind === "hours") {
      await external.call(config.path, "PUT", { workingHours: hours });
    }
    r.refresh();
  }
  const rows: Data[] = r.data[config.collection] || [];
  return (
    <Page
      {...r}
      title={config.title}
      subtitle="Build a workspace that reflects how you work."
    >
      <ErrorNotice message={a.error || services.error} />
      {["coverage", "capacity"].includes(kind) && (
        <>
          <Txt bold>Choose a service</Txt>
          {(services.data.services || []).map((s: Data) => (
            <Card
              key={id(s)}
              onPress={() => {
                set("vendorServiceId", id(s));
                if (kind === "capacity") {
                  const c = s.capabilities?.[0];
                  setForm((f) => ({
                    ...f,
                    vendorServiceId: id(s),
                    styles: c?.styles?.join(", ") || "",
                    equipment: c?.equipment?.join(", ") || "",
                    format: c?.format || "Full day",
                    teamSize: String(c?.teamSize ?? 2),
                    simultaneousEventLimit: String(
                      c?.simultaneousEventLimit ?? 1,
                    ),
                  }));
                }
              }}
            >
              <Txt bold>
                {form.vendorServiceId === id(s) ? "✓ " : ""}
                {s.name}
              </Txt>
            </Card>
          ))}
          {!services.data.services?.length && (
            <Empty
              title="Add a service first"
              description="Your service catalogue defines what you can offer."
            />
          )}
        </>
      )}
      {kind === "origins" && (
        <>
          {field("label", "Location name")}
          {field("city", "City")}
          {field("state", "State")}
          {field("address", "Address / search for your place")}
          <Button
            title="Find this place"
            secondary
            busy={a.busy}
            onPress={() => {
              void a.run(async () => {
                const d = await external.call(
                  `/vendor/google-places/search?q=${encodeURIComponent(`${form.address} ${form.city}`.trim())}`,
                );
                setPlaces(d.places || []);
              });
            }}
          />
          {places.map((p) => (
            <Card
              key={p.id}
              onPress={() => {
                setForm((f) => ({
                  ...f,
                  address: p.address,
                  lat: String(p.lat),
                  lng: String(p.lng),
                  label: f.label || p.name,
                }));
                setPlaces([]);
              }}
            >
              <Txt bold>{p.name}</Txt>
              <Txt muted>{p.address}</Txt>
            </Card>
          ))}
          {field("lat", "Latitude", true)}
          {field("lng", "Longitude", true)}
        </>
      )}
      {kind === "resources" && (
        <>
          {field("name", "Resource or team member name")}
          <Choice
            label="Resource type"
            value={form.type}
            values={[
              "TEAM_MEMBER",
              "EQUIPMENT",
              "INVENTORY",
              "VEHICLE",
              "SPACE",
            ]}
            onChange={(v) => set("type", v)}
          />
          {field("capacityUnits", "Capacity units", true)}
        </>
      )}
      {kind === "coverage" && (
        <>
          {field("city", "City")}
          {field("state", "State")}
          {field("radiusKm", "Service radius in km", true)}
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Txt>Outstation travel available</Txt>
            <Switch value={outstation} onValueChange={setOutstation} />
          </View>
        </>
      )}
      {kind === "capacity" && (
        <>
          {field("styles", "Styles / specialities (comma separated)")}
          {field("equipment", "Equipment (comma separated)")}
          {field("format", "Service format")}
          {field("teamSize", "Team size", true)}
          {field(
            "simultaneousEventLimit",
            "Simultaneous events supported",
            true,
          )}
        </>
      )}
      {kind === "travel" && (
        <>
          {field("freeRadiusKm", "Free travel radius in km", true)}
          {field("perKmRate", "Price per extra km in ₹", true)}
          {field("equipmentTransitFee", "Equipment transport fee in ₹", true)}
          {field(
            "outstationDailyAllowance",
            "Outstation daily allowance in ₹",
            true,
          )}
          {field(
            "accommodationRequiredBeyondKm",
            "Accommodation required beyond km",
            true,
          )}
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Txt>Tolls & parking included</Txt>
            <Switch value={tolls} onValueChange={setTolls} />
          </View>
        </>
      )}
      {kind === "hours" &&
        Object.entries(hours).map(([day, value]: [string, any]) => (
          <Card key={day}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Txt bold>{day}</Txt>
              <Switch
                value={value.isOpen}
                onValueChange={(v) =>
                  setHours((h) => ({ ...h, [day]: { ...h[day], isOpen: v } }))
                }
              />
            </View>
            {value.isOpen && (
              <Field
                label={`${day} hours`}
                value={value.hours}
                onChangeText={(v) =>
                  setHours((h) => ({ ...h, [day]: { ...h[day], hours: v } }))
                }
              />
            )}
          </Card>
        ))}
      <Button
        title={editingLocation ? "Save location changes" : "Save changes"}
        busy={a.busy}
        onPress={() => {
          void a.run(save);
        }}
      />
      {!!editingLocation && (
        <Button
          title="Cancel location editing"
          secondary
          disabled={a.busy}
          onPress={() => {
            setEditingLocation("");
            setForm((f) => ({
              ...f,
              label: "",
              city: "",
              state: "",
              address: "",
              lat: "",
              lng: "",
            }));
          }}
        />
      )}
      {config.collection && kind !== "capacity" && (
        <>
          <Txt bold size={21}>
            Your saved {config.title.toLowerCase()}
          </Txt>
          {rows.map((row) => (
            <Card key={id(row)}>
              <Txt bold>{row.name || row.label || row.city}</Txt>
              <Txt muted>
                {row.address || human(row.type || row.coverageType)}
              </Txt>
              {row.isPrimary && <Pill>PRIMARY LOCATION</Pill>}
              {kind === "origins" && (
                <>
                  <Button
                    title="Edit location"
                    secondary
                    disabled={a.busy}
                    onPress={() => {
                      setEditingLocation(id(row));
                      setForm((f) => ({
                        ...f,
                        label: row.label || "",
                        city: row.city || "",
                        state: row.state || "",
                        address: row.address || "",
                        lat: String(row.coordinates?.lat ?? ""),
                        lng: String(row.coordinates?.lng ?? ""),
                      }));
                    }}
                  />
                  {!row.isPrimary && (
                    <Button
                      title="Make primary location"
                      secondary
                      busy={a.busy}
                      onPress={() =>
                        a.run(async () => {
                          await external.call(
                            `${config.path}/${id(row)}/primary`,
                            "PATCH",
                          );
                          await r.refresh();
                        })
                      }
                    />
                  )}
                </>
              )}
              <Button
                title="Remove"
                secondary
                busy={a.busy}
                onPress={() =>
                  confirm(
                    "Remove this item?",
                    "The server applies the change to your business setup.",
                    () => {
                      void a.run(async () => {
                        await external.call(
                          `${config.path}/${id(row)}`,
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
        </>
      )}
    </Page>
  );
}
