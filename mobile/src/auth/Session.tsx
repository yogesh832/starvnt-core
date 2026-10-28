import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { Data } from '../api/client';
import { external, internal, sessionPreference } from '../api/runtime';
import { logoutPush } from '../pushRuntime';
import { createSessionManager } from './sessionManager';
import type { Domain } from './sessionManager';

type SessionValue = {
  activeDomain: Domain;
  setActiveDomain: (domain: Domain) => void;
  user: Data | null;
  admin: Data | null;
  ready: boolean;
  error: string;
  logoutRevision: number;
  restore: () => Promise<void>;
  signIn: (domain: Domain, path: string, payload: Data) => Promise<void>;
  switchSurface: (targetSurface: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
};
const Context = createContext<SessionValue>(null!);
export function SessionProvider({ children }: React.PropsWithChildren) {
  const [manager] = useState(() => createSessionManager({
    external, internal, preference: sessionPreference, cleanupPush: logoutPush,
  }));
  const state = useSyncExternalStore(manager.subscribe, manager.getState, manager.getState);
  useEffect(() => {
    const disconnect = manager.connect();
    void manager.restore();
    return disconnect;
  }, [manager]);
  return <Context.Provider value={{
    ...state,
    restore: manager.restore,
    signIn: manager.signIn,
    setActiveDomain: manager.setActiveDomain,
    switchSurface: manager.switchSurface,
    logout: manager.logout,
    can: permission => !!state.admin && (state.admin.role === 'SUPER_ADMIN' || state.admin.permissions?.includes(permission)),
  }}>{children}</Context.Provider>;
}
export const useSession = () => useContext(Context);
