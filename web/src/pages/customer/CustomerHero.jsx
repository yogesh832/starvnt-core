import AuraMark from '../../components/AuraMark.jsx';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';

const ideas = [
  ['heart', "My daughter’s wedding", "My daughter's wedding"],
  ['gift', 'Plan my birthday', 'Plan my birthday'],
  ['customers', 'Corporate event', 'Corporate event for 300 people'],
  ['sparkles', 'Arrange a Puja', 'Arrange a Puja'],
];
export default function CustomerHero({ firstName, eventId }) {
  const [text, setText] = useState('');
  const navigate = useNavigate();
  function ask(value) {
    if (!value.trim()) return;
    const query = new URLSearchParams({ ask: value.trim() });
    if (eventId) query.set('event', eventId);
    navigate(`/customer/aura?${query}`);
  }
  return <>
    <section className="customer-hero" aria-label="Plan your event">
      <div className="customer-hero-orbit customer-hero-orbit-one" aria-hidden="true" />
      <div className="customer-hero-orbit customer-hero-orbit-two" aria-hidden="true" />
      <div className="customer-hero-content">
        <p className="customer-hero-welcome">Welcome{eventId ? ' back' : ''}, <b>{firstName}</b> <span aria-hidden="true">👋</span></p>
        <h1><span className="customer-hero-desktop-title">Let’s plan something amazing.</span><span className="customer-hero-mobile-title">What shall we<br />plan today?</span></h1>
        <p className="customer-hero-description">Tell us what you’re planning — we’ll handle the rest.</p>
        <form className="customer-hero-input" onSubmit={event => { event.preventDefault(); ask(text); }}>
          <AuraMark size={25} />
          <input aria-label="Describe your event" value={text} onChange={event => setText(event.target.value)} placeholder="Describe your event (e.g. birthday, wedding, corporate event...)" />
          <button type="submit" aria-label="Plan with Aura+"><Icon name="arrowRight" size={20} /></button>
        </form>
        <div className="customer-hero-ideas" aria-label="Event ideas">{ideas.map(([icon, label, prompt]) => <button key={label} type="button" onClick={() => ask(prompt)}><Icon name={icon} size={15} /><span>{label}</span></button>)}</div>
      </div>
      <div className="customer-hero-note">From ideas<br />to unforgettable<br />experiences <AuraMark size={22} /></div>
    </section>
    <Link className="customer-aura-mobile" to={`/customer/aura${eventId ? `?event=${eventId}` : ''}`}><span className="customer-aura-gem"><AuraMark variant="orb" size={52} /></span><span><b>Aura+</b><small>Your event assistant</small></span><span className="customer-aura-next"><Icon name="chevronRight" size={20} /></span></Link>
  </>;
}
