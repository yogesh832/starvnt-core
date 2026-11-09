import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api.js';
import { useAdminAuth } from '../../auth/AdminAuthContext.jsx';

const endpoint = '/growth-meetings';
const field = 'mt-1 block min-h-11 w-full rounded-lg border p-2';
const button = 'min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50';
const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const empty = { title: '', agenda: '', startsAt: '', endsAt: '', timezone: deviceZone, meetUrl: '', audience: 'ACTIVE', invitees: '' };
const localTime = value => {
  const time = new Date(value);
  return new Date(time.getTime() - time.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function GrowthMeetingsAdmin() {
  const { can } = useAdminAuth();
  const canSchedule = can('growthMeetings.schedule');
  const canRun = can('growthMeetings.run');
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState(empty);
  const [summary, setSummary] = useState('');
  const [resources, setResources] = useState('');
  const [reason, setReason] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [participants, setParticipants] = useState(null);
  const [attendee, setAttendee] = useState('');
  const [attendance, setAttendance] = useState('yes');
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const meeting = data?.meetings.find(row => row.id === selected);
  const ended = meeting && Date.parse(meeting.endsAt) <= Date.now();
  const cancelled = meeting?.status === 'CANCELLED';
  const canEditSchedule = canSchedule && (!meeting || (!cancelled && Date.parse(meeting.startsAt) > Date.now()));

  async function load() { setData(await adminApi.call(endpoint)); }
  useEffect(() => { load().catch(error => setError(error.message)); }, []);

  function select(id) {
    const row = data.meetings.find(item => item.id === id);
    setSelected(id);
    setDraft(row ? { ...row, startsAt: localTime(row.startsAt), endsAt: localTime(row.endsAt), invitees: row.invitees.join(', ') } : empty);
    setSummary(row?.summary || '');
    setResources(row?.resources || '');
    setParticipants(null);
    setAttendee('');
    setQuery('');
    setCandidates(null);
    setReason('');
    setRequestKey(crypto.randomUUID());
    setError('');
    setMessage('');
  }

  async function act(work, success) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
      if (success) setMessage(success);
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  function saveSchedule(event) {
    event.preventDefault();
    act(async () => {
      const fields = {
        title: draft.title, agenda: draft.agenda, timezone: draft.timezone,
        startsAt: new Date(draft.startsAt).toISOString(), endsAt: new Date(draft.endsAt).toISOString(),
        meetUrl: draft.meetUrl, audience: draft.audience,
        invitees: draft.audience === 'INVITED' ? draft.invitees.split(/[,\s]+/).filter(Boolean) : [],
        reason, requestKey, revision: meeting?.revision, scheduleVersion: meeting?.scheduleVersion,
      };
      const result = await adminApi.call(meeting ? `${endpoint}/${meeting.id}/schedule` : endpoint, {
        method: meeting ? 'PUT' : 'POST', body: fields,
      });
      await load();
      setSelected(result.meeting.id);
      setParticipants(null);
      setReason('');
    }, meeting ? 'Meeting rescheduled.' : 'Meeting scheduled.');
  }

  function cancel() {
    if (!window.confirm('Cancel this meeting? Vendors will lose access to its join link in Partner OS.')) return;
    act(async () => {
      await adminApi.call(`${endpoint}/${meeting.id}/cancel`, {
        method: 'POST', body: { revision: meeting.revision, reason },
      });
      await load();
      setReason('');
    }, 'Meeting cancelled.');
  }

  async function loadParticipants() {
    setParticipants(await adminApi.call(`${endpoint}/${meeting.id}/participation`));
  }

  const bind = key => ({ value: draft[key] ?? '', onChange: event => setDraft({ ...draft, [key]: event.target.value }) });
  return <div className="max-w-4xl space-y-4">
    <h1 className="text-2xl font-bold">Growth Meetings</h1>
    {error && <p role="alert" className="text-red-700">{error} <button type="button" className="underline" onClick={() => act(load)}>Reload</button></p>}
    {message && <p role="status" className="text-emerald-700">{message}</p>}
    {!data && !error && <p role="status">Loading meetings…</p>}
    {data && <>
      <label className="block">Meeting<select className={field} disabled={busy} value={selected} onChange={event => select(event.target.value)}>
        <option value="">{canSchedule ? 'New meeting' : 'Choose a meeting'}</option>
        {data.meetings.map(row => <option key={row.id} value={row.id}>{row.title} · {new Date(row.startsAt).toLocaleDateString()} · {row.status}</option>)}
      </select></label>
      {data.truncated && <p className="text-sm text-muted">Showing the 100 most recent scheduled dates.</p>}
      {meeting && <p className="rounded-xl bg-white p-4 text-sm">
        {meeting.title} · {meeting.status} · Schedule version {meeting.scheduleVersion}
        <br />{new Date(meeting.startsAt).toLocaleString(undefined, { timeZone: meeting.timezone })} · {meeting.timezone}
      </p>}
      {canEditSchedule && <form className="space-y-3 rounded-2xl bg-white p-4" onSubmit={saveSchedule}>
        <h2 className="font-bold">{meeting ? 'Change schedule' : 'Schedule a meeting'}</h2>
        {meeting && <p className="text-sm text-muted">A schedule change clears responses for the current time. Vendors respond again for the revised meeting.</p>}
        <label className="block">Topic<input className={field} required maxLength={160} {...bind('title')} /></label>
        <label className="block">Agenda<textarea className={field} required maxLength={4000} {...bind('agenda')} /></label>
        <p className="text-sm text-muted">Enter the start and end in your device timezone ({deviceZone}). The display timezone is shown to vendors.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Start<input className={field} type="datetime-local" required {...bind('startsAt')} /></label>
          <label>End<input className={field} type="datetime-local" required {...bind('endsAt')} /></label>
        </div>
        <label className="block">Display timezone<input className={field} required maxLength={64} placeholder="Asia/Kolkata" {...bind('timezone')} /></label>
        <label className="block">Google Meet link<input className={field} type="url" required maxLength={100} {...bind('meetUrl')} /></label>
        <label className="block">Audience<select className={field} {...bind('audience')}>
          <option value="ACTIVE">Approved active vendors</option><option value="INVITED">Invited approved vendors</option>
        </select></label>
        {draft.audience === 'INVITED' && <fieldset className="space-y-2 rounded-lg border p-3">
          <legend className="px-1 font-semibold">Invite list</legend>
          <label className="block">Find an approved vendor<input className={field} maxLength={80} value={query} onChange={event => setQuery(event.target.value)} /></label>
          <button type="button" className={button} disabled={busy || query.trim().length < 2} onClick={() => act(async () => {
            const result = await adminApi.call(`${endpoint}/invitees?q=${encodeURIComponent(query.trim())}`);
            setCandidates(result.vendors);
          })}>Search vendors</button>
          {candidates?.map(vendor => {
            const ids = draft.invitees.split(/[,\s]+/).filter(Boolean);
            const added = ids.includes(vendor.id);
            return <button type="button" className={`${button} block text-left`} key={vendor.id} disabled={added || ids.length >= 100}
              onClick={() => setDraft({ ...draft, invitees: [...ids, vendor.id].join(', ') })}>
              {added ? 'Added' : 'Add'} {vendor.name}
            </button>;
          })}
          {candidates?.length === 0 && <p className="text-sm text-muted">No matching active vendors.</p>}
          <label className="block">Vendor organization IDs, separated by commas
            <textarea className={field} required maxLength={2600} {...bind('invitees')} />
          </label>
        </fieldset>}
        <label className="block">Decision reason<input className={field} required maxLength={500}
          value={reason} onChange={event => setReason(event.target.value)} /></label>
        <button className={button} type="submit" disabled={busy}>{meeting ? 'Save revised schedule' : 'Schedule meeting'}</button>
      </form>}
      {meeting && canSchedule && !ended && !cancelled && <section className="space-y-3 rounded-2xl bg-white p-4">
        <h2 className="font-bold">Cancellation</h2>
        <label className="block">Cancellation reason shown to vendors<input className={field} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <button className={button} type="button" disabled={busy || !reason.trim()} onClick={cancel}>Cancel meeting</button>
      </section>}
      {meeting && canRun && <section className="space-y-3 rounded-2xl bg-white p-4">
        <h2 className="font-bold">RSVP and attendance</h2>
        <button type="button" className={button} disabled={busy} onClick={() => act(loadParticipants)}>Load participation</button>
        {participants && <>
          <ul className="space-y-2 text-sm">
            {participants.participants.map(row => <li className="rounded-lg border p-2" key={row.vendorId}>
              {row.name} · {row.rsvp || 'No RSVP'} · {row.attended === undefined ? 'Attendance pending' : row.attended ? 'Attended' : 'Did not attend'}
              <p className="break-all text-xs text-muted">{row.vendorId}</p>
              {row.feedback && <p className="whitespace-pre-wrap break-words">{row.feedback}</p>}
              {ended && !cancelled && <button type="button" className="min-h-11 text-primary underline" onClick={() => {
                setAttendee(row.vendorId);
                setAttendance(row.attended === false ? 'no' : 'yes');
              }}>Select for attendance</button>}
            </li>)}
          </ul>
          {!participants.participants.length && <p className="text-sm text-muted">No participation has been recorded.</p>}
          {participants.truncated && <p className="text-sm text-muted">Showing up to 200 recent records.</p>}
        </>}
        {ended && !cancelled && <form className="space-y-3" onSubmit={event => {
          event.preventDefault();
          act(async () => {
            await adminApi.call(`${endpoint}/${meeting.id}/attendance`, {
              method: 'PUT', body: { vendorId: attendee.trim(), attended: attendance === 'yes', scheduleVersion: meeting.scheduleVersion },
            });
            await loadParticipants();
          }, 'Attendance recorded.');
        }}>
          <label className="block">Vendor organization ID<input className={field} required maxLength={24} value={attendee} onChange={event => setAttendee(event.target.value)} /></label>
          <label className="block">Attendance<select className={field} value={attendance} onChange={event => setAttendance(event.target.value)}>
            <option value="yes">Attended</option><option value="no">Did not attend</option>
          </select></label>
          <button type="submit" className={button} disabled={busy}>Save attendance</button>
        </form>}
      </section>}
      {meeting && canRun && ended && !cancelled && <form className="space-y-3 rounded-2xl bg-white p-4" onSubmit={event => {
        event.preventDefault();
        act(async () => {
          await adminApi.call(`${endpoint}/${meeting.id}/summary`, {
            method: 'PUT', body: { revision: meeting.revision, summary, resources, reason },
          });
          await load();
          setReason('');
        }, 'Summary saved.');
      }}>
        <h2 className="font-bold">Post-meeting summary</h2>
        <label className="block">Summary shown to vendors<textarea className={field} required maxLength={6000} value={summary} onChange={event => setSummary(event.target.value)} /></label>
        <label className="block">Resource notes<textarea className={field} maxLength={6000} value={resources} onChange={event => setResources(event.target.value)} /></label>
        <label className="block">Decision reason<input className={field} required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <button type="submit" className={button} disabled={busy}>Save summary</button>
      </form>}
    </>}
  </div>;
}
