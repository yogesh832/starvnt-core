import { createContext, useContext, useEffect, useState, useRef } from "react";
import { externalApi } from "../lib/api.js";

import { acceptCustomerSession, customerPayload } from "../lib/customerSurface.js";

const ExternalAuthContext = createContext(null);

/** Customer OS uses the shared external identity with the customer surface. */
export function ExternalAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const sessionRevision = useRef(0);
  async function storeSession(data, expected = sessionRevision.current) {
    const current = () => expected === sessionRevision.current;
    const nextUser = await acceptCustomerSession(data, externalApi, current);
    if (current()) setUser(nextUser);
    return nextUser;
  }

  useEffect(() => {
    async function restoreSession() {
      const expected = sessionRevision.current;
      try {
        if (externalApi.getToken()) {
          const data = await externalApi.call("/auth/me");
          if (data?.user) {
            await storeSession(data, expected);
            return;
          }
        }

        const data = await externalApi.refresh();
        if (data?.user) await storeSession(data, expected);
      } catch {
        if (expected === sessionRevision.current) { externalApi.setToken(null); setUser(null); }
      } finally {
        setReady(true);
      }
    }

    restoreSession();
  }, []);

  // Customer builds always request the customer surface, including social/OTP flows.
  async function login(email, password, accountType) {
    const expected = ++sessionRevision.current;
    const data = await externalApi.call("/auth/login", {
      method: "POST",
      body: customerPayload({ email, password }),
    });
    return storeSession(data, expected);
  }

  async function register(payload) {
    const expected = ++sessionRevision.current;
    const data = await externalApi.call("/auth/register", {
      method: "POST",
      body: customerPayload(payload),
    });
    return storeSession(data, expected);
  }

  async function loginWithGoogle(credential, extra = {}) {
    const expected = ++sessionRevision.current;
    const data = await externalApi.call("/auth/google", {
      method: "POST",
      body: customerPayload({ credential, ...extra }),
    });
    return storeSession(data, expected);
  }

  async function sendOtp(phone) {
    return externalApi.call("/auth/otp/send", {
      method: "POST",
      body: customerPayload({ phone }),
    });
  }

  async function sendEmailOtp(email, extra = {}) {
    return externalApi.call("/auth/otp/email/send", {
      method: "POST",
      body: customerPayload({ email, ...extra }),
    });
  }

  async function verifyEmailOtp(email, otp) {
    return externalApi.call("/auth/otp/email/verify", {
      method: "POST",
      body: { email, otp },
    });
  }

  async function setPassword(email, otp, password, accountType) {
    const expected = ++sessionRevision.current;
    const data = await externalApi.call("/auth/password/set", {
      method: "POST",
      body: customerPayload({ email, otp, password }),
    });
    return storeSession(data, expected);
  }

  async function loginWithOtp(phone, otp, extra = {}) {
    const expected = ++sessionRevision.current;
    const data = await externalApi.call("/auth/otp/verify", {
      method: "POST",
      body: customerPayload({ phone, otp, ...extra }),
    });
    return storeSession(data, expected);
  }

  async function loginWithEmailOtp(email, otp, extra = {}) {
    const expected = ++sessionRevision.current;
    const data = await externalApi.call("/auth/otp/email/verify", {
      method: "POST",
      body: customerPayload({ email, otp, ...extra }),
    });
    return storeSession(data, expected);
  }

  async function loginWithWidgetOtp(accessToken, extra = {}) {
    const expected = ++sessionRevision.current;
    const data = await externalApi.call("/auth/otp/widget-verify", {
      method: "POST",
      body: customerPayload({ accessToken, ...extra }),
    });
    return storeSession(data, expected);
  }

  async function switchSurface(targetType) {
    if (targetType !== "CUSTOMER") throw new Error("Vendor OS is available in the vendor app.");
    const expected = ++sessionRevision.current;
    const data = await externalApi.call("/auth/switch-surface", {
      method: "POST",
      body: { targetSurface: targetType },
    });
    return storeSession(data, expected);
  }

  async function logout() {
    ++sessionRevision.current;
    const request = externalApi.raw("/auth/logout", { method: "POST" }, false);
    externalApi.setToken(null);
    setUser(null);
    await request.catch(() => {});
  }

  return (
    <ExternalAuthContext.Provider
      value={{
        user,
        ready,
        login,
        register,
        loginWithGoogle,
        sendOtp,
        sendEmailOtp,
        verifyEmailOtp,
        setPassword,
        loginWithOtp,
        loginWithEmailOtp,
        loginWithWidgetOtp,
        switchSurface,
        logout,
      }}
    >
      {children}
    </ExternalAuthContext.Provider>
  );
}

export const useExternalAuth = () => useContext(ExternalAuthContext);
