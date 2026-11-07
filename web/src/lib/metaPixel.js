import { PORTAL_SURFACE } from './portalAccess.js';
// Explicit image-tag Pixel transport keeps Meta scripts away from private form/DOM data.
// Only allowlisted parameters and route labels leave the browser. No advanced matching.
export const PIXEL_ID = '1694475908953355';
export const CONSENT_KEY = 'starvnt_partner_marketing_v1';
const ATTRIBUTION_KEY = 'starvnt_partner_attribution_v1';
const SENT_KEY = 'starvnt_partner_pixel_sent_v1';
const MAX_AGE = 90 * 24 * 60 * 60 * 1000;
const EVENTS = new Set(['PageView', 'ViewContent', 'CompleteRegistration', 'Contact', 'Search', 'SubmitApplication', 'VendorRegistrationStarted', 'VendorLogin', 'VendorOnboardingStarted', 'VendorBusinessInformationAdded', 'VendorProfileCompleted', 'VendorPortfolioUploaded', 'VendorOnboardingCompleted', 'VendorVerified']);
const PAGES = new Set(['dashboard', 'launchpad', 'profile', 'portfolio', 'services', 'availability', 'documents', 'settings', 'readiness', 'enquiries', 'quotes', 'bookings', 'calendar', 'payments', 'reviews', 'analytics', 'messages', 'updates', 'growth', 'discovery-rewards', 'financial', 'external-bookings', 'customers', 'experience-qr', 'proposals']);
const read = (storage, key) => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };
const write = (storage, key, value) => { try { storage.setItem(key, JSON.stringify(value)); } catch { /* Restricted storage never affects the application. */ } };
export function pageLabel(path) {
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return 'landing';
  if (['login', 'register', 'signup', 'privacy', 'terms'].includes(parts[0]) && parts.length === 1) return parts[0];
  if (parts[0] === 'vendor') return PAGES.has(parts[1]) ? `vendor/${parts[1]}` : 'vendor/dashboard';
  return null; // Never expose admin, customer, invitation tokens or unknown paths.
}
export function campaignFromUrl(href) {
  const query = new URL(href).searchParams, result = {};
  // Campaign/ad IDs are opaque identifiers, not free-text campaign names or search terms.
  for (const key of ['campaign_id', 'adset_id', 'ad_id', 'utm_id']) {
    const value = query.get(key);
    if (value && /^\d{1,30}$/.test(value)) result[key] = value;
  }
  for (const key of ['utm_source', 'utm_medium']) {
    const value = query.get(key)?.toLowerCase();
    if (['facebook', 'instagram', 'fb', 'ig', 'meta', 'paid_social', 'social', 'cpc'].includes(value)) result[key] = value;
  }
  const click = query.get('fbclid');
  if (click && /^[A-Za-z0-9_-]{10,500}$/.test(click)) result.fbclid = click;
  return result;
}

