import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { customerApi, errorText } from './customerApi.js';
import { Empty, PageSkeleton, useLoad } from './customerUi.jsx';
import { useCurrentEvent } from './currentEvent.jsx';
import { formatDate, formatINR } from './format.js';
import { libraryItems, safeContractLink, savedOptionLink } from './libraryState.js';

const field = 'block w-full rounded-xl border border-gray-200 bg-white text-navy p-3 mt-1';
function EventFilter({ value, onChange, global = false }) {
  const { events } = useCurrentEvent();
  return <label className="block text-sm">Event<select aria-label="Event" className={field} value={value} onChange={event => onChange(event.target.value)}><option value="">All events</option>{global && <option value="global">Saved without an event</option>}{events.map(event => <option key={event.id} value={event.id}>{event.title || event.eventTypeLabel}</option>)}</select></label>;
}
export function DocumentsPage() {
  const [params, setParams] = useSearchParams();
  const eventId = params.get('event') || '', type = params.get('type') || '';
  const change = (key, value) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next); };
  return <DocumentLibrary key={`${eventId}:${type}`} eventId={eventId} type={type} change={change} />;
}
function DocumentLibrary({ eventId, type, change }) {
  const { data, error, loading, reload } = useLoad(() => customerApi.documents({ eventId, type }), [eventId, type]);
  const [search, setSearch] = useState(''), [downloading, setDownloading] = useState(''), [actionError, setActionError] = useState(''), [adding, setAdding] = useState(false);
  async function download(doc) {
    setDownloading(doc.id); setActionError('');
    try {
      const response = await customerApi.documentAccess(doc.id);
      let href, revoke = false;
      if (response.headers.get('content-type')?.includes('application/json')) {
        const { downloadUrl } = await response.json(); href = safeContractLink(downloadUrl);
        if (!href) throw new Error('This file link is unavailable. Ask for a secure replacement.');
      } else { href = URL.createObjectURL(await response.blob()); revoke = true; }
      const anchor = document.createElement('a'); anchor.href = href; anchor.download = (doc.fileName || `${doc.type}${doc.version ? `-v${doc.version}` : ''}-${doc.title || 'STARVNT'}.pdf`).replace(/[\\/:*?"<>|]/g, '-');
      if (!revoke) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      if (revoke) setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (err) { setActionError(errorText(err, err.message || 'Could not download this document.')); }
    finally { setDownloading(''); }
  }
  const docs = libraryItems(data?.documents || [], { search });
  return <div className="customer-library max-w-3xl mx-auto space-y-4">
    <h1 className="text-xl font-extrabold">Event documents</h1>
    <p className="text-sm text-muted">Find saved invoices, verified receipts, contract links and exact proposal versions. A contract link is a saved file reference; it does not record agreement acceptance.</p>
    <div className="grid sm:grid-cols-3 gap-3"><EventFilter value={eventId} onChange={value => change('event', value)} /><label className="text-sm">Document type<select aria-label="Document type" className={field} value={type} onChange={event => change('type', event.target.value)}><option value="">All types</option>{['receipt', 'invoice', 'contract', 'proposal'].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm">Search documents<input className={field} value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    <div className="flex flex-wrap gap-3"><button className="customer-secondary-action" disabled={loading} onClick={reload}>{loading ? 'Refreshing…' : 'Refresh documents'}</button><button className="customer-secondary-action" onClick={() => setAdding(value => !value)}>{adding ? 'Close contract form' : 'Add contract link'}</button>{eventId && <Link className="customer-secondary-action" to={`/customer/events/${eventId}`}>Open event</Link>}</div>
    {adding && <ContractForm key={eventId} eventId={eventId} onSaved={() => { setAdding(false); reload(); }} />}
    {actionError && <p role="alert" className="text-red-600 text-sm">{actionError}</p>}
    {error ? <div role="alert" className="customer-home-panel">Documents unavailable. {errorText(error)} <button className="customer-secondary-action" onClick={reload}>Try again</button></div> : loading && !data ? <PageSkeleton title="Documents" count={2} type="cards" /> : !docs.length ? <Empty title="No matching documents">Documents appear when their source records are available. Try another event or filter.</Empty> : docs.map(doc => <article className="customer-home-panel space-y-3" key={doc.id}>
      <h2 className="font-bold">{doc.title}{doc.version != null ? ` · Version ${doc.version}` : ''}</h2>
      <p className="text-sm">{doc.event?.title || 'No linked event'} · {doc.type} · {doc.status}</p>
      <p className="text-xs text-muted">{doc.issuedAt ? `${doc.type === 'contract' ? 'Saved' : 'Issued'} ${formatDate(String(doc.issuedAt).slice(0, 10))}` : 'Issue date not recorded'}{doc.amount != null ? ` · ${formatINR(doc.amount)}` : ''}{doc.vendorName ? ` · ${doc.vendorName}` : ''}</p>
      <p className="text-xs text-muted">{doc.immutable ? 'Exact frozen proposal PDF' : doc.type === 'contract' ? 'Saved file link' : 'Generated from current saved records'}</p>
      {!doc.canDownload && <p className="text-sm">Not available for download yet.{doc.type === 'receipt' ? ' Payment verification is still pending.' : doc.type === 'contract' ? ' Ask the file owner for a secure replacement link.' : ''}</p>}
      <div className="flex flex-wrap gap-3"><button className="customer-secondary-action" disabled={!doc.canDownload || Boolean(downloading)} onClick={() => download(doc)}>{downloading === doc.id ? 'Preparing…' : doc.type === 'contract' ? 'Open saved file' : 'Download PDF'}</button>{doc.event?.id && <Link className="customer-secondary-action" to={`/customer/events/${doc.event.id}${doc.type === 'receipt' || doc.type === 'invoice' ? '/bookings' : ''}`}>Open linked event</Link>}{doc.proposalId && <Link className="customer-secondary-action" to={`/customer/proposals?event=${encodeURIComponent(doc.event?.id || '')}&proposal=${encodeURIComponent(doc.proposalId)}`}>Review this version</Link>}</div>
    </article>)}
  </div>;
}
function ContractForm({ eventId, onSaved }) {
  const [form, setForm] = useState({ title: '', fileUrl: '', fileName: '' }), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const set = key => event => setForm(value => ({ ...value, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setError('');
    if (!safeContractLink(form.fileUrl)) { setError('Use a secure HTTPS file link.'); return; }
    setBusy(true);
    try { await customerApi.createContractDocument({ ...form, ...(eventId ? { eventId } : {}) }); onSaved(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="customer-home-panel space-y-3"><h2 className="font-bold">Add an existing contract link</h2><p className="text-sm">{eventId ? 'This link will be associated with the selected event.' : 'This link will be saved without an event. Choose an event above to associate it.'} Access is controlled by the linked file's owner.</p>{error && <p role="alert">{error}</p>}<label className="block text-sm">Contract title<input className={field} required maxLength={180} value={form.title} onChange={set('title')} /></label><label className="block text-sm">Secure file URL<input className={field} type="url" required maxLength={1200} value={form.fileUrl} onChange={set('fileUrl')} /></label><label className="block text-sm">File name (optional)<input className={field} maxLength={240} value={form.fileName} onChange={set('fileName')} /></label><button className="customer-primary-action" disabled={busy}>{busy ? 'Saving…' : 'Save contract link'}</button></form>;
}

export function FavoritesPage() {
  const [params, setParams] = useSearchParams(), { current, events } = useCurrentEvent();
  const { data, error, loading, reload } = useLoad(() => customerApi.favorites(), []);
  const [search, setSearch] = useState(''), [source, setSource] = useState(''), [removing, setRemoving] = useState(''), [actionError, setActionError] = useState('');
  const eventId = params.get('event') || '';
  const items = libraryItems(data?.favorites || [], { eventId, source, search });
  const [compare, setCompare] = useState([]);
  useEffect(() => setCompare([]), [eventId, source, search]);
  const compareEvent = eventId && eventId !== 'global' ? events.find(event => event.id === eventId) : current;
  const compared = [...new Map(items.filter(item => compare.includes(item.optionId)).map(item => [item.optionId, item])).values()];
  const canCompare = compareEvent && compared.length >= 2 && compared.length <= 4 && compared.every(item => item.category && item.category.toLowerCase() === compared[0].category.toLowerCase());

  async function remove(item) { setActionError(''); setRemoving(item.id); try { await customerApi.removeFavorite(item.id); reload(); } catch (err) { setActionError(errorText(err)); } finally { setRemoving(''); } }
  return <div className="customer-library max-w-3xl mx-auto space-y-4"><h1 className="text-xl font-extrabold">Saved items & selections</h1><p className="text-sm text-muted">Saving keeps a reference. It does not enquire, book, subscribe or notify a vendor. Selected event options remain separate from saves.</p><div className="grid sm:grid-cols-3 gap-3"><EventFilter global value={eventId} onChange={value => { const next = new URLSearchParams(params); value ? next.set('event', value) : next.delete('event'); setParams(next); }} /><label className="text-sm">Show<select aria-label="Show" className={field} value={source} onChange={event => setSource(event.target.value)}><option value="">Saved & selected</option><option value="saved">Saved only</option><option value="selected">Selected only</option></select></label><label className="text-sm">Search saved items<input className={field} value={search} onChange={event => setSearch(event.target.value)} /></label></div><button className="customer-secondary-action" disabled={loading} onClick={reload}>Refresh saved items</button><section className="customer-home-panel space-y-3"><h2 className="font-bold">Compare saved options</h2><p className="text-sm">Choose 2 to 4 options from the same service. {compareEvent ? `Comparison uses ${compareEvent.title || 'your current event'} and rechecks current offers.` : 'Choose an event to compare current offers.'}</p>{canCompare && <Link className="customer-secondary-action" to={`/customer/events/${encodeURIComponent(compareEvent.id)}/compare?ids=${compared.map(item => encodeURIComponent(item.optionId)).join(',')}`}>Compare {compared.length} options</Link>}</section>{actionError && <p role="alert" className="text-red-600">{actionError}</p>}{error ? <div role="alert">Saved items unavailable. {errorText(error)} <button className="customer-secondary-action" onClick={reload}>Try again</button></div> : loading && !data ? <PageSkeleton title="Saved items" count={2} type="cards" /> : !items.length ? <Empty title="No matching saved items">Save an option from its service details, or try another filter.</Empty> : items.map(item => {
    const targetEvent = item.event?.id || (eventId && eventId !== 'global' ? eventId : current?.id), to = savedOptionLink(item, targetEvent);
    return <article key={item.id} className="customer-home-panel space-y-3">{item.optionId && <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`Compare ${item.vendorName}`} checked={compare.includes(item.optionId)} disabled={!compare.includes(item.optionId) && compare.length >= 4} onChange={event => setCompare(value => event.target.checked ? [...new Set([...value, item.optionId])] : value.filter(id => id !== item.optionId))} />Choose for comparison</label>}<h2 className="font-bold">{item.vendorName} · {item.packageName || item.category || 'Saved reference'}</h2><p className="text-sm">{item.source === 'selected_option' ? 'Selected in event plan' : 'Saved reference'} · {item.event?.title || 'Saved without an event'}</p><p className="text-sm">{item.price != null ? `Saved price ${formatINR(item.price)}. ` : ''}Availability and current price are checked when opened. A saved option may no longer be offered.</p>{item.notes && <p className="text-sm">{item.notes}</p>}<div className="flex flex-wrap gap-3">{to ? <Link className="customer-secondary-action" to={to}>View current details</Link> : <Link className="customer-secondary-action" to="/customer/events">Choose an event to explore services</Link>}{item.event?.id && <Link className="customer-secondary-action" to={`/customer/events/${item.event.id}/requirements`}>Open event plan</Link>}{item.removable && <button className="customer-secondary-action" disabled={Boolean(removing)} onClick={() => remove(item)}>{removing === item.id ? 'Removing…' : 'Remove saved reference'}</button>}</div></article>;
  })}</div>;
}
