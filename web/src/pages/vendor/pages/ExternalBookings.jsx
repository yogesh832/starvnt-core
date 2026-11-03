import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { externalApi } from '../../../lib/api.js';
import CommitmentForm from '../../../components/CommitmentForm.jsx';
import { EXTERNAL_SOURCES, EXTERNAL_STAGES, human, localDateTime } from '../../../components/ExternalBookingFields.jsx';
import { Page, Card } from './shared.jsx';
const money = n => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const button = 'border rounded-xl px-3 min-h-11 text-sm disabled:opacity-50';
export default function ExternalBookings() {
  const [rows, setRows] = useState([]), [summary, setSummary] = useState(null), [services, setServices] = useState([]), [resources, setResources] = useState([]), [legacy, setLegacy] = useState([]);
  const [filter, setFilter] = useState(''), [source, setSource] = useState(''), [next, setNext] = useState(null), [selected, setSelected] = useState(null), [editing, setEditing] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [stage, setStage] = useState(''), [reason, setReason] = useState(''), [hold, setHold] = useState('');
  const [payment, setPayment] = useState({ kind: 'receipts', amount: '', method: 'BANK', receivedAt: localDateTime(new Date()), reference: '', reason: '', attachmentId: '' });
  const [file, setFile] = useState(null), [fileKind, setFileKind] = useState('INVOICE');
  const intent = useRef(null), generation = useRef(0);
  function requestKey(body) {
    const fingerprint = JSON.stringify(body);
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() };
    return intent.current.key;
  }
  async function refresh(after = null) {
    const current = ++generation.current;
    setLoading(true);
    const params = new URLSearchParams(); if (filter) params.set('lifecycle', filter); if (source) params.set('source', source); if (after) params.set('after', after);
    try {
      const [list, totals, catalogue, equipment, old] = await Promise.all([
        externalApi.call(`/vendor/external-bookings?${params}`), externalApi.call('/vendor/external-bookings/financial-summary'), externalApi.call('/vendor/services'), externalApi.call('/vendor/resources'), externalApi.call('/vendor/external-bookings/legacy'),
      ]);
      if (current !== generation.current) return;
      setRows(previous => after ? [...previous, ...list.bookings] : list.bookings); setNext(list.nextCursor); setSummary(totals); setServices(catalogue.services || []); setResources(equipment.resources || []); setLegacy(old.bookings || []); setError('');
      if (selected?._id) { const detail = await externalApi.call(`/vendor/external-bookings/${selected._id}`); if (current === generation.current) setSelected(previous => previous?._id === detail.booking._id ? detail.booking : previous); }
    } catch (err) { if (current === generation.current) setError(err.data?.message || err.message); }
    finally { if (current === generation.current) setLoading(false); }
  }
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('booking'); if (id) externalApi.call(`/vendor/external-bookings/${encodeURIComponent(id)}`).then(r => choose(r.booking)).catch(err => setError(err.data?.message || err.message)); }, []);
  useEffect(() => { refresh(); return () => { generation.current++; }; }, [filter, source]);
  async function act(work) {
    setBusy(true); setError(''); setMessage('');
    try { await work(); } catch (err) { setError([err.data?.message || err.message, ...(err.data?.conflicts || []).map(c => c.detail)].filter(Boolean).join(' · ')); } finally { setBusy(false); }
  }
  function choose(row) { setSelected(row); setStage(''); setReason(''); setHold(''); setEditing(false); setMessage(''); }
  async function applyAction(path, body) {
    const response = await externalApi.call(`/vendor/external-bookings/${selected._id}/${path}`, { method: 'POST', body: { ...body, idempotencyKey: requestKey({ id: selected._id, path, ...body }) } });
    setSelected(response.booking); await refresh(); return response.booking;
  }
  const lifecycle = selected?.externalBooking?.lifecycle || 'CONFIRMED';
  return <Page title="External bookings" sub="Manage work you acquired directly. All amounts are vendor-reported and separate from STARVNT revenue." action={<button className={`${button} bg-primary text-white`} onClick={() => { setSelected(null); setEditing(true); }}>Add external booking</button>}>
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm"><Link className="underline text-primary" to="/vendor/calendar">Unified calendar</Link><Link className="underline text-primary" to="/vendor/readiness">Business readiness</Link><button disabled={loading || busy} className="underline" onClick={() => refresh()}>Refresh</button></div>
      {error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status" className="text-green-700">{message}</p>}
      {summary && <section aria-label="All external booking totals" className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{[['Contracted value', summary.contractedAmount], ['Reported receipts', summary.reportedReceivedAmount], ['Reported refunds', summary.refundedAmount], ['Contract outstanding', summary.outstandingAmount]].map(([label, amount]) => <Card key={label}><p className="text-xs text-muted">{label} · all external bookings</p><p className="font-extrabold text-xl mt-1">{money(amount)}</p></Card>)}</section>}
      {editing && <Card><CommitmentForm key={selected?._id || 'new'} externalOnly initial={selected} services={services} resources={resources} onSaved={async row => { choose(row); setMessage('External booking saved.'); await refresh(); }} onCancel={() => setEditing(false)} /></Card>}
      <Card><div className="flex flex-wrap gap-3 mb-4"><label className="text-sm">Stage<select className="block border rounded-lg p-2" value={filter} onChange={e => setFilter(e.target.value)}><option value="">All stages</option>{Object.keys(EXTERNAL_STAGES).map(s => <option value={s} key={s}>{human(s)}</option>)}</select></label><label className="text-sm">Source<select className="block border rounded-lg p-2" value={source} onChange={e => setSource(e.target.value)}><option value="">All sources</option>{EXTERNAL_SOURCES.map(s => <option value={s} key={s}>{human(s)}</option>)}</select></label></div>
        {loading && <p role="status" className="text-sm">Refreshing external records…</p>}
        {!loading && rows.length === 0 && <p className="text-sm text-muted">No external bookings in this view.</p>}
        <div className="grid lg:grid-cols-2 gap-3">{rows.map(row => <button key={row._id} className={`border rounded-xl p-4 text-left min-w-0 ${selected?._id === row._id ? 'border-primary bg-primary-soft' : ''}`} onClick={() => choose(row)}><strong className="block break-words">{row.externalBooking?.eventName || row.external?.eventType || 'External event'} · {row.date}</strong><p className="text-sm break-words">{row.external?.customerName || 'Contact not supplied'} · {human(row.externalBooking.lifecycle)} · {human(row.externalBooking.acquisitionChannel)}</p><p className="text-xs mt-1">Value {money(row.financials.totalAmount)} · Outstanding {money(row.financials.outstandingAmount)}{row.financials.overdue && ' · overdue'}</p></button>)}</div>
        {next && <button className={`${button} mt-3`} disabled={loading} onClick={() => refresh(next)}>Load more</button>}
      </Card>
      {selected && !editing && <Card><div className="space-y-5">
        <div className="flex flex-wrap gap-3 justify-between"><div><h2 className="font-extrabold text-lg break-words">{selected.externalBooking.eventName || 'External booking'}</h2><p className="text-sm">{human(lifecycle)} · {human(selected.externalBooking.acquisitionChannel)} · vendor reported</p></div>{!['COMPLETED', 'CANCELLED'].includes(lifecycle) && <button className={button} onClick={() => setEditing(true)}>Edit / reschedule</button>}</div>
        <dl className="grid sm:grid-cols-2 gap-2 text-sm">{[['Customer', selected.external?.customerName || 'Not provided'], ['Phone', selected.external?.customerPhone || 'Not provided'], ['Event location', selected.external?.location || selected.serviceLocation?.city || 'Not provided'], ['Schedule', `${selected.date} to ${selected.endDate || selected.date} · ${selected.allDay ? 'all day' : `${selected.startTime}–${selected.endTime}`} (${selected.timezone})`], ['Received', money(selected.financials.receivedAmount)], ['Refunded', money(selected.financials.refundedAmount)], ['Net received', money(selected.financials.netReceivedAmount)], ['Payment state', human(selected.financials.paymentStatus)]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl>
        {Boolean(selected.externalBooking.lineItems?.length) && <ul className="text-sm list-disc pl-5">{selected.externalBooking.lineItems.map((item, i) => <li key={i}>{item.name} × {item.quantity} · {money(item.unitPrice)} per unit</li>)}</ul>}
        {EXTERNAL_STAGES[lifecycle]?.length > 0 && <form className="border rounded-xl p-3 grid sm:grid-cols-2 gap-3" onSubmit={e => { e.preventDefault(); act(async () => { await applyAction('lifecycle', { lifecycle: stage, reason, revision: selected.revision, ...(stage === 'ON_HOLD' ? { holdExpiresAt: new Date(hold).toISOString() } : {}) }); setStage(''); setReason(''); setMessage('Lifecycle saved with history.'); }); }}><label className="text-sm">Next stage<select required className="block w-full border rounded-lg p-2" value={stage} onChange={e => setStage(e.target.value)}><option value="">Choose action</option>{EXTERNAL_STAGES[lifecycle].map(s => <option key={s} value={s}>{human(s)}</option>)}</select></label><label className="text-sm">Reason<input required maxLength={500} className="block w-full border rounded-lg p-2" value={reason} onChange={e => setReason(e.target.value)} /></label>{stage === 'ON_HOLD' && <label className="text-sm">Hold expires<input required type="datetime-local" className="block border rounded-lg p-2" value={hold} onChange={e => setHold(e.target.value)} /></label>}<button className={button} disabled={busy || !stage}>Save lifecycle</button></form>}
        <form className="border rounded-xl p-3 grid sm:grid-cols-2 gap-3" onSubmit={e => { e.preventDefault(); act(async () => { await applyAction(payment.kind, { ...payment, amount: Number(payment.amount), receivedAt: new Date(payment.receivedAt).toISOString(), attachmentId: payment.attachmentId || null, revision: selected.revision }); setPayment({ ...payment, amount: '', reference: '', reason: '' }); setMessage('Vendor-reported money entry saved.'); }); }}>
          <h3 className="font-bold sm:col-span-2">Record receipt or refund</h3><label className="text-sm">Entry type<select className="block border rounded-lg p-2 w-full" value={payment.kind} onChange={e => setPayment({ ...payment, kind: e.target.value })}><option value="receipts">Receipt</option><option value="refunds">Refund</option></select></label>
          <label className="text-sm">Amount (₹)<input required type="number" min="0.01" step="0.01" className="block w-full border rounded-lg p-2" value={payment.amount} onChange={e => setPayment({ ...payment, amount: e.target.value })} /></label>
          <label className="text-sm">Payment method<select className="block w-full border rounded-lg p-2" value={payment.method} onChange={e => setPayment({ ...payment, method: e.target.value })}>{['BANK', 'UPI', 'CASH', 'OTHER'].map(m => <option key={m}>{m}</option>)}</select></label>
          <label className="text-sm">Transaction date<input required type="datetime-local" className="block w-full border rounded-lg p-2" value={payment.receivedAt} onChange={e => setPayment({ ...payment, receivedAt: e.target.value })} /></label>
          <label className="text-sm">Reference<input maxLength={160} className="block w-full border rounded-lg p-2" value={payment.reference} onChange={e => setPayment({ ...payment, reference: e.target.value })} /></label><label className="text-sm">Reason {payment.kind === 'refunds' ? '(required)' : '(optional)'}<input required={payment.kind === 'refunds'} maxLength={500} className="block w-full border rounded-lg p-2" value={payment.reason} onChange={e => setPayment({ ...payment, reason: e.target.value })} /></label>
          <label className="text-sm">Linked document<select className="block w-full border rounded-lg p-2" value={payment.attachmentId} onChange={e => setPayment({ ...payment, attachmentId: e.target.value })}><option value="">No attachment</option>{selected.externalBooking.attachments?.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}</select></label><button className={button} disabled={busy || (lifecycle === 'CANCELLED' && payment.kind === 'receipts')}>Save reported entry</button>
        </form>
        <section className="space-y-2"><h3 className="font-bold">Private invoices & receipts</h3><p className="text-xs text-muted">PDF, JPEG, PNG or WebP up to 10 MB. Downloads require your account.</p>
          <form className="flex flex-wrap gap-2 items-end" onSubmit={e => { e.preventDefault(); act(async () => { const body = new FormData(); body.append('file', file); body.append('kind', fileKind); body.append('idempotencyKey', requestKey({ id: selected._id, file: file.name, size: file.size, modified: file.lastModified, kind: fileKind })); const r = await externalApi.call(`/vendor/external-bookings/${selected._id}/attachments`, { method: 'POST', body }); setSelected(r.booking); setFile(null); setMessage('Private document attached.'); }); }}><label className="text-sm">Document purpose<select className="block border rounded-lg p-2" value={fileKind} onChange={e => setFileKind(e.target.value)}>{['INVOICE', 'RECEIPT', 'OTHER'].map(k => <option key={k}>{k}</option>)}</select></label><label className="text-sm max-w-full">File<input className="block max-w-full" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" required onChange={e => setFile(e.target.files?.[0] || null)} /></label><button className={button} disabled={busy || !file}>Attach document</button></form>
          {selected.externalBooking.attachments?.map(a => <button key={a._id} className={`${button} mr-2`} disabled={busy} onClick={() => act(async () => { const r = await externalApi.call(`/vendor/external-bookings/${selected._id}/attachments/${a._id}/download`); window.open(r.url, '_blank', 'noopener,noreferrer'); })}>{a.name}</button>)}
        </section>
        <section className="text-sm"><h3 className="font-bold mb-2">Reported payment history</h3>{[...(selected.externalBooking.receipts || []).map(r => ({ ...r, kind: 'receipt' })), ...(selected.externalBooking.refunds || []).map(r => ({ ...r, kind: 'refund' }))].map(r => <p className="break-words" key={`${r.kind}:${r.key}`}>{r.kind} · {money(r.amount)} · {r.method} · {new Date(r.receivedAt).toLocaleString()} · {r.reference || r.reason || 'No reference'}</p>)}</section>
        <details className="text-sm"><summary className="cursor-pointer font-bold min-h-11">Booking history</summary><ol className="space-y-2">{selected.history?.map((h, i) => <li key={i} className="border-b py-2 break-words">{human(h.action)} · {new Date(h.at).toLocaleString()} · {h.reason || 'Recorded change'}</li>)}</ol></details>
      </div></Card>}
      {legacy.length > 0 && <Card title="Legacy reported commitments"><p className="text-sm mb-3">Existing records are retained separately. Manage these in <Link className="underline" to="/vendor/calendar">Calendar</Link>.</p><ul className="text-sm space-y-2">{legacy.map(row => <li key={row._id}>{row.date} · {row.serviceName || 'Reported commitment'} · {human(row.status)}</li>)}</ul></Card>}
    </div>
  </Page>;
}
