import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import { LogoMark, LogoWord } from '../../components/ui.jsx';
import PublicNavbar from '../../components/PublicNavbar.jsx';
import PublicFooter from '../../components/PublicFooter.jsx';

const SUGGESTIONS = [
  "My daughter's wedding",
  'Plan my birthday',
  'Corporate event for 300 people',
  'Arrange a Puja',
  'Plan an anniversary',
];

/** Popup shown when a guest tries to use the planner without an account. */
function LoginPopup({ text, onClose }) {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl shadow-primary/20 w-full max-w-sm p-6 text-center animate-[pop_.18s_ease-out]">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-primary-soft text-primary grid place-items-center">
          <LogoMark size={26} />
        </div>
        <h2 className="mt-4 text-lg font-extrabold text-navy">Log in to start planning</h2>
        <p className="mt-2 text-xs text-muted leading-relaxed">
          {text ? (
            <>
              Aura+ is ready to plan <b className="text-ink">"{text.length > 60 ? text.slice(0, 60) + '…' : text}"</b>.
              Log in (or create a free account) and we'll pick up right from here.
            </>
          ) : (
            'Log in — or create a free account — and Aura+ will start planning with you.'
          )}
        </p>
        <button
          onClick={() => navigate('/login', { state: { intent: text || undefined } })}
          className="mt-5 w-full rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-bold py-3 transition shadow-md shadow-primary/25"
        >
          Log in
        </button>
        <button
          onClick={() => navigate('/login', { state: { intent: text || undefined, register: true } })}
          className="mt-2 w-full rounded-xl border border-primary/30 text-primary text-sm font-bold py-3 hover:bg-primary-soft transition"
        >
          Create a free account
        </button>
        <button onClick={onClose} className="mt-3 text-xs text-muted hover:text-ink">
          Maybe later
        </button>
      </div>
    </div>
  );
}

/**
 * Screen 1: Public Landing Page matching Reference Screen Set 2
 */
export default function Landing() {
  const { user } = useExternalAuth();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [popup, setPopup] = useState(null);

  function beginPlan(text) {
    if (user) {
      navigate(user.accountType === 'VENDOR' ? '/vendor' : '/customer');
      return;
    }
    setPopup(text || '');
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#efeaff] via-lavender to-white flex flex-col justify-between">
      {/* Reusable Brand Header */}
      <PublicNavbar onPlanClick={beginPlan} activePage="landing" />

      {/* Main Split Hero */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 sm:px-12 py-8 sm:py-12 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
        {/* Left Column: Heading + Interactive AI Input */}
        <div>
          <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-wide text-primary bg-white/90 rounded-full px-3.5 py-1.5 shadow-2xs border border-primary/10">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            <span>Events made simple with AI</span>
          </span>

          <h1 className="mt-5 text-4xl sm:text-5xl font-extrabold leading-tight text-navy">
            Tell us what you're planning.
            <br />
            <span className="bg-gradient-to-r from-primary to-[#9b6dff] bg-clip-text text-transparent">
              We'll handle the rest.
            </span>
          </h1>

          <p className="mt-4 text-sm sm:text-base text-muted max-w-lg leading-relaxed">
            From weddings and birthdays to corporate events and everything in between, STARVNT helps you plan, find, book
            and manage everything in one place.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              beginPlan(input.trim());
            }}
            className="mt-8 w-full flex items-center gap-2 bg-white rounded-2xl shadow-xl shadow-primary/10 px-4 py-3 border border-gray-100"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell us what you want to arrange..."
              className="flex-1 outline-none text-sm sm:text-base placeholder:text-muted/60"
            />
            <button type="button" className="text-muted hover:text-primary p-1 cursor-pointer transition" aria-label="Voice input">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M19 11a7 7 0 01-14 0m14 0a7 7 0 00-14 0m14 0v1a7 7 0 01-14 0v-1m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
            <button
              type="submit"
              className="w-10 h-10 grid place-items-center rounded-xl bg-primary text-white hover:bg-primary-dark transition shadow-md shadow-primary/25 cursor-pointer"
              aria-label="Submit search"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </form>

          {/* Suggestion pills */}
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => beginPlan(s)}
                className="text-xs sm:text-sm bg-white hover:bg-primary-soft hover:text-primary text-ink/80 border border-gray-100 rounded-full px-4 py-2 transition shadow-2xs font-medium"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: Hero Image with Script Overlay */}
        <div className="relative rounded-3xl overflow-hidden shadow-2xl border-4 border-white aspect-4/3 lg:aspect-square">
          <img
            src="https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80"
            alt="Beautiful Wedding Setup"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-navy/60 via-transparent to-transparent flex flex-col justify-end p-8 text-white">
            <p className="text-xl sm:text-2xl font-serif italic drop-shadow-md">
              "Beautiful events create happier people."
            </p>
            <span className="text-xs uppercase tracking-widest text-white/80 font-bold mt-1">— STARVNT</span>
          </div>
        </div>
      </main>

      {/* Unified Public Footer with Trust Strip */}
      <PublicFooter showTrustStrip={true} />

      {popup !== null && <LoginPopup text={popup} onClose={() => setPopup(null)} />}
    </div>
  );
}
