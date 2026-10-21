import { useEffect, useId, useRef, useState } from 'react';
import { searchVendorCategories, VENDOR_CATEGORY_VALUES } from '../../../server/src/common/vendorCategories.js';

export default function VendorCategoryPicker({ value = '', onChange, required = false, disabled = false, label = 'Primary category', className = '' }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0);
  const input = useRef(null), root = useRef(null), list = useRef(null), listId = useId();
  const results = searchVendorCategories(query);
  const choices = value && !VENDOR_CATEGORY_VALUES.includes(value) && (!query || value.toLowerCase().includes(query.toLowerCase()))
    ? [{ value, aliases: [] }, ...results] : results;
  useEffect(() => { input.current?.setCustomValidity(required && !value ? 'Choose a category from the list.' : ''); }, [required, value]);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (open && root.current && root.current.getBoundingClientRect().bottom + 330 > window.innerHeight) root.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [open]);
  useEffect(() => { if (open) list.current?.querySelector(`[data-option="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  function select(category) { onChange(category); setOpen(false); setQuery(''); input.current?.focus(); }
  return <div ref={root} className="relative min-w-0" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setQuery(''); } }}>
    <div className="relative">
      <input ref={input} role="combobox" aria-label={label} aria-required={required} aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
        aria-activedescendant={open && choices[active] ? `${listId}-${active}` : undefined}
        required={required} disabled={disabled} autoComplete="off" placeholder="Search or choose a category…" value={open ? query : value}
        onClick={() => { if (!open) { setOpen(true); setQuery(''); } }}
        onChange={event => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setQuery(''); }
          else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(index => !open ? 0 : Math.max(0, Math.min(choices.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))); }
          else if (event.key === 'Enter' && open) { event.preventDefault(); if (choices[active]) select(choices[active].value); }
          else if (event.key === 'Tab') { setOpen(false); setQuery(''); }
        }}
        className={`w-full rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3.5 py-2.5 pr-9 text-sm text-navy dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 ${className}`} />
      <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">⌕</span>
    </div>
    {open && <div className="absolute z-[80] mt-2 w-full min-w-0 overflow-hidden rounded-2xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-xl">
      <div className="border-b border-gray-100 dark:border-slate-700 px-3 py-2 text-xs text-muted dark:text-slate-400" role="status">{choices.length} matching {choices.length === 1 ? 'category' : 'categories'} · {VENDOR_CATEGORY_VALUES.length} available</div>
      <div ref={list} role="listbox" id={listId} aria-label="Vendor categories" className="max-h-[min(17rem,45dvh)] overflow-y-auto overscroll-contain p-1">
        {choices.map((category, index) => <button key={category.value} type="button" role="option" id={`${listId}-${index}`} data-option={index} aria-selected={value === category.value}
          onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => select(category.value)}
          className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${active === index ? 'bg-primary/10 dark:bg-primary/25 text-primary dark:text-violet-200' : 'text-navy dark:text-slate-200'} ${value === category.value ? 'font-bold' : ''}`}>
          <span>{category.value}</span>{value === category.value && <span aria-hidden="true">✓</span>}
        </button>)}
        {!choices.length && <p className="px-3 py-4 text-sm text-muted dark:text-slate-400">No matching category. Try another term, or choose Other.</p>}
      </div>
      {!choices.some(category => category.value === 'Other') && <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => select('Other')} className="min-h-11 w-full border-t border-gray-100 dark:border-slate-700 px-4 py-3 text-left text-sm font-bold text-primary dark:text-violet-200">Choose Other</button>}
    </div>}
  </div>;
}
