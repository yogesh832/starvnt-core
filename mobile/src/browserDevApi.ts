/** A local browser preview should reach the backend through the same loopback
 * host, without requiring browser local-network access to the phone's LAN URL. */
export function browserDevApi(configured: string, browserHost: string | undefined) {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(browserHost || '')) return configured;
  try {
    const api = new URL(configured);
    const host = api.hostname;
    const privateHost = /^(10\.|192\.168\.|127\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === 'localhost';
    if (api.protocol === 'http:' && privateHost) { api.hostname = browserHost!; return api.toString().replace(/\/$/, ''); }
  } catch { /* Preserve the explicit configuration so validation can report it. */ }
  return configured;
}
