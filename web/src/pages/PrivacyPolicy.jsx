import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LogoWord } from '../components/ui.jsx';

const sections = [
  ['scope', 'About this policy', [
    'This Privacy Policy explains how STARVNT handles personal information when you use our website, mobile application, customer and vendor portals, and Aura+ event-planning assistant. It applies to customers, vendors and visitors.',
    'For privacy questions or requests, contact support@starvnt.com. Please identify the account and the request, but do not send passwords, OTPs, full payment-card details or identity documents in your initial email.',
  ]],
  ['information', 'Information we collect', [
    'Account information: your name, email address, phone number, account role, profile information, authentication records and preferences. When you set a password, we store a password hash rather than the plain-text password.',
    'Event and business information: event dates, locations, guest counts, budgets, requirements, vendor services, prices, crew and equipment details, operating locations, coverage areas, availability and portfolios. We also store enquiries, messages, quotations, booking records, reviews and completion evidence you submit.',
    'Verification and payment information: identity or business documents and verification results, tax information, bank account details needed for vendor verification and settlement, and transaction amounts, references and statuses. Payment processors handle payment credentials entered in their checkout.',
    'Technical information: session identifiers, device and browser information, network information such as IP addresses, application logs, and notification tokens when you enable push notifications. Features involving your microphone, selected files or device location require the relevant device or browser permission.',
  ]],
  ['google', 'Sign in with Google', [
    'If you choose Google sign-in, we receive the Google account identifier and basic profile information made available for authentication, such as your name, email address, email-verification status and profile picture. We use this information to create or identify your STARVNT account, sign you in and help secure your account.',
    'Google sign-in does not give STARVNT access to your Gmail inbox, Google Drive files or contacts. Connecting any separate Google feature may involve an additional permission request. You can review and revoke connected-app access in your Google Account settings; revocation does not automatically delete your STARVNT account or records.',
  ]],
  ['use', 'How we use information', [
    'We use information to authenticate users, maintain profiles, plan events, match requirements with vendor services, deliver enquiries and messages, manage quotes and bookings, process payment and settlement records, verify vendors, and provide support.',
    'We also use relevant records to prevent fraud and misuse, investigate problems and disputes, maintain security, improve reliability and meet applicable legal obligations. Service notifications may include authentication codes, enquiry updates, booking changes and payment updates.',
  ]],
  ['aura', 'Aura+ text, voice and maps', [
    'Aura+ processes your messages and relevant saved account, event or business records to answer questions and assist with setup and planning. Conversations and related actions may be stored so you can continue them later. Avoid including information about other people unless you have permission to share it.',
    'AI providers, including Google Gemini where configured, may process the text and context needed to generate a response. When you use voice features, audio or transcripts may be processed by speech providers, including ElevenLabs where configured, for transcription or spoken replies. These providers process information under their own applicable terms and privacy policies.',
    'Map and place-search features may send your search terms or selected location to the map or geocoding provider. A location you choose and save can become part of your event or vendor operating-location record. You can decline microphone or location access and use text or enter an address manually.',
  ]],
  ['sharing', 'When information is shared', [
    'Customers and vendors receive information relevant to their interactions, such as an enquiry brief, event location, messages, quotes and booking details. Vendor profiles, service listings, published portfolios and published reviews may be visible to other users or visitors. Do not place private documents or bank details in public listings.',
    'We use providers for hosting, database storage, media uploads, email and SMS delivery, authentication, maps, AI and speech, payment processing and notifications. They receive information needed for the features they support. Examples include Google, ElevenLabs, Cloudinary, email-delivery providers and Razorpay where those services are enabled.',
    'Authorized STARVNT personnel may access relevant records for support, verification, security, dispute handling and operations. We may also disclose information where required by law, to protect users or legal rights, or as part of a business transfer subject to appropriate protections and applicable requirements.',
  ]],
  ['storage', 'Storage, retention and security', [
    'Information may be processed in the countries where STARVNT and its service providers operate. We use access controls and authentication measures to protect records, but no internet service can guarantee absolute security.',
    'We retain information as needed to provide the service and for legitimate operational and legal purposes. Retention depends on the record: transaction, tax, verification, fraud-prevention and dispute records may need to remain after an account closes. Backup copies may persist until they are replaced or expire.',
  ]],
  ['cookies', 'Cookies and device storage', [
    'We use cookies and browser or app storage to maintain sessions, protect authentication and remember preferences such as theme. Signing out ends your session but may leave non-account preferences on the device. Clearing storage or blocking necessary cookies can affect sign-in and other features.',
  ]],
  ['choices', 'Your choices and privacy requests', [
    'You can update available profile and event details in your account, manage device permissions and notification settings, and revoke Google access through your Google Account. Turning off push notifications does not prevent essential service emails or messages within the application.',
    'To request access, correction, a copy of your information, account deletion, or withdrawal of consent where applicable, email support@starvnt.com from your registered address. We may need to verify your identity before acting. We will explain any records that must be retained and any limits that apply under applicable law. Withdrawing permission may prevent us from providing the related feature.',
  ]],
  ['children', 'Children and third-party services', [
    'STARVNT accounts and commercial booking features are intended for adults. If you believe a child has provided personal information without appropriate authorization, contact us so we can investigate. Share only the minimum guest information necessary for an event.',
    'Links and integrations may take you to independent providers. Their handling of information is governed by their own privacy policies. Review those policies before sharing information with them.',
  ]],
  ['changes', 'Changes and contact', [
    'We may update this policy as our features or data practices change. The date below identifies the current version. Where required, we will provide additional notice or request consent for material changes.',
    'For privacy concerns, account deletion requests or questions about this policy, contact STARVNT at support@starvnt.com.',
  ]],
];

