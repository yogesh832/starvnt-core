import { useEffect, useState } from 'react';
import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';
import { adminApi } from '../../lib/api.js';

const empty = { title: '', category: '', objective: '', content: '', resources: '', videoId: '', captions: '', durationSeconds: 0 };
const field = 'mt-1 block min-h-11 w-full rounded-lg border p-2';
const button = 'min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50';

function LessonVersions({ lessonId, revision }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { setResult(null); setError(''); setLoading(false); }, [lessonId, revision]);
  async function load() {
    setLoading(true); setError('');
    try { setResult(await adminApi.call(`/academy/${lessonId}/versions`)); }
    catch (error) { setError(error.message); }
    finally { setLoading(false); }
  }
  return <section className="space-y-3 rounded-2xl bg-white p-4">
    <h2 className="font-bold">Saved content versions</h2>
    <p className="text-sm text-muted">Read-only lesson text, captions and resource notes. Publication and rights decisions remain in the decision history.</p>
    <button className={button} type="button" disabled={loading} onClick={load}>{loading ? 'Loading versions…' : result ? 'Refresh versions' : 'View versions'}</button>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {result && <>
      {!result.currentVersionArchived && <p className="text-sm">This older lesson has no saved snapshot for its current version. Its present content will be preserved on the next edit; earlier missing versions cannot be reconstructed.</p>}
      {result.versions.map(version => <details key={version.version} className="rounded-xl border p-3">
        <summary className="cursor-pointer font-semibold">Version {version.version}{version.version === result.currentVersion ? ' · Current' : ''} · {version.content.title}</summary>
        <p className="mt-2 break-all text-xs text-muted">Hash: {version.hash}</p>
        <p className="text-xs text-muted">{version.provenance === 'RECOVERED_CURRENT_ON_EDIT' ? 'Existing content captured before editing' : 'Captured on save'} · {new Date(version.capturedAt).toLocaleString()}</p>
        <p className="mt-2 text-sm">{version.content.objective}</p>
        <h3 className="mt-3 font-semibold">Lesson text</h3><p className="whitespace-pre-wrap break-words text-sm">{version.content.content}</p>
        <h3 className="mt-3 font-semibold">Resource notes</h3><p className="whitespace-pre-wrap break-words text-sm">{version.content.resources || 'No resources saved in this version.'}</p>
        {version.content.videoId && <p className="mt-2 text-sm">Video reference: <span className="break-all">{version.content.videoId}</span>. Historical media is not playable from this archive.</p>}
        {version.content.captions && <details className="mt-2"><summary>Saved captions</summary><pre className="whitespace-pre-wrap break-words text-xs">{version.content.captions}</pre></details>}
      </details>)}
    </>}
  </section>;
}

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
  const editable = canEdit && !lesson?.publishAt && lesson?.state !== 'REVIEW';

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
        {data.lessons.map(row => <option key={row.id} value={row.id}>{row.title} · {row.state}</option>)}
      </select></label>
      {data.truncated && <p className="text-sm text-muted">Showing the 100 most recently updated lessons.</p>}
      {(lesson || canEdit) && <form className="rounded-2xl bg-white p-4" onSubmit={save}>
        <fieldset className="space-y-3" disabled={!editable || busy}>
          <legend className="mb-3 font-bold">Lesson content</legend>
          <label className="block">Title<input className={field} required maxLength={160} {...bind('title')} /></label>
          <div><label htmlFor="academy-category" className="block">Category</label><select id="academy-category" className={field} required {...bind('category')}>
            <option value="">Choose a category</option>{data.categories.map(value => <option key={value}>{value}</option>)}
          </select></div>
          <div><label htmlFor="academy-objective" className="block">Learning objective</label><textarea id="academy-objective" className={field} required maxLength={400} {...bind('objective')} /></div>
          <div><label htmlFor="academy-content" className="block">Lesson text</label><textarea id="academy-content" className={field} required rows={6} maxLength={20000} {...bind('content')} /></div>
          <div><label htmlFor="academy-resources" className="block">Resource notes</label><textarea id="academy-resources" className={field} rows={3} maxLength={10000} {...bind('resources')} /></div>
          <label className="block">Authenticated Cloudinary MP4 asset ID (optional)
            <input className={field} maxLength={200} placeholder="starvnt_private/academy/lesson-name" {...bind('videoId')} />
          </label>
          {draft.videoId && <>
            <label className="block">Video duration in seconds<input className={field} required type="number" min="1" max="3600"
              value={draft.durationSeconds} onChange={event => setDraft({ ...draft, durationSeconds: Number(event.target.value) })} /></label>
            <div><label htmlFor="academy-captions" className="block">WebVTT captions</label><textarea id="academy-captions" className={field} required maxLength={45000} rows={5} {...bind('captions')} /></div>
          </>}
          {editable && <button className={button} type="submit">Save draft</button>}
        </fieldset>
      </form>}
      {lesson && <LessonVersions key={`${lesson.id}:${lesson.revision}`} lessonId={lesson.id} revision={lesson.revision} />}
      {lesson && <section className="space-y-3 rounded-2xl bg-white p-4">
        <h2 className="font-bold">Publication and rights</h2>
        <p className="text-sm">State: {lesson.state}. A different authorized publisher reviews the saved content before publication.</p>
        {canEdit && ['DRAFT', 'UNPUBLISHED'].includes(lesson.state) && <button disabled={busy} className={button} onClick={() => act(() => adminApi.call(`/academy/${lesson.id}/submit-review`, { method: 'POST', body: { revision: lesson.revision, reason: 'Saved lesson submitted for independent review' } }))}>Submit saved version for review</button>}
        {canPublish && lesson.state === 'REVIEW' && <button disabled={busy || !reason.trim()} className={button} onClick={() => act(() => adminApi.call(`/academy/${lesson.id}/request-changes`, { method: 'POST', body: { revision: lesson.revision, reason } }))}>Return for changes with decision reason</button>}
        <p className="text-sm text-muted">{lesson.publishAt ? `Available from ${new Date(lesson.publishAt).toLocaleString()}` : 'Draft'} · Content version {lesson.contentVersion}</p>
        {lesson.publishAt && <p className="break-words text-sm">Rights reference {lesson.rightsReference}{lesson.rightsExpiresAt && ` · Ends ${new Date(lesson.rightsExpiresAt).toLocaleString()}`}</p>}
        {canPublish && (lesson.state === 'REVIEW' || lesson.publishAt) && <form onSubmit={publish} className="space-y-3">
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
