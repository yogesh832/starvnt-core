import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import { SUPPORT_CONTACT } from '../../config/support.js';
import venue768 from '../../assets/images/partner-venue-768.webp';
import venue1536 from '../../assets/images/partner-venue-1536.webp';
import hero768 from '../../assets/images/partner-hero-768.webp';
import hero1536 from '../../assets/images/partner-hero-1536.webp';
import testimonialAvatar from '../../assets/images/partner-testimonial-avatar.webp';
import { LogoWord } from '../../components/ui.jsx';
import './partnerLanding.css';
import './partnerTheme.css';

const SIGNUP = '/signup?as=vendor&next=%2Fvendor';
const LOGIN = '/login?as=vendor&next=%2Fvendor';

const ICONS = {
  arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 6-6 4 4 3-3 5 5" /></>,
  message: <><path d="M21 11a8 8 0 0 1-8 8H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path d="M7.5 10h.01M12 10h.01M16.5 10h.01" /></>,
  sparkle: <path d="M12 2c1.4 6.7 3.3 8.6 10 10-6.7 1.4-8.6 3.3-10 10C10.6 15.3 8.7 13.4 2 12 8.7 10.6 10.6 8.7 12 2Z" />,
  academy: <><path d="m2 8 10-5 10 5-10 5L2 8Zm4 2v8c4 3 8 3 12 0v-8M22 8v9" /></>,
  growth: <><path d="M3 21h4V11H3v10Zm7 0h4V7h-4v14Zm7 0h4V3h-4v18ZM3 7l7-4 5 1 6-3" /></>,
  user: <><circle cx="10" cy="7" r="4" /><path d="M2 22v-3a7 7 0 0 1 14 0v3H2ZM20 8v8m-4-4h8" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  shield: <><path d="M12 2 3 6v6c0 5 5 8 9 10 4-2 9-5 9-10V6l-9-4Z" /><path d="m8 12 3 3 5-6" /></>,
  check: <><circle cx="12" cy="12" r="10" /><path d="m7 12 3 3 7-7" /></>,
  crown: <><path d="m2 6 5 5 5-8 5 8 5-5-3 14H5L2 6ZM5 20h14" /></>,
  rocket: <><path d="M14 4c3-2 6-2 7-1 1 3-2 9-7 12l-5-5c1-2 3-4 5-6Zm-4 5-5 1-3 5 7-1m6 0-1 5-5 3 1-7" /><circle cx="16" cy="7" r="1.5" /><path d="m6 17-3 4 4-2" /></>,
  star: <path d="m12 2 3.1 6.3 7 .9-5.1 5 .9 7-5.9-3.3L6.1 21l.9-6.8-5.1-5 7-.9L12 2Z" />,
  coins: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v5c0 4 16 4 16 0V5M4 10v5c0 4 16 4 16 0v-5M4 15v4c0 4 16 4 16 0v-4" /></>,
  support: <><path d="M3 14v-3a9 9 0 0 1 18 0v7a4 4 0 0 1-4 4h-3M3 11H1v7h5v-7H3Zm18 0h2v7h-5v-7h3Z" /></>,
  camera: <><path d="M8 5 10 2h4l2 3h5v16H3V5h5Z" /><circle cx="12" cy="12" r="4" /></>,
  flower: <><path d="M12 11c-8-10-13 0-4 3-8 5 0 12 4 4 4 8 12 1 4-4 9-3 4-13-4-3ZM12 11c-6-5 0-12 3-7 2 3-1 5-3 7Z" /><circle cx="12" cy="14" r="2" /></>,
  catering: <><path d="M2 19h20M4 16a8 8 0 0 1 16 0H4ZM12 6V3m-2 0h4" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 2v6M16 2v6m-9 7h3m4 0h3" /></>,
  venue: <><path d="m2 11 10-9 10 9M5 8v14h5v-8h4v8h5V8" /></>,
  makeup: <><path d="m14 3 4 2-6 11-4-2 6-11ZM8 14l-3 4c-1 3 1 5 3 3l4-5" /></>,
  music: <><path d="M9 18V5l12-3v13M9 8l12-3" /><ellipse cx="5" cy="18" rx="4" ry="3" /><ellipse cx="17" cy="15" rx="4" ry="3" /></>,
  production: <><rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="15" r="4" /><circle cx="12" cy="6" r="1.5" /></>,
  people: <><circle cx="12" cy="6" r="3" /><path d="M6 21v-3a6 6 0 0 1 12 0v3H6ZM3 6a3 3 0 0 0 0 6m18-6a3 3 0 0 1 0 6M2 21v-3a5 5 0 0 1 3-4m17 7v-3a5 5 0 0 0-3-4" /></>,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  close: <path d="m5 5 14 14M19 5 5 19" />,
};

