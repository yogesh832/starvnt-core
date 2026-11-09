import { useEffect, useState } from 'react';
import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';
import { adminApi } from '../../lib/api.js';

const empty = { title: '', category: '', objective: '', content: '', resources: '', videoId: '', captions: '', durationSeconds: 0 };
const field = 'mt-1 block min-h-11 w-full rounded-lg border p-2';
const button = 'min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50';

export default function AcademyAdmin() {
  const { can } = useAdminAuth();
  const canEdit = can('academy.edit');
  const canPublish = can('academy.publish');
  const [data, setData] = useState(null);
  const [selection, setSelection] = useState('');
  const [draft, setDraft] = useState(empty);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState('');
  const [rightsReference, setRightsReference] = useState('');
  const [rightsExpiry, setRightsExpiry] = useState('');
  const [schedule, setSchedule] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lesson = data?.lessons.find(row => row.id === selection);
  const editable = canEdit && !lesson?.publishAt;

  async function load() { setData(await adminApi.call('/academy')); }
  useEffect(() => { load().catch(error => setError(error.message)); }, []);

  function select(id) {
    setSelection(id);
    setDraft(data.lessons.find(row => row.id === id) || empty);
    setKey(crypto.randomUUID());
    setReason('');
    setRightsReference('');
    setRightsExpiry('');
    setSchedule('');
  }

  async function act(work) {
    setBusy(true);
    setError('');
    try { await work(); await load(); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  function save(event) {
    event.preventDefault();
    const fields = Object.fromEntries(Object.keys(empty).map(name => [name, draft[name]]));
    if (!fields.videoId.trim()) {
      fields.captions = '';
      fields.durationSeconds = 0;
    }
    return act(async () => {
      const result = await adminApi.call(lesson ? `/academy/${lesson.id}` : '/academy', {
        method: lesson ? 'PUT' : 'POST',
        body: { ...fields, revision: lesson?.revision, requestKey: key },
      });
      setSelection(result.lesson.id);
      setDraft(result.lesson);
    });
  }

  function publish(event) {
    event.preventDefault();
    return act(async () => {
      const { lesson: updated } = await adminApi.call(`/academy/${lesson.id}/publication`, {
        method: 'POST',
        body: lesson.publishAt ? { revision: lesson.revision, action: 'WITHDRAW', reason } : {
          revision: lesson.revision, action: 'PUBLISH', reason, rightsReference,
          publishAt: schedule ? new Date(schedule).toISOString() : undefined,
          rightsExpiresAt: rightsExpiry ? new Date(rightsExpiry).toISOString() : undefined,
        },
      });
      setDraft(updated);
      setReason('');
    });
  }

  const bind = name => ({ value: draft[name], onChange: event => setDraft({ ...draft, [name]: event.target.value }) });
  return <div className="max-w-4xl space-y-4">
    <h1 className="text-2xl font-bold">Partner Academy</h1>
    {error && <p role="alert" className="text-red-700">{error} <button className="underline" type="button" onClick={() => act(async () => {})}>Reload</button></p>}
    {!data && !error && <p role="status">Loading lessons…</p>}
    {data && <>
      <label className="block text-sm">Choose a lesson<select className={field} disabled={busy} value={selection} onChange={event => select(event.target.value)}>
        <option value="">{canEdit ? 'New draft' : 'Select a lesson'}</option>
        {data.lessons.map(row => <option key={row.id} value={row.id}>{row.title} · {row.publishAt ? 'Publication configured' : 'Draft'}</option>)}
      </select></label>
      {data.truncated && <p className="text-sm text-muted">Showing the 100 most recently updated lessons.</p>}
      {(lesson || canEdit) && <form className="rounded-2xl bg-white p-4" onSubmit={save}>
        <fieldset className="space-y-3" disabled={!editable || busy}>
          <legend className="mb-3 font-bold">Lesson content</legend>
          <label className="block">Title<input className={field} required maxLength={160} {...bind('title')} /></label>
          <label className="block">Category<select className={field} required {...bind('category')}>
            <option value="">Choose a category</option>{data.categories.map(value => <option key={value}>{value}</option>)}
          </select></label>
          <label className="block">Learning objective<textarea className={field} required maxLength={400} {...bind('objective')} /></label>
          <label className="block">Lesson text<textarea className={field} required rows={6} maxLength={20000} {...bind('content')} /></label>
          <label className="block">Resource notes<textarea className={field} rows={3} maxLength={10000} {...bind('resources')} /></label>
          <label className="block">Authenticated Cloudinary MP4 asset ID (optional)
            <input className={field} maxLength={200} placeholder="starvnt_private/academy/lesson-name" {...bind('videoId')} />
          </label>
          {draft.videoId && <>
            <label className="block">Video duration in seconds<input className={field} required type="number" min="1" max="3600"
              value={draft.durationSeconds} onChange={event => setDraft({ ...draft, durationSeconds: Number(event.target.value) })} /></label>
            <label className="block">WebVTT captions<textarea className={field} required maxLength={45000} rows={5} {...bind('captions')} /></label>
          </>}
          {editable && <button className={button} type="submit">Save draft</button>}
        </fieldset>
      </form>}
      {lesson && <section className="space-y-3 rounded-2xl bg-white p-4">
        <h2 className="font-bold">Publication and rights</h2>
        <p className="text-sm text-muted">{lesson.publishAt ? `Available from ${new Date(lesson.publishAt).toLocaleString()}` : 'Draft'} · Content version {lesson.contentVersion}</p>
        {lesson.publishAt && <p className="break-words text-sm">Rights reference {lesson.rightsReference}{lesson.rightsExpiresAt && ` · Ends ${new Date(lesson.rightsExpiresAt).toLocaleString()}`}</p>}
        {canPublish && <form onSubmit={publish} className="space-y-3">
          {!lesson.publishAt && <>
            <label className="block">Approved rights reference<input className={field} required maxLength={200} value={rightsReference} onChange={event => setRightsReference(event.target.value)} /></label>
            <p className="text-sm text-muted">Enter dates in your device timezone. Leave expiry blank only for rights without a time limit.</p>
            <label className="block">Rights expiry (optional)<input className={field} type="datetime-local" value={rightsExpiry} onChange={event => setRightsExpiry(event.target.value)} /></label>
            <label className="block">Schedule publication (optional)<input className={field} type="datetime-local" value={schedule} onChange={event => setSchedule(event.target.value)} /></label>
          </>}
          <label className="block">Decision reason<input className={field} required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <button type="submit" className={button} disabled={busy}>{lesson.publishAt ? 'Withdraw lesson' : 'Approve publication'}</button>
        </form>}
        <h3 className="font-bold">Decision history</h3>
        <ul className="space-y-1 text-sm">{lesson.history.map((event, index) => <li key={index}>{event.action} · {new Date(event.at).toLocaleString()} · {event.actor}{event.reason ? ` · ${event.reason}` : ''}</li>)}</ul>
      </section>}
    </>}
  </div>;
}
