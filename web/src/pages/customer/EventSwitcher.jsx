import { useNavigate } from 'react-router-dom';
import { useCurrentEvent } from './currentEvent.jsx';

export default function EventSwitcher() {
  const { events, current, setCurrent, loading, error } = useCurrentEvent();
  const navigate = useNavigate();
  if (loading) return <span className="customer-event-context" role="status">Loading events…</span>;
  if (error) return <span className="customer-event-context" role="status">Event list unavailable</span>;
  if (!events.length) return <span className="customer-event-context">No event yet</span>;
  return <label className="customer-event-context">
    <span>Selected event</span>
    <select aria-label="Selected event" value={current?.id || ''} onChange={event => {
      setCurrent(event.target.value);
      navigate('/customer');
    }}>
      {!current && <option value="" disabled>Select your event</option>}
      {events.map(event => <option key={event.id} value={event.id}>{event.title || event.eventTypeLabel || 'Untitled event'}{event.status === 'completed' ? ' (completed)' : event.status === 'cancelled' ? ' (cancelled)' : ''}</option>)}
    </select>
  </label>;
}
