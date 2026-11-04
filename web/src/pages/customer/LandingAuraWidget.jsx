import { useEffect, useState } from 'react';
import AuraMark from '../../components/AuraMark.jsx';
import Icon from '../../components/Icon.jsx';

const SUGGESTIONS = ['Plan a wedding', 'Explore event services', 'Plan a corporate event'];

export default function LandingAuraWidget({ open, onOpenChange, onAsk }) {
  const [message, setMessage] = useState('');
  const [showHint, setShowHint] = useState(true);
  const [planFormVisible, setPlanFormVisible] = useState(false);

  useEffect(() => {
    const form = document.querySelector('#plan-event form');
    if (!form || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setPlanFormVisible(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(form);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function dismissHintAfterScroll() {
      if (window.scrollY > 120) setShowHint(false);
    }
    window.addEventListener('scroll', dismissHintAfterScroll, { passive: true });
    return () => window.removeEventListener('scroll', dismissHintAfterScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event) {
      if (event.key === 'Escape') onOpenChange(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  function ask(prompt) {
    const text = prompt.trim();
    if (!text) return;
    onOpenChange(false);
    onAsk(text);
  }

  return <aside id="aura" className={`fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 transition-opacity sm:bottom-6 sm:right-6 ${planFormVisible && !open ? 'pointer-events-none opacity-0 sm:pointer-events-auto sm:opacity-100' : ''}`} aria-label="Aura+ event assistant">
    {open && <section aria-label="Ask Aura+" className="flex max-h-[min(620px,calc(100dvh-7rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] border border-primary/15 bg-white/95 text-navy shadow-[0_22px_80px_rgba(20,26,60,.2)] backdrop-blur-2xl dark:border-sky-200/25 dark:bg-[#0d1c36]/95 dark:text-white dark:shadow-[0_22px_80px_rgba(1,13,38,.5)]">
      <div className="flex items-center gap-3 border-b border-primary/10 bg-gradient-to-r from-primary-soft/70 to-sky-50 px-5 py-4 dark:border-white/10 dark:from-blue-700/35 dark:to-sky-500/15">
        <AuraMark variant="orb" size={44} motion />
        <div className="min-w-0 flex-1"><h2 className="text-sm font-bold">Aura+ <span className="font-normal text-primary dark:text-sky-200">· Your event assistant</span></h2><p className="text-xs text-muted dark:text-slate-300">Ideas to a clear plan</p></div>
        <button type="button" onClick={() => onOpenChange(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-primary/10 text-muted hover:bg-primary-soft dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10" aria-label="Close Aura+"><Icon name="close" size={17} /></button>
      </div>
      <div className="overflow-y-auto px-5 py-5">
        <p className="max-w-[290px] rounded-2xl rounded-tl-md border border-primary/10 bg-lavender px-4 py-3 text-sm leading-6 text-navy dark:border-white/10 dark:bg-white/10 dark:text-slate-100">Hi, I’m Aura+. What can I help you plan?</p>
        <p className="mt-4 text-xs leading-5 text-muted dark:text-slate-300">Tell me about your event. Sign in to continue the conversation in your customer workspace.</p>
        <div className="mt-5 flex flex-wrap gap-2">{SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => ask(suggestion)} className="rounded-full border border-primary/15 bg-primary-soft/60 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary-soft dark:border-sky-300/25 dark:bg-sky-300/10 dark:text-sky-100 dark:hover:bg-sky-300/20">{suggestion}</button>)}</div>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); ask(message); }} className="flex gap-2 border-t border-primary/10 bg-lavender/60 p-3 dark:border-white/10 dark:bg-[#0a1730]/90">
        <label htmlFor="landing-aura-message" className="sr-only">Tell Aura+ about your event</label>
        <input id="landing-aura-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={300} placeholder="Tell Aura+ your idea…" className="min-w-0 flex-1 rounded-xl border border-primary/15 bg-white px-3 py-2.5 text-sm text-navy outline-none placeholder:text-muted focus:border-primary dark:border-white/15 dark:bg-white/10 dark:text-white dark:placeholder:text-slate-400 dark:focus:border-sky-300" />
        <button type="submit" disabled={!message.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 text-white transition hover:brightness-110 disabled:opacity-40" aria-label="Continue with Aura+"><Icon name="send" size={17} /></button>
      </form>
    </section>}
    <div className="flex items-center gap-2">
      {!open && showHint && <div className="flex items-center gap-2 rounded-2xl border border-primary/15 bg-white/95 py-2 pl-4 pr-2 text-xs font-semibold text-navy shadow-xl backdrop-blur-xl dark:border-sky-200/25 dark:bg-[#0d1c36]/90 dark:text-white"><span>What can I help you plan?</span><button type="button" onClick={() => setShowHint(false)} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-primary-soft dark:text-slate-300 dark:hover:bg-white/10" aria-label="Dismiss Aura+ message"><Icon name="close" size={13} /></button></div>}
      <button type="button" onClick={() => { onOpenChange(!open); setShowHint(false); }} aria-label={open ? 'Close Aura+ chat' : 'Open Aura+ chat'} aria-expanded={open} className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-sky-200/30 bg-gradient-to-br from-[#133466] via-[#263f95] to-[#0a8cb8] shadow-[0_9px_32px_rgba(14,165,233,.42)] transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-sky-300 sm:h-[68px] sm:w-[68px]"><AuraMark variant="orb" size={52} motion state={open ? 'active' : 'idle'} /></button>
    </div>
  </aside>;
}
