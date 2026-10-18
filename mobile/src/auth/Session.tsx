import React, { createContext, useContext, useEffect, useState } from "react";
import { Data, Client } from "../api/client";
import { external, internal } from "../api/runtime";
import { logoutPush } from "../pushRuntime";

type SessionValue = {
  activeDomain: "external" | "admin";
  setActiveDomain: (domain: "external" | "admin") => void;
  user: Data | null;
  admin: Data | null;
  ready: boolean;
  error: string;
  restore: () => Promise<void>;
  signIn: (
    domain: "external" | "admin",
    path: string,
    payload: Data,
  ) => Promise<void>;
  switchSurface: (targetSurface: string) => Promise<void>;
  logout: (admin?: boolean) => Promise<void>;
  can: (permission: string) => boolean;
};
const Context = createContext<SessionValue>(null!);
export function SessionProvider({ children }: React.PropsWithChildren) {
  const [user, setUser] = useState<Data | null>(null);
  const [admin, setAdmin] = useState<Data | null>(null);
  const [ready, setReady] = useState(false);
  const [activeDomain, setActiveDomain] = useState<"external" | "admin">(
    "external",
  );
  const [error, setError] = useState("");
  async function restore() {
    setReady(false);
    setError("");
    try {
      // Independent domains: one expired credential must not clear the other.
      const results = await Promise.allSettled([
        external.refresh(),
        internal.refresh(),
      ]);
      const outside =
        results[0].status === "fulfilled"
          ? results[0].value?.user || null
          : null;
      const inside =
        results[1].status === "fulfilled"
          ? results[1].value?.admin || null
          : null;
      setUser(outside);
      setAdmin(inside);
      if (inside && !outside) setActiveDomain("admin");
      // A transient failure in one domain cannot block a restored session in the other.
      if (!outside && !inside) {
        const failure = results.find((r) => r.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    external.onExpired(() => setUser(null));
    internal.onExpired(() => setAdmin(null));
    void restore();
  }, []);
  async function signIn(
    domain: "external" | "admin",
    path: string,
    payload: Data,
  ) {
    const api: Client = domain === "admin" ? internal : external;
    const result = await api.authenticate(path, payload);
    if (domain === "admin") setAdmin(result.admin);
    else setUser(result.user);
    setActiveDomain(domain);
  }
  return (
    <Context.Provider
      value={{
        user,
        admin,
        ready,
        error,
        restore,
        signIn,
        activeDomain,
        setActiveDomain,
        can: (p) =>
          !!admin &&
          (admin.role === "SUPER_ADMIN" || admin.permissions?.includes(p)),
        async switchSurface(targetSurface) {
          const result = await external.authenticate("switch-surface", {
            targetSurface,
          });
          setUser(result.user);
        },
        async logout(isAdmin) {
          await logoutPush(isAdmin ? "admin" : "external");
          await (isAdmin ? internal : external).logout();
          if (isAdmin) setAdmin(null);
          else setUser(null);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useSession = () => useContext(Context);
