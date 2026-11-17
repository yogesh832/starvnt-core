import { useState } from 'react';
import * as Crypto from 'expo-crypto';
import { internal } from '../api/runtime';
import type { Data } from '../api/client';
import { useSession } from '../auth/Session';
import { Button, Card, Choice, Empty, ErrorNotice, Field, MenuRow, Page, Txt, useAction, useResource } from '../ui';
import { meetingTime } from '../meetingTime';

export const growthPermissions = {
  academy: ['academy.read', 'academy.edit', 'academy.publish'],
  meetings: ['growthMeetings.read', 'growthMeetings.schedule', 'growthMeetings.run'],
};

function GrowthFields({ fields, form, change, busy }: {
  fields: [string, string, number, boolean?][];
  form: Data;
  change: (name: string, value: string) => void;
  busy: boolean;
}) {
  return <>{fields.map(([name, label, limit, multiline]) =>
    <Field key={name} label={label} value={String(form[name] ?? '')} editable={!busy}
      maxLength={limit} multiline={multiline} onChangeText={value => change(name, value)} />)}</>;
}

export function AdminAcademy({ navigation }: any) {
  const { can } = useSession();
  const resource = useResource(internal, '/academy');
  const categories: string[] = resource.data.categories || [];
  const lessons: Data[] = resource.data.lessons || [];
  return <Page {...resource} title="Partner Academy" subtitle="Manage drafts and rights-approved publication.">
    {can('academy.edit') && <Button title="New lesson" onPress={() => navigation.navigate('AdminLesson', { categories })} />}
    {lessons.map(lesson => <MenuRow key={lesson.id} title={lesson.title}
      subtitle={`${lesson.category} · ${lesson.publishAt ? 'Publication approved' : 'Draft'}`}
      onPress={() => navigation.navigate('AdminLesson', { lesson, categories })} />)}
    {!resource.loading && !resource.error && !lessons.length && <Empty title="No lessons created yet" />}
    {resource.data.truncated && <Txt muted>Showing the 100 most recent lessons.</Txt>}
  </Page>;
}

const lessonFields: [string, string, number, boolean?][] = [
  ['title', 'Title', 160], ['objective', 'Objective', 400, true],
  ['content', 'Lesson content', 20000, true], ['resources', 'Resources', 10000, true],
  ['videoId', 'Private Academy video asset ID', 200], ['durationSeconds', 'Video duration in seconds', 4],
  ['captions', 'WebVTT captions', 45000, true],
];

export function AdminLesson({ navigation, route }: any) {
  const { can } = useSession();
  const { lesson, categories } = route.params;
  const [form, setForm] = useState<Data>(() => ({ category: categories[0], ...lesson }));
  const [requestKey] = useState(() => Crypto.randomUUID());
  const [publication, setPublication] = useState<Data>({});
  const action = useAction();
  const path = lesson ? `/academy/${lesson.id}` : '/academy';
  const editable = can('academy.edit') && !lesson?.publishAt;
  const publishable = lesson && can('academy.publish');
  function savePublication() {
    void action.run(async () => {
      const { reason, rightsReference, publishAt, rightsExpiresAt } = publication;
      await internal.call(`${path}/publication`, 'POST', {
        action: lesson.publishAt ? 'WITHDRAW' : 'PUBLISH', revision: lesson.revision,
        reason, rightsReference, publishAt, rightsExpiresAt,
      });
      navigation.goBack();
    });
  }
  return <Page title={lesson?.title || 'New lesson'}>
    <Card>
      {editable ? <>
        <Choice label="Category" value={form.category} values={categories} onChange={category => setForm(current => ({ ...current, category }))} />
        <GrowthFields fields={lessonFields} form={form} busy={action.busy}
          change={(name, value) => setForm(current => ({ ...current, [name]: value }))} />
        <Button title="Save draft" busy={action.busy} onPress={() => void action.run(async () => {
          const { title, category, objective, content, resources, videoId, captions, durationSeconds } = form;
          await internal.call(path, lesson ? 'PUT' : 'POST', {
            title, category, objective, content, resources, videoId, captions, durationSeconds: Number(durationSeconds || 0),
            requestKey, revision: lesson?.revision,
          });
          navigation.goBack();
        })} />
      </> : <><Txt muted>{lesson?.category}</Txt><Txt>{lesson?.objective}</Txt><Txt>{lesson?.content}</Txt>
        {!!lesson?.resources && <Txt>{lesson.resources}</Txt>}</>}
      {publishable && <>
        <Txt bold>{lesson.publishAt ? 'Withdraw lesson' : 'Approve the saved lesson for publication'}</Txt>
        <Field label="Publication decision reason" value={publication.reason || ''} maxLength={500}
          editable={!action.busy} onChangeText={reason => setPublication(current => ({ ...current, reason }))} />
        {!lesson.publishAt && <GrowthFields fields={[
          ['rightsReference', 'Rights evidence reference', 200],
          ['publishAt', 'Publish at (ISO date with timezone, blank for now)', 32],
          ['rightsExpiresAt', 'Rights expiry (ISO date with timezone, optional)', 32],
        ]} form={publication} busy={action.busy} change={(name, value) => setPublication(current => ({ ...current, [name]: value }))} />}
        <Button title={lesson.publishAt ? 'Withdraw lesson' : 'Approve publication'} busy={action.busy} onPress={savePublication} />
      </>}
      <ErrorNotice message={action.error} />
    </Card>
  </Page>;
}

