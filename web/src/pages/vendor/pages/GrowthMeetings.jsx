import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { externalApi } from '../../../lib/api.js';
import { Card, Page } from './shared.jsx';

const button = 'inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold disabled:opacity-50';
const endpoint = '/vendor/growth-meetings';

function meetingTime(meeting) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: meeting.timezone,
  }).formatRange(new Date(meeting.startsAt), new Date(meeting.endsAt));
}

export function NextGrowthMeetingCard() {
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    async function load() {
      const request = ++sequence;
      try {
        const result = await externalApi.call(`${endpoint}/next`);
        if (active && request === sequence) setState(result);
      } catch (error) {
        if (active && request === sequence) setState({ error: error.status === 403 ? 'Meetings open after vendor approval.' : 'Meeting schedule unavailable.' });
      }
    }
    load();
    window.addEventListener('focus', load);
    return () => { active = false; window.removeEventListener('focus', load); };
  }, []);
  return <Card title="Next Growth Meeting">
    {!state && <p role="status" className="text-sm text-muted">Loading schedule…</p>}
    {state && (state.meeting ? <>
      <p className="text-sm font-bold">{state.meeting.title}</p>
      <p className="mt-1 text-sm text-muted">{meetingTime(state.meeting)} · {state.meeting.timezone}</p>
    </> : <p className="text-sm text-muted">{state.error || 'No upcoming meetings for your account.'}</p>)}
    <Link to="/vendor/learning/meetings" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">View Growth Meetings</Link>
  </Card>;
}

function MeetingCard({ meeting, now, reload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState(meeting.feedback);
  const cancelled = meeting.status === 'CANCELLED';
  const ended = now >= Date.parse(meeting.endsAt);
  const joinOpen = !cancelled && !ended && now >= Date.parse(meeting.startsAt) - 15 * 60000;

  async function action(path, method, body, success) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await externalApi.call(`${endpoint}/${meeting.id}/${path}`, {
        method, body: { scheduleVersion: meeting.scheduleVersion, ...body },
      });
      if (path === 'join') {
        window.location.assign(result.url);
      } else {
        await reload();
        setMessage(success);
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <Card title={meeting.title}>
    <div className="space-y-3 text-sm">
      <p className="text-muted">{meetingTime(meeting)} · {meeting.timezone}</p>
      <p className="whitespace-pre-wrap break-words">{meeting.agenda}</p>
      {cancelled && <p className="text-red-700">Cancelled. {meeting.cancellationReason}</p>}
      {meeting.scheduleVersion > 1 && !cancelled && <p className="text-muted">Rescheduled. RSVP applies to this time only.</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {message && <p role="status" className="text-emerald-700">{message}</p>}
      {!cancelled && !ended && <>
        <p>RSVP {meeting.rsvp === 'GOING' ? '· Going' : meeting.rsvp === 'NOT_GOING' ? '· Not going' : '· Awaiting your response'}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} aria-pressed={meeting.rsvp === 'GOING'} disabled={busy}
            onClick={() => action('rsvp', 'PUT', { rsvp: 'GOING' }, 'RSVP saved.')}>Going</button>
          <button type="button" className={button} aria-pressed={meeting.rsvp === 'NOT_GOING'} disabled={busy}
            onClick={() => action('rsvp', 'PUT', { rsvp: 'NOT_GOING' }, 'RSVP saved.')}>Not going</button>
          {joinOpen && <button type="button" className={`${button} bg-primary text-white`} disabled={busy}
            onClick={() => action('join', 'POST', {})}>Join Google Meet</button>}
        </div>
        {!joinOpen && <p className="text-muted">The join link opens 15 minutes before the start.</p>}
      </>}
      {ended && !cancelled && <>
        <p className="font-semibold">Attendance {meeting.attended === true ? '· Confirmed' : meeting.attended === false ? '· Not recorded as attended' : '· Awaiting staff review'}</p>
        {meeting.summary && <section><h3 className="font-bold">Summary</h3><p className="whitespace-pre-wrap break-words">{meeting.summary}</p></section>}
        {meeting.resources && <section><h3 className="font-bold">Resources</h3><p className="whitespace-pre-wrap break-words">{meeting.resources}</p></section>}
        {meeting.attended && <form className="space-y-2" onSubmit={event => { event.preventDefault(); action('feedback', 'PUT', { feedback }, 'Feedback saved.'); }}>
          <label className="block">Feedback<textarea className="mt-1 block w-full rounded-lg border p-2" maxLength={1500} required
            value={feedback} onChange={event => setFeedback(event.target.value)} /></label>
          <button type="submit" className={button} disabled={busy}>Save feedback</button>
        </form>}
      </>}
    </div>
  </Card>;
}

export default function GrowthMeetings() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  async function reload() { setData(await externalApi.call(endpoint)); }
  function refresh() {
    setError('');
    return reload().catch(error => setError(error.message));
  }
  useEffect(() => {
    let active = true;
    externalApi.call(endpoint).then(value => { if (active) setData(value); })
      .catch(error => { if (active) setError(error.message); });
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const meetings = data?.meetings || [];
  const upcoming = meetings.filter(row => Date.parse(row.endsAt) > now);
  const past = meetings.filter(row => Date.parse(row.endsAt) <= now);
  return <Page title="Growth Meetings" sub="See upcoming sessions, respond to invites and find past summaries."
    action={<button type="button" className={button} onClick={refresh}>Refresh schedule</button>}>
    <Link to="/vendor/learning" className="text-sm font-semibold text-primary underline">Back to Partner Academy</Link>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!data && !error && <p role="status">Loading meetings…</p>}
    {data && <>
      <h2 className="font-bold">Upcoming</h2>
      {upcoming.length ? upcoming.map(row => <MeetingCard key={`${row.id}:${row.scheduleVersion}`} meeting={row} now={now} reload={reload} />) :
        <p className="text-sm text-muted">No upcoming meetings for your account.</p>}
      <h2 className="font-bold">Previous meetings</h2>
      {past.length ? past.map(row => <MeetingCard key={`${row.id}:${row.scheduleVersion}`} meeting={row} now={now} reload={reload} />) :
        <p className="text-sm text-muted">Past meetings will appear here.</p>}
      {data.truncated && <p className="text-sm text-muted">Showing up to 50 sessions per section.</p>}
    </>}
  </Page>;
}
