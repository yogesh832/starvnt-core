import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { ExternalUser } from "../src/external/models/ExternalUser.js";
import { ExternalSession } from "../src/external/models/ExternalSession.js";
import { AdminUser } from "../src/admin/models/AdminUser.js";
import { AdminSession } from "../src/admin/models/AdminSession.js";
import {
  hashRefreshToken,
  verifyExternalAccessToken,
} from "../src/external/utils/tokens.js";
import { verifyAdminAccessToken } from "../src/admin/utils/tokens.js";

test("real native auth routes rotate, scope, revoke, and reject replay without a database", async (t) => {
  const user = {
    _id: "customer",
    status: "ACTIVE",
    accountType: "CUSTOMER",
    $locals: {},
    toSafeJSON() {
      return {
        id: this._id,
        accountType: this.$locals.activeAccountType || this.accountType,
      };
    },
  };
  const admin = {
    _id: "admin",
    status: "ACTIVE",
    role: "ADMIN",
    toSafeJSON() {
      return { id: this._id, role: this.role };
    },
  };
  function store(initial) {
    const rows = new Map();
    let counter = 0;
    function add(value) {
      const row = {
        _id: `session-${++counter}`,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60000),
        ...value,
        save: async () => {},
      };
      rows.set(row.refreshTokenHash, row);
      return row;
    }
    add(initial);
    return {
      add,
      find: async (query) => rows.get(query.refreshTokenHash),
      revoke: async (query) => {
        const row = rows.get(query.refreshTokenHash);
        if (row) row.revokedAt = new Date();
      },
    };
  }
  const ext = store({
    refreshTokenHash: hashRefreshToken("external-original"),
    user: user._id,
    accountType: "VENDOR",
  });
  const adm = store({
    refreshTokenHash: hashRefreshToken("admin-original"),
    admin: admin._id,
  });
  t.mock.method(ExternalUser, "findById", async () => user);
  t.mock.method(AdminUser, "findById", async () => admin);
  for (const [model, data] of [
    [ExternalSession, ext],
    [AdminSession, adm],
  ]) {
    t.mock.method(model, "findOne", data.find);
    t.mock.method(model, "create", async (row) => data.add(row));
    t.mock.method(model, "updateOne", data.revoke);
  }
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (domain, action, refreshToken) =>
    (
      await fetch(
        `${base}/api/${domain === "admin" ? "admin/" : ""}auth/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Starvnt-Client": "native",
          },
          body: JSON.stringify({ refreshToken }),
        },
      )
    ).json();
  const external = await post("external", "refresh", "external-original");
  assert.ok(external.refreshToken);
  assert.notEqual(external.refreshToken, "external-original");
  assert.equal(
    verifyExternalAccessToken(external.accessToken).accountType,
    "VENDOR",
  );
  assert.equal(
    (await post("external", "refresh", "external-original")).error,
    "SESSION_INVALID",
  );
  assert.equal(
    (await post("admin", "refresh", external.refreshToken)).error,
    "SESSION_INVALID",
  );
  const internal = await post("admin", "refresh", "admin-original");
  assert.ok(internal.refreshToken);
  assert.equal(verifyAdminAccessToken(internal.accessToken).role, "ADMIN");
  assert.throws(() => verifyAdminAccessToken(external.accessToken));
  assert.throws(() => verifyExternalAccessToken(internal.accessToken));
  await post("external", "logout", external.refreshToken);
  assert.equal(
    (await post("external", "refresh", external.refreshToken)).error,
    "SESSION_INVALID",
  );
  assert.ok(
    (await post("admin", "refresh", internal.refreshToken)).accessToken,
  );
});