export function createPartnerPixel(env) {
  let consent = null, attribution = null, currentPage = null, lastVisit = null;
  const sent = new Set(), inFlight = new Set(), images = new Set();
  // Keep landing attribution only in memory until consent, including across SPA redirects.
  let landing = { ...campaignFromUrl(env.location.href), capturedAt: env.now() };
  const storage = () => { try { return env.localStorage; } catch { return null; } };
  const permitted = () => consent?.allowed === true && env.now() - consent.at < MAX_AGE && !env.optOut();
  function cookie(name) { try { return env.document.cookie.split('; ').find(c => c.startsWith(`${name}=`))?.slice(name.length + 1); } catch { return undefined; } }
  function setCookie(name, value, age = MAX_AGE / 1000, domain = '') {
    try { env.document.cookie = `${name}=${value}; Path=/; Max-Age=${age}; SameSite=Lax${env.location.protocol === 'https:' ? '; Secure' : ''}${domain ? `; Domain=${domain}` : ''}`; } catch { /* Cookies may be disabled. */ }
  }
  function clearMarketing() {
    attribution = null;
    try { storage()?.removeItem(ATTRIBUTION_KEY); } catch { /* optional storage */ }
    for (const name of ['_fbp', '_fbc']) {
      setCookie(name, '', 0);
      const parts = env.location.hostname.split('.');
      for (let i = 0; i < parts.length - 1; i++) setCookie(name, '', 0, parts.slice(i).join('.'));
    }
    for (const img of images) { img.removeAttribute('src'); }
    images.clear();
  }
  function loadAttribution() {
    const saved = read(storage(), ATTRIBUTION_KEY);
    const freshLanding = landing.fbclid || landing.campaign_id || landing.ad_id || landing.utm_id;
    attribution = !freshLanding && saved && env.now() - saved.capturedAt < MAX_AGE
      ? { ...campaignFromUrl(`https://partner.invalid/?${new URLSearchParams(saved)}`), capturedAt: saved.capturedAt }
      : { ...landing };
    if (!cookie('_fbp')) setCookie('_fbp', `fb.1.${env.now()}.${env.randomDigits()}`);
    if (attribution.fbclid && !cookie('_fbc')?.endsWith(`.${attribution.fbclid}`)) setCookie('_fbc', `fb.1.${attribution.capturedAt}.${attribution.fbclid}`);
    write(storage(), ATTRIBUTION_KEY, attribution);
  }
  function syncConsent() {
    const stored = read(storage(), CONSENT_KEY);
    if (stored?.version === 1) consent = stored;
    else if (stored !== null) consent = null;
    if (!permitted()) { clearMarketing(); return false; }
    return true;
  }
  function setConsent(allowed) {
    const keepMetaConsent = allowed === true && permitted();
    if (keepMetaConsent && consent.googleTagManager === true) return;
    const accepted = allowed === true && !env.optOut();
    consent = {
      version: 1,
      allowed: accepted,
      googleTagManager: accepted,
      at: keepMetaConsent ? consent.at : env.now(),
    };
    write(storage(), CONSENT_KEY, consent);
    if (!keepMetaConsent) lastVisit = null;
    if (permitted()) loadAttribution(); else { clearMarketing(); landing = { capturedAt: env.now() }; }
    env.consentChanged?.();
  }
  function getConsent() { return permitted() ? consent : { ...consent, allowed: false }; }
  async function track(name, eventId = env.uuid(), occurredAt = env.now(), details = {}) {
    if (!EVENTS.has(name) || !currentPage || !syncConsent() || Number(new Date(occurredAt)) < consent.at || !/^[A-Za-z0-9-]{1,100}$/.test(eventId)) return false;
    // Web Locks serialize claims across tabs; storage + memory cover refresh and rerenders.
    const send = () => {
      if (!syncConsent() || sent.has(eventId) || inFlight.has(eventId)) return false;
      const ledger = read(storage(), SENT_KEY) || {};
      if (ledger[eventId]) { sent.add(eventId); return false; }
      inFlight.add(eventId);
      try {
        loadAttribution();
        const url = new URL('https://www.facebook.com/tr/');
        const data = { id: PIXEL_ID, ev: name, dl: `${env.location.origin}/${currentPage === 'landing' ? '' : currentPage}`, rl: '', if: 'false', ts: String(env.now()), eid: eventId, noscript: '1' };
        for (const key of ['_fbp', '_fbc']) { const value = cookie(key); if (value && /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_-]{1,500}$/.test(value)) data[key.slice(1)] = value; }
        data['cd[page]'] = currentPage;
        for (const [key, value] of Object.entries(attribution || {})) if (key !== 'fbclid' && key !== 'capturedAt') data[`cd[${key}]`] = value;
        if (['whatsapp', 'phone', 'email', 'project_location'].includes(details.channel)) data['cd[channel]'] = details.channel;
        for (const [key, value] of Object.entries(data)) url.searchParams.set(key, value);
        const img = env.image();
        img.referrerPolicy = 'no-referrer';
        images.add(img);
        img.onload = img.onerror = () => { images.delete(img); };
        img.src = url.href;
        // A dispatch is not proof of delivery. At-most-once dispatch favors avoiding false conversions.
        sent.add(eventId);
        ledger[eventId] = env.now();
        const trimmed = Object.fromEntries(Object.entries(ledger).filter(([, at]) => env.now() - at < MAX_AGE).slice(-2000));
        write(storage(), SENT_KEY, trimmed);
        return true;
      } catch { return false; } finally { inFlight.delete(eventId); }
    };
    try { return env.lock ? await env.lock(`starvnt-pixel-${eventId}`, send) : send(); } catch { return false; }
  }
  function page(path, visit) {
    currentPage = pageLabel(path);
    if (!currentPage) { lastVisit = null; return; }
    if (!syncConsent() || lastVisit === visit) return;
    lastVisit = visit;
    void track('PageView');
    if (['landing', 'register', 'signup'].includes(currentPage)) void track('ViewContent');
  }
  function receipts(events) { for (const e of events || []) if (e?.name && e?.eventId && e?.occurredAt) void track(e.name, e.eventId, e.occurredAt); }
  syncConsent();
  return { track, page, receipts, setConsent, getConsent, syncConsent };
}

// Singleton per document, enabled exclusively on the vendor product.
export const partnerPixel = typeof window !== 'undefined' && PORTAL_SURFACE === 'VENDOR' && !window.location.hostname.startsWith('admin.')
  ? createPartnerPixel({
    location: window.location, document, get localStorage() { return window.localStorage; },
    now: () => Date.now(), uuid: () => crypto.randomUUID(), randomDigits: () => String(crypto.getRandomValues(new Uint32Array(1))[0]),
    image: () => new Image(), optOut: () => navigator.globalPrivacyControl === true || navigator.doNotTrack === '1',
    lock: navigator.locks ? (name, fn) => navigator.locks.request(name, fn) : null,
    consentChanged: () => window.dispatchEvent(new Event('starvnt-marketing-consent')),
  }) : null;
