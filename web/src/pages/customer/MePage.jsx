import Icon from '../../components/Icon.jsx';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useExternalAuth } from '../../auth/ExternalAuthContext.jsx';
import { customerApi, errorText } from './customerApi.js';
import { useLoad } from './customerUi.jsx';
import { eventCounts } from './accountState.js';
import AccountEventHistory from './AccountEventHistory.jsx';
import './profile.css';

const LINKS = [
  ['documents', 'Documents', 'Your important event records', '/customer/documents'],
  ['heart', 'Saved items', 'The ideas you want to keep', '/customer/favorites'],
  ['quotes', 'Proposals', 'Review the details together', '/customer/proposals'],
  ['message', 'Messages & updates', 'Stay close to every conversation', '/customer/updates'],
  ['bell', 'Reminders', 'A little help staying on track', '/customer/reminders'],
  ['settings', 'Settings', 'Privacy and notification preferences', '/customer/settings'],
  ['profile', 'Relationships & feedback', 'Your Customer 360', '/customer/customer-360'],
];

export default function MePage({ user, logout }) {
  const profile = useLoad(() => customerApi.profile(), []), events = useLoad(() => customerApi.events(), []);
  const { refreshIdentity } = useExternalAuth();
  const [editing, setEditing] = useState(false), [fullName, setFullName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [photo, setPhoto] = useState(null), [photoPreview, setPhotoPreview] = useState(''), [photoBusy, setPhotoBusy] = useState(false), [photoError, setPhotoError] = useState(''), [photoMessage, setPhotoMessage] = useState('');
  const editButton = useRef(null), nameInput = useRef(null), photoInput = useRef(null);
  const p = profile.data?.profile || user, counts = eventCounts(events.data?.events);
  useEffect(() => {
    if (!photo) { setPhotoPreview(''); return; }
    const url = URL.createObjectURL(photo); setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  function choosePhoto(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setPhotoError(''); setPhotoMessage('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setPhotoError('Choose a JPEG, PNG or WebP photo.'); return; }
    if (file.size > 5 * 1024 * 1024) { setPhotoError('Choose a photo smaller than 5 MB.'); return; }
    setPhoto(file);
  }
  async function changePhoto(remove = false) {
    setPhotoBusy(true); setPhotoError(''); setPhotoMessage('');
    try {
      const result = remove ? await customerApi.removeProfilePhoto() : await customerApi.uploadProfilePhoto(photo);
      profile.setData(result); setPhoto(null); setPhotoMessage(remove ? 'Profile photo removed.' : 'Your new photo is saved.');
      try { await refreshIdentity(); } catch { setPhotoMessage('Your photo is saved. Refresh to update the account menu.'); }
    } catch (err) { setPhotoError(errorText(err)); }
    finally { setPhotoBusy(false); }
  }
  function closeEditor() { setEditing(false); requestAnimationFrame(() => editButton.current?.focus()); }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = await customerApi.patchProfile({ fullName: fullName.trim() });
      profile.setData(result); closeEditor(); setMessage('Your name has been saved.');
      try { await refreshIdentity(); } catch { setMessage('Your name is saved. Refresh to update the account menu.'); }
    } catch (err) { setError(err?.data?.fields ? Object.values(err.data.fields).join(' · ') : errorText(err)); }
    finally { setBusy(false); }
  }
  return <div className="customer-account profile-page">
    <div className="profile-page-heading"><div><p className="profile-kicker">MY ACCOUNT</p><h1>A little more you.</h1><p>Your details, your plans, your space.</p></div><Link to="/customer/settings" className="profile-icon-button" aria-label="Account settings"><Icon name="settings" size={20} /></Link></div>
    <section className="profile-identity" aria-label="Your profile">
      <div className="profile-cover"><span>Every great event starts with you.</span><span className="profile-cover-spark" aria-hidden="true">✦</span></div>
      <div className="profile-identity-body">
        <div className="profile-avatar-row"><div className="profile-avatar-wrap">
          {photoPreview || p?.avatarUrl ? <img className="profile-avatar" src={photoPreview || p.avatarUrl} alt={photoPreview ? 'New profile photo preview' : 'Your profile photo'} /> : <div className="profile-avatar profile-initials" aria-hidden="true">{p?.fullName?.[0]?.toUpperCase() || '?'}</div>}
          <button type="button" className="profile-camera" disabled={photoBusy || busy} aria-label="Change profile photo" onClick={() => photoInput.current?.click()}><Icon name="camera" size={17} /></button>
          <input ref={photoInput} className="sr-only" tabIndex={-1} type="file" aria-label="Choose profile photo" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} disabled={photoBusy || busy} />
        </div><button ref={editButton} disabled={profile.loading || Boolean(profile.error) || !profile.data || busy || photoBusy} className="profile-edit-button" onClick={() => { setFullName(p?.fullName || ''); setError(''); setMessage(''); setEditing(true); requestAnimationFrame(() => nameInput.current?.focus()); }}><Icon name="edit" size={15} /> Edit profile</button></div>
        <div className="profile-name"><h2>{p?.fullName || 'Your profile'}</h2><span>STARVNT customer</span></div>
        <div className="profile-photo-tools"><button type="button" disabled={photoBusy || busy} onClick={() => photoInput.current?.click()}>{p?.avatarUrl ? 'Change photo' : 'Add a profile photo'}</button>{p?.avatarUrl && !photo && <button type="button" disabled={photoBusy || busy} onClick={() => changePhoto(true)}>Remove</button>}<small>JPG, PNG or WebP · up to 5 MB</small></div>
        {photo && <div className="profile-photo-preview-actions"><p className="text-sm">Looking good? Save your new photo.</p><div className="flex flex-wrap gap-2"><button type="button" className="customer-primary-action" disabled={photoBusy || busy} onClick={() => changePhoto()}>{photoBusy ? 'Uploading photo…' : 'Save photo'}</button><button type="button" className="customer-secondary-action" disabled={photoBusy || busy} onClick={() => { setPhoto(null); setPhotoError(''); }}>Cancel photo</button></div></div>}
        {photoBusy && !photo && <p role="status" className="text-sm">Updating your photo…</p>}{photoError && <p role="alert" className="profile-error">{photoError}</p>}{photoMessage && <p role="status" className="profile-success">{photoMessage}</p>}
        <div className="profile-contact-grid"><div><span>Email address</span><p>{p?.email || 'Not added yet'}</p></div><div><span>Mobile number</span><p>{p?.phone || 'Not added yet'}</p><Link to="/customer/settings">{p?.phone ? 'Manage verification' : 'Add & verify mobile'} <Icon name="arrowRight" size={13} /></Link></div></div>
        {profile.loading && <p role="status" className="text-sm">Loading your saved profile…</p>}{profile.error && <p role="alert" className="profile-error">Your saved profile could not be refreshed. <button type="button" onClick={profile.reload}>Try again</button></p>}
        {editing && <form onSubmit={save} className="profile-name-editor"><label className="block text-sm font-semibold">Your name<input ref={nameInput} className="account-field" required maxLength={120} autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} /></label><p className="text-xs text-muted">Manage mobile verification and privacy in account settings.</p>{error && <p role="alert" className="profile-error">{error}</p>}<div className="flex flex-wrap gap-2"><button className="customer-primary-action" disabled={busy || photoBusy || !fullName.trim()}>{busy ? 'Saving…' : 'Save changes'}</button><button type="button" className="customer-secondary-action" disabled={busy} onClick={closeEditor}>Cancel edit</button></div></form>}
        {message && <p role="status" className="profile-success">{message}</p>}
      </div>
    </section>
    <section className="profile-event-totals" aria-label="Saved event counts">{[['Events', counts?.total], ['Active', counts?.active], ['Completed', counts?.completed], ['Cancelled', counts?.cancelled]].map(([label, value]) => <div key={label}><strong>{value ?? '—'}</strong><span>{label}</span></div>)}</section>
    <section aria-labelledby="profile-essentials-title"><div className="profile-section-heading"><div><h2 id="profile-essentials-title">Everything, in one place.</h2><p>Pick up wherever you left off.</p></div></div><div className="profile-links">{LINKS.map(([icon, label, detail, to]) => <Link key={to} to={to}><span className="profile-link-icon"><Icon name={icon} size={21} /></span><span><b>{label}</b><small>{detail}</small></span><Icon name="chevronRight" size={17} /></Link>)}</div></section>
    <section className="profile-history">{events.loading && <p role="status">Loading your event history…</p>}{events.error && <p role="alert" className="profile-error">Event history could not be refreshed. <button onClick={events.reload}>Try again</button></p>}{events.data && <AccountEventHistory events={events.data.events || []} />}</section>
    <div className="profile-footer"><Link to="/customer/events/new">Plan something new <Icon name="arrowRight" size={16} /></Link><button type="button" onClick={logout}>Log out</button></div>
  </div>;
}
