import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { pushRoutes } from "../src/notifications/push.routes.js";
import { config } from "../src/config.js";
import { PushSubscription } from "../src/notifications/push.models.js";
import { ExternalUser } from "../src/external/models/ExternalUser.js";
import { ExternalSession } from "../src/external/models/ExternalSession.js";
import { AdminUser } from "../src/admin/models/AdminUser.js";
import { AdminSession } from "../src/admin/models/AdminSession.js";
import { signExternalAccessToken } from "../src/external/utils/tokens.js";
import { signAdminAccessToken } from "../src/admin/utils/tokens.js";

test("real push routers enforce auth domains, derive owners and scope unregister to its binding", async (t) => {
  const previous = [config.pushEnabled, config.pushProjectId];
  config.pushEnabled = true;
  config.pushProjectId = "project";
  const user = {
    _id: "customer",
    accountType: "CUSTOMER",
    status: "ACTIVE",
    $locals: {},
  };
  const admin = { _id: "admin", status: "ACTIVE", role: "ADMIN" };
  const session = {
    _id: "session",
    expiresAt: new Date(Date.now() + 60000),
    accountType: "CUSTOMER",
  };
  t.mock.method(ExternalUser, "findById", async () => user);
  t.mock.method(ExternalSession, "findById", async () => session);
  t.mock.method(AdminUser, "findById", async () => admin);
  t.mock.method(AdminSession, "findById", async () => session);
  let saved, removed;
  t.mock.method(PushSubscription, "findOne", () => ({
    lean: async () => null,
  }));
  t.mock.method(PushSubscription, "deleteMany", async () => {});
  t.mock.method(
    PushSubscription,
    "findOneAndUpdate",
    async (filter, update) => {
      saved = update.$set;
      return { bindingId: "binding" };
    },
  );
  t.mock.method(PushSubscription, "updateOne", async (filter) => {
    removed = filter;
  });
  const app = express();
  app.use(express.json());
  app.use("/push", pushRoutes("external"));
  app.use("/admin/push", pushRoutes("admin"));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    [config.pushEnabled, config.pushProjectId] = previous;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = signExternalAccessToken(user, "session");
  const adminToken = signAdminAccessToken(admin, "session");
  const body = {
    installationId: "11111111-1111-4111-8111-111111111111",
    token: "ExpoPushToken[test]",
    platform: "ios",
    projectId: "project",
    ownerId: "victim",
    surface: "ADMIN",
  };
  const call = (path, access, method = "POST", payload = body) =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  assert.equal((await call("/push/devices")).status, 401);
  assert.equal((await call("/push/devices", adminToken)).status, 401);
  assert.equal((await call("/admin/push/devices", token)).status, 401);
  assert.equal((await call("/push/devices", token)).status, 200);
  assert.equal(saved.ownerId, "customer");
  assert.equal(saved.surface, "CUSTOMER");
  assert.equal(saved.sessionId, "session");
  assert.equal((await call("/admin/push/devices", adminToken)).status, 200);
  assert.equal(saved.ownerId, "admin");
  assert.equal(saved.domain, "admin");
  assert.equal(
    (
      await call(`/push/devices/${body.installationId}`, token, "DELETE", {
        bindingId: "old-binding",
      })
    ).status,
    200,
  );
  assert.equal(removed.ownerId, "customer");
  assert.equal(removed.bindingId, "old-binding");
  assert.equal(removed.domain, "external");
});
