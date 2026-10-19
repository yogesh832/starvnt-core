import type { Data } from '../api/client.ts';
import type { Domain } from './sessionManager.ts';

type Persona = { domain: Domain; email: string; role?: string; accountType?: string };
type Navigation = {
  getState: () => { routeNames?: readonly string[] } | undefined;
  reset: (state: { index: number; routes: { name: string }[] }) => void;
};

export async function quickAuthenticate(
  account: Persona,
  signIn: (domain: Domain, path: string, payload: Data) => Promise<void>,
  navigation: Navigation,
) {
  await signIn(account.domain, 'dev-auth', {
    email: account.email,
    ...(account.domain === 'admin' ? { role: account.role } : { accountType: account.accountType }),
  });
  // A different identity remounts the navigator at Main. Re-selecting the same
  // identity keeps its navigator, so it needs an explicit exit from TestAuth.
  // Guest navigators do not yet have Main; SessionProvider replaces those.
  if (navigation.getState()?.routeNames?.includes('Main'))
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
}
