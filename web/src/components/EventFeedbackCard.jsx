import { useId } from 'react';
import Icon from './Icon.jsx';
import './eventFeedback.css';

const ratings = [1, 2, 3, 4, 5];

export default function EventFeedbackCard({ score, busy, message, error, onRate }) {
  const titleId = useId();

  return (
    <section className="event-feedback" aria-labelledby={titleId}>
      <div className="event-feedback-heading">
        <span className="event-feedback-mark" aria-hidden="true"><Icon name="sparkles" size={22} /></span>
        <div>
          <p className="event-feedback-eyebrow">PLANNING FEEDBACK</p>
          <h2 id={titleId}>How helpful has planning this event been?</h2>
        </div>
        {score !== null && <span className="event-feedback-score" aria-label={`Your rating: ${score} out of 5`}>{score} / 5</span>}
      </div>

      <div className="event-feedback-ratings" role="group" aria-label="Event planning rating" aria-busy={busy}>
        {ratings.map(value => (
          <button
            key={value}
            type="button"
            data-filled={score !== null && value <= score}
            aria-pressed={score === value}
            aria-label={`Rate ${value} out of 5`}
            disabled={busy}
            onClick={() => onRate(value)}
          >
            <span aria-hidden="true"><Icon name="star" size={22} /></span>
            <span aria-hidden="true">{value}</span>
          </button>
        ))}
      </div>
      <div className="event-feedback-scale" aria-hidden="true"><span>Not helpful</span><span>Very helpful</span></div>

      <div className="event-feedback-status" role="status">
        {busy ? 'Updating feedback…' : message ? (
          <span className="event-feedback-saved"><Icon name="check" size={15} />{message}</span>
        ) : score !== null ? 'Choose another star to update your rating.' : 'Choose a star to rate your experience.'}
      </div>
      {error && <p className="event-feedback-error" role="alert">{error}</p>}
    </section>
  );
}
