import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { customerApi, errorText } from './customerApi.js';

/**
 * The customer's explicit choice. Selecting is not reserving or booking:
 * the plan item stays "pending" until a quote is accepted and paid.
 */
export default function SelectOptionButton({ eventId, eventStatus, option, selected, onChanged, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const unavailable = option.availability === 'blocked' || option.availability === 'booked';
  const reason =
    eventStatus === 'draft' ? 'Confirm your event details first'
      : unavailable ? 'Not available on your date'
        : option.price == null ? 'No fixed total to quote yet'
          : null;

  async function run(optionId) {
    setBusy(true);
    setError('');
    try {
      await customerApi.selectOption(eventId, option.category, optionId);
      onChanged?.(optionId);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const size = compact ? 'text-[11px] px-2.5 py-1.5' : 'text-xs px-4 py-2';
  if (selected) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-xl bg-emerald-50 text-emerald-700 font-bold ${size}`}><Icon name="check" size={12} /> Selected</span>
          <button disabled={busy} onClick={() => run(null)} className="text-[11px] font-bold text-muted hover:text-red-500 disabled:opacity-50">Remove</button>
        </div>
        {error && <span className="text-[10px] text-red-500">{error}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        disabled={busy || Boolean(reason)}
        onClick={() => run(option.id)}
        title={reason || 'Choose this option'}
        className={`rounded-xl bg-primary hover:bg-primary-dark text-white font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${size}`}
      >
        {busy ? 'Selecting…' : 'Select'}
      </button>
      {(error || (reason && !compact)) && <span className="text-[10px] text-muted">{error || reason}</span>}
    </div>
  );
}
