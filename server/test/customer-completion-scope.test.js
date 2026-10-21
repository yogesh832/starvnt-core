import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyBookingCompletion } from "../src/customer/services/commerce.service.js";
import { CoreBooking } from "../src/admin/models/CoreBooking.js";
import { Booking } from "../src/customer/models/index.js";

const bookingId = "111111111111111111111111";
test("completion fallback cannot load or change another customer booking", async (t) => {
  let reads = 0,
    writes = 0;
  t.mock.method(CoreBooking, "findOne", async (filter) => {
    reads++;
    assert.equal(filter.customerId, "customer1");
    return null;
  });
  t.mock.method(Booking, "findById", () => ({
    lean: async () => ({ _id: bookingId, customer: "other-customer" }),
  }));
  t.mock.method(Booking, "updateOne", async () => {
    writes++;
  });
  await assert.rejects(
    () => verifyBookingCompletion("customer1", bookingId),
    (error) => error.status === 404,
  );
  assert.equal(reads, 1);
  assert.equal(writes, 0);
});
test("legacy bookings cannot self-verify without a Core booking; fallback queries stay owner-scoped", async (t) => {
  const filters = [];
  let writes = 0;
  t.mock.method(CoreBooking, "findOne", async (filter) => {
    filters.push(filter);
    return null;
  });
  t.mock.method(Booking, "findById", () => ({
    lean: async () => ({
      _id: bookingId,
      customer: "customer1",
      reference: "booking-reference",
    }),
  }));
  t.mock.method(Booking, "updateOne", async () => {
    writes++;
  });
  await assert.rejects(
    () => verifyBookingCompletion("customer1", bookingId),
    (error) => error.code === "CORE_BOOKING_REQUIRED",
  );
  assert.ok(filters.every((filter) => filter.customerId === "customer1"));
  assert.equal(writes, 0);
});
test("non-ObjectId references never match null quote IDs on unrelated bookings", async (t) => {
  t.mock.method(CoreBooking, "findOne", async (filter) => {
    assert.deepEqual(filter, {
      customerId: "customer1",
      $or: [{ bookingReference: "unknown-reference" }],
    });
    return null;
  });
  await assert.rejects(
    () => verifyBookingCompletion("customer1", "unknown-reference"),
    (error) => error.status === 404,
  );
});
