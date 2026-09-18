import { createContext, useContext, useEffect, useState } from 'react';
import { adminApi } from '../lib/api.js';

const AdminAuthContext = createContext(null);

/** Separate INTERNAL identity — Admin / Super Admin. Never mixed with external. */
export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    adminApi
      .refresh()
      .then((data) => data && setAdmin(data.admin))
      .finally(() => setReady(true));
  }, []);

  async function login(email, password) {
    const data = await adminApi.call('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    adminApi.setToken(data.accessToken);
    setAdmin(data.admin);
    return data.admin;
  }

  async function logout() {
    await adminApi.call('/auth/logout', { method: 'POST' }).catch(() => {});
    adminApi.setToken(null);
    setAdmin(null);
  }

  /** Permission check for UI affordances ONLY — backend enforces regardless. */
  function can(...perms) {
    if (!admin) return false;
    if (admin.role === 'SUPER_ADMIN') return true;
    return perms.every((p) => admin.permissions.includes(p));
  }

  return (
    <AdminAuthContext.Provider value={{ admin, ready, login, logout, can }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => useContext(AdminAuthContext);
