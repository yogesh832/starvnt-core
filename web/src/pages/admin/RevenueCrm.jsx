import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../lib/api.js';

export default function RevenueCrm() {
  const [data, setData] = useState({ leads: [], owners: [] });
  const [report, setReport] = useState(null);
  const [selected, setSelected] = useState('');
  const [form, setForm] = useState({ owner: '', stage: 'NEW', notes: '', lostReason: '', reportedValue: '', dueDate: '', title: '' });
  const [detail, setDetail] = useState(null);
  const [options, setOptions] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const intent = useRef(null);
  const load = useCallback(async () => {
    const [leads, metrics] = await Promise.all([adminApi.call('/crm'), adminApi.call('/crm/report?days=30')]);
    setData(leads); setReport(metrics);
  }, []);
  useEffect(() => { load().catch(err => setError(err.message)); }, [load]);
  const lead = data.leads.find(item => item._id === selected);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  async function act(path, body) {
    setBusy(true); setError('');
    const fingerprint = JSON.stringify({ path, body });
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await adminApi.call(path, { method: 'POST', body: { ...body, idempotencyKey: intent.current.key } });
      intent.current = null;
      await load();
      if (selected) setDetail(await adminApi.call(`/crm/${selected}`));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const field = 'rounded-lg border p-2 w-full text-sm';
  const button = 'rounded-lg border px-3 py-2 text-sm disabled:opacity-40';
  return <section className="space-y-4">
    <h1 className="text-xl font-bold">Revenue CRM</h1>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {report?.available && <div className="rounded-xl border bg-white p-4 space-y-2 text-sm">
      <p>Last 30 days of demand · {report.denominator} leads · {report.convertedLeads} verified conversions · {report.conversionRate == null ? 'Insufficient data' : `${(report.conversionRate * 100).toFixed(1)}%`}</p>
      <p>Reported value ₹{report.reportedLeadValue} · Contracted ₹{report.contractedValue} · Verified collections ₹{report.verifiedCollections}</p>
      <p>Refunds ₹{report.refunds} · Settlement releases ₹{report.settlementReleases} · Contracted platform fees ₹{report.contractedPlatformFees} · Recognized revenue: {report.recognizedPlatformRevenue == null ? 'Awaiting accounting policy' : `₹${report.recognizedPlatformRevenue}`}</p>
      <p>{report.definitions}</p>
    </div>}
    <label className="block text-sm">Assigned demand<select className={field} value={selected} onChange={event => {
      const row = data.leads.find(item => item._id === event.target.value);
      setSelected(event.target.value);
      setForm(current => ({ ...current, owner: row?.crm?.owner || '', stage: row?.crm?.stage || 'NEW', reportedValue: row?.crm?.reportedValue ?? '' }));
      if (row) adminApi.call(`/crm/${row._id}`).then(setDetail).catch(err => setError(err.message));
    }}><option value="">Choose a lead</option>{data.leads.map(item => <option key={item._id} value={item._id}>{item.eventDetails?.title || item.eventDetails?.eventType} · {item.category} · {item.crm?.stage || 'NEW'}</option>)}</select></label>
    {lead && <div className="rounded-xl border bg-white p-4 space-y-3">
      <Link className="underline" to="/admin/events">Event and requirement records</Link>
      <label className="block text-sm">Sales owner<select className={field} value={form.owner} onChange={event => set('owner', event.target.value)}><option value="">Assign an owner</option>{data.owners.map(owner => <option key={owner._id} value={owner._id}>{owner.fullName || owner.email}</option>)}{!data.owners.length && form.owner && <option>{form.owner}</option>}</select></label>
      <label className="block text-sm">Pipeline stage<select className={field} value={form.stage} onChange={event => set('stage', event.target.value)}>{['NEW', 'QUALIFIED', 'SOURCING', 'QUOTED', 'CONVERTED', 'LOST'].map(stage => <option key={stage}>{stage}</option>)}</select></label>
      <label className="block text-sm">Reported lead value<input className={field} type="number" min="0" value={form.reportedValue} onChange={event => set('reportedValue', event.target.value)} /></label>
      <label className="block text-sm">Activity notes<textarea className={field} value={form.notes} onChange={event => set('notes', event.target.value)} /></label>
      {form.stage === 'LOST' && <label className="block text-sm">Lost or declined reason<input className={field} value={form.lostReason} onChange={event => set('lostReason', event.target.value)} /></label>}
      <button className={button} disabled={busy} onClick={() => act(`/crm/${selected}`, { ...form, reportedValue: Number(form.reportedValue || 0), expectedVersion: lead.__v })}>Save pipeline activity</button>
      <p className="text-sm">{detail?.opportunities?.length || 0} linked vendor enquiries · {detail?.quotes?.length || 0} quotes · {detail?.bookings?.length || 0} Core bookings</p>
      <button className={button} disabled={busy} onClick={async () => { setBusy(true); try { setOptions((await adminApi.call(`/crm/${selected}/options`)).options || []); } catch (err) { setError(err.message); } finally { setBusy(false); } }}>Find eligible services</button>
      {options.map(option => <div className="border p-3 rounded-lg text-sm" key={option.id}><p>{option.vendorName} · {option.packageName} · {option.price == null ? 'Price pending' : `₹${option.price} estimate`}</p><button className={button} disabled={busy} onClick={() => act(`/crm/${selected}/source`, { optionId: option.id })}>Request vendor quote</button></div>)}
      <p className="text-sm">The customer chooses the confirmed quote and pays through the normal booking flow.</p>
      <label className="block text-sm">Next follow-up action<input className={field} value={form.title} onChange={event => set('title', event.target.value)} /></label>
      <label className="block text-sm">Due date and time<input className={field} type="datetime-local" value={form.dueDate} onChange={event => set('dueDate', event.target.value)} /></label>
      <button className={button} disabled={busy || !form.dueDate || !form.title} onClick={() => act(`/crm/${selected}/followups`, { title: form.title, dueDate: new Date(form.dueDate).toISOString(), notes: form.notes })}>Schedule follow-up</button>
      {lead.followUps.map(item => <div className="rounded-lg border p-3 text-sm" key={item._id}><p>{item.title} · {new Date(item.dueDate).toLocaleString()} · {item.status}</p><button className={button} disabled={busy || !form.notes || item.status === 'COMPLETED'} onClick={() => act(`/crm/followups/${item._id}/complete`, { notes: form.notes })}>Record follow-up outcome</button></div>)}
      {(lead.crm?.history || []).map(item => <p className="text-sm" key={item.key}>{item.from} → {item.to} · {item.notes}</p>)}
    </div>}
  </section>;
}
