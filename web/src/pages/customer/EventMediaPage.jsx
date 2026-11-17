import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { externalApi } from '../../lib/api.js';
import { errorText } from './customerApi.js';
import { BackLink, useLoad } from './customerUi.jsx';
import useCustomerRefresh from './useCustomerRefresh.js';
import ConfirmActionButton from '../../components/ConfirmActionButton.jsx';

const button = 'min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50';
const secondary = 'min-h-11 rounded-xl border px-4 py-2 font-semibold disabled:opacity-50';

function MediaPreview({ asset, path, automatic = false }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    setUrl('');
    if (!automatic || asset.kind === 'UPDATE') return;
    let active = true, objectUrl;
    externalApi.raw(path).then(response => response.blob()).then(blob => {
      if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch(err => { if (active) setError(errorText(err)); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset.updatedAt, asset.kind, path, automatic]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (asset.kind === 'UPDATE') return null;
  return <div className="space-y-2">
    {!url && <button className={secondary} disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { const response = await externalApi.raw(path); setUrl(URL.createObjectURL(await response.blob())); }
      catch (err) { setError(errorText(err)); }
      finally { setBusy(false); }
    }}>{busy ? 'Loading media…' : asset.kind === 'VIDEO' ? 'Open video' : 'Open photo'}</button>}
    {url && (asset.kind === 'VIDEO' ? <video src={url} controls autoPlay={automatic} muted={automatic} loop={automatic} playsInline preload="metadata" className="max-h-96 w-full rounded-xl" aria-label={asset.caption || 'Event video'} /> : <img src={url} alt={asset.caption || 'Event photo'} className="max-h-96 w-full rounded-xl object-contain" />)}
    {error && <p role="alert">{error}</p>}
  </div>;
}

function MediaCard({ asset, eventId, permissions, onChanged, publicPath }) {
  const [review, setReview] = useState(false), [privacy, setPrivacy] = useState(false), [safety, setSafety] = useState(false), [rights, setRights] = useState(false);
  const [reason, setReason] = useState(''), [live, setLive] = useState(asset.liveEligible), [memory, setMemory] = useState(asset.memoryIncluded), [highlight, setHighlight] = useState(asset.highlight);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [intent, setIntent] = useState({ key: '', signature: '' });
  const canModerate = permissions.includes('moderate'), canCurate = permissions.includes('memory.edit');
  async function decide(decision) {
    const body = { decision, expectedVersion: asset.version, privacy, safety, rights, reason, liveEligible: live, memoryIncluded: memory, highlight };
    const signature = JSON.stringify(body);
    const key = intent.signature === signature ? intent.key : crypto.randomUUID();
    setIntent({ key, signature }); setBusy(true); setError('');
    try {
      await externalApi.call(`/customer/events/${eventId}/media/${asset.id}/review`, { method: 'POST', body: { ...body, idempotencyKey: key } });
      setReview(false); onChanged();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  return <article className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-primary">{asset.kind.toLowerCase()}</span>{!publicPath && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs">{asset.state.toLowerCase()}</span>}</div>
    <p className="whitespace-pre-wrap break-words">{asset.caption}</p>
    {asset.state !== 'WITHDRAWN' && <MediaPreview asset={asset} automatic={Boolean(publicPath)} path={publicPath ? `${publicPath}/media/${asset.id}/file` : `/customer/event-media/${asset.id}/file`} />}
    <p className="text-xs text-muted">{new Date(asset.occurredAt).toLocaleString()}</p>
    {asset.review?.reason && !publicPath && <p className="text-sm">Review note · {asset.review.reason}</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!publicPath && <div className="space-y-3">
      {canModerate && asset.state === 'PENDING' && <button className={secondary} onClick={() => setReview(!review)} aria-expanded={review}>Review submission</button>}
      {review && <fieldset disabled={busy} className="space-y-3 rounded-xl bg-blue-50 p-3">
        <legend className="font-semibold">Review before publishing</legend>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={privacy} onChange={e => setPrivacy(e.target.checked)} />Privacy and people shown have been checked</label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={safety} onChange={e => setSafety(e.target.checked)} />Content is appropriate and safe</label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} />Sharing permissions have been checked</label>
        <label className="block">Review note<textarea className="block w-full rounded-xl border p-3" value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} />Allow on event display</label>
        {canCurate && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={memory} onChange={e => setMemory(e.target.checked)} />Include in Event Memory</label>}
        <div className="flex flex-wrap gap-2"><button className={button} disabled={!privacy || !safety || !rights || busy} onClick={() => decide('APPROVE')}>Approve content</button><button className={secondary} disabled={busy} onClick={() => decide('REJECT')}>Reject</button></div>
      </fieldset>}
      {canCurate && asset.state === 'PUBLISHED' && <fieldset disabled={busy} className="space-y-2">
        <legend className="font-semibold">Curate your event</legend>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={memory} onChange={e => setMemory(e.target.checked)} />Include in Memory</label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={highlight} onChange={e => setHighlight(e.target.checked)} />Highlight</label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} />Allow on event display</label>
        <button className={secondary} onClick={() => decide('CURATE')}>Save curation</button>
      </fieldset>}
      {asset.state !== 'WITHDRAWN' && permissions.includes('upload') && <ConfirmActionButton disabled={busy} className="min-h-11 text-sm text-red-700 underline" confirmation="Withdraw this content from your event display and Memory?" onConfirm={() => decide('WITHDRAW')}>Withdraw submission</ConfirmActionButton>}
    </div>}
  </article>;
}

