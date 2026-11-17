import { useEffect, useRef, useState } from 'react';

export default function ConfirmActionButton({ children, confirmation, onConfirm, disabled, className }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null), confirm = useRef(null);
  useEffect(() => { if (open) confirm.current?.focus(); }, [open]);
  function close() { setOpen(false); trigger.current?.focus(); }
  return <div className="space-y-2">
    <button ref={trigger} type="button" className={className} disabled={disabled} aria-expanded={open} onClick={() => setOpen(true)}>{children}</button>
    {open && <div role="group" aria-label={`Confirm ${children}`} className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-3" onKeyDown={event => { if (event.key === 'Escape') close(); }}>
      <p className="text-sm">{confirmation}</p>
      <div className="flex flex-wrap gap-3">
        <button ref={confirm} type="button" className="min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={disabled} onClick={async () => { await onConfirm(); setOpen(false); }}>Confirm</button>
        <button type="button" className="min-h-11 rounded-xl border bg-white px-4 py-2 font-semibold" disabled={disabled} onClick={close}>Cancel</button>
      </div>
    </div>}
  </div>;
}