export default function PrivacyPolicy() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Privacy Policy | STARVNT';
    window.scrollTo(0, 0);
    return () => { document.title = previous; };
  }, []);

  return (
    <div className="min-h-screen bg-[#faf9fe] text-[#10162b] dark:bg-[#0b1020] dark:text-gray-100">
      <header className="border-b border-violet-100 bg-white/90 dark:border-gray-800 dark:bg-[#111729]/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link to="/" aria-label="STARVNT home"><LogoWord /></Link>
          <Link to="/" className="rounded-full border border-violet-200 px-4 py-2 text-sm font-semibold text-primary dark:border-violet-700 dark:text-violet-300">Back to home</Link>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-16">
        <div className="mb-10 rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-100 via-white to-indigo-50 p-6 sm:p-10 dark:border-violet-800 dark:from-violet-950 dark:via-[#151b30] dark:to-indigo-950">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-primary dark:text-violet-300">Trust & privacy</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Privacy Policy</h1>
          <p className="mt-4 max-w-2xl leading-relaxed text-slate-600 dark:text-slate-300">How we handle your information as you plan, connect and celebrate with STARVNT.</p>
          <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">Effective and last updated: 24 October 2026</p>
        </div>
        <div className="grid items-start gap-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-12">
          <nav aria-label="Privacy policy contents" className="rounded-2xl border border-violet-100 bg-white p-5 dark:border-gray-800 dark:bg-[#111729]">
            <p className="mb-3 text-sm font-bold">On this page</p>
            <ol className="space-y-3 text-sm">
              {sections.map(([id, title], index) => <li key={id}><a href={`#${id}`} className="text-slate-600 transition hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary dark:text-slate-300 dark:hover:text-violet-300">{index + 1}. {title}</a></li>)}
            </ol>
          </nav>
          <article className="min-w-0 space-y-9">
            {sections.map(([id, title, paragraphs], index) => (
              <section id={id} key={id} aria-labelledby={`${id}-heading`} className="scroll-mt-6">
                <h2 id={`${id}-heading`} className="mb-3 text-xl font-bold">{index + 1}. {title}</h2>
                <div className="space-y-3 text-[15px] leading-7 text-slate-600 dark:text-slate-300">{paragraphs.map(text => <p key={text}>{text}</p>)}</div>
              </section>
            ))}
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-6 dark:border-violet-800 dark:bg-violet-950/40">
              <h2 className="font-bold">Have a privacy request?</h2>
              <a href="mailto:support@starvnt.com" className="mt-2 inline-block break-all font-semibold text-primary underline underline-offset-4 dark:text-violet-300">support@starvnt.com</a>
            </div>
          </article>
        </div>
      </main>
      <footer className="border-t border-violet-100 px-5 py-6 text-center text-sm text-slate-500 dark:border-gray-800 dark:text-slate-400">© {new Date().getFullYear()} STARVNT · Events. Simplified.</footer>
    </div>
  );
}
