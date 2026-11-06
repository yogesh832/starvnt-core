import { useState } from 'react';
import { Link } from 'react-router-dom';
import { customerApi, errorText } from './customerApi.js';

export default function SaveOptionButton({ eventId, option }) {
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try { await customerApi.saveFavorite({ eventId, optionId: option.id, vendorName: option.vendorName, packageName: option.packageName, category: option.category, price: option.price ?? null }); setSaved(true); }
    catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return <div className="space-y-2"><div className="flex flex-wrap gap-3"><button type="button" className="customer-secondary-action" disabled={busy || saved} onClick={save}>{busy ? 'Saving…' : saved ? 'Saved for later' : 'Save for later'}</button><Link className="customer-secondary-action" to={`/customer/favorites?event=${encodeURIComponent(eventId)}`}>Open saved items</Link></div><p className="text-xs text-muted">Saving does not send an enquiry or notify the vendor.</p>{error && <p role="alert" className="text-xs text-red-600">{error}</p>}</div>;
}
