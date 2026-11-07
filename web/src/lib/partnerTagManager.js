const SCRIPT_ID = 'starvnt-partner-gtm';
const DEFAULT_CONSENT = {
  ad_storage: 'denied',
  analytics_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
};

let granted = false;

export function syncPartnerTagManager(browser, allowed) {
  if (allowed === granted) return;
  granted = allowed;

  const { document } = browser;
  const installed = document.getElementById(SCRIPT_ID);
  browser.dataLayer ??= [];
  browser.gtag ??= function gtag() { browser.dataLayer.push(arguments); };

  if (!installed) browser.gtag('consent', 'default', DEFAULT_CONSENT);
  browser.gtag('consent', 'update', {
    ...DEFAULT_CONSENT,
    ad_storage: allowed ? 'granted' : 'denied',
    analytics_storage: allowed ? 'granted' : 'denied',
  });

  if (!allowed || installed) return;
  browser.gtag('js', new Date());
  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.async = true;
  script.referrerPolicy = 'no-referrer';
  script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-PWG3DN52';
  document.head.append(script);
}
