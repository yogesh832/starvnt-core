import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registration,
  currentBinding,
  expoMessage,
  afterCursor,
  classifyPushError,
} from "../src/notifications/push.contract.js";
import {
  deliverOne,
  collectBinding,
} from "../src/notifications/push.service.js";
import { PushSubscription, PushJob } from "../src/notifications/push.models.js";
import { CustomerNotification } from "../src/customer/models/index.js";

test("registration pins project and derives identity from the authenticated server session", () => {
  const identity = {
    ownerId: "customer",
    sessionId: "session",
    audienceId: "customer",
    surface: "CUSTOMER",
    domain: "external",
  };
  const body = {
    installationId: "11111111-1111-4111-8111-111111111111",
    token: "ExpoPushToken[example]",
    platform: "android",
    projectId: "project",
    ownerId: "other",
    domain: "admin",
  };
  assert.equal(registration(body, identity, "project").ownerId, "customer");
  assert.equal(registration(body, identity, "project").domain, "external");
  assert.throws(() =>
    registration({ ...body, projectId: "other" }, identity, "project"),
  );
  assert.throws(() =>
    registration(
      { ...body, token: "https://attacker.test" },
      identity,
      "project",
    ),
  );
  assert.throws(() => registration(body, identity, ""));
});
test("visible notifications contain a route, account scope and stable source ID", () => {
  const binding = {
    _id: "device",
    bindingId: "binding",
    token: "ExpoPushToken[test]",
    enabled: true,
    domain: "external",
    ownerId: "customer",
    surface: "CUSTOMER",
  };
  const job = {
    subscription: "device",
    bindingId: "binding",
    sourceId: "customer:n1",
    title: "New message",
    body: "Review your conversation",
    actionUrl: "/customer/updates",
  };
  assert.equal(currentBinding(binding, job), true);
  assert.equal(
    currentBinding({ ...binding, bindingId: "new-account" }, job),
    false,
  );
  assert.equal(currentBinding({ ...binding, enabled: false }, job), false);
  const message = expoMessage(binding, job);
  assert.equal(message.title, "New message");
  assert.equal(message.sound, "default");
  assert.equal(message.data.ownerId, "customer");
  assert.equal(message.data.notificationId, "customer:n1");
  assert.equal(classifyPushError("DeviceNotRegistered"), "DISABLE");
  assert.equal(classifyPushError("InvalidCredentials"), "CONFIGURATION");
  assert.equal(classifyPushError("MessageRateExceeded"), "RETRY");
});
test("source checkpoints do not skip notifications with identical timestamps", () => {
  const at = new Date("2026-10-17T00:00:00Z");
  assert.deepEqual(afterCursor({ at, id: "next-id" }, at), {
    $or: [
      { createdAt: { $gt: at } },
      { createdAt: at, _id: { $gt: "next-id" } },
    ],
  });
});
test("worker handles provider receipts, uninstall, temporary errors and revoked ownership without live pushes", async (t) => {
  let saved, disabled, binding;
  const job = {
    _id: "job",
    subscription: "device",
    bindingId: "binding",
    lease: "lease",
    sourceId: "customer:1",
    attempts: 1,
    expiresAt: new Date(Date.now() + 60000),
  };
  binding = {
    _id: "device",
    bindingId: "binding",
    enabled: true,
    domain: "external",
    token: "ExpoPushToken[example]",
  };
  t.mock.method(PushSubscription, "findById", () => ({
    select: () => ({ lean: async () => binding }),
  }));
  t.mock.method(PushSubscription, "updateOne", async (filter, update) => {
    disabled = update.$set;
  });
  t.mock.method(PushJob, "updateOne", async (filter, update) => {
    assert.equal(filter.lease, "lease");
    saved = update.$set;
  });
  const identity = async () => ({ status: "ACTIVE" });
  await deliverOne(job, {
    identity,
    request: async () => [{ status: "ok", id: "ticket" }],
  });
  assert.equal(saved.status, "RECEIPT");
  assert.equal(saved.ticketId, "ticket");
  await deliverOne(
    { ...job, ticketId: "ticket" },
    { identity, request: async () => ({ ticket: { status: "ok" } }) },
  );
  assert.equal(saved.status, "SENT");
  let oldReceiptRequested = false;
  await deliverOne(
    { ...job, ticketId: "old-token-ticket", tokenHash: "previous-token-hash" },
    {
      identity,
      request: async () => {
        oldReceiptRequested = true;
      },
    },
  );
  assert.equal(oldReceiptRequested, false);
  assert.equal(saved.status, "QUEUED");
  assert.equal(saved.lastError, "TOKEN_CHANGED");
  await deliverOne(job, {
    identity,
    request: async () => [
      { status: "error", details: { error: "InvalidCredentials" } },
    ],
  });
  assert.equal(saved.status, "QUEUED");
  assert.equal(saved.lastError, "InvalidCredentials");
  await deliverOne(
    { ...job, ticketId: "ticket" },
    {
      identity,
      request: async () => ({
        ticket: { status: "error", details: { error: "MessageRateExceeded" } },
      }),
    },
  );
  assert.equal(saved.status, "QUEUED");
  assert.equal(saved.ticketId, "");
  await deliverOne(
    { ...job, ticketId: "ticket" },
    {
      identity,
      request: async () => ({
        ticket: { status: "error", details: { error: "DeviceNotRegistered" } },
      }),
    },
  );
  assert.equal(saved.status, "FAILED");
  assert.equal(disabled.enabled, false);
  await deliverOne(job, {
    identity,
    request: async () => {
      throw new Error("network");
    },
  });
  assert.equal(saved.status, "QUEUED");
  let called = false;
  await deliverOne(job, {
    identity: async () => null,
    request: async () => {
      called = true;
    },
  });
  assert.equal(saved.status, "CANCELLED");
  assert.equal(called, false);
  binding = { ...binding, bindingId: "replacement" };
  await deliverOne(job, {
    identity,
    request: async () => {
      called = true;
    },
  });
  assert.equal(saved.status, "CANCELLED");
  assert.equal(called, false);
  binding = { ...binding, bindingId: "binding", domain: "admin" };
  await deliverOne(
    { ...job, permissions: ["audit.read"] },
    {
      identity: async () => ({
        status: "ACTIVE",
        role: "ADMIN",
        permissions: [],
      }),
      request: async () => {
        called = true;
      },
    },
  );
  assert.equal(saved.status, "CANCELLED");
  assert.equal(called, false);
});
test("notifications are durably queued before advancing the device checkpoint", async (t) => {
  const order = [];
  const at = new Date();
  t.mock.method(CustomerNotification, "find", (filter) => {
    assert.equal(filter.$and[0].customer, "customer");
    return {
      sort: () => ({
        limit: () => ({
          lean: async () => [
            {
              _id: "n1",
              createdAt: at,
              title: "Quote ready",
              body: "Review quote",
              event: "event1",
            },
          ],
        }),
      }),
    };
  });
  t.mock.method(PushJob, "updateOne", async (filter, update, options) => {
    order.push("enqueue");
    assert.equal(options.upsert, true);
    assert.equal(filter.sourceId, "customer:n1");
  });
  t.mock.method(PushSubscription, "updateOne", async () => {
    order.push("checkpoint");
  });
  await collectBinding(
    {
      _id: "device",
      surface: "CUSTOMER",
      audienceId: "customer",
      bindingId: "binding",
      boundAt: at,
    },
    {},
  );
  assert.deepEqual(order, ["enqueue", "checkpoint"]);
});
