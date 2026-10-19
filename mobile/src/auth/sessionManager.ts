import type { Client, Data, Vault } from '../api/client.ts';

export type Domain = 'external' | 'admin';
type State = {
  user: Data | null;
  admin: Data | null;
  activeDomain: Domain;
  ready: boolean;
  error: string;
  logoutRevision: number;
};

/** Owns session transitions independently of React and native storage. */
export function createSessionManager(deps: {
  external: Client;
  internal: Client;
  preference: Vault;
  cleanupPush: (domain: Domain) => Promise<void>;
}) {
  let state: State = { user: null, admin: null, activeDomain: 'external', ready: false, error: '', logoutRevision: 0 };
  let revision = 0;
  let preferenceWrite: Promise<void> = Promise.resolve();
  let signingOut: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const clients = { external: deps.external, admin: deps.internal };
  const persistent = { external: true, admin: true };
  function update(change: Partial<State>) {
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  }
  function remember(domain: Domain | 'guest') {
    const job = preferenceWrite.then(() => deps.preference.set(domain));
    preferenceWrite = job.catch(() => {});
    return job;
  }
  function expire(domain: Domain) {
    update(domain === 'admin' ? { admin: null } : { user: null });
  }
  return {
    connect() {
      deps.external.onExpired(() => expire('external'));
      deps.internal.onExpired(() => expire('admin'));
      return () => {
        deps.external.onExpired(() => {});
        deps.internal.onExpired(() => {});
      };
    },
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async restore() {
      if (signingOut) return signingOut;
      const expected = ++revision;
      update({ ready: false, error: '' });
      try {
        await preferenceWrite;
        const selected = await deps.preference.get();
        if (expected !== revision) return;
        // Existing installs default to the customer/vendor workspace. A stale
        // internal credential never opts a customer into the admin dashboard.
        const domain: Domain = selected === 'admin' ? 'admin' : 'external';
        if (selected === 'guest') {
          update({ user: null, admin: null, activeDomain: 'external' });
          return;
        }
        // Restore only the explicitly selected workspace. An unused admin
        // credential must neither sign in silently nor delay customer startup.
        const result = await clients[domain].refresh();
        if (expected !== revision) return;
        update({
          user: domain === 'external' ? result?.user || null : null,
          admin: domain === 'admin' ? result?.admin || null : null,
          activeDomain: domain,
        });
      } catch (e) {
        if (expected === revision) update({ error: (e as Error).message });
      } finally {
        if (expected === revision) update({ ready: true });
      }
    },
    setActiveDomain(domain: Domain) {
      if (signingOut) return;
      // This changes the sign-in surface; only a successful sign-in persists it.
      // Otherwise viewing the internal login could change the next launch.
      update({ activeDomain: domain, error: '' });
      const owner = domain === 'admin' ? state.admin : state.user;
      if (owner) void remember(persistent[domain] ? domain : 'guest').catch(() => {});
    },
    async signIn(domain: Domain, path: string, payload: Data) {
      if (signingOut) await signingOut;
      const expected = ++revision;
      const result = await clients[domain].authenticate(path, payload);
      if (expected !== revision) return;
      const identity = domain === 'admin' ? result.admin : result.user;
      if (!identity) throw new Error('The server did not return your account. Please try again.');
      persistent[domain] = path !== 'dev-auth';
      await remember(persistent[domain] ? domain : 'guest');
      if (expected !== revision) return;
      update({ ...(domain === 'admin' ? { admin: identity } : { user: identity }), activeDomain: domain, ready: true, error: '' });
    },
    async switchSurface(targetSurface: string) {
      if (signingOut) return;
      const expected = ++revision;
      const result = await deps.external.authenticate('switch-surface', { targetSurface });
      if (expected !== revision) return;
      if (!result.user) throw new Error('The server did not return your workspace. Please try again.');
      await remember(persistent.external ? 'external' : 'guest');
      if (expected === revision) update({ user: result.user, activeDomain: 'external', ready: true, error: '' });
    },
    logout() {
      if (signingOut) return signingOut;
      ++revision;
      // Clear UI immediately and fence any in-flight restore/login. Neither push
      // cleanup nor an offline revocation endpoint can retain a local session.
      update({ user: null, admin: null, activeDomain: 'external', ready: false, error: '', logoutRevision: state.logoutRevision + 1 });
      const localLogout = Promise.allSettled([
        remember('guest'), deps.external.logout(), deps.internal.logout(),
      ]);
      signingOut = (async () => {
        const results = await localLogout;
        for (const domain of ['external', 'admin'] as const)
          void deps.cleanupPush(domain).catch(() => {});
        const failure = results.find(r => r.status === 'rejected');
        update({ ready: true, error: failure?.status === 'rejected' ? 'Could not remove the saved session from this device. Please retry sign-out.' : '' });
      })().finally(() => { signingOut = null; });
      return signingOut;
    },
  };
}
