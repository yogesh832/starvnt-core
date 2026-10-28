import { useState } from 'react';
import { externalApi } from '../lib/api.js';
export default function ProductFeedback({ kind, reference }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="text-xs space-y-2"><span>{kind === 'NOTIFICATION' ? 'Was this notification useful?' : 'How helpful has planning this event been?'}</span><div className="flex flex-wrap gap-2">{(kind === 'NOTIFICATION' ? [1, 5] : [1, 2, 3, 4, 5]).map(score => <button key={score} disabled={busy} className="border rounded-lg px-3 py-2" aria-label={kind === 'NOTIFICATION' ? score === 5 ? 'Helpful' : 'Not helpful' : `Rate ${score} out of 5`} onClick={async () => { setBusy(true); try { await externalApi.call('/customer/feedback', { method: 'POST', body: { kind, reference, score } }); setMessage('Feedback saved. Thank you.'); } catch (err) { setMessage(err.message); } finally { setBusy(false); } }}>{kind === 'NOTIFICATION' ? score === 5 ? 'Helpful' : 'Not helpful' : score}</button>)}</div>{message && <p role="status">{message}</p>}</div>;
}
