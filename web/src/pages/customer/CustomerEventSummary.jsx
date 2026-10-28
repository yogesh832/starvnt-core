import AuraMark from '../../components/AuraMark.jsx';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { EventStatusPill, ProgressRing, StepTracker, categoryIcon } from './customerUi.jsx';
import { budgetText, formatDate, formatINR, planStatus } from './format.js';

export default function CustomerEventSummary({ event, summary, steps, payments = [], onEdit, children }) {
  const paid = summary?.budget?.paidAmount ?? payments.filter(payment => payment.status === 'verified').reduce((total, payment) => total + payment.amount, 0);
  const venue = (summary?.items || []).find(item => item.category === 'venue');
  const tiles = venue ? [venue] : event.status === 'draft' ? [{ category: 'venue', label: 'Venue', status: 'missing', optionCount: null }] : (summary?.items || []).filter(item => item.tier === 'essential').slice(0, 1);
  const meta = [['calendar', formatDate(event.eventDate)], ['mapPin', event.locationLabel || event.city], ['customers', event.guestCount ? `${event.guestCount} guests` : null], ['wallet', budgetText(event)]];
  const editClass = 'customer-event-edit';
  return <section className="customer-event-summary" aria-label="Current event summary">
    <div className="customer-event-heading">
      <span className="customer-event-emblem"><Icon name="party" size={30} /></span>
      <div className="customer-event-name"><h2>{event.title || event.eventTypeLabel || 'Your event'}</h2><EventStatusPill status={event.status} /></div>
      {['draft', 'planning'].includes(event.status) && (onEdit ? <button type="button" onClick={onEdit} className={editClass}><Icon name="edit" size={16} /> Edit</button> : <Link to={`/customer/events/${event.id}?edit=1`} className={editClass}><Icon name="edit" size={16} /> Edit</Link>)}
    </div>
    <div className="customer-event-meta">{meta.map(([icon, value]) => <span key={icon}><Icon name={icon} size={17} />{value || { calendar: 'Date not set', mapPin: 'Location not set', customers: 'Guests not set', wallet: 'Budget not set' }[icon]}</span>)}</div>
    <div className="customer-event-steps"><StepTracker steps={steps || event.steps || []} /></div>
    {!!tiles.length && <div className="customer-event-services">{tiles.map(item => {
      const state = planStatus(item);
      const open = ['missing', 'pending'].includes(item.status);
      const detail = open && !item.selectedOption ? item.optionCount == null ? 'Confirm details to see options' : item.optionCount ? `${item.optionCount} options` : 'No options yet' : state.text;
      return <Link key={item.category} to={open ? `/customer/events/${event.id}/services?category=${item.category}` : `/customer/events/${event.id}/requirements`} className="customer-event-service"><span className="customer-event-tile-icon"><Icon name={categoryIcon(item.category)} size={24} /></span><span><small>{item.label}</small><b className={open ? 'customer-event-pending' : ''}>{detail}</b></span><Icon name="chevronRight" size={20} /></Link>;
    })}</div>}
    <div className="customer-event-footer">
      <Link className="customer-event-stat" to={`/customer/events/${event.id}/bookings`}><span className="customer-event-tile-icon"><Icon name="payments" size={26} /></span><span><small>Payment</small><b>{paid ? `${formatINR(paid)} paid` : 'Nothing paid yet'}</b></span></Link>
      <div className="customer-event-stat"><ProgressRing percent={summary?.progressPercent ?? event.progressPercent ?? 0} size={62} label="" /><span><small>Event readiness</small><span>{(summary?.progressPercent ?? event.progressPercent ?? 0) === 100 ? 'Your event plan is complete' : (summary?.progressPercent ?? event.progressPercent ?? 0) > 0 ? 'Your plan is taking shape' : 'Let’s get started'}</span></span></div>
      <Link className="customer-event-assistant" to={`/customer/aura?event=${event.id}`}><AuraMark size={44} /><span><b>Your Event Assistant</b><small>Aura+ is with you throughout</small></span><Icon name="chevronRight" size={20} /></Link>
    </div>
    {children && <div className="customer-event-details">{children}</div>}
  </section>;
}
