import { useState } from 'react';
import { externalApi } from '../lib/api.js';
export default function ServiceResources({ services, resources, onSaved }) {
  const [selected, setSelected] = useState(null);
  const [ids, setIds] = useState([]);
  const [setup, setSetup] = useState(45);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return <section className="bg-white rounded-2xl border p-4 space-y-3 text-sm"><h2 className="font-extrabold">Service resources & setup buffers</h2><p className="text-xs text-muted">Declare dedicated resources so a resource-specific block affects the services that need it.</p>
    <label>Service<select className="block border rounded-lg p-2" value={selected?._id || ''} onChange={e => { const service = services.find(s => s._id === e.target.value); setSelected(service || null); setIds(service?.requiredResourceIds || []); setSetup(service?.setupBufferMinutes ?? 45); setMessage(''); }}><option value="">Choose service</option>{services.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select></label>
    {selected && <><fieldset><legend>Dedicated resources</legend>{resources.map(r => <label key={r._id} className="flex gap-2 p-1"><input type="checkbox" checked={ids.map(String).includes(String(r._id))} onChange={e => setIds(e.target.checked ? [...ids, r._id] : ids.filter(id => String(id) !== String(r._id)))} />{r.name}</label>)}</fieldset><label>Setup / teardown buffer (minutes)<input type="number" min="0" max="1440" className="border rounded-lg p-2 ml-2" value={setup} onChange={e => setSetup(e.target.value)} /></label><button disabled={busy} className="border rounded-lg px-3 py-2" onClick={async () => { setBusy(true); try { await externalApi.call(`/vendor/services/${selected._id}/resources`, { method: 'PUT', body: { requiredResourceIds: ids, setupBufferMinutes: Number(setup) } }); setMessage('Service resources saved.'); onSaved(); } catch (err) { setMessage(err.message); } finally { setBusy(false); } }}>Save service resources</button></>}
    {message && <p role="status">{message}</p>}
  </section>;
}
