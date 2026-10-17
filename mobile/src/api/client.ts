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
    super(
      data.message ||
        messages[data.error] ||
        String(data.error || "Request failed")
          .replaceAll("_", " ")
          .toLowerCase(),
    );
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
};

export function createClient(
  base: string,
  vault: Vault,
  fetcher: typeof fetch = fetch,
) {
  let accessToken: string | null = null;
  let refreshing: Promise<Data | null> | null = null;
  let generation = 0;
  let closing = false;
  let vaultWrite: Promise<void> = Promise.resolve();
  let expired = () => {};
  function persist(action: () => Promise<void>) {
    const job = vaultWrite.then(action, action);
    vaultWrite = job.catch(() => {});
    return job;
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
      throw new Error(
        "Could not reach STARVNT. Check your connection and try again.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  async function accept(data: Data, expected = generation) {
    if (!data.accessToken || !data.refreshToken)
      throw new Error("The server needs the native session update.");
    if (expected !== generation) return;
    await persist(async () => {
      if (expected === generation) await vault.set(data.refreshToken);
    });
    if (expected === generation) accessToken = data.accessToken;
  }
  async function clear() {
    generation++;
    accessToken = null;
    await persist(() => vault.clear());
  }
  function refresh(): Promise<Data | null> {
    if (closing) return Promise.resolve(null);
    if (refreshing) return refreshing;
    const expected = generation;
    refreshing = (async () => {
      const credential = await vault.get();
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
          if (expected === generation) {
            await clear();
            expired();
          }
          return null;
        }
        await accept(data, expected);
        return expected === generation ? data : null;
      } catch (error) {
        if (
          error instanceof ApiError &&
          [400, 401, 403].includes(error.status)
        ) {
          if (expected === generation) {
            await clear();
            expired();
          }
          return null;
        }
        throw error;
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    binary = false,
  ): Promise<Data> {
    const tokenAtStart = accessToken;
    async function retryOnce() {
      try {
        return await send(path, method, body, binary);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clear();
          expired();
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
        path.startsWith("/auth/")
      )
        throw error;
      // A concurrent request may already have rotated the session.
      if (accessToken && accessToken !== tokenAtStart) return retryOnce();
      if (await refresh()) return retryOnce();
      expired();
      throw error;
    }
  }
  return {
    call,
    refresh,
    accept,
    clear,
    async download(path: string): Promise<Response> {
      return (await call(path, "GET", undefined, true)).response;
    },
    onExpired: (listener: () => void) => {
      expired = listener;
    },
    async authenticate(path: string, body: Data) {
      const expected = generation;
      const data = await send(`/auth/${path}`, "POST", body);
      await accept(data, expected);
      return data;
    },
    async logout() {
      closing = true;
      try {
        await refreshing;
        await vaultWrite;
        const refreshToken = await vault.get();
        // Keep the credential available for retry if server revocation fails.
        await send("/auth/logout", "POST", { refreshToken });
        await clear();
      } finally {
        closing = false;
      }
    },
  };
}
export type Client = ReturnType<typeof createClient>;