const meetingPath = '/growth-meetings';
export function AdminMeetings({ navigation }: any) {
  const { can } = useSession();
  const resource = useResource(internal, meetingPath);
  const meetings: Data[] = resource.data.meetings || [];
  return <Page {...resource} title="Growth Meetings" subtitle="Manage meeting schedules, attendance and summaries.">
    {can('growthMeetings.schedule') && <Button title="Schedule a meeting" onPress={() => navigation.navigate('AdminMeeting', {})} />}
    {meetings.map(meeting => <MenuRow key={meeting.id} title={meeting.title}
      subtitle={`${meetingTime(meeting)}${meeting.status === 'CANCELLED' ? ' · Cancelled' : ''}`}
      onPress={() => navigation.navigate('AdminMeeting', { meeting })} />)}
    {!resource.loading && !resource.error && !meetings.length && <Empty title="No meetings scheduled yet" />}
    {resource.data.truncated && <Txt muted>Showing the 100 most recent meetings.</Txt>}
  </Page>;
}

const scheduleFields: [string, string, number, boolean?][] = [
  ['title', 'Meeting title', 160], ['agenda', 'Agenda', 4000, true],
  ['startsAt', 'Starts at (ISO date with timezone)', 32], ['endsAt', 'Ends at (ISO date with timezone)', 32],
  ['timezone', 'Timezone (for example, Asia/Kolkata)', 64], ['meetUrl', 'Google Meet link', 100],
];

