import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { partnerPixel, CONSENT_KEY, pageLabel } from '../lib/metaPixel.js';
import { syncPartnerTagManager } from '../lib/partnerTagManager.js';
import { useExternalAuth } from '../auth/ExternalAuthContext.jsx';
import { externalApi } from '../lib/api.js';

export default function PartnerMarketing() {
  const location = useLocation();
  const { user } = useExternalAuth();
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!partnerPixel) return;
    const update = () => { partnerPixel.syncConsent(); setRevision(v => v + 1); };
    const storage = e => { if (e.key === CONSENT_KEY || e.key === null) { if (!e.newValue) partnerPixel.setConsent(false); update(); } };
    window.addEventListener('starvnt-marketing-consent', update);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener('starvnt-marketing-consent', update); window.removeEventListener('storage', storage); };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => partnerPixel?.page(location.pathname, location.key), 0);
    return () => clearTimeout(timer); // Redirects and StrictMode remounts are not extra visits.
  }, [location.pathname, location.key, revision]);
  useEffect(() => {
    if (!partnerPixel) return;
    const sync = () => {
      const consent = partnerPixel.getConsent();
      syncPartnerTagManager(window, Boolean(pageLabel(location.pathname) && consent.allowed && consent.googleTagManager));
    };
    sync();
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, [location.pathname, revision]);
  useEffect(() => {
    if (!partnerPixel || user?.accountType !== 'VENDOR' || !pageLabel(location.pathname)?.startsWith('vendor/') || !partnerPixel.getConsent().allowed) return;
    let active = true, busy = false;
    const poll = async () => {
      if (!active || busy || document.visibilityState === 'hidden' || !partnerPixel.syncConsent()) return;
      busy = true;
      try {
        // This reads backend facts and claims first achievements atomically across devices.
        const result = await externalApi.call('/vendor/acquisition-events/claim', { method: 'POST', body: { consentSince: partnerPixel.getConsent().at } });
        partnerPixel.receipts(result.events);
      } catch { /* Marketing failures never affect vendor operations. */ }
      finally { busy = false; }
    };
    void poll();
    const timer = setInterval(poll, 30000);
    window.addEventListener('starvnt-vendor-saved', poll);
    document.addEventListener('visibilitychange', poll);
    return () => { active = false; clearInterval(timer); window.removeEventListener('starvnt-vendor-saved', poll); document.removeEventListener('visibilitychange', poll); };
  }, [user?.id, user?.accountType, revision, location.pathname]);
  useEffect(() => {
    if (!partnerPixel) return;
    const contactTimes = new Map();
    const contact = e => {
      const a = e.target.closest?.('a[href]');
      if (!a || e.defaultPrevented) return;
      const href = a.getAttribute('href') || '';
      // Support only: WhatsApp sharing of customer links is not a support conversion.
      const support = /support/i.test(a.textContent || '');
      const channel = support && /^https:\/\/(wa.me|api.whatsapp.com)\//.test(href) ? 'whatsapp'
        : /^mailto:support@starvnt.com(?:\?|$)/i.test(href) ? 'email'
        : support && /^tel:/.test(href) ? 'phone' : null;
      if (channel && Date.now() - (contactTimes.get(channel) || 0) > 2000) {
        contactTimes.set(channel, Date.now());
        void partnerPixel.track('Contact', undefined, undefined, { channel });
      }
    };
    const search = () => { void partnerPixel.track('Search', undefined, undefined, { channel: 'project_location' }); };
    window.addEventListener('starvnt-vendor-search', search);
    document.addEventListener('click', contact);
    return () => { document.removeEventListener('click', contact); window.removeEventListener('starvnt-vendor-search', search); };
  }, []);
  if (!partnerPixel) return null;
  const consent = partnerPixel.getConsent();
  const choose = allowed => { partnerPixel.setConsent(allowed); setOpen(false); };
  const needsChoice = !consent.version || Date.now() - consent.at >= 90 * 86400000 ||
    (consent.allowed && consent.googleTagManager !== true);
  return <>
    <button type="button" className="fixed bottom-3 left-3 z-[90] rounded-xl border bg-white text-gray-900 px-3 py-2 text-xs shadow" onClick={() => setOpen(true)}>Marketing privacy</button>
    {(needsChoice || open) && <section aria-label="Marketing privacy choices" className="fixed bottom-14 left-3 right-3 sm:left-auto sm:max-w-md z-[100] rounded-2xl border border-gray-300 bg-white p-5 text-gray-900 shadow-xl">
      <h2 className="font-bold">Your marketing privacy</h2>
      <p className="mt-2 text-sm">With your permission, we use Meta Pixel and Google Tag Manager to measure ads and activity on the vendor portal. Meta receives a browser identifier, ad click information and partner activity such as registration and approval. Google tags may use cookies to measure site visits and advertising. This is optional and you can withdraw permission here at any time.</p>
      <p className="mt-2 text-xs">Your choice lasts 90 days on this browser. Rejecting does not affect your account. We honor browser Global Privacy Control and Do Not Track signals. <a className="underline" href="/privacy">Privacy notice</a></p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className="rounded-lg border border-gray-500 px-4 py-2 text-sm" onClick={() => choose(false)}>{consent.allowed ? 'Revoke consent' : 'Reject marketing'}</button>
        <button type="button" className="rounded-lg border border-gray-500 px-4 py-2 text-sm" onClick={() => choose(true)}>Allow marketing</button>
        {open && !needsChoice && <button type="button" className="px-3 py-2 text-sm underline" onClick={() => setOpen(false)}>Close</button>}
      </div>
    </section>}
  </>;
}
