import assert from "node:assert/strict";
import { test } from "node:test";
import {
  eventEditPayload,
  locationFromEvent,
  serviceLocationPayload,
} from "../src/eventFormModel.ts";
import { validateServiceLocation } from "../../server/src/customer/services/serviceRequirements.js";

test("editing event notes preserves the budget range, map coordinates and unchanged dates", () => {
  const event = {
    eventType: "wedding",
    eventDate: "2025-01-01",
    status: "confirmed",
    budget: null,
    budgetMin: 100000,
    budgetMax: 500000,
    city: "Pune",
    notes: "",
    location: { locality: "Baner", coordinates: { lat: 18.56, lng: 73.78 } },
  };
  assert.deepEqual(
    eventEditPayload(
      { ...event, budget: "", notes: "Ramp access needed" },
      locationFromEvent(event),
      event,
    ),
    { notes: "Ramp access needed" },
  );
});

test("clearing a location field produces an explicit clear without overwriting the rest of the venue", () => {
  const event = {
    city: "Pune",
    location: {
      locality: "Baner",
      venueName: "Hall",
      address: "Street",
      coordinates: { lat: 18.56, lng: 73.78 },
    },
  };
  assert.deepEqual(
    eventEditPayload({}, { ...locationFromEvent(event), venueName: "" }, event),
    { location: { venueName: null } },
  );
});

test("mobile transport handoff is accepted by the existing backend and discards a stale custom drop", () => {
  const payload = serviceLocationPayload({
    mode: "custom",
    pickup: " Airport ",
    drop: "Previous hotel",
    dropIsEventLocation: true,
  });
  const accepted = validateServiceLocation("transport", payload);
  assert.equal(accepted.pickup, "Airport");
  assert.equal(accepted.drop, null);
  assert.equal(accepted.dropIsEventLocation, true);
});

test("custom service locations and switching back to the event location use the existing backend contract", () => {
  assert.equal(
    validateServiceLocation(
      "makeup",
      serviceLocationPayload({ mode: "custom", place: " Hotel " }),
    ).place,
    "Hotel",
  );
  assert.equal(
    validateServiceLocation(
      "makeup",
      serviceLocationPayload({ mode: "event", place: "Old hotel" }),
    ).place,
    null,
  );
  assert.throws(() =>
    validateServiceLocation(
      "transport",
      serviceLocationPayload({ mode: "custom", pickup: "", drop: "" }),
    ),
  );
});

test("invalid pasted numeric event input cannot turn into a silent null update", () => {
  assert.throws(
    () =>
      eventEditPayload({ guestCount: "not a number" }, {}, { guestCount: 20 }),
    /Guest count/,
  );
  assert.throws(
    () => eventEditPayload({ budget: "invalid" }, {}, { budget: 10000 }),
    /budget/,
  );
});