export function AdminMeeting({ navigation, route }: any) {
  const { can } = useSession();
  const { meeting } = route.params;
  const [form, setForm] = useState<Data>(() => ({ timezone: 'Asia/Kolkata', audience: 'ACTIVE', invitees: [], ...meeting, reason: '' }));
  const [requestKey] = useState(() => Crypto.randomUUID());
  const [vendorQuery, setVendorQuery] = useState('');
  const [vendors, setVendors] = useState<Data[]>([]);
  const action = useAction();
  const search = useAction();
  const active = meeting?.status === 'SCHEDULED';
  const past = Date.parse(meeting?.endsAt) <= Date.now();
  const canSchedule = can('growthMeetings.schedule');
  const schedule = canSchedule && (!meeting || (active && Date.parse(meeting.startsAt) > Date.now()));
  const canRun = active && past && can('growthMeetings.run');
  const path = meeting ? `${meetingPath}/${meeting.id}` : meetingPath;
  const change = (name: string, value: unknown) => setForm(current => ({ ...current, [name]: value }));
  const invitees: string[] = form.invitees;
  const participants = useResource(internal, `${path}/participation`, 0, canRun);
  const records: Data[] = participants.data.participants || [];
  const [attendanceId, setAttendanceId] = useState('');
  function submit(endpoint: string, method: string, payload: Data) {
    void action.run(async () => {
      await internal.call(endpoint, method, payload);
      navigation.goBack();
    });
  }
  function saveAttendance(vendorId: string, attended: boolean) {
    void action.run(async () => {
      await internal.call(`${path}/attendance`, 'PUT', { vendorId, attended, scheduleVersion: meeting.scheduleVersion });
      await participants.refresh();
      setAttendanceId('');
    });
  }
  return <Page title={meeting?.title || 'Schedule a Growth Meeting'}>
    <Card>
      {meeting && <><Txt muted>{meetingTime(meeting)}</Txt><Txt>{meeting.agenda}</Txt>
        {!active && <Txt>Cancelled · {meeting.cancellationReason}</Txt>}</>}
      {schedule && <>
        <GrowthFields fields={scheduleFields} form={form} busy={action.busy} change={change} />
        <Choice label="Audience" value={form.audience} values={['ACTIVE', 'INVITED']}
          labels={{ ACTIVE: 'Approved active vendors', INVITED: 'Selected vendors' }} onChange={value => change('audience', value)} />
        {form.audience === 'INVITED' && <>
          {invitees.map(id => <Button key={id} title={`Remove ${vendors.find(vendor => vendor.id === id)?.name || id}`}
            secondary disabled={action.busy} onPress={() => change('invitees', invitees.filter(value => value !== id))} />)}
          <Field label="Find a vendor by business name" value={vendorQuery} onChangeText={setVendorQuery} />
          <Button title="Find vendors" secondary busy={search.busy} disabled={vendorQuery.trim().length < 2}
            onPress={() => void search.run(async () => {
              const result = await internal.call(`${meetingPath}/invitees?q=${encodeURIComponent(vendorQuery.trim())}`);
              setVendors(result.vendors);
            })} />
          <ErrorNotice message={search.error} />
          {vendors.filter(vendor => !invitees.includes(vendor.id)).map(vendor => <MenuRow key={vendor.id} title={`Invite ${vendor.name}`}
            onPress={() => { if (!action.busy) change('invitees', [...invitees, vendor.id]); }} />)}
        </>}
      </>}
      {(schedule || (canSchedule && active && !past)) && <Field label="Schedule or cancellation reason"
        value={form.reason} editable={!action.busy} maxLength={500} onChangeText={value => change('reason', value)} />}
      {schedule && <Button title={meeting ? 'Reschedule' : 'Schedule meeting'} busy={action.busy} onPress={() => {
        const { title, agenda, startsAt, endsAt, timezone, meetUrl, audience, reason } = form;
        submit(meeting ? `${path}/schedule` : path, meeting ? 'PUT' : 'POST', {
          title, agenda, startsAt, endsAt, timezone, meetUrl, audience, invitees: audience === 'INVITED' ? invitees : [],
          reason, requestKey, revision: meeting?.revision, scheduleVersion: meeting?.scheduleVersion,
        });
      }} />}
      {canSchedule && active && !past && <Button title="Cancel meeting" secondary busy={action.busy} disabled={!form.reason.trim()}
        onPress={() => submit(`${path}/cancel`, 'POST', { reason: form.reason, revision: meeting.revision })} />}
      {canRun && <>
        <GrowthFields fields={[[ 'summary', 'Meeting summary', 6000, true ], [ 'resources', 'Resources', 6000, true ]]}
          form={form} busy={action.busy} change={change} />
        <Button title="Publish meeting summary" busy={action.busy} onPress={() => submit(`${path}/summary`, 'PUT', {
          summary: form.summary, resources: form.resources, revision: meeting.revision,
        })} />
        <Txt bold>Attendance and private feedback</Txt>
        <ErrorNotice message={participants.error} retry={participants.refresh} />
        {records.map(record => <Card key={record.vendorId}>
          <Txt bold>{record.name}</Txt>
          <Txt muted>{record.attended === true ? 'Attended' : record.attended === false ? 'Absent' : 'Attendance pending'} · {record.rsvp || 'No RSVP'}</Txt>
          {!!record.feedback && <Txt>{record.feedback}</Txt>}
          <Button title="Mark attended" secondary disabled={action.busy || record.attended === true} onPress={() => saveAttendance(record.vendorId, true)} />
          <Button title="Mark absent" secondary disabled={action.busy || record.attended === false} onPress={() => saveAttendance(record.vendorId, false)} />
        </Card>)}
        <Field label="Vendor ID for a walk-in attendee" value={attendanceId} maxLength={24} onChangeText={setAttendanceId} autoCapitalize="none" />
        <Button title="Record walk-in attendance" secondary disabled={action.busy || !/^[a-f0-9]{24}$/i.test(attendanceId)}
          onPress={() => saveAttendance(attendanceId, true)} />
      </>}
      <ErrorNotice message={action.error} />
    </Card>
  </Page>;
}
