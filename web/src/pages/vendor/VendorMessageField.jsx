import { useEffect, useId, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { externalApi } from '../../lib/api.js';

/** One editable message field for chat, quotes and booking updates. */
export default function VendorMessageField({ value, onChange, context, label = 'Message to customer (optional)', placeholder = 'Write your message about this service…', disabled = false, rows = 3 }) {
  const id = useId();
  const editor = useRef(null);
  const [showAura, setShowAura] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState('');
  const scope = `${context?.type}:${context?.id}`;
  const latest = useRef({ scope, value, onChange });
  latest.current = { scope, value, onChange };
  const requestId = useRef(0);
  useEffect(() => {
    requestId.current += 1;
    setShowAura(false);
    setInstructions('');
    setDrafting(false);
    setError('');
    return () => { requestId.current += 1; };
  }, [scope]);

  async function generate() {
    if (!instructions.trim() || !context?.id || drafting) return;
    const request = ++requestId.current;
    const originalValue = value;
    setDrafting(true);
    setError('');
    try {
      const result = await externalApi.call('/vendor/messages/draft', {
        method: 'POST', body: { context, instructions: instructions.trim() },
      });
      if (request !== requestId.current || latest.current.scope !== scope) return;
      if (!result.ok || !result.draft) throw new Error('DRAFT_UNAVAILABLE');
      if (latest.current.value !== originalValue) {
        setError('You edited the message while Aura was writing. Generate again to replace your draft.');
        return;
      }
      latest.current.onChange(result.draft);
      setShowAura(false);
      editor.current?.focus();
    } catch {
      if (request === requestId.current) setError('Aura could not write this draft. Try again or edit the message yourself.');
    } finally {
      if (request === requestId.current) setDrafting(false);
    }
  }

  return (
    <div className="space-y-2 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-bold text-navy">{label}</label>
        <div className="flex items-center gap-1.5">
          <button type="button" disabled={disabled} onClick={() => editor.current?.focus()} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-bold text-navy hover:bg-lavender disabled:opacity-50"><Icon name="edit" size={12} />Edit</button>
          <button type="button" disabled={disabled || !context?.id || drafting} onClick={() => setShowAura((open) => !open)} aria-expanded={showAura} className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary-soft px-2.5 py-1.5 text-[11px] font-bold text-primary disabled:opacity-50"><Icon name="aura" size={12} />{drafting ? 'Writing…' : 'Write with Aura'}</button>
        </div>
      </div>
      {showAura && <div className="rounded-xl border border-gray-200 bg-lavender p-3 space-y-2">
        <label htmlFor={`${id}-details`} className="block text-xs font-bold text-navy">What details should Aura include?</label>
        <textarea id={`${id}-details`} rows={2} maxLength={2000} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Describe your update, question, or specific details for this service." className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-navy" />
        <button type="button" onClick={generate} disabled={!instructions.trim() || drafting || disabled} className="rounded-xl bg-primary text-white px-3 py-2 text-xs font-bold disabled:opacity-50">{drafting ? 'Writing…' : value.trim() ? 'Replace draft with Aura' : 'Generate draft'}</button>
      </div>}
      <textarea id={id} ref={editor} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} maxLength={2000} placeholder={placeholder} disabled={disabled} className="w-full min-w-0 rounded-xl border border-gray-200 bg-lavender/60 px-3 py-2.5 text-xs text-navy placeholder:text-muted outline-none focus:border-primary resize-y disabled:opacity-50" />
      <p className="text-[10px] text-muted">Example text is a placeholder. Review and edit your message before submitting.</p>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
