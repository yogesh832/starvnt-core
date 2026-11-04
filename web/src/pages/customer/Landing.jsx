import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import AuraMark from '../../components/AuraMark.jsx';
import Icon from '../../components/Icon.jsx';
import PublicNavbar from '../../components/PublicNavbar.jsx';
import PublicFooter from '../../components/PublicFooter.jsx';
import LandingAuraWidget from './LandingAuraWidget.jsx';
import './landing.css';
import { savePendingPrompt } from './pendingPrompt.js';

const EXPERIENCES = [
  { name: 'Weddings', eventType: 'Wedding', eyebrow: 'A celebration of your story', description: 'From intimate rituals to multi-day celebrations, shape an occasion that feels entirely yours.', icon: 'heart', image: '/images/customer-wedding-hero.jpg', position: 'center' },
  { name: 'Celebrations', eventType: 'Celebration', eyebrow: 'Gather beautifully', description: 'Birthdays, anniversaries and meaningful moments with the people who matter.', icon: 'party', image: '/images/customer-celebrations.webp', position: 'center 35%' },
  { name: 'Corporate events', eventType: 'Corporate event', eyebrow: 'Make an impression', description: 'Bring teams and audiences together with a considered, professional experience.', icon: 'events', image: '/images/customer-corporate.webp', position: 'center 35%' },
];

const JOURNEY = [
  { number: '01', title: 'Share your vision', description: 'Tell us the occasion, date, place and what matters most.' },
  { number: '02', title: 'Explore the possibilities', description: 'Find relevant services and understand the scope behind each option.' },
  { number: '03', title: 'Choose with clarity', description: 'Review written quotations and make an informed booking decision.' },
  { number: '04', title: 'Bring it to life', description: 'Follow preparation, booking details and event updates in one place.' },
];

const CUSTOMER_FEATURES = [
  { icon: 'aura', title: 'Plan with Aura+', description: 'Turn an idea into clear event requirements and useful next steps.' },
  { icon: 'services', title: 'Discover services', description: 'Explore event professionals and services for your event.' },
  { icon: 'quotes', title: 'Review quotations', description: 'Compare scope and pricing before you choose.' },
  { icon: 'bookings', title: 'Stay in control', description: 'Keep bookings, payment status and event updates together.' },
];

function LoginPopup({ text, onClose }) {
  const navigate = useNavigate();
  return <div className="fixed inset-0 z-50 grid place-items-center p-4" role="presentation">
    <button type="button" className="absolute inset-0 bg-navy/65 backdrop-blur-sm" onClick={onClose} aria-label="Close sign-in prompt" />
    <div role="dialog" aria-modal="true" aria-labelledby="landing-login-title" className="relative w-full max-w-md rounded-3xl border border-primary/15 bg-white/95 p-6 text-center text-navy shadow-[0_22px_80px_rgba(20,26,60,.26)] backdrop-blur-xl dark:border-sky-200/20 dark:bg-[#102342]/95 dark:text-white sm:p-8">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-primary/15 bg-primary-soft dark:border-sky-200/20 dark:bg-sky-300/10"><AuraMark size={34} /></div>
      <h2 id="landing-login-title" className="mt-5 text-xl font-extrabold text-navy dark:text-white">Your event starts here</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted dark:text-slate-300">
        {text ? <>Create a customer account or sign in to continue planning <span className="font-semibold text-navy dark:text-white">{text.length > 100 ? text.slice(0, 100) + '…' : text}</span>.</> : 'Create a customer account or sign in to start planning your event.'}
      </p>
      <button type="button" onClick={() => navigate('/signup?as=customer&next=/customer', { state: { intent: text || undefined, register: true } })} className="mt-6 w-full rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:brightness-110">Create a customer account</button>
      <button type="button" onClick={() => navigate('/login?as=customer&next=/customer', { state: { intent: text || undefined } })} className="mt-2 w-full rounded-xl border border-primary/20 bg-primary-soft/50 px-5 py-3 text-sm font-bold text-primary transition hover:bg-primary-soft dark:border-sky-200/25 dark:bg-white/5 dark:text-sky-100 dark:hover:bg-white/10">Sign in</button>
      <button type="button" onClick={onClose} className="mt-4 text-xs font-semibold text-muted hover:text-navy dark:text-slate-300 dark:hover:text-white">Continue exploring</button>
    </div>
  </div>;
}

