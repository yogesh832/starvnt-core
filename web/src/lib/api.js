/**
 * Authenticated fetch helpers. Access tokens live in memory (per domain
 * context); refresh happens via HttpOnly cookie scoped to each domain's
 * auth path. On 401 we attempt exactly one refresh then retry once.
 */
export function makeApi(base, refreshPath, options = {}) {
  const storageKey = options.storageKey || "";
  let token = null;
  let refreshing = null;

  if (storageKey && typeof window !== "undefined") {
    token = window.localStorage.getItem(storageKey);
  }

  const setToken = (t) => {
    token = t;
    if (!storageKey || typeof window === "undefined") return;
    if (t) {
      window.localStorage.setItem(storageKey, t);
    } else {
      window.localStorage.removeItem(storageKey);
    }
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

  /** Low-level request: supports JSON, FormData, Blob and string bodies; returns the Response. */
  async function raw(path, { method = "GET", body, headers = {} } = {}, retry = true) {
    const hasBody = body !== undefined && body !== null;
    const isJsonBody = hasBody && !(body instanceof FormData) && !(body instanceof Blob) && typeof body !== "string";
    const res = await fetch(`${base}${path}`, {
      method,
      credentials: "include",
      headers: {
        ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: hasBody ? (isJsonBody ? JSON.stringify(body) : body) : undefined,
    });

    if (res.status === 401 && retry) {
      const refreshed = await refresh();
      if (refreshed) return raw(path, { method, body, headers }, false);
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      
      // Global Auth enforcement: If 401 after retry, session is dead.
      if (res.status === 401) {
        setToken(null);
        if (typeof window !== "undefined") {
          window.location.href = "/login?expired=1";
        }
      }

      const err = new Error(data.message || friendlyApiMessage(data.error, res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return res;
  }

  async function call(path, { method = "GET", body } = {}) {
    const res = await raw(path, { method, body });
    return res.json().catch(() => ({}));
  }

  return { call, raw, refresh, setToken, getToken: () => token };
}

export function friendlyApiMessage(code, status) {
  const messages = {
    UNAUTHENTICATED: "Your session has expired. Please sign in again.",
    SESSION_REVOKED: "Your session has expired. Please sign in again.",
    ACCOUNT_DISABLED_OR_MISSING: "This account is not available. Please contact support.",
    FORBIDDEN: "You do not have permission to perform this action.",
    NO_VENDOR_ORGANIZATION: "Your vendor workspace is not ready yet. Please complete vendor setup.",
    CLOUDINARY_NOT_CONFIGURED: "Media storage is not configured. Add the Cloudinary API key on the server and restart it.",
    MEDIA_UPLOAD_FAILED: "Media upload failed. Please check Cloudinary settings or try a smaller file.",
    PRIMARY_CATEGORY_SINGLE_ONLY: "Choose exactly one primary category. Add secondary services separately.",
    RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
  };
  return messages[code] || (status ? `Request failed (${status}). Please try again.` : "Request failed. Please try again.");
}

/** Backend base URL — direct calls keep auth and OTP requests consistent. */
const defaultProdUrl = "https://app.starvnt.com";
const defaultDevUrl = "http://localhost:4000";
const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, "")
  : import.meta.env.MODE === "production"
    ? defaultProdUrl
    : defaultDevUrl;

export const externalApi = makeApi(
  `${API_BASE}/api`,
  `${API_BASE}/api/auth/refresh`,
  { storageKey: "starvnt_external_access_token" },
);
export const adminApi = makeApi(
  `${API_BASE}/api/admin`,
  `${API_BASE}/api/admin/auth/refresh`,
);
