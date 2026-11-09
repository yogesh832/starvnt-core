import { useState } from 'react';
import { externalApi } from '../lib/api.js';
import EventFeedbackCard from './EventFeedbackCard.jsx';

export default function ProductFeedback({ kind, reference }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState(null);
  const [error, setError] = useState('');

  async function rate(value) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await externalApi.call('/customer/feedback', { method: 'POST', body: { kind, reference, score: value } });
      setScore(value);
      setMessage('Feedback saved. Thank you.');
    } catch (err) {
      setError(err.message || 'Your feedback could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (kind === 'EVENT') return <EventFeedbackCard score={score} busy={busy} message={message} error={error} onRate={rate} />;

  return (
    <div className="text-xs space-y-2">
      <span>Was this notification useful?</span>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="border rounded-lg px-3 py-2" onClick={() => rate(1)}>Not helpful</button>
        <button type="button" disabled={busy} className="border rounded-lg px-3 py-2" onClick={() => rate(5)}>Helpful</button>
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