export default function Landing() {
  const { user } = useExternalAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [popup, setPopup] = useState(null);
  const [eventType, setEventType] = useState('');
  const [city, setCity] = useState('');
  const [date, setDate] = useState('');
  const [auraOpen, setAuraOpen] = useState(false);

  useEffect(() => {
    if (location.hash === '#aura') setAuraOpen(true);
  }, [location.hash]);

  function beginPlan(text = '') {
    const ask = String(text).trim();
    if (user) {
      navigate(ask ? `/customer/aura?new=1&ask=${encodeURIComponent(ask)}` : '/customer/events/new');
      return;
    }
    savePendingPrompt(ask);
    setPopup(ask);
  }

  function startFromForm(event) {
    event.preventDefault();
    const parts = [eventType ? `Plan a ${eventType.toLowerCase()}` : 'Plan an event', city.trim() ? `in ${city.trim()}` : '', date ? `on ${date}` : ''];
    beginPlan(parts.filter(Boolean).join(' '));
  }

  return <div className="marketing-landing min-h-screen">
    <PublicNavbar activePage="landing" onPlanClick={() => document.getElementById('plan-event')?.scrollIntoView({ behavior: 'smooth' })} onAuraClick={() => setAuraOpen(true)} />

    <main>
      <section className="relative isolate overflow-hidden bg-navy-deep text-white" aria-labelledby="landing-title">
        <img src="/images/customer-wedding-hero.jpg" alt="Wedding setting with flowers, warm lights and a long table" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" fetchPriority="high" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#05142e]/95 via-[#0b2b53]/78 to-[#114675]/25" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#07152d]/85 via-transparent to-transparent" />
        <div className="mx-auto flex min-h-[590px] max-w-7xl flex-col justify-center px-5 py-20 sm:min-h-[660px] sm:px-8 lg:px-12">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/90 backdrop-blur-sm">The STARVNT experience</div>
          <h1 id="landing-title" className="mt-7 max-w-[760px] text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">Your story deserves a <span className="text-[#8edcff]">remarkable</span> stage.</h1>
          <p className="mt-6 max-w-xl text-sm leading-7 text-white/85 sm:text-base">From the first idea to the final moment, bring your celebration to life with thoughtful planning and the right event professionals.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a href="#plan-event" className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200/30 bg-gradient-to-r from-blue-600 to-sky-500 px-6 py-3.5 text-sm font-bold text-white shadow-[0_12px_32px_rgba(14,165,233,.3)] transition hover:brightness-110">Plan your event <Icon name="arrowRight" size={17} /></a>
            <a href="#experiences" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/50 bg-white/5 px-6 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/15">Explore experiences</a>
          </div>
          <div className="mt-16 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/30 pt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/75"><span>Weddings</span><span>Celebrations</span><span>Corporate experiences</span></div>
        </div>
      </section>

      <section id="experiences" className="scroll-mt-20 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">What we create</p><h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-navy dark:text-white sm:text-5xl">Experiences worth remembering.</h2></div>
            <p className="max-w-md text-sm leading-7 text-muted dark:text-slate-300">Every occasion has its own energy. Explore the people and services that can shape yours.</p>
          </div>
          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            {EXPERIENCES.map((item) => <article key={item.name} className="group relative flex min-h-[330px] flex-col justify-end overflow-hidden rounded-3xl bg-navy p-6 text-white shadow-lg sm:min-h-[370px] sm:p-8">
              <img src={item.image} alt="" loading="lazy" decoding="async" style={{ objectPosition: item.position }} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-navy-deep via-navy-deep/40 to-transparent" />
              <div className="relative z-10"><div className="mb-5 grid h-11 w-11 place-items-center rounded-2xl border border-white/30 bg-white/15 backdrop-blur-sm"><Icon name={item.icon} size={21} /></div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-200">{item.eyebrow}</p><h3 className="mt-2 text-2xl font-extrabold">{item.name}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-white/80">{item.description}</p><button type="button" onClick={() => {setEventType(item.eventType);document.getElementById('plan-event')?.scrollIntoView({ behavior: 'smooth' });}} className="mt-5 inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-sky-200 hover:text-white">Start planning <Icon name="arrowRight" size={15} /></button></div>
            </article>)}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 border-y border-gray-100 bg-white px-5 py-16 dark:border-white/10 dark:bg-[#161926] sm:px-8 sm:py-20 lg:px-12"><div className="mx-auto max-w-7xl"><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">The STARVNT journey</p><h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy dark:text-white sm:text-5xl">From a vision to a real event.</h2><div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{JOURNEY.map((step) => <div key={step.number} className="border-t-2 border-primary/40 pt-5"><span className="text-sm font-extrabold text-primary">{step.number}</span><h3 className="mt-5 text-lg font-bold text-navy dark:text-white">{step.title}</h3><p className="mt-2 text-sm leading-6 text-muted dark:text-slate-300">{step.description}</p></div>)}</div></div></section>

      <section className="px-5 py-16 sm:px-8 sm:py-20 lg:px-12"><div className="mx-auto max-w-7xl"><div className="max-w-3xl"><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">For your event</p><h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy dark:text-white sm:text-5xl">Beautiful ideas. Clear decisions.</h2><p className="mt-4 text-sm leading-7 text-muted dark:text-slate-300">The customer experience brings your planning details, professionals and booking journey together.</p></div><div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{CUSTOMER_FEATURES.map((feature) => <div key={feature.title} className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#161926]"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-primary"><Icon name={feature.icon} size={21} /></div><h3 className="mt-5 text-base font-bold text-navy dark:text-white">{feature.title}</h3><p className="mt-2 text-sm leading-6 text-muted dark:text-slate-300">{feature.description}</p></div>)}</div></div></section>

      <section id="plan-event" className="scroll-mt-20 px-5 py-16 sm:px-8 sm:py-20 lg:px-12"><div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[.95fr_1.05fr] lg:gap-16"><div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">Begin here</p><h2 className="mt-3 max-w-xl text-3xl font-extrabold tracking-tight text-navy dark:text-white sm:text-5xl">Tell us what you're imagining.</h2><p className="mt-5 max-w-lg text-sm leading-7 text-muted dark:text-slate-300">Start with a few details. Sign in or create a customer account to carry the idea into your planning workspace.</p><div className="mt-7 inline-flex items-center gap-3 rounded-2xl border border-primary/15 bg-white px-4 py-3 text-xs font-semibold text-muted dark:border-white/10 dark:bg-[#161926] dark:text-slate-300"><Icon name="lock" size={17} className="text-primary" /> Your event information stays in your account.</div></div><form onSubmit={startFromForm} className="rounded-3xl border border-primary/10 bg-white p-5 shadow-xl shadow-primary/5 dark:border-white/10 dark:bg-[#161926] sm:p-8"><h3 className="text-xl font-extrabold text-navy dark:text-white">Start planning your event</h3><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="block text-xs font-bold text-navy dark:text-white">Event type<select value={eventType} onChange={(event) => setEventType(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-ink outline-none focus:border-primary dark:border-white/20 dark:bg-[#20243a] dark:text-white"><option value="">Choose an occasion</option><option>Wedding</option><option>Celebration</option><option>Corporate event</option><option>Other event</option></select></label><label className="block text-xs font-bold text-navy dark:text-white">City or locality<input value={city} onChange={(event) => setCity(event.target.value)} placeholder="e.g. Kolkata" maxLength={80} className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-ink outline-none focus:border-primary dark:border-white/20 dark:bg-[#20243a] dark:text-white" /></label><label className="block text-xs font-bold text-navy dark:text-white sm:col-span-2">Event date <span className="font-normal text-muted">(if known)</span><input value={date} onChange={(event) => setDate(event.target.value)} type="date" className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-ink outline-none focus:border-primary dark:border-white/20 dark:bg-[#20243a] dark:text-white" /></label></div><button type="submit" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-white shadow-sm shadow-primary/25 transition hover:bg-primary-dark">Continue planning <Icon name="arrowRight" size={17} /></button><p className="mt-3 text-center text-xs text-muted dark:text-slate-400">No booking or payment is created at this step.</p></form></div></section>

      <section id="partners" className="scroll-mt-20 bg-gradient-to-br from-[#191743] to-navy-deep px-5 py-16 text-white sm:px-8 sm:py-20 lg:px-12"><div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-sky-200">For event professionals</p><h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">Beautiful work deserves the right opportunities.</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-white/70">Present your services and portfolio, respond to enquiries, create clear quotations and manage bookings through the STARVNT partner experience.</p></div><a href="https://vendor.starvnt.com/signup?as=vendor" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/35 bg-white/10 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/20">Become a partner <Icon name="arrowRight" size={17} /></a></div></section>
    </main>

    <PublicFooter showTrustStrip={false} marketing onAuraClick={() => setAuraOpen(true)} />
    <LandingAuraWidget open={auraOpen} onOpenChange={setAuraOpen} onAsk={beginPlan} />
    {popup !== null && <LoginPopup text={popup} onClose={() => setPopup(null)} />}
  </div>;
}
