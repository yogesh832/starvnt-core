import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogoWord } from '../components/ui.jsx';
import { portalLoginUrl, portalSignupUrl } from '../lib/portalAccess.js';

const primary = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-[#2878FF] px-5 py-3 font-bold text-[#080B12] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white';
const secondary = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-500 px-5 py-3 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white';
const panels = [
  ['Business identity', 'Showcase the services you provide, the areas you cover and your portfolio.'],
  ['Enquiries and quotes', 'Review customer requirements and prepare a quote with scope, pricing and validity.'],
  ['Bookings and payments', 'See booking milestones and follow payment status from STARVNT Core.'],
  ['Learning and community', 'Explore sample Academy and meeting views in the product demo.'],
  ['Social sharing', 'Choose which social links appear on your public profile and share an eligible profile link.'],
  ['Recognition', 'Explore how achievements could appear in the sample dashboard.'],
];
const modules = [
  { name: 'Dashboard', headline: 'Cedar & Light Studio', rows: [['Pending enquiries', '2'], ['Open quotes', '1'], ['Confirmed bookings', '1']] },
  { name: 'Business Profile', headline: 'Cedar & Light Studio', rows: [['Category', 'Photography'], ['Service area', 'Kolkata'], ['Verification', 'Verified in this sample']] },
  { name: 'Portfolio', headline: 'Recent work', rows: [['Garden reception', 'Photo project'], ['Studio portraits', 'Photo project']] },
  { name: 'Enquiries', headline: 'Review incoming requests', rows: [['Garden reception', 'Needs a reply'], ['Portrait session', 'New request']] },
  { name: 'Quotes', headline: 'Garden reception quote', rows: [['Coverage', 'Six hours'], ['Total', '₹24,000'], ['Status', 'Awaiting customer review']] },
  { name: 'Bookings', headline: 'Sample booking timeline', rows: [['Portrait session', 'Confirmed'], ['Garden reception', 'Quote pending']] },
  { name: 'Payments', headline: 'Recorded payment status', rows: [['Portrait session payment', 'Verified'], ['Settlement', 'Pending review']] },
  { name: 'Reviews', headline: 'Customer feedback', rows: [['Verified reviews', '0'], ['Rating', 'No verified reviews yet']] },
  { name: 'Analytics', headline: 'Sample performance', rows: [['Enquiries', '2'], ['Quotes sent', '1'], ['Confirmed bookings', '1']] },
  { name: 'Academy', headline: 'Continue watching', rows: [['Write a clearer quote', '40% complete'], ['Organize your portfolio', 'Ready to start']] },
  { name: 'Social Links', headline: 'Business channels', rows: [['Instagram', 'Public in this sample'], ['YouTube', 'Hidden in this sample']] },
  { name: 'Share Center', headline: 'Preview a profile', rows: [['Resource', 'Public business profile'], ['Available actions', 'Link and QR preview']] },
  { name: 'Subscription', headline: 'Sample commercial status', rows: [['Entitlement', 'Free active in this sample'], ['Renewal', 'Manual'], ['Payment', 'No payment due']] },
];

function partnerDestination(signup = false) {
  const url = new URL(signup ? portalSignupUrl('VENDOR') : portalLoginUrl('VENDOR'));
  url.searchParams.set('next', '/vendor/dashboard');
  return url.href;
}

function Frame({ children }) {
  return <main className="min-h-screen bg-[#080B12] px-4 py-6 text-[#F5F7FA] sm:px-8">
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 pb-5">
        <Link to="/partners" className="inline-flex rounded-lg bg-white px-3 py-2 text-[#080B12]"><LogoWord /></Link>
        <nav aria-label="Partnership" className="flex flex-wrap items-center gap-4 text-sm font-semibold">
          <Link to="/partners" className="hover:underline">Partnership</Link>
          <Link to="/partners/demo" className="hover:underline">Product demo</Link>
          <a href={partnerDestination()} className="hover:underline">Partner login</a>
        </nav>
      </header>
      {children}
      <footer className="mt-12 flex flex-wrap gap-4 border-t border-slate-700 py-6 text-sm text-slate-300">
        <Link to="/privacy?for=vendor" className="hover:underline">Privacy Policy</Link>
        <Link to="/terms?for=vendor" className="hover:underline">Vendor Terms</Link>
      </footer>
    </div>
  </main>;
}

export function PartnershipPage() {
  return <Frame>
    <section className="max-w-3xl py-12 sm:py-20">
      <p className="font-semibold text-blue-300">STARVNT Partner OS</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Your business deserves more than just leads</h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">Build your business profile and manage event enquiries, quotes and bookings in one workspace.</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <a href={partnerDestination(true)} className={primary}>Become a STARVNT Partner</a>
        <Link to="/partners/demo" className={secondary}>Explore Vendor OS</Link>
      </div>
    </section>
    <section aria-labelledby="tools-heading" className="rounded-3xl bg-[#101A2C] p-5 sm:p-8">
      <h2 id="tools-heading" className="text-2xl font-bold">A workspace for event professionals</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {panels.map(([title, copy]) => <article key={title} className="rounded-2xl border border-slate-600 p-4">
          <h3 className="font-bold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-300">{copy}</p>
        </article>)}
      </div>
    </section>
    <section aria-labelledby="join-heading" className="mt-10">
      <h2 id="join-heading" className="text-2xl font-bold">How to join</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {['Create an account and verify your contact details.', 'Add business details, services, locations and your portfolio.', 'Submit applicable business documents for review and follow your saved progress.'].map((text, index) =>
          <li key={text} className="rounded-2xl border border-slate-700 p-4"><span className="font-bold text-blue-300">Step {index + 1}</span><p className="mt-2 text-slate-300">{text}</p></li>)}
      </ol>
    </section>
    <section aria-labelledby="faq-heading" className="mt-10 space-y-3">
      <h2 id="faq-heading" className="text-2xl font-bold">Frequently asked questions</h2>
      <details className="rounded-xl border border-slate-700 p-4">
        <summary className="cursor-pointer font-semibold">Can I explore without signing up?</summary>
        <p className="mt-3 text-slate-300">Yes. The interactive demo shows sample records and can be explored without an account.</p>
      </details>
      <details className="rounded-xl border border-slate-700 p-4">
        <summary className="cursor-pointer font-semibold">What can I expect after joining?</summary>
        <p className="mt-3 text-slate-300">Partner OS gives you tools to present and manage your business. Enquiries and bookings depend on customer demand, fit and availability.</p>
      </details>
      <details className="rounded-xl border border-slate-700 p-4">
        <summary className="cursor-pointer font-semibold">Where will subscription terms appear?</summary>
        <p className="mt-3 text-slate-300">When a plan is available, you can review its price, billing terms and eligibility before choosing it.</p>
      </details>
      <a href={partnerDestination(true)} className={primary}>Become a STARVNT Partner</a>
    </section>
  </Frame>;
}

export function PartnershipDemo() {
  const [selected, setSelected] = useState(0);
  const [visited, setVisited] = useState([0]);
  const current = modules[selected];
  function choose(index) {
    setSelected(index);
    setVisited(previous => previous.includes(index) ? previous : [...previous, index]);
  }
  return <Frame>
    <section className="py-8">
      <h1 className="text-3xl font-black sm:text-4xl">Interactive Product Demonstration — Sample Data</h1>
      <p className="mt-3 text-slate-300">Choose a module to explore the sample workspace.</p>
    </section>
    <div className="grid gap-5 lg:grid-cols-[15rem_1fr]">
      <div>
        <div className="lg:hidden">
          <label htmlFor="partner-demo-module" className="block text-sm">Demo module</label>
          <select id="partner-demo-module" className="mt-2 min-h-11 w-full rounded-xl border border-slate-600 bg-[#101A2C] px-3"
            value={selected} onChange={event => choose(Number(event.target.value))}>
            {modules.map((module, index) => <option key={module.name} value={index}>{module.name}</option>)}
          </select>
        </div>
        <nav aria-label="Demo modules" className="hidden space-y-1 lg:block">
          {modules.map((module, index) => <button key={module.name} type="button" aria-pressed={selected === index}
            onClick={() => choose(index)} className="block min-h-11 w-full rounded-lg px-3 text-left text-sm hover:bg-[#101A2C] aria-pressed:bg-[#101A2C] aria-pressed:font-bold">
            {module.name}
          </button>)}
        </nav>
      </div>
      <section aria-labelledby="demo-module" className="min-w-0 rounded-3xl bg-[#101A2C] p-5 sm:p-8">
        <p className="text-sm font-bold text-blue-300">{current.name} · Sample</p>
        <h2 id="demo-module" className="mt-2 text-2xl font-bold">{current.headline}</h2>
        <dl className="mt-5 divide-y divide-slate-600">
          {current.rows.map(([label, value]) => <div key={label} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
            <dt className="text-slate-300">{label}</dt><dd className="font-bold">{value}</dd>
          </div>)}
        </dl>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" className={secondary} onClick={() => choose((selected + 1) % modules.length)}>Next module</button>
          <button type="button" className="min-h-11 px-2 underline" onClick={() => { setSelected(0); setVisited([0]); }}>Reset demo</button>
          <span role="status" className="text-sm text-slate-300">{visited.length} of {modules.length} explored</span>
        </div>
      </section>
    </div>
  </Frame>;
}
