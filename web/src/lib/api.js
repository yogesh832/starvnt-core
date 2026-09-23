/**
 * Authenticated fetch helpers. Access tokens live in memory (per domain
 * context); refresh happens via HttpOnly cookie scoped to each domain's
 * auth path. On 401 we attempt exactly one refresh then retry once.
 */
export function makeApi(base, refreshPath) {
  let token = null;
  let refreshing = null;

  const setToken = (t) => {
    token = t;
  };

  async function refresh() {
    refreshing =
      refreshing ||
      fetch(refreshPath, { method: "POST", credentials: "include" })
        .then(async (r) => {
          if (!r.ok) return null;
          const data = await r.json();
          if (!data || !data.accessToken) return null;
          setToken(data.accessToken);
          return data;
        })
        .catch(() => null)
        .finally(() => {
          refreshing = null;
        });
    return refreshing;
  }

  async function call(path, { method = "GET", body } = {}, retry = true) {
    const res = await fetch(`${base}${path}`, {
      method,
      credentials: "include",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && retry) {
      const refreshed = await refresh();
      if (refreshed) return call(path, { method, body }, false);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `HTTP_${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return { call, refresh, setToken, getToken: () => token };
}

/** Backend base URL — direct calls keep auth and OTP requests consistent. */
const defaultProdUrl = "https://starvnt-core.onrender.com";
const defaultDevUrl = "http://localhost:4000";
const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, "")
  : import.meta.env.MODE === "production"
    ? defaultProdUrl
    : defaultDevUrl;

export const externalApi = makeApi(
  `${API_BASE}/api`,
  `${API_BASE}/api/auth/refresh`,
);
export const adminApi = makeApi(
  `${API_BASE}/api/admin`,
  `${API_BASE}/api/admin/auth/refresh`,
);
