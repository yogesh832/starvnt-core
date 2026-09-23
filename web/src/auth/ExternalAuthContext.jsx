import { createContext, useContext, useEffect, useState } from "react";
import { externalApi } from "../lib/api.js";

const ExternalAuthContext = createContext(null);

/** Single EXTERNAL identity — one login flow for both CUSTOMER and VENDOR. */
export function ExternalAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    externalApi
      .refresh()
      .then((data) => data && setUser(data.user))
      .finally(() => setReady(true));
  }, []);

  async function login(email, password) {
    const data = await externalApi.call("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    externalApi.setToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }

  async function register(payload) {
    const data = await externalApi.call("/auth/register", {
      method: "POST",
      body: payload,
    });
    externalApi.setToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }

  async function loginWithGoogle(credential, extra = {}) {
    const data = await externalApi.call("/auth/google", {
      method: "POST",
      body: { credential, ...extra },
    });
    externalApi.setToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }

  async function sendOtp(phone) {
    return externalApi.call("/auth/otp/send", {
      method: "POST",
      body: { phone },
    });
  }

  async function sendEmailOtp(email, extra = {}) {
    return externalApi.call("/auth/otp/email/send", {
      method: "POST",
      body: { email, ...extra },
    });
  }

  async function verifyEmailOtp(email, otp) {
    return externalApi.call("/auth/otp/email/verify", {
      method: "POST",
      body: { email, otp },
    });
  }

  async function loginWithOtp(phone, otp, extra = {}) {
    const data = await externalApi.call("/auth/otp/verify", {
      method: "POST",
      body: { phone, otp, ...extra },
    });
    externalApi.setToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }

  async function loginWithEmailOtp(email, otp, extra = {}) {
    const data = await externalApi.call("/auth/otp/email/verify", {
      method: "POST",
      body: { email, otp, ...extra },
    });
    externalApi.setToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }

  async function loginWithWidgetOtp(accessToken, extra = {}) {
    const data = await externalApi.call("/auth/otp/widget-verify", {
      method: "POST",
      body: { accessToken, ...extra },
    });
    externalApi.setToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    await externalApi.call("/auth/logout", { method: "POST" }).catch(() => {});
    externalApi.setToken(null);
    setUser(null);
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
        loginWithOtp,
        loginWithEmailOtp,
        loginWithWidgetOtp,
        logout,
      }}
    >
      {children}
    </ExternalAuthContext.Provider>
  );
}

export const useExternalAuth = () => useContext(ExternalAuthContext);
