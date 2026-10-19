import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, createClient } from "../src/api/client.ts";
import { visibleModules } from "../src/adminModules.ts";

function memory(initial: string | null = null) {
  let value = initial;
  return {
    get: async () => value,
    set: async (v: string) => {
      value = v;
    },
    clear: async () => {
      value = null;
    },
  };
}
const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("push observers follow accepted session rotation and cannot break authentication", async () => {
  const api = createClient("https://example.test/api", memory());
  let changes = 0;
  const unsubscribe = api.onSessionChanged(() => {
    changes++;
  });
  api.onSessionChanged(() => {
    throw new Error("observer failure");
  });
  await api.accept({ accessToken: "first", refreshToken: "first-refresh" });
  await api.accept({ accessToken: "rotated", refreshToken: "rotated-refresh" });
  assert.equal(changes, 2);
  unsubscribe();
  await api.accept({ accessToken: "next", refreshToken: "next-refresh" });
  assert.equal(changes, 2);
  await api.clear();
  api.onSessionChanged(() => {
    changes++;
  });
  await api.accept({ accessToken: "stale", refreshToken: "stale-refresh" }, 0);
  assert.equal(changes, 2);
});

test("parallel expired requests rotate once and retry with the new access token", async () => {
  const vault = memory("old-refresh");
  let refreshes = 0;
  let calls = 0;
  const api = createClient("https://example.test/api", vault, (async (
    url,
    options: RequestInit,
  ) => {
    assert.equal(options.credentials, "omit");
    assert.equal((options.headers as any)["X-Starvnt-Client"], "native");
    if (String(url).endsWith("/auth/refresh")) {
      refreshes++;
      assert.equal(
        JSON.parse(String(options.body)).refreshToken,
        "old-refresh",
      );
      await new Promise((r) => setTimeout(r, 10));
      return json({ accessToken: "new-access", refreshToken: "new-refresh" });
    }
    calls++;
    return (options.headers as any).Authorization === "Bearer new-access"
      ? json({ ok: true })
      : json({ error: "UNAUTHENTICATED" }, 401);
  }) as typeof fetch);
  const results = await Promise.all([
    api.call("/events"),
    api.call("/bookings"),
  ]);
  assert.ok(results.every((r) => r.ok));
  assert.equal(refreshes, 1);
  assert.equal(calls, 4);
  assert.equal(await vault.get(), "new-refresh");
});
test("transient refresh failures preserve the credential for reconnection", async () => {
  const vault = memory("keep-me");
  const api = createClient("https://example.test", vault, (async () => {
    throw new Error("offline");
  }) as typeof fetch);
  await assert.rejects(api.refresh(), /connection/);
  assert.equal(await vault.get(), "keep-me");
});
test("revoked refresh tokens clear the session and notify the app", async () => {
  const vault = memory("revoked");
  let expired = 0;
  const api = createClient("https://example.test", vault, (async () =>
    json({ error: "SESSION_REVOKED" }, 401)) as typeof fetch);
  api.onExpired(() => {
    expired++;
  });
  assert.equal(await api.refresh(), null);
  assert.equal(await vault.get(), null);
  assert.equal(expired, 1);
});
test("web-compatible HTTP 200 session failures clear credentials rather than blocking sign-in", async () => {
  for (const error of [
    "SESSION_INVALID",
    "NO_REFRESH_TOKEN",
    "ACCOUNT_DISABLED_OR_MISSING",
  ]) {
    const vault = memory("expired");
    const api = createClient("https://example.test", vault, (async () =>
      json({ ok: false, error })) as typeof fetch);
    assert.equal(await api.refresh(), null);
    assert.equal(await vault.get(), null);
  }
});
test("authentication failures do not trigger a refresh loop", async () => {
  let calls = 0;
  const api = createClient("https://example.test", memory(), (async () => {
    calls++;
    return json({ error: "INVALID_CREDENTIALS" }, 401);
  }) as typeof fetch);
  await assert.rejects(
    api.authenticate("login", { email: "test", password: "wrong" }),
    ApiError,
  );
  assert.equal(calls, 1);
});
test("a protected request still rejected after refresh expires the local session", async () => {
  const vault = memory("credential");
  let expired = false;
  const api = createClient("https://example.test", vault, (async (url) =>
    String(url).endsWith("/refresh")
      ? json({ accessToken: "new", refreshToken: "rotated" })
      : json({}, 401)) as typeof fetch);
  api.onExpired(() => {
    expired = true;
  });
  await assert.rejects(api.call("/private"));
  assert.equal(await vault.get(), null);
  assert.equal(expired, true);
});
test("logout clears immediately and revokes a late rotated credential", async () => {
  const vault = memory("original");
  let used: string | undefined;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const api = createClient("https://example.test", vault, (async (
    url,
    options,
  ) => {
    if (String(url).endsWith("/refresh")) {
      await gate;
      return json({ accessToken: "access", refreshToken: "rotated" });
    }
    used = JSON.parse(String(options?.body)).refreshToken;
    return json({ ok: true });
  }) as typeof fetch);
  const refresh = api.refresh();
  await api.logout();
  assert.equal(await vault.get(), null);
  release();
  await refresh;
  assert.equal(used, "rotated");
  assert.equal(await vault.get(), null);
});
test("clearing a session during an in-flight refresh cannot resurrect it", async () => {
  const vault = memory("original");
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const api = createClient("https://example.test", vault, (async () => {
    await gate;
    return json({ accessToken: "late", refreshToken: "late-refresh" });
  }) as typeof fetch);
  const pending = api.refresh();
  await api.clear();
  release();
  assert.equal(await pending, null);
  assert.equal(await vault.get(), null);
});
test("server logout failure cannot retain a local session", async () => {
  const vault = memory("still-live");
  const api = createClient("https://example.test", vault, (async () =>
    json({ error: "UNAVAILABLE" }, 503)) as typeof fetch);
  await api.logout();
  assert.equal(await vault.get(), null);
});
test("admin and external clients cannot share refresh credentials", async () => {
  const outside = memory("external");
  const inside = memory("admin");
  const api = createClient("https://example.test/api", outside, (async () =>
    json({ ok: true })) as typeof fetch);
  await api.logout();
  assert.equal(await outside.get(), null);
  assert.equal(await inside.get(), "admin");
});
test("protected binary downloads retain bearer authentication and refresh behavior", async () => {
  const api = createClient("https://example.test", memory("refresh"), (async (
    url,
    options,
  ) => {
    if (String(url).endsWith("/refresh"))
      return json({ accessToken: "access", refreshToken: "next" });
    return (options?.headers as any).Authorization
      ? new Response("pdf-content")
      : json({}, 401);
  }) as typeof fetch);
  assert.equal(await (await api.download("/document")).text(), "pdf-content");
});
test("admin navigation obeys any-permission rules and super-admin-only access", () => {
  assert.deepEqual(visibleModules(null), []);
  assert.deepEqual(visibleModules({ role: "ADMIN", permissions: [] }), []);
  const modules = visibleModules({
    role: "ADMIN",
    permissions: ["operations.read", "settlements.read"],
  }).map((m) => m.key);
  assert.ok(modules.includes("bookings"));
  assert.ok(modules.includes("payments"));
  assert.ok(!modules.includes("users"));
  assert.ok(
    visibleModules({ role: "SUPER_ADMIN" }).some((m) => m.key === "users"),
  );
});

