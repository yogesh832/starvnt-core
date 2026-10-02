/**
 * Authenticated fetch helpers. Access tokens live in memory (per domain
 * context); refresh happens via HttpOnly cookie scoped to each domain's
 * auth path. On 401 we attempt exactly one refresh then retry once.
 */
export function makeApi(base, refreshPath, options = {}) {
  const storageKey = options.storageKey || "";
  const loginRedirectPath = options.loginRedirectPath || null;
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

      // Auth enforcement: clear token on 401.
      // NEVER hard redirect if:
      // - The request was an auth endpoint (/login, /auth/login, /auth/refresh, etc.)
      // - The user is already on a login page (/login or /admin/login)
      // Only redirect if a protected app route returned 401 and loginRedirectPath is configured.
      if (res.status === 401) {
        setToken(null);
        const isAuthEndpoint = /\/auth\/(login|refresh|me|verify|otp)/i.test(path) || /\/login/i.test(path);
        const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
        const isOnLoginPage = currentPath.includes("/login");
        if (!isAuthEndpoint && !isOnLoginPage && loginRedirectPath && typeof window !== "undefined") {
          window.location.href = `${loginRedirectPath}?expired=1`;
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

  async function stream(path, { method = "POST", body, headers = {}, signal } = {}, onEvent) {
    const res = await raw(path, {
      method,
      body,
      headers: { Accept: "text/event-stream", ...headers },
      signal,
    });

    if (!res.body) {
      throw new Error("ReadableStream not supported");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (let line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          const dataStr = trimmed.slice(6);
          try {
            const event = JSON.parse(dataStr);
            if (onEvent) onEvent(event);
          } catch {
            // ignore malformed JSON line
          }
        }
      }
    }
  }

  return { call, raw, stream, refresh, setToken, getToken: () => token };
}

export function friendlyApiMessage(code, status) {
  const messages = {
    UNAUTHENTICATED: "Your session has expired. Please sign in again.",
    SESSION_REVOKED: "Your session has expired. Please sign in again.",
    ACCOUNT_DISABLED_OR_MISSING: "This account is not available. Please contact support.",
    FORBIDDEN: "You do not have permission to perform this action.",
    NO_VENDOR_ORGANIZATION: "Your vendor workspace is not ready yet. Please complete vendor setup.",
    ACCOUNT_TYPE_MISMATCH: "This account belongs to the other login tab. Please switch Customer/Vendor and try again.",
    CLOUDINARY_NOT_CONFIGURED: "Media storage is not configured. Add the Cloudinary API key on the server and restart it.",
    MEDIA_UPLOAD_FAILED: "Media upload failed. Please check Cloudinary settings or try a smaller file.",
    PRIMARY_CATEGORY_SINGLE_ONLY: "Choose exactly one primary category. Add secondary services separately.",
    RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
    COUPON_INVALID: "This coupon code is not valid.",
    COUPON_NOT_STARTED: "This coupon is not active yet.",
    COUPON_EXPIRED: "This coupon has expired.",
    COUPON_USAGE_LIMIT_REACHED: "This coupon has already been fully used.",
    COUPON_MIN_ORDER_NOT_MET: "This order does not meet the coupon minimum amount.",
    COUPON_NO_DISCOUNT: "This coupon does not reduce this payment.",
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
  { storageKey: "starvnt_external_access_token", loginRedirectPath: "/login" },
);
export const adminApi = makeApi(
  `${API_BASE}/api/admin`,
  `${API_BASE}/api/admin/auth/refresh`,
  { storageKey: "starvnt_admin_access_token", loginRedirectPath: "/admin/login" },
);
