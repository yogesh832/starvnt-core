import { useEffect, useRef, useState } from 'react';
import { externalApi } from '../lib/api.js';
import EventFeedbackCard from './EventFeedbackCard.jsx';

export default function ProductFeedback({ kind, reference }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState(null);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setScore(null); setMessage(''); setError(''); setBusy(true);
    externalApi.call(`/customer/feedback?${new URLSearchParams({ kind, reference })}`)
      .then(data => { if (generation.current === current) setScore(data.feedback?.score ?? null); })
      .catch(() => { if (generation.current === current) setError('Your previous rating could not be loaded. You can try submitting it again.'); })
      .finally(() => { if (generation.current === current) setBusy(false); });
    return () => { generation.current += 1; };
  }, [kind, reference]);
  async function rate(value) {
    const current = generation.current;
    setBusy(true); setMessage(''); setError('');
    try {
      const data = await externalApi.call('/customer/feedback', { method: 'POST', body: { kind, reference, score: value } });
      if (current === generation.current) { setScore(data.feedback.score); setMessage('Your feedback has been saved. Thank you.'); }
    } catch (err) {
      if (current === generation.current) setError(err.message || 'Your feedback could not be saved. Please try again.');
    } finally { if (current === generation.current) setBusy(false); }
  }
  if (kind === 'EVENT') return <EventFeedbackCard score={score} busy={busy} message={message} error={error} onRate={rate} />;

  return <div className="product-feedback space-y-3" aria-busy={busy}>
    <p className="text-sm font-semibold">{kind === 'NOTIFICATION' ? 'Was this notification useful?' : 'How helpful has planning this event been?'}</p>
    <div className="flex flex-wrap gap-2" role="group" aria-label={kind === 'NOTIFICATION' ? 'Notification usefulness' : 'Event planning rating'}>
      {(kind === 'NOTIFICATION' ? [1, 5] : [1, 2, 3, 4, 5]).map(value => <button type="button" key={value} disabled={busy} aria-pressed={score === value} className={`min-h-11 min-w-11 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${score === value ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-sky-700 dark:text-sky-200 dark:hover:bg-sky-900'}`} aria-label={kind === 'NOTIFICATION' ? value === 5 ? 'Helpful' : 'Not helpful' : `Rate ${value} out of 5`} onClick={() => rate(value)}>{kind === 'NOTIFICATION' ? value === 5 ? 'Helpful' : 'Not helpful' : value}</button>)}
    </div>
    {score !== null && <p className="text-xs text-muted">{kind === 'NOTIFICATION' ? `Your response: ${score === 5 ? 'Helpful' : 'Not helpful'}.` : `Your rating: ${score} out of 5.`} You can change your response.</p>}
    {message && <p className="text-sm" role="status">{message}</p>}
    {error && <p className="text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}
  </div>;
}
