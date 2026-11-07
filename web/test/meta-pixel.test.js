import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartnerPixel, campaignFromUrl, pageLabel, PIXEL_ID, CONSENT_KEY } from '../src/lib/metaPixel.js';
import { syncPartnerTagManager } from '../src/lib/partnerTagManager.js';

function browser(shared = new Map()) {
  let time = 1800000000000, count = 0, optedOut = false;
  const requests = [], cookies = new Map();
  const localStorage = { getItem: k => shared.get(k) || null, setItem: (k, v) => shared.set(k, v), removeItem: k => shared.delete(k) };
  const document = {
    get cookie() { return [...cookies].map(([k, v]) => `${k}=${v}`).join('; '); },
    set cookie(s) { const [kv] = s.split(';'), [k, ...v] = kv.split('='); if (s.includes('Max-Age=0;')) cookies.delete(k); else cookies.set(k, v.join('=')); },
  };
  const env = { location: new URL('https://partner.starvnt.com/register?fbclid=ValidClickID123&campaign_id=123&email=private@example.com&token=secret#otp=123456'), document, localStorage,
    now: () => time, uuid: () => `random-${++count}`, randomDigits: () => '12345678', optOut: () => optedOut,
    image: () => ({ set src(url) { requests.push(new URL(url)); }, removeAttribute() {} }),
  };
  return { env, requests, cookies, localStorage, advance: ms => time += ms, optOut: () => optedOut = true, pixel: createPartnerPixel(env) };
}

test('no Meta requests or marketing storage before consent; rejection and revocation stop dispatch', async () => {
  const b = browser(); b.pixel.page('/register', 'one');
  assert.equal(await b.pixel.track('CompleteRegistration', 'registration'), false);
  assert.equal(b.requests.length, 0); assert.equal(b.cookies.size, 0);
  b.pixel.setConsent(false); b.pixel.page('/register', 'one'); assert.equal(b.requests.length, 0);
  b.pixel.setConsent(true); b.pixel.page('/register', 'one'); assert.equal(b.requests.length, 2);
  b.pixel.setConsent(false); assert.equal(b.cookies.size, 0);
  assert.equal(await b.pixel.track('VendorVerified', 'verified'), false);
  assert.equal(b.requests.length, 2);
});

test('initial load, SPA visits, strict rerenders, refresh and durable receipt deduplication', async () => {
  const b = browser(); b.pixel.setConsent(true); b.pixel.page('/register', 'initial');
  b.pixel.page('/register', 'initial'); assert.equal(b.requests.filter(r => r.searchParams.get('ev') === 'PageView').length, 1);
  b.pixel.page('/vendor/profile', 'next'); b.pixel.page('/register', 'back');
  assert.equal(b.requests.filter(r => r.searchParams.get('ev') === 'PageView').length, 3);
  b.pixel.page('/admin/login', 'admin'); b.pixel.page('/register', 'back');
  assert.equal(b.requests.filter(r => r.searchParams.get('ev') === 'PageView').length, 4);
  assert.equal(await b.pixel.track('CompleteRegistration', 'receipt-id'), true);
  assert.equal(await b.pixel.track('CompleteRegistration', 'receipt-id'), false);
  const reload = createPartnerPixel(b.env); reload.page('/vendor/profile', 'reload');
  assert.equal(await reload.track('CompleteRegistration', 'receipt-id'), false);
  assert.equal(b.requests.filter(r => r.searchParams.get('ev') === 'CompleteRegistration').length, 1);
});

