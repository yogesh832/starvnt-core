import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import { nativeAuthTransport } from "../src/common/nativeAuthTransport.js";

test("native auth transport preserves browser cookies and isolates native credentials by domain", async (t) => {
  const app = express();
  app.use(express.json(), cookieParser());
  for (const [prefix, name] of [
    ["/api/auth", "external_refresh"],
    ["/api/admin/auth", "admin_refresh"],
  ]) {
    const router = express.Router();
    router.use(nativeAuthTransport(name));
    router.post("/login", (req, res) =>
      res
        .cookie(name, `new-${name}`, { httpOnly: true, path: prefix })
        .json({ accessToken: "access", user: { id: "user" } }),
    );
    router.post("/refresh", (req, res) => {
      if (req.cookies[name] !== `old-${name}`)
        return res.status(401).json({ error: "UNAUTHENTICATED" });
      return res
        .cookie(name, `rotated-${name}`, { httpOnly: true })
        .json({ accessToken: "rotated-access" });
    });
    router.post("/logout", (req, res) =>
      res.json({ revoked: req.cookies[name] || null }),
    );
    app.use(prefix, router);
  }
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, native, body, cookie) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(native ? { "X-Starvnt-Client": "native" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body || {}),
    });
  await t.test("browser login keeps refresh tokens out of JSON", async () => {
    const response = await request("/api/auth/login");
    assert.match(response.headers.get("set-cookie"), /HttpOnly/);
    assert.equal((await response.json()).refreshToken, undefined);
  });
  await t.test("native login receives the rotating refresh token", async () => {
    const response = await request("/api/auth/login", true);
    assert.equal((await response.json()).refreshToken, "new-external_refresh");
  });
  await t.test(
    "body credentials work only for an explicitly native refresh",
    async () => {
      assert.equal(
        (
          await request("/api/auth/refresh", false, {
            refreshToken: "old-external_refresh",
          })
        ).status,
        401,
      );
      const response = await request("/api/auth/refresh", true, {
        refreshToken: "old-external_refresh",
      });
      assert.equal(
        (await response.json()).refreshToken,
        "rotated-external_refresh",
      );
    },
  );
  await t.test("browser refresh still uses its HttpOnly cookie", async () => {
    const response = await request(
      "/api/auth/refresh",
      false,
      {},
      "external_refresh=old-external_refresh",
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).refreshToken, undefined);
  });
  await t.test("native refresh cannot borrow a browser cookie", async () => {
    assert.equal(
      (
        await request(
          "/api/auth/refresh",
          true,
          {},
          "external_refresh=old-external_refresh",
        )
      ).status,
      401,
    );
  });
  await t.test(
    "external refresh credentials cannot refresh the admin domain",
    async () => {
      assert.equal(
        (
          await request("/api/admin/auth/refresh", true, {
            refreshToken: "old-external_refresh",
          })
        ).status,
        401,
      );
      const response = await request("/api/admin/auth/refresh", true, {
        refreshToken: "old-admin_refresh",
      });
      assert.equal(
        (await response.json()).refreshToken,
        "rotated-admin_refresh",
      );
    },
  );
  await t.test(
    "logout revokes only the supplied native domain credential",
    async () => {
      const response = await request(
        "/api/auth/logout",
        true,
        { refreshToken: "old-external_refresh" },
        "external_refresh=other-browser-session",
      );
      assert.equal((await response.json()).revoked, "old-external_refresh");
    },
  );
});