test('an old account request returning 401 cannot clear a newly signed-in account', async () => {
  let failOld!: () => void;
  const gate = new Promise<void>(r => { failOld = r; });
  const vault = memory('old');
  const api = createClient('https://example.test', vault, (async url => {
    if (String(url).endsWith('/old-data')) {
      await gate;
      return json({ error: 'UNAUTHENTICATED' }, 401);
    }
    return json({ accessToken: 'new', refreshToken: 'new-refresh', user: { id: 'new' } });
  }) as typeof fetch);
  let expired = 0;
  api.onExpired(() => { expired++; });
  const old = assert.rejects(api.call('/old-data'), ApiError);
  await api.authenticate('login', {});
  failOld();
  await old;
  assert.equal(await vault.get(), 'new-refresh');
  assert.equal(expired, 0);
});

test('a failed login does not prevent a subsequent successful login', async () => {
  let attempts = 0;
  const vault = memory();
  const api = createClient('https://example.test', vault, (async () => ++attempts === 1
    ? json({ error: 'INVALID_CREDENTIALS' }, 401)
    : json({ accessToken: 'access', refreshToken: 'refresh', user: { id: 'account' } })) as typeof fetch);
  await assert.rejects(api.authenticate('login', {}), ApiError);
  assert.equal((await api.authenticate('login', {})).user.id, 'account');
  assert.equal(await vault.get(), 'refresh');
});

test('Quick Auth replaces an old saved session with memory-only refresh and still revokes on logout', async () => {
  const vault = memory('old-persistent');
  const requests: { url: string; refreshToken?: string }[] = [];
  const api = createClient('https://example.test', vault, (async (url, options) => {
    requests.push({ url: String(url), refreshToken: JSON.parse(String(options?.body || '{}')).refreshToken });
    return String(url).endsWith('/logout') ? json({ ok: true }) : json({ accessToken: 'temporary-access', refreshToken: String(url).endsWith('/refresh') ? 'rotated-temporary' : 'temporary', user: { id: 'test' } });
  }) as typeof fetch);
  await api.authenticate('dev-auth', {});
  assert.equal(await vault.get(), null);
  assert.ok(await api.refresh());
  assert.equal(requests[1].refreshToken, 'temporary');
  assert.equal(await vault.get(), null);
  await api.logout();
  assert.equal(requests.at(-1)?.refreshToken, 'rotated-temporary');
  assert.equal(await api.refresh(), null);
});