test('outgoing payloads contain safe route labels and IDs, never raw URLs, search text or form data', async () => {
  const b = browser(); b.pixel.setConsent(true); b.pixel.page('/vendor/messages/private-user@example.com', 'private-route');
  await b.pixel.track('Contact', 'contact', undefined, { channel: 'whatsapp', email: 'secret@example.com', password: 'sensitive' });
  for (const request of b.requests) {
    assert.equal(request.searchParams.get('id'), PIXEL_ID);
    assert.equal(request.searchParams.get('dl'), 'https://partner.starvnt.com/vendor/messages');
    assert.equal(request.searchParams.get('rl'), '');
    assert.equal(request.searchParams.get('cd[campaign_id]'), '123');
    assert.doesNotMatch(request.href, /private|secret|sensitive|otp|email|token/);
    assert.match(request.searchParams.get('fbc'), /^fb\.1\.\d+\.ValidClickID123$/);
  }
  assert.equal(pageLabel('/admin/users'), null);
  assert.equal(pageLabel('/experience/secret-token'), null);
  assert.deepEqual(campaignFromUrl('https://partner.starvnt.com/?utm_campaign=customer@example.com&ad_id=123&campaign_id=bad&fbclid=email@example.com'), { ad_id: '123' });
});

test('receipt timestamps prevent replaying pre-consent conversions and browser opt-out overrides consent', async () => {
  const b = browser(); const before = b.env.now(); b.advance(1000); b.pixel.setConsent(true); b.pixel.page('/vendor', 'one');
  assert.equal(await b.pixel.track('VendorVerified', 'old', before), false);
  b.optOut(); assert.equal(await b.pixel.track('VendorLogin', 'login'), false); assert.equal(b.cookies.size, 0);
  b.pixel.setConsent(true); assert.equal(b.pixel.getConsent().allowed, false);
});

test('storage restrictions, Meta failure, consent expiry and cross-tab rejection do not break application actions', async () => {
  const b = browser(); b.pixel.setConsent(true); b.pixel.page('/vendor/profile', 'one');
  b.localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: 1, allowed: false, at: b.env.now() }));
  assert.equal(await b.pixel.track('VendorProfileCompleted', 'blocked'), false);
  b.pixel.setConsent(true); b.advance(91 * 86400000);
  assert.equal(await b.pixel.track('VendorVerified', 'expired'), false);
  const broken = browser(); Object.defineProperty(broken.env, 'localStorage', { get() { throw Error('denied'); } });
  broken.env.image = () => { throw Error('Meta unavailable'); };
  const pixel = createPartnerPixel(broken.env); pixel.setConsent(true); pixel.page('/vendor', 'one');
  assert.equal(await pixel.track('CompleteRegistration', 'unavailable'), false);
});

test('existing Meta consent requires a fresh choice before Google Tag Manager loads', () => {
  const b = browser();
  const originalConsent = { version: 1, allowed: true, at: b.env.now() };
  b.localStorage.setItem(CONSENT_KEY, JSON.stringify(originalConsent));
  b.pixel.syncConsent();
  const scripts = [];
  const browserWindow = {
    document: {
      getElementById: id => scripts.find(script => script.id === id),
      createElement: () => ({}),
      head: { append: script => scripts.push(script) },
    },
  };
  const sync = () => {
    const consent = b.pixel.getConsent();
    syncPartnerTagManager(browserWindow, consent.allowed && consent.googleTagManager === true);
  };

  sync();
  assert.equal(scripts.length, 0);
  assert.equal(browserWindow.dataLayer, undefined);
  b.advance(1000);
  b.pixel.setConsent(true);
  sync();
  sync();
  assert.equal(b.pixel.getConsent().at, originalConsent.at);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://www.googletagmanager.com/gtm.js?id=GTM-PWG3DN52');
  const commands = browserWindow.dataLayer.map(args => Array.from(args));
  assert.equal(commands.length, 3);
  assert.deepEqual(commands.slice(0, 2).map(args => args.slice(0, 2)), [
    ['consent', 'default'], ['consent', 'update'],
  ]);
  assert.equal(commands[2][0], 'js');
  assert.ok(commands[2][1] instanceof Date);
  assert.equal(commands[0][2].analytics_storage, 'denied');
  assert.equal(commands[1][2].analytics_storage, 'granted');
  assert.equal(commands[1][2].ad_user_data, 'denied');

  b.pixel.setConsent(false);
  sync();
  assert.equal(browserWindow.dataLayer.at(-1)[2].analytics_storage, 'denied');
  assert.equal(scripts.length, 1);
});