function Icon({ name, className = '', ...props }) {
  return <svg className={`partner-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{ICONS[name] || ICONS.sparkle}</svg>;
}

function Brand({ footer = false }) {
  return <Link to="/" className="partner-brand" aria-label="STARVNT Partner Platform home">
    <LogoWord light sub={footer ? 'Events. Simplified.' : 'Partner Platform'} markSize={36} size="text-xl" />
  </Link>;
}

function BusinessPreview() {
  return <aside className="partner-business-preview" aria-label="Illustrative workspace with example data"><div><Icon name="sparkle" /><strong>Your Business on STARVNT</strong></div><span className="partner-preview-caption">Workspace preview · example data</span>{[['message','New enquiry','12'],['image','Quotation sent','8'],['calendar','Booking confirmed','4']].map(([icon,label,count])=><div className="partner-business-preview-row" key={label}><Icon name={icon}/><span>{label}</span><b>{count}</b><Icon name="chevron"/></div>)}</aside>;
}

function WorkspacePreview() {
  return <div className="partner-device-scene" aria-label="Illustrative STARVNT workspace on laptop and phone, with example data">
    <div className="partner-laptop"><div className="partner-laptop-display"><aside><Brand/><ul>{['Dashboard','Enquiries','Quotes','Bookings','Services','Portfolio','Analytics'].map((label,i)=><li key={label} data-selected={i===0}><Icon name={['grid','message','image','calendar','grid','image','growth'][i]}/>{label}</li>)}</ul></aside><div className="partner-demo-dashboard"><span className="partner-demo-eyebrow">WORKSPACE PREVIEW · EXAMPLE DATA</span><h3>My Business</h3><div className="partner-demo-metrics">{[['12','New enquiries'],['8','Quotes sent'],['4','Bookings confirmed']].map(([n,label])=><div key={label}><strong>{n}</strong><span>{label}</span></div>)}</div><div className="partner-demo-chart"><strong>Enquiries trend</strong><svg viewBox="0 0 400 120" role="img" aria-label="Illustrative upward enquiries trend"><path d="M0 25H400M0 65H400M0 105H400" stroke="currentColor" opacity=".12"/><path d="M4 103 60 90 110 94 160 66 210 75 270 45 325 35 395 12" fill="none" stroke="#b49bdc" strokeWidth="3"/>{[[4,103],[60,90],[110,94],[160,66],[210,75],[270,45],[325,35],[395,12]].map(([cx,cy])=><circle key={cx} cx={cx} cy={cy} r="4" fill="#c8b5e9"/>)}</svg></div><div className="partner-demo-enquiries"><strong>Recent enquiries</strong><div><span>Client</span><span>Event type</span><span>Status</span></div><div><span>Example client</span><span>Wedding</span><span>New</span></div></div></div></div><div className="partner-laptop-base"/></div>
    <div className="partner-demo-phone"><Brand/><h3>My Business</h3>{[['message','Enquiries'],['image','Quotes'],['calendar','Bookings'],['growth','Analytics']].map(([icon,label])=><div key={label}><Icon name={icon}/><span>{label}</span><span>›</span></div>)}<small>Workspace preview</small></div>
  </div>;
}

const NAV = [
  ['Benefits', '#benefits'], ['How It Works', '#how-it-works'], ['Workspace', '#workspace'],
  ['Founding Program', '#founding-program'], ['Success Stories', '#success-stories'], ['FAQs', '#faqs'],
];

const BENEFITS = [
  ['image', 'Digital Showcase', 'Present your services, packages and portfolio professionally.'],
  ['message', 'Enquiry & Quotation Tools', 'Receive enquiries, create quotations and manage client responses in one place.'],
  ['sparkle', 'AURA+ Assistance', 'Get smart suggestions for pricing, packages and business growth.'],
  ['academy', 'Partner Academy', 'Learn, upgrade your skills and stay ahead in the event industry.'],
  ['growth', 'Growth & Visibility', 'Get discovered by customers actively planning events.'],
];

const STEPS = [
  ['user', 'Create Account', 'Sign up with your business details.'],
  ['grid', 'Build Your Profile', 'Add services, packages, photos and portfolio.'],
  ['shield', 'Verification (KYC)', 'Complete business and identity verification.'],
  ['check', 'Get Activated', 'Become a verified partner and get eligible for enquiries.'],
  ['growth', 'Manage & Grow', 'Receive enquiries, send quotations, manage bookings and grow your business.'],
];

const CATEGORIES = [
  ['camera', 'Photographers'], ['flower', 'Decorators'], ['catering', 'Caterers'], ['calendar', 'Event Planners'],
  ['venue', 'Venues'], ['makeup', 'Makeup Artists'], ['music', 'Entertainment'], ['production', 'Production'],
];

const FAQS = [
  ['Who can join STARVNT as a partner?', 'Photographers, decorators, caterers, event planners, venues, makeup artists, entertainers and other event professionals can apply. Create your account and add your business details to get started.'],
  ['How does the verification process work?', 'Complete your business profile and submit the identity and business information requested during onboarding. Your verification and activation status will be shown in your workspace. Enquiry eligibility also depends on your services, coverage and availability.'],
  ['Is there any registration or listing fee?', 'Applicable fees and any Founding Partner benefits are subject to the current program terms. Review the terms shown before accepting a paid plan or service. Contact STARVNT for the current offer details.'],
  ['Will I get guaranteed enquiries?', 'No. Enquiries and bookings are not guaranteed. Opportunities depend on customer demand, location, service fit, availability and partner eligibility.'],
];

export default function PartnerLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useExternalAuth();
  const isPartner = user?.accountType === 'VENDOR';
  const joinUrl = isPartner ? '/vendor' : SIGNUP;
  const loginUrl = isPartner ? '/vendor' : LOGIN;
  const supportEmail = SUPPORT_CONTACT.email || 'support@starvnt.com';

  return <div className="partner-landing">
    <a className="partner-skip-link" href="#partner-main">Skip to content</a>
    <header className="partner-header">
      <div className="partner-container partner-header-inner">
        <Brand />
        <nav className={`partner-navigation ${menuOpen ? 'is-open' : ''}`} id="partner-navigation" aria-label="Main navigation">
          {NAV.map(([label, href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
          <Link className="partner-mobile-login" to={loginUrl} onClick={() => setMenuOpen(false)}>{isPartner ? 'My Workspace' : 'Partner Login'}</Link>
        </nav>
        <div className="partner-header-actions">
          <Link className="partner-button partner-button-outline partner-login" to={loginUrl}>{isPartner ? 'My Workspace' : 'Partner Login'}</Link>
          <Link className="partner-button partner-button-gold partner-header-join" to={joinUrl}>{isPartner ? 'Open Workspace' : 'Join as a Partner'}</Link>
          <button className="partner-menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="partner-navigation" onClick={() => setMenuOpen(open => !open)}><Icon name={menuOpen ? 'close' : 'menu'} /></button>
        </div>
      </div>
    </header>

    <main id="partner-main">
      <section className="partner-hero" aria-labelledby="partner-hero-title">
        <div className="partner-hero-visual"><img className="partner-hero-photo" src={hero1536} srcSet={`${hero768} 768w, ${hero1536} 1536w`} sizes="(max-width:640px) 100vw, 57vw" width="1536" height="1024" fetchPriority="high" decoding="async" alt="Photographer and event planner reviewing a camera at a floral event venue"/><BusinessPreview/></div>
        <div className="partner-container partner-hero-inner">
          <div className="partner-hero-copy">
            <p className="partner-eyebrow">For event professionals <span /></p>
            <h1 id="partner-hero-title">Your Event Business<br />Deserves More Than<br /><span>a Listing.</span></h1>
            <p className="partner-hero-description">Build your digital presence, manage client enquiries, send quotations, track bookings and grow your event business with STARVNT.</p>
            <div className="partner-hero-actions">
              <Link className="partner-button partner-button-gold" to={joinUrl}>{isPartner ? 'Open Your Workspace' : 'Join as a Founding Partner'}<Icon name="arrow" /></Link>
              <a className="partner-button partner-button-outline" href="#how-it-works">See How It Works</a>
            </div>
            <ul className="partner-hero-promises" aria-label="Partner benefits">
              {['Verified Leads', 'Business Workspace', 'Growth Support'].map(text => <li key={text}><Icon name="check" />{text}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="partner-benefits" id="benefits" aria-labelledby="partner-benefits-title">
        <div className="partner-container">
          <div className="partner-section-heading"><h2 id="partner-benefits-title">Why Partner with STARVNT?</h2><p>A complete business platform designed for event professionals.</p></div>
          <div className="partner-benefit-grid">
            {BENEFITS.map(([icon, title, description]) => <article className="partner-benefit-card" key={title}>
              <div className="partner-benefit-title"><Icon name={icon} /><h3>{title}</h3></div><p>{description}</p>
            </article>)}
          </div>
        </div>
      </section>

      <section className="partner-workspace" id="workspace" aria-labelledby="partner-workspace-title">
        <div className="partner-container partner-workspace-inner">
          <div className="partner-workspace-copy">
            <h2 id="partner-workspace-title">Your Partner Workspace</h2>
            <p>Manage your event business, from enquiries<br className="partner-desktop-break" /> to confirmed bookings.</p>
            <ul>{['Real-time enquiries and lead details', 'Create and share professional quotations', 'Booking and event management', 'Performance insights and business growth'].map(text => <li key={text}><span className="partner-check-dot"><Icon name="check" /></span>{text}</li>)}</ul>
          </div>
          <div className="partner-workspace-visual"><WorkspacePreview/></div>
        </div>
      </section>

      <section className="partner-process" id="how-it-works" aria-labelledby="partner-process-title">
        <div className="partner-container">
          <div className="partner-section-heading"><h2 id="partner-process-title">How It Works</h2><p>A simple and transparent process to get started.</p></div>
          <ol className="partner-steps">
            {STEPS.map(([icon, title, description], index) => <li className="partner-step" key={title}>
              <div className="partner-step-top"><Icon name={icon} />{index < STEPS.length - 1 && <Icon name="arrow" className="partner-step-arrow" />}</div>
              <div className="partner-step-content"><span className="partner-step-number">0{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div></div>
            </li>)}
          </ol>
        </div>
      </section>

      <section className="partner-founding" id="founding-program" aria-labelledby="partner-founding-title">
        <div className="partner-founding-visual"><img src={venue1536} srcSet={`${venue768} 768w, ${venue1536} 1536w`} sizes="(max-width:640px) 100vw, 48vw" alt="Floral wedding reception canopy with warm chandelier lighting and elegantly arranged tables" width="1536" height="768" loading="lazy" decoding="async"/></div>
        <div className="partner-container partner-founding-inner">
          <div className="partner-founding-copy">
            <h2 id="partner-founding-title"><Icon name="crown" />Founding Partner Program</h2>
            <p>Be part of STARVNT’s launch community and<br className="partner-desktop-break" /> get exclusive, early access benefits.</p>
            <div className="partner-aura-offer"><strong>Partner plans are coming. Get six months of Aura+ free.</strong><span>Activate with <b>AURA6MONTHS</b> in your workspace. Your six months start on activation, with no card or automatic paid renewal.</span></div>
            <ul className="partner-founding-perks">
              {[['rocket', <>Early Access<br />to New Features</>], ['star', <>Higher Visibility<br />in Your Category</>], ['coins', <>Platform Fee<br />Benefits*</>], ['support', <>Priority<br />Support</>]].map(([icon, label]) => <li key={icon}><Icon name={icon} /><span>{label}</span></li>)}
            </ul>
            <div className="partner-founding-action"><Link to={joinUrl} className="partner-button partner-button-gold">{isPartner ? 'Open Your Workspace' : 'Join as a Founding Partner'}<Icon name="arrow" /></Link><small>* Benefits are for a limited period and subject to program terms.</small><Link to="/vendor/partner-program" className="partner-button partner-button-gold">Get 6 months of Aura+ free<Icon name="arrow" /></Link><small>Partner subscription plans are planned. Use AURA6MONTHS for six free months of Aura+. No card or automatic paid renewal.</small></div>
          </div>
        </div>
      </section>

      <section className="partner-community" aria-labelledby="partner-categories-title">
        <div className="partner-container">
          <div className="partner-section-heading partner-section-heading-accent"><h2 id="partner-categories-title">Built for Every Event Professional</h2></div>
          <ul className="partner-category-list">{CATEGORIES.map(([icon, label]) => <li key={label}><Icon name={icon} /><span>{label}</span></li>)}</ul>
          <div className="partner-trust-row" id="success-stories">
            <figure className="partner-testimonial">
              <span className="partner-quote-mark" aria-hidden="true">“</span>
              <blockquote>“STARVNT has given our business a professional platform, quality enquiries and a much better way to manage bookings.”</blockquote>
              <figcaption><img src={testimonialAvatar} alt="Arjun Dutta" width="33" height="33" loading="lazy" decoding="async"/><div><strong>Arjun Dutta</strong><span>Event Decorator, Kolkata</span></div><span className="partner-stars" aria-label="5 out of 5 stars">★★★★★</span></figcaption>
            </figure>
            <div className="partner-trust-benefits">
              {[['shield', 'Verified & Trusted', 'A curated network of verified event professionals.'], ['people', 'Relevant Opportunities', 'Enquiries from genuine event requirements.'], ['support', 'Dedicated Support', 'A partner success team to help you grow.']].map(([icon, title, text]) => <article key={title}><Icon name={icon} /><h3>{title}</h3><p>{text}</p></article>)}
            </div>
          </div>
        </div>
      </section>

      <section className="partner-faq" id="faqs" aria-labelledby="partner-faq-title">
        <div className="partner-container">
          <div className="partner-section-heading"><h2 id="partner-faq-title">Frequently Asked Questions</h2></div>
          <div className="partner-faq-grid">{FAQS.map(([question, answer]) => <details key={question}><summary>{question}<Icon name="chevron" /></summary><p>{answer}</p></details>)}</div>
        </div>
      </section>
    </main>

    <footer className="partner-footer"><div className="partner-container partner-footer-inner">
      <Brand footer />
      <div className="partner-footer-platform"><h2>Partner Platform</h2><nav aria-label="Partner platform links"><a href="#benefits">Benefits</a><a href="#how-it-works">How It Works</a><a href="#founding-program">Founding Program</a><a href="#faqs">FAQs</a></nav></div>
      <nav className="partner-footer-legal" aria-label="Legal and support links"><Link to="/terms?for=vendor">Terms</Link><Link to="/privacy?for=vendor">Privacy</Link><a href={`mailto:${supportEmail}`}>Support</a></nav>
      <Link className="partner-button partner-button-outline partner-footer-login" to={loginUrl}>{isPartner ? 'My Workspace' : 'Partner Login'}</Link>
    </div></footer>
  </div>;
}
