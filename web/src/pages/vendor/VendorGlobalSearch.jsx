import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { externalApi } from '../../lib/api.js';

export default function VendorGlobalSearch() {
  const [query, setQuery] = useState(''), [result, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false), [open, setOpen] = useState(false), [attempt, setAttempt] = useState(0);
  const container = useRef(null);
  const [page, setPage] = useState(1), [type, setType] = useState('');
  const data = result?.page === page && result?.query === query.trim() && result?.requestType === type ? result : null;
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
      externalApi.call(`/vendor/search?q=${encodeURIComponent(query.trim())}&page=${page}${type ? `&type=${type}` : ''}`)
        .then(value => { if (current) setData({ ...value, requestType: type }); })
        .catch(() => { if (current) setError('Search is unavailable. Please retry.'); })
        .finally(() => { if (current) setLoading(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [query, attempt, page, type]);
  const hasResults = data?.sections?.some(section => section.results?.length);
  const unavailable = data?.sections?.some(section => section.status !== 'READY');
  return <div ref={container} className="relative w-full" onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); container.current?.querySelector('input')?.focus(); } }}>
    <input aria-label="Search Vendor OS" aria-expanded={open && query.trim().length >= 2} aria-controls="vendor-search-results" value={query} onChange={e => { setQuery(e.target.value); setPage(1); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }} maxLength={100} placeholder="Search leads, bookings, quotes…" className="bg-transparent w-full outline-none text-xs sm:text-sm" />
    {open && query.trim().length >= 2 && <div id="vendor-search-results" role="region" aria-label="Vendor search results" className="fixed top-[4.5rem] left-3 right-3 sm:absolute sm:top-full sm:left-0 sm:right-0 mt-4 z-50 max-h-[65vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-xl text-sm">
      <label htmlFor="vendor-search-category" className="block">Search category</label><select id="vendor-search-category" className="min-h-11 w-full border rounded-lg p-2 bg-inherit" value={type} onChange={event => { setType(event.target.value); setPage(1); }}><option value="">All authorized sources</option>{['leads', 'quotes', 'bookings', 'payments', 'documents', 'services', 'portfolio', 'customers'].map(value => <option key={value}>{value}</option>)}</select>
      {loading && <p role="status">Searching authorized records…</p>}
      {error && <p role="alert">{error}</p>}
      {unavailable && <p role="status">Some sources are unavailable or incomplete. Available results remain usable.</p>}
      {(error || unavailable) && <button type="button" onClick={() => setAttempt(x => x + 1)} className="underline min-h-11">Retry search</button>}
      {data && !hasResults && !unavailable && <p role="status">{page === 1 ? 'No matching records.' : 'No matching records on this page.'}</p>}
      {data?.sections?.map(section => <section key={section.type}>
        {!!section.results?.length && <h3 className="font-bold capitalize mt-2">{section.type}</h3>}
        {section.results?.map(row => <Link key={row.id} to={row.url} onClick={() => setOpen(false)} className="block rounded-lg p-2 min-h-11 hover:bg-primary/10 focus-visible:outline focus-visible:outline-primary"><span className="font-semibold">{row.title}</span><small className="block text-muted break-all">{[row.status, row.date, row.reference, row.invoiceReference].filter(Boolean).join(' · ')}</small></Link>)}
      </section>)}
      {data && <div className="flex flex-wrap items-center gap-2 mt-3"><button type="button" className="min-h-11 underline" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>Previous search page</button><span>Page {page}</span><button type="button" className="min-h-11 underline" disabled={loading || page >= 100 || !data.sections.some(section => section.hasMore)} onClick={() => setPage(value => value + 1)}>Next search page</button>{page === 100 && data.sections.some(section => section.hasMore) && <p>Search limit reached. Refine the query or category.</p>}<p className="text-xs text-muted">Updated {new Date(data.computedAt).toLocaleTimeString()}</p></div>}
    </div>}
  </div>;
}
