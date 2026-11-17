import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { externalApi } from '../../lib/api.js';

export default function VendorGlobalSearch() {
  const [query, setQuery] = useState(''), [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false), [open, setOpen] = useState(false), [attempt, setAttempt] = useState(0);
  const container = useRef(null);
  useEffect(() => {
    const close = event => { if (!container.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  useEffect(() => {
    let current = true;
    setData(null); setError(''); setLoading(query.trim().length >= 2);
    if (query.trim().length < 2) return;
    const timer = setTimeout(() => {
      externalApi.call(`/vendor/search?q=${encodeURIComponent(query.trim())}`)
        .then(value => { if (current) setData(value); })
        .catch(() => { if (current) setError('Search is unavailable. Please retry.'); })
        .finally(() => { if (current) setLoading(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [query, attempt]);
  const hasResults = data?.sections?.some(section => section.results?.length);
  const unavailable = data?.sections?.some(section => section.status !== 'READY');
  return <div ref={container} className="relative w-full">
    <input aria-label="Search Vendor OS" aria-expanded={open && query.trim().length >= 2} aria-controls="vendor-search-results" value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }} maxLength={100} placeholder="Search leads, bookings, quotes…" className="bg-transparent w-full outline-none text-xs sm:text-sm" />
    {open && query.trim().length >= 2 && <div id="vendor-search-results" className="absolute top-full left-0 right-0 mt-4 z-50 max-h-[65vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-xl text-sm">
      {loading && <p role="status">Searching authorized records…</p>}
      {error && <p role="alert">{error}</p>}
      {unavailable && <p role="status">Some sources are unavailable or incomplete. Available results remain usable.</p>}
      {(error || unavailable) && <button type="button" onClick={() => setAttempt(x => x + 1)} className="underline min-h-11">Retry search</button>}
      {data && !hasResults && !unavailable && <p>No matching records.</p>}
      {data?.sections?.map(section => <section key={section.type}>
        {!!section.results?.length && <h3 className="font-bold capitalize mt-2">{section.type}</h3>}
        {section.results?.map(row => <Link key={row.id} to={row.url} onClick={() => setOpen(false)} className="block rounded-lg p-2 min-h-11 hover:bg-primary/10 focus-visible:outline focus-visible:outline-primary"><span className="font-semibold">{row.title}</span><small className="block text-muted break-all">{[row.status, row.date, row.reference].filter(Boolean).join(' · ')}</small></Link>)}
        {section.hasMore && <p className="text-xs text-muted">More {section.type} match. Refine your search.</p>}
      </section>)}
      {data && <p className="text-xs text-muted mt-3">Updated {new Date(data.computedAt).toLocaleTimeString()}</p>}
    </div>}
  </div>;
}
