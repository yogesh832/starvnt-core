export type Data = Record<string, any>;
export type Vault = {
  get: () => Promise<string | null>;
  set: (value: string) => Promise<void>;
  clear: () => Promise<void>;
};
export class ApiError extends Error {
  status: number;
  data: Data;
  constructor(status: number, data: Data) {
    const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "support@starvnt.com";
    const userMessage =
      messages[data.error] ||
      (status >= 500
        ? `There is a temporary issue on the STARVNT server. Please try again later or reach out to support at ${supportEmail}.`
        : data.message ||
          String(data.error || "Request failed")
            .replaceAll("_", " ")
            .toLowerCase());
    super(userMessage);
    this.status = status;
    this.data = data;
  }
}
const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "The email or password is incorrect.",
  RATE_LIMITED: "Too many attempts. Please wait before trying again.",
  MFA_REQUIRED: "Enter the six-digit code from your authenticator.",
  MFA_SETUP_REQUIRED:
    "An administrator must finish MFA setup before you can sign in.",
  EMAIL_OTP_NOT_CONFIGURED: "Email verification is temporarily unavailable.",
  ACCOUNT_TYPE_MISMATCH: "Choose the other account type and try again.",
  UNAUTHENTICATED: "Your session has expired. Please sign in again.",
  SESSION_REVOKED: "Your session has expired. Please sign in again.",
  ACCOUNT_DISABLED_OR_MISSING: "This account is not available. Please contact customer support at support@starvnt.com.",
};

export function createClient(
  base: string,
  vault: Vault,
  fetcher: typeof fetch = fetch,
) {
  let accessToken: string | null = null;
  let temporaryRefreshToken: string | null = null;
  let refreshing: Promise<Data | null> | null = null;
  let generation = 0;
  let closing = false;
  let vaultWrite: Promise<void> = Promise.resolve();
  let expired = () => {};
  const sessionListeners = new Set<() => void>();
  function persist(action: () => Promise<void>) {
    const job = vaultWrite.then(action, action);
    vaultWrite = job.catch(() => {});
    return job;
  }
  function revoke(refreshToken: string | null) {
    // Revocation is best effort; local logout must also work while offline.
    if (refreshToken)
      void send('/auth/logout', 'POST', { refreshToken }).catch(() => {});
  }

  async function send(
    path: string,
    method: string,
    body?: unknown,
    binary = false,
  ): Promise<Data> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const multipart =
        typeof FormData !== "undefined" && body instanceof FormData;
      const response = await fetcher(`${base}${path}`, {
        method,
        credentials: "omit",
        signal: controller.signal,
        headers: {
          "X-Starvnt-Client": "native",
          Accept: "application/json",
          ...(!multipart && body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body:
          body === undefined
            ? undefined
            : multipart
              ? (body as FormData)
              : JSON.stringify(body),
      });
      if (binary && response.ok) return { response };
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new ApiError(response.status, data);
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && /Unsupported FormData(?:Part)? implementation/.test(error.message))
        throw new Error('This file could not be prepared for upload. Please select or record it again.');
      if (controller.signal.aborted)
        throw new Error('STARVNT took too long to respond. Please try again.');
      throw new Error(
        "Could not reach STARVNT. Check your connection and try again.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  async function accept(data: Data, expected = generation, persistent = true) {
    if (!data.accessToken || !data.refreshToken)
      throw new Error("The server needs the native session update.");
    if (expected !== generation) return;
    await persist(async () => {
      if (expected !== generation) return;
      if (persistent) await vault.set(data.refreshToken);
      else await vault.clear();
    });
    if (expected === generation) {
      accessToken = data.accessToken;
      temporaryRefreshToken = persistent ? null : data.refreshToken;
      for (const listener of sessionListeners) {
        try {
          listener();
        } catch {
          /* Optional observers cannot invalidate authentication. */
        }
      }
    }
  }
  async function clear() {
    generation++;
    accessToken = null;
    temporaryRefreshToken = null;
    refreshing = null;
    await persist(() => vault.clear());
  }
  async function invalidate(expected: number) {
    if (expected !== generation) return;
    const invalidated = generation + 1;
    await clear();
    if (generation === invalidated) expired();
  }
  function refresh(): Promise<Data | null> {
    if (closing) return Promise.resolve(null);
    if (refreshing) return refreshing;
    const expected = generation;
    const persistent = !temporaryRefreshToken;
    const job = (async () => {
      const credential = temporaryRefreshToken || await vault.get();
      if (!credential) return null;
      try {
        const data = await send("/auth/refresh", "POST", {
          refreshToken: credential,
        });
        // The existing web-compatible backend reports invalid refresh sessions as HTTP 200.
        if (
          !data.accessToken &&
          data.ok === false &&
          [
            "NO_REFRESH_TOKEN",
            "SESSION_INVALID",
            "ACCOUNT_DISABLED_OR_MISSING",
          ].includes(data.error)
        ) {
          await invalidate(expected);
          return null;
        }
        if (expected !== generation) {
          revoke(data.refreshToken);
          return null;
        }
        await accept(data, expected, persistent);
        if (expected !== generation) {
          revoke(data.refreshToken);
          return null;
        }
        return data;
      } catch (error) {
        if (
          error instanceof ApiError &&
          [400, 401, 403].includes(error.status)
        ) {
          await invalidate(expected);
          return null;
        }
        throw error;
      }
    })().finally(() => {
      if (refreshing === job) refreshing = null;
    });
    refreshing = job;
    return job;
  }
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    binary = false,
  ): Promise<Data> {
    const tokenAtStart = accessToken;
    const expected = generation;
    async function retryOnce() {
      try {
        return await send(path, method, body, binary);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && expected === generation) {
          await invalidate(expected);
        }
        throw error;
      }
    }
    try {
      return await send(path, method, body, binary);
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        error.status !== 401 ||
        path.startsWith("/auth/") ||
        expected !== generation || closing
      )
        throw error;
      // A concurrent request may already have rotated the session.
      if (accessToken && accessToken !== tokenAtStart) return retryOnce();
      if (await refresh()) return retryOnce();
      if (expected === generation) expired();
      throw error;
    }
  }
  return {
    call,
    refresh,
    accept,
    clear,
    onSessionChanged(listener: () => void) {
      sessionListeners.add(listener);
      return () => {
        sessionListeners.delete(listener);
      };
    },
    async download(path: string): Promise<Response> {
      return (await call(path, "GET", undefined, true)).response;
    },
    onExpired: (listener: () => void) => {
      expired = listener;
    },
    async authenticate(path: string, body: Data) {
      if (closing) throw new Error('Please wait for sign-out to finish.');
      const expected = ++generation;
      const persistent = path !== 'dev-auth' && (path !== 'switch-surface' || !temporaryRefreshToken);
      refreshing = null;
      const data = await send(`/auth/${path}`, "POST", body);
      await accept(data, expected, persistent);
      if (expected !== generation) {
        revoke(data.refreshToken);
        throw new Error('This sign-in was cancelled. Please try again.');
      }
      return data;
    },
    async logout() {
      closing = true;
      generation++;
      accessToken = null;
      const temporaryToken = temporaryRefreshToken;
      temporaryRefreshToken = null;
      refreshing = null;
      try {
        let refreshToken: string | null = null;
        await persist(async () => {
          try {
            refreshToken = temporaryToken || await vault.get();
          } finally {
            await vault.clear();
          }
        });
        revoke(refreshToken);
      } finally {
        closing = false;
      }
    },
  };
}
export type Client = ReturnType<typeof createClient>;