export default function EventMediaPage({ memoryView = false }) {
  const { id } = useParams();
  const source = useLoad(() => externalApi.call(`/customer/events/${id}/${memoryView ? 'memory' : 'media'}`), [id, memoryView]);
  useCustomerRefresh(source.reload, `${id}:${memoryView}`);
  const [caption, setCaption] = useState(''), [file, setFile] = useState(null), [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [token, setToken] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [filter, setFilter] = useState('all');
  if (!source.data || [401, 403, 404].includes(source.error?.status) || source.error?.data?.error === 'CIRCLE_LOCKED') return <div role={source.error ? 'alert' : 'status'}>{source.error ? errorText(source.error) : 'Loading your event…'}{source.error && <button onClick={source.reload}>Try again</button>}{memoryView && <Link className="block text-primary underline" to="/customer/events">Open your retained event list</Link>}</div>;
  const { event, assets = [], permissions = [], publication = {}, story = [] } = source.data;
  const filtered = assets.filter(asset => filter === 'all' || (filter === 'highlights' ? asset.highlight : asset.kind === filter));
  async function upload(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    const body = new FormData();
    body.append('caption', caption); body.append('rightsConfirmed', String(rights)); body.append('idempotencyKey', requestKey);
    if (file) body.append('file', file);
    try {
      await externalApi.call(`/customer/events/${id}/media`, { method: 'POST', body });
      setCaption(''); setFile(null); setRights(false); setRequestKey(crypto.randomUUID()); e.target.reset();
      setNotice('Submitted for review. You can follow its status below.'); source.reload();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  async function publish(liveEnabled, memoryShared) {
    setBusy(true); setError(''); setToken('');
    try {
      const result = await externalApi.call(`/customer/events/${id}/publication`, { method: 'PUT', body: { liveEnabled, memoryShared, expectedVersion: publication.version || 0, idempotencyKey: crypto.randomUUID() } });
      setToken(result.shareToken || ''); setNotice(result.shareToken ? 'Sharing updated. Use the links below.' : 'Event sharing has been revoked.'); source.reload();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-4xl space-y-5">
    <BackLink to={`/customer/events/${id}/collaboration`}>Event Circle</BackLink>
    <div className="rounded-3xl bg-gradient-to-br from-blue-100 to-sky-50 p-6"><p className="text-sm text-blue-700">{event.title}</p><h1 className="mt-1 text-3xl font-extrabold">{memoryView ? 'Your event story' : 'Moments, together'}</h1><p className="mt-3 text-sm">{memoryView ? 'The photos, videos and updates you have chosen to keep.' : 'Share a moment. Every submission is reviewed before it can appear on your event display.'}</p></div>
    <div className="flex flex-wrap gap-3"><Link className="customer-secondary-action" to={`/customer/events/${id}/${memoryView ? 'media' : 'memory'}`}>{memoryView ? 'Manage event content' : 'Open Event Memory'}</Link>{permissions.includes('memory.edit') && <><Link className="customer-secondary-action" to={`/customer/events/${id}/history`}>Event records & timeline</Link><Link className="customer-secondary-action" to={`/customer/events/${id}/bookings`}>Bookings & payments</Link></>}</div>
    {source.error && <p role="alert">Updates are unavailable. Your last loaded content is shown. <button onClick={source.reload}>Retry</button></p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!memoryView && permissions.includes('upload') && <form onSubmit={upload} className="space-y-3 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-bold">Add to your event</h2>
      <label className="block">Photo or video<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" className="block min-h-11 w-full py-2" disabled={busy} onChange={e => { setFile(e.target.files?.[0] || null); setRequestKey(crypto.randomUUID()); }} /></label>
      <p className="text-xs text-muted">JPEG, PNG, WebP or MP4, up to 20 MB.</p>
      <label className="block">Caption or update<textarea className="block w-full rounded-xl border p-3" maxLength={2000} disabled={busy} value={caption} onChange={e => { setCaption(e.target.value); setRequestKey(crypto.randomUUID()); }} /></label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} />I have permission to share this content and the people shown</label>
      <button disabled={busy || !rights || (!file && !caption.trim()) || file?.size > 20 * 1024 * 1024} className={button}>{busy ? 'Submitting…' : 'Submit for review'}</button>
    </form>}
    {permissions.includes('publish') && <section className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="font-bold">Sharing & event display</h2><p className="text-sm">Memory is {publication.memoryShared ? 'shared by link' : 'private'}. Event display is {publication.liveEnabled ? 'enabled' : 'off'}. Only approved, selected content appears.</p><div className="flex flex-wrap gap-3"><ConfirmActionButton disabled={busy} className={secondary} confirmation="Anyone with the link can view approved event display content until you revoke it." onConfirm={() => publish(true, publication.memoryShared === true)}>Enable event display</ConfirmActionButton><ConfirmActionButton disabled={busy} className={secondary} confirmation="Anyone with the link can view approved, selected Memory content until you revoke it." onConfirm={() => publish(publication.liveEnabled === true, true)}>Share Memory by link</ConfirmActionButton><button disabled={busy} className={secondary} onClick={() => publish(false, false)}>Revoke sharing</button></div>{token && <div className="flex flex-wrap gap-3">{publication.liveEnabled && <Link className="text-primary underline" to={`/event-share/${token}/live`}>Open event display</Link>}{publication.memoryShared && <Link className="text-primary underline" to={`/event-share/${token}/memory`}>Open shared Memory</Link>}</div>}</section>}
    {memoryView && story.length > 0 && <section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Your journey</h2><ol className="mt-3 space-y-2">{story.map(item => <li key={item.id} className="text-sm">{item.action.replaceAll('_', ' ')} · {new Date(item.at).toLocaleDateString()}</li>)}</ol></section>}
    <label className="block">Show<select className="ml-3 min-h-11 rounded-xl border bg-white px-3" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All content</option><option value="highlights">Highlights</option><option value="PHOTO">Photos</option><option value="VIDEO">Videos</option><option value="UPDATE">Updates</option></select></label>
    {filtered.length ? <div className="grid items-start gap-4 md:grid-cols-2">{filtered.map(asset => <MediaCard key={`${asset.id}:${asset.version}`} asset={asset} eventId={id} permissions={permissions} onChanged={source.reload} />)}</div> : <p className="rounded-2xl border bg-white p-6">{memoryView ? 'Your approved memories will appear here. Your event records remain available above.' : 'No content in this view yet.'}</p>}
  </div>;
}

export function PublicEventContent() {
  const { token, view } = useParams();
  const path = `/event-publications/${token}/${view}`;
  const source = useLoad(() => externalApi.call(path), [token, view]);
  useCustomerRefresh(source.reload, path);
  return <main className="min-h-screen bg-slate-50 p-5"><div className="mx-auto max-w-5xl space-y-5">
    <h1 className="text-3xl font-extrabold">{source.data?.event?.title || (view === 'live' ? 'Event display' : 'Event Memory')}</h1>
    {source.loading && !source.data && <p role="status">Loading event content…</p>}
    {source.error ? <p role="alert">This event link is unavailable or has been revoked. <button onClick={source.reload}>Retry</button></p> : <>
      {(source.data?.assets || []).length === 0 && !source.loading && <p>No approved content to display yet.</p>}
      <div className="grid gap-5 md:grid-cols-2">{(source.data?.assets || []).map(asset => <MediaCard key={asset.id} asset={asset} permissions={[]} publicPath={path} />)}</div>
    </>}
  </div></main>;
}
