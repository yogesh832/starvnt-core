import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useExternalAuth } from '../auth/ExternalAuthContext.jsx';
import { useTheme } from '../lib/ThemeContext.jsx';
import { LogoWord } from './ui.jsx';
import Icon from './Icon.jsx';

export default function PublicNavbar({ onPlanClick, onAuraClick, activePage = 'landing' }) {
  const { user } = useExternalAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const marketing = activePage === 'landing';
  const surface = marketing ? 'border-white/10 bg-[#0b1730]/85 text-white shadow-[0_12px_40px_rgba(4,17,43,.18)]' : 'border-white/60 bg-white/80 dark:border-white/10 dark:bg-navy/80';
  const menuSurface = marketing ? 'border-sky-300/20 bg-[#102342]/95 text-white backdrop-blur-xl' : 'border-primary/10 bg-white text-navy dark:border-white/10 dark:bg-[#161926] dark:text-white';
  const themeButton = <button type="button" onClick={toggleTheme} className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition ${marketing ? 'border-white/15 bg-white/10 text-white hover:bg-white/20' : 'border-primary/10 bg-white text-muted hover:bg-primary-soft dark:bg-white/10 dark:text-white'}`} aria-label={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}><Icon name={dark ? 'sun' : 'moon'} size={17} /></button>;

  function handlePlan() {
    setMenuOpen(false);
    if (onPlanClick) onPlanClick('');
    else navigate('/?plan=true');
  }
  function handleAura() {
    setMenuOpen(false);
    if (onAuraClick) onAuraClick();
    else navigate('/#aura');
  }

  return <header className={`sticky top-0 z-40 w-full border-b backdrop-blur-xl ${surface}`}>
    <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-6 px-5 sm:px-8 lg:px-12">
      <Link to="/" className="min-w-0 shrink-0 transition hover:opacity-90" aria-label="StarVnt home"><LogoWord light={marketing} /></Link>
      <nav className={`hidden items-center gap-6 text-sm font-semibold xl:flex ${marketing ? 'text-slate-200' : 'text-ink/70 dark:text-gray-300'}`} aria-label="Main navigation">
        <a href="/#experiences" className="transition hover:text-sky-300">Experiences</a>
        <a href="/#how-it-works" className="transition hover:text-sky-300">How it works</a>
        <button type="button" onClick={handleAura} className="transition hover:text-sky-300">Aura+</button>
        <a href="https://vendor.starvnt.com/signup?as=vendor" className="transition hover:text-sky-300">For partners</a>
      </nav>
      <div className="hidden shrink-0 items-center gap-3 xl:flex">
        {user ? <button type="button" onClick={() => navigate('/customer')} className="text-sm font-semibold text-inherit hover:text-sky-300">My dashboard</button> : <Link to={activePage === 'login' ? '/' : '/login?as=customer'} className="text-sm font-semibold text-inherit hover:text-sky-300">{activePage === 'login' ? 'Explore' : 'Sign in'}</Link>}
        {themeButton}
        <button type="button" onClick={handlePlan} className={`rounded-xl px-5 py-3 text-sm font-bold transition ${marketing ? 'border border-sky-300/30 bg-gradient-to-r from-[#2563eb] to-[#0ea5e9] text-white shadow-[0_8px_28px_rgba(14,165,233,.28)] hover:from-[#1d4ed8] hover:to-[#0284c7]' : 'bg-primary text-white shadow-sm shadow-primary/20 hover:bg-primary-dark'}`}>Plan an Event</button>
      </div>
      <div className="relative xl:hidden">
        <button type="button" onClick={() => setMenuOpen((open) => !open)} className={`grid h-11 w-11 place-items-center rounded-xl border ${marketing ? 'border-white/20 bg-white/10 text-white' : 'border-primary/15 bg-white text-primary dark:bg-white/10'}`} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="public-mobile-nav"><Icon name={menuOpen ? 'close' : 'menu'} size={20} /></button>
        {menuOpen && <nav id="public-mobile-nav" className={`absolute right-0 top-14 z-50 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-2xl border p-3 text-sm font-semibold shadow-2xl ${menuSurface}`} aria-label="Mobile navigation">
          <a href="/#experiences" onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-2.5 hover:bg-white/10">Experiences</a>
          <a href="/#how-it-works" onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-2.5 hover:bg-white/10">How it works</a>
          <button type="button" onClick={handleAura} className="rounded-xl px-3 py-2.5 text-left hover:bg-white/10">Ask Aura+</button>
          <a href="https://vendor.starvnt.com/signup?as=vendor" onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-2.5 hover:bg-white/10">For partners</a>
          {user ? <button type="button" onClick={() => navigate('/customer')} className="rounded-xl px-3 py-2.5 text-left hover:bg-white/10">My dashboard</button> : <Link to="/login?as=customer" onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-2.5 hover:bg-white/10">Sign in</Link>}
          <div className="my-1 border-t border-white/10" />
          <div className="flex items-center justify-between gap-3 px-1">{themeButton}<button type="button" onClick={handlePlan} className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold text-white ${marketing ? 'bg-gradient-to-r from-blue-600 to-sky-500' : 'bg-primary'}`}>Plan an Event</button></div>
        </nav>}
      </div>
    </div>
  </header>;
}
