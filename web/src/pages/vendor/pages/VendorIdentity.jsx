import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { externalApi } from '../../../lib/api.js';
import { Card, Page } from './shared.jsx';

const button = 'inline-flex items-center justify-center rounded-xl border px-4 min-h-11 text-sm font-semibold disabled:opacity-50';
const field = 'w-full min-h-11 rounded-lg border px-3 text-sm';
const endpoint = '/vendor/profile/social-links';

export default function VendorIdentity({ share = false }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState(null);

  useEffect(() => {
    let current = true;
    externalApi.call(endpoint).then(value => {
      if (current) setProfile(value);
    }).catch(error => {
      if (current) setError(error.message);
    });
    return () => { current = false; };
  }, []);

  async function act(work) {
    setBusy(true);
    setError('');
    setStatus('');
    try { await work(); }
    catch (error) { if (error.name !== 'AbortError') setError(error.message); }
    finally { setBusy(false); }
  }

  function setLinks(links) {
    setProfile(previous => ({ ...previous, links }));
  }

  function updateLink(index, change) {
    setLinks(profile.links.map((link, position) => position === index ? { ...link, ...change } : link));
  }

  async function save(event) {
    event.preventDefault();
    await act(async () => {
      const { revision, publishProfile, links } = profile;
      const saved = await externalApi.call(endpoint, { method: 'PUT', body: { revision, publishProfile, links } });
      setProfile(saved);
      setStatus('Social links and profile visibility saved.');
    });
  }

  const available = profile?.platforms.filter(platform => !profile.links.some(link => link.platform === platform.id)) || [];
  const url = profile?.url;
  const shareData = { title: 'Find my business on STARVNT', text: 'Discover this event professional on STARVNT.', url };
  return <Page title={share ? 'Share Your Business' : 'Social Media Links'}
    sub={share ? 'Preview and share your published business profile.' : 'Choose which social links customers can open from your public profile.'}>
    <nav className="flex flex-wrap gap-4 text-sm">
      <Link className="underline text-primary" to="/vendor/profile">Profile & Hub</Link>
      <Link className="underline text-primary" to="/vendor/profile/social-links">Social Media Links</Link>
      <Link className="underline text-primary" to="/vendor/share">Share Your Business</Link>
    </nav>
    {error && <p role="alert" className="text-sm text-red-700">{error} <button type="button" className="underline"
      onClick={() => act(async () => { setProfile(await externalApi.call(endpoint)); setQr(null); })}>Reload saved profile</button></p>}
    {status && <p role="status" className="text-sm text-ink">{status}</p>}
    {!profile && !error && <p role="status">Loading profile settings…</p>}
    {profile && (share ? <Card title="Public business profile">
      {!url ? <p className="text-sm text-muted">{profile.reason || 'Publish your profile in Social Media Links to start sharing.'}</p> : <div className="space-y-3">
        <label className="block text-sm">Public link<input className={`mt-1 ${field}`} value={url} readOnly onFocus={event => event.target.select()} /></label>
        <div className="flex flex-wrap gap-2">
          <a className={button} href={url} target="_blank" rel="noopener noreferrer">Preview profile</a>
          {navigator.clipboard?.writeText && <button type="button" className={button} disabled={busy} onClick={() => act(async () => {
            await navigator.clipboard.writeText(url);
            setStatus('Public link copied.');
          })}>Copy link</button>}
          {navigator.share && <button type="button" className={button} disabled={busy}
            onClick={() => act(() => navigator.share(shareData))}>Share link</button>}
          <button type="button" className={button} disabled={busy} onClick={() => act(async () => {
            setQr(await externalApi.call('/vendor/profile/share-qr', { method: 'POST' }));
          })}>Generate QR</button>
        </div>
        {qr?.url === url && <div className="space-y-2">
          <img src={qr.qrDataUrl} width="240" height="240" className="max-w-full" alt="QR code for your STARVNT public profile" />
          <a className={button} href={qr.qrDataUrl} download="starvnt-business-profile-qr.png">Download QR</a>
        </div>}
      </div>}
    </Card> : <Card title="Profile links and visibility">
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-muted">Your published profile shows your business name, category and the links you mark public. Review contact links before sharing them.</p>
        {profile.links.length === 0 && <p className="text-sm text-muted">Add a social profile to show customers where to find you.</p>}
        {profile.links.map((link, index) => {
          const label = profile.platforms.find(platform => platform.id === link.platform)?.label || link.platform;
          return <fieldset key={index} className="space-y-2 rounded-xl border p-3">
            <legend className="px-1 text-sm font-bold">{label}</legend>
            <label className="block text-sm">Platform
              <select value={link.platform} className={field} disabled={busy} onChange={event => updateLink(index, { platform: event.target.value })}>
                <option value={link.platform}>{label}</option>
                {available.map(platform => <option key={platform.id} value={platform.id}>{platform.label}</option>)}
              </select>
            </label>
            <label className="block text-sm">{label} profile URL
              <input type="url" maxLength={1024} required disabled={busy} value={link.url} className={field}
                onChange={event => updateLink(index, { url: event.target.value })} />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" disabled={busy} checked={link.public} onChange={event => updateLink(index, { public: event.target.checked })} />
                Display publicly
              </label>
              <button type="button" className={button} disabled={busy}
                onClick={() => setLinks(profile.links.filter((_, position) => position !== index))}>Remove {label}</button>
            </div>
          </fieldset>;
        })}
        <button type="button" className={button} disabled={busy || !available.length}
          onClick={() => setLinks([...profile.links, { platform: available[0].id, url: '', public: false }])}>Add social link</button>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={profile.publishProfile} disabled={busy || (!profile.publishable && !profile.publishProfile)}
            onChange={event => setProfile(previous => ({ ...previous, publishProfile: event.target.checked }))} />
          Publish my STARVNT business profile
        </label>
        {profile.reason && <p className="text-sm text-muted">{profile.reason}</p>}
        <button type="submit" className={`${button} bg-primary text-white`} disabled={busy}>Save profile settings</button>
      </form>
    </Card>)}
  </Page>;
}
