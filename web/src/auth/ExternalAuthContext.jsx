import { createContext, useContext, useEffect, useState } from 'react';
import { externalApi } from '../lib/api.js';

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
    const data = await externalApi.call('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    externalApi.setToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }

  async function register(payload) {
    const data = await externalApi.call('/auth/register', {
      method: 'POST',
      body: payload,
    });
    externalApi.setToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    await externalApi.call('/auth/logout', { method: 'POST' }).catch(() => {});
    externalApi.setToken(null);
    setUser(null);
  }

  return (
    <ExternalAuthContext.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </ExternalAuthContext.Provider>
  );
}

export const useExternalAuth = () => useContext(ExternalAuthContext);
