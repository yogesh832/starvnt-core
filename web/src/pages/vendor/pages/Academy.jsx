import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { externalApi } from '../../../lib/api.js';
import { Card, Page } from './shared.jsx';

const button = 'min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50';

function canResume(lesson) {
  return lesson.positionSeconds > 0 && !lesson.completedAt;
}

export function ContinueWatchingCard() {
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    externalApi.call('/vendor/academy')
      .then(data => { if (active) setState({ lessons: data.lessons.filter(canResume).slice(0, 3) }); })
      .catch(() => { if (active) setState({ error: true }); });
    return () => { active = false; };
  }, []);

  return <Card title="Continue Watching">
    {!state ? <p role="status" className="text-sm text-muted">Loading lesson progress…</p> :
      state.lessons?.length ? <ul className="space-y-2">{state.lessons.map(lesson => (
        <li key={lesson.id}><Link className="text-sm font-semibold text-primary underline" to={`/vendor/learning?lesson=${lesson.id}`}>{lesson.title}</Link></li>
      ))}</ul> : <p className="text-sm text-muted">{state.error ? 'Lesson progress is unavailable.' : 'Lessons you start will appear here.'}</p>}
    <Link to="/vendor/learning" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Browse Academy</Link>
  </Card>;
}

function Lesson({ lesson, onProgress, onClose }) {
  const [detail, setDetail] = useState(null);
  const [playback, setPlayback] = useState(null);
  const [captionUrl, setCaptionUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const base = `/vendor/academy/${lesson.id}`;

  useEffect(() => {
    let active = true;
    let track;
    externalApi.call(base).then(data => {
      if (!active) return;
      setDetail(data.lesson);
      if (data.lesson.captions) {
        track = URL.createObjectURL(new Blob([data.lesson.captions], { type: 'text/vtt' }));
        setCaptionUrl(track);
      }
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; if (track) URL.revokeObjectURL(track); };
  }, [base]);

  async function save(positionSeconds, complete = false) {
    try {
      const progress = await externalApi.call(`${base}/progress`, {
        method: 'PUT', body: { contentVersion: detail.contentVersion, positionSeconds, complete },
      });
      onProgress(lesson.id, detail.contentVersion, progress);
    } catch (error) { setError(error.message); }
  }

  async function openVideo() {
    setBusy(true);
    setError('');
    try { setPlayback(await externalApi.call(`${base}/playback`, { method: 'POST' })); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  return <Card title={detail?.title || lesson.title} extra={<button type="button" className={button} onClick={onClose}>Back to lessons</button>}>
    {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
    {!detail && !error && <p role="status">Loading lesson…</p>}
    {detail && <div className="space-y-4">
      <p className="text-sm font-semibold text-muted">{detail.category}</p>
      <p>{detail.objective}</p>
      {detail.hasVideo && <>
        {playback && <video key={playback.url} src={playback.url} controls playsInline preload="metadata"
          className="max-h-[65vh] w-full rounded-xl bg-black" aria-label={detail.title}
          onLoadedMetadata={event => { event.currentTarget.currentTime = Math.min(lesson.positionSeconds, event.currentTarget.duration || 0); }}
          onPause={event => save(Math.min(detail.durationSeconds, Math.floor(event.currentTarget.currentTime)))}
          onEnded={() => save(detail.durationSeconds, true)}
          onError={() => setError('Playback stopped. Request a fresh playback link to resume.')}>
          {captionUrl && <track kind="captions" src={captionUrl} label="Captions" default />}
        </video>}
        <button type="button" className={button} onClick={openVideo} disabled={busy}>{playback ? 'Refresh video access' : 'Open video'}</button>
      </>}
      <p className="whitespace-pre-wrap break-words">{detail.content}</p>
      {detail.resources && <section><h3 className="font-bold">Resources</h3><p className="mt-2 whitespace-pre-wrap break-words">{detail.resources}</p></section>}
      {lesson.completedAt ? <p role="status" className="font-semibold text-emerald-700">Completed</p> :
        <button type="button" className={button} onClick={() => save(lesson.positionSeconds, true)}>Mark complete</button>}
    </div>}
  </Card>;
}

export default function Academy() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [filter, setFilter] = useState('');
  const [params, setParams] = useSearchParams();
  const selected = params.get('lesson');
  useEffect(() => {
    let active = true;
    externalApi.call('/vendor/academy').then(value => { if (active) setData(value); })
      .catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [retry]);

  const lessons = data?.lessons || [];
  const chosen = lessons.find(row => row.id === selected);
  const shown = lessons.filter(row => (!category || row.category === category) &&
    `${row.title} ${row.objective}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (filter === 'complete' ? row.completedAt : filter === 'continue' ? canResume(row) : true));

  function selectLesson(id) {
    const next = new URLSearchParams(params);
    if (id) next.set('lesson', id);
    else next.delete('lesson');
    setParams(next);
  }

  function onProgress(id, contentVersion, progress) {
    setData(current => ({
      ...current,
      lessons: current.lessons.map(row => row.id === id && row.contentVersion === contentVersion
        ? { ...row, positionSeconds: Math.max(row.positionSeconds, progress.positionSeconds), completedAt: row.completedAt || progress.completedAt }
        : row),
    }));
  }

  return <Page title="Learning & Growth" sub="Browse the Partner Academy and continue from your saved progress.">
    <Link to="/vendor/learning/meetings" className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold text-primary">Growth Meetings</Link>
    {error && <p role="alert" className="text-red-700">{error} <button type="button" className="underline" onClick={() => { setError(''); setRetry(value => value + 1); }}>Retry</button></p>}
    {!data && !error && <p role="status">Loading Academy…</p>}
    {data && selected && !chosen && <p role="status" className="text-sm text-muted">This lesson is unavailable.</p>}
    {chosen ? <Lesson key={chosen.id} lesson={chosen} onProgress={onProgress} onClose={() => selectLesson(null)} /> :
      data && <Card title="Partner Academy">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">Search lessons<input className="block min-h-11 w-full rounded-lg border px-2" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label className="text-sm">Category<select className="block min-h-11 w-full rounded-lg border px-2" value={category} onChange={event => setCategory(event.target.value)}>
            <option value="">All categories</option>{data.categories.map(value => <option key={value}>{value}</option>)}
          </select></label>
          <label className="text-sm">Progress<select className="block min-h-11 w-full rounded-lg border px-2" value={filter} onChange={event => setFilter(event.target.value)}>
            <option value="">All lessons</option><option value="continue">Continue watching</option><option value="complete">Completed</option>
          </select></label>
        </div>
        <ul className="mt-4 space-y-2">
          {shown.map(lesson => <li key={lesson.id} className="rounded-xl border p-3">
            <button type="button" className="min-h-11 text-left font-bold text-primary" onClick={() => selectLesson(lesson.id)}>{lesson.title}</button>
            <p className="text-sm">{lesson.objective}</p>
            <p className="mt-1 text-sm text-muted">{lesson.category}{lesson.completedAt ? ' · Completed' : lesson.positionSeconds ? ' · In progress' : ''}</p>
          </li>)}
        </ul>
        {!shown.length && <p className="mt-3 text-sm text-muted">{lessons.length ? 'No lessons match these filters.' : 'Academy lessons will appear after publication.'}</p>}
        {data.truncated && <p className="mt-3 text-sm text-muted">Showing the 100 most recent lessons.</p>}
      </Card>}
  </Page>;
}
