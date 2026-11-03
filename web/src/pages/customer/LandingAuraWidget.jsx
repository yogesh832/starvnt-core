import { useEffect, useState } from 'react';
import AuraMark from '../../components/AuraMark.jsx';
import Icon from '../../components/Icon.jsx';

const SUGGESTIONS = ['Plan a wedding', 'Explore event services', 'Plan a corporate event'];

export default function LandingAuraWidget({ open, onOpenChange, onAsk }) {
  const [message, setMessage] = useState('');
  const [showHint, setShowHint] = useState(true);

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

  return <aside id="aura" className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 sm:bottom-6 sm:right-6" aria-label="Aura+ event assistant">
    {open && <section aria-label="Ask Aura+" className="flex max-h-[min(620px,calc(100dvh-7rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] border border-sky-200/25 bg-[#0d1c36]/95 text-white shadow-[0_22px_80px_rgba(1,13,38,.5)] backdrop-blur-2xl">
      <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-blue-700/35 to-sky-500/15 px-5 py-4">
        <AuraMark variant="orb" size={44} motion />
        <div className="min-w-0 flex-1"><h2 className="text-sm font-bold">Aura+ <span className="font-normal text-sky-200">· Your event assistant</span></h2><p className="text-xs text-slate-300">Ideas to a clear plan</p></div>
        <button type="button" onClick={() => onOpenChange(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-slate-200 hover:bg-white/10" aria-label="Close Aura+"><Icon name="close" size={17} /></button>
      </div>
      <div className="overflow-y-auto px-5 py-5">
        <p className="max-w-[290px] rounded-2xl rounded-tl-md border border-white/10 bg-white/10 px-4 py-3 text-sm leading-6 text-slate-100">Hi, I’m Aura+. What can I help you plan?</p>
        <p className="mt-4 text-xs leading-5 text-slate-300">Tell me about your event. Sign in to continue the conversation in your customer workspace.</p>
        <div className="mt-5 flex flex-wrap gap-2">{SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => ask(suggestion)} className="rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-300/20">{suggestion}</button>)}</div>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); ask(message); }} className="flex gap-2 border-t border-white/10 bg-[#0a1730]/90 p-3">
        <label htmlFor="landing-aura-message" className="sr-only">Tell Aura+ about your event</label>
        <input id="landing-aura-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={300} placeholder="Tell Aura+ your idea…" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-400 focus:border-sky-300" />
        <button type="submit" disabled={!message.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 text-white transition hover:brightness-110 disabled:opacity-40" aria-label="Continue with Aura+"><Icon name="send" size={17} /></button>
      </form>
    </section>}
    <div className="flex items-center gap-2">
      {!open && showHint && <div className="flex items-center gap-2 rounded-2xl border border-sky-200/25 bg-[#0d1c36]/90 py-2 pl-4 pr-2 text-xs font-semibold text-white shadow-xl backdrop-blur-xl"><span>What can I help you plan?</span><button type="button" onClick={() => setShowHint(false)} className="grid h-7 w-7 place-items-center rounded-lg text-slate-300 hover:bg-white/10" aria-label="Dismiss Aura+ message"><Icon name="close" size={13} /></button></div>}
      <button type="button" onClick={() => { onOpenChange(!open); setShowHint(false); }} aria-label={open ? 'Close Aura+ chat' : 'Open Aura+ chat'} aria-expanded={open} className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-sky-200/30 bg-gradient-to-br from-[#133466] via-[#263f95] to-[#0a8cb8] shadow-[0_9px_32px_rgba(14,165,233,.42)] transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-sky-300 sm:h-[68px] sm:w-[68px]"><AuraMark variant="orb" size={52} motion state={open ? 'active' : 'idle'} /></button>
    </div>
  </aside>;
}
