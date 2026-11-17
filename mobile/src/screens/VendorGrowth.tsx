import { useRef, useState } from 'react';
import { Linking, Switch, View } from 'react-native';
import { external } from '../api/runtime';
import type { Data } from '../api/client';
import { meetingTime } from '../meetingTime';
import { Button, Card, Choice, Empty, ErrorNotice, Field, MenuRow, Page, Txt, useAction, useResource } from '../ui';
import { AcademyVideo } from './AcademyVideo';

const identityPath = '/vendor/profile/social-links';
const academyPath = '/vendor/academy';
const meetingPath = '/vendor/growth-meetings';

type SocialLink = { platform: string; url: string; public: boolean };
type SocialProfile = {
  revision: number;
  links: SocialLink[];
  platforms: { id: string; label: string }[];
  publishable: boolean;
  publishProfile: boolean;
  reason: string;
};

export function VendorSocialLinks() {
  const resource = useResource(external, identityPath);
  const [refresh, setRefresh] = useState(0);
  const saved = resource.data as SocialProfile;
  return <Page {...resource} title="Social Media Links"
    subtitle="Choose which links customers can open from your public profile."
    refresh={() => { setRefresh(value => value + 1); return resource.refresh(); }}>
    {saved.platforms && <SocialLinksForm key={`${saved.revision}:${refresh}`} saved={saved} />}
  </Page>;
}

function SocialLinksForm({ saved }: { saved: SocialProfile }) {
  const [profile, setProfile] = useState(saved);
  const [notice, setNotice] = useState('');
  const action = useAction();
  const available = profile.platforms.filter(platform => !profile.links.some(link => link.platform === platform.id));
  function setLinks(links: SocialLink[]) {
    setNotice('');
    setProfile(current => ({ ...current, links }));
  }
  return <Card>
    <Txt>Your published profile shows your business name, category and public links.</Txt>
    {profile.links.map((link, index) => {
      const platform = profile.platforms.find(option => option.id === link.platform);
      const label = platform?.label || link.platform;
      const update = (patch: Partial<SocialLink>) => setLinks(profile.links.map((item, position) =>
        position === index ? { ...item, ...patch } : item));
      return <Card key={link.platform}>
        <Txt bold>{label}</Txt>
        <Field label={`${label} profile URL`} value={link.url} editable={!action.busy} autoCapitalize="none"
          keyboardType="url" maxLength={1024} onChangeText={url => update({ url })} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Txt style={{ flex: 1 }}>Display {label} publicly</Txt>
          <Switch accessibilityLabel={`Display ${label} publicly`} value={link.public} disabled={action.busy}
            onValueChange={value => update({ public: value })} />
        </View>
        <Button title={`Remove ${label}`} secondary disabled={action.busy}
          onPress={() => setLinks(profile.links.filter(item => item.platform !== link.platform))} />
      </Card>;
    })}
    {available.length > 0 && !action.busy && <Choice label="Add a social link" value=""
      values={available.map(platform => platform.id)}
      labels={Object.fromEntries(available.map(platform => [platform.id, platform.label]))}
      onChange={platform => setLinks([...profile.links, { platform, url: '', public: false }])} />}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Txt style={{ flex: 1 }}>Publish my STARVNT business profile</Txt>
      <Switch accessibilityLabel="Publish my STARVNT business profile" value={profile.publishProfile}
        disabled={action.busy || (!profile.publishable && !profile.publishProfile)}
        onValueChange={publishProfile => { setNotice(''); setProfile(current => ({ ...current, publishProfile })); }} />
    </View>
    {!!profile.reason && <Txt muted>{profile.reason}</Txt>}
    <ErrorNotice message={action.error} retry={() => void action.run(async () => {
      setProfile(await external.call(identityPath) as SocialProfile);
      setNotice('Saved profile reloaded.');
    })} />
    {!!notice && <Txt>{notice}</Txt>}
    <Button title="Save profile settings" busy={action.busy} onPress={() => void action.run(async () => {
      const { revision, publishProfile, links } = profile;
      setProfile(await external.call(identityPath, 'PUT', { revision, publishProfile, links }) as SocialProfile);
      setNotice('Profile settings saved.');
    })} />
  </Card>;
}

export function VendorAcademy({ navigation }: any) {
  const resource = useResource(external, academyPath);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [progress, setProgress] = useState('All lessons');
  const lessons: Data[] = resource.data.lessons || [];
  const matching = lessons.filter(lesson =>
    (category === 'All categories' || lesson.category === category) &&
    `${lesson.title} ${lesson.objective}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (progress === 'Completed' ? lesson.completedAt : progress === 'In progress' ? lesson.positionSeconds > 0 && !lesson.completedAt : progress === 'Not started' ? !lesson.positionSeconds && !lesson.completedAt : true));
  return <Page {...resource} title="Partner Academy" subtitle="Browse lessons and pick up where you left off.">
    <Field label="Search lessons" value={query} onChangeText={setQuery} />
    <Choice label="Category" values={['All categories', ...(resource.data.categories || [])]} value={category} onChange={setCategory} />
    <Choice label="Progress" values={['All lessons', 'Not started', 'In progress', 'Completed']} value={progress} onChange={setProgress} />
    {matching.map(lesson => <MenuRow key={lesson.id} title={lesson.title}
      subtitle={`${lesson.category} · ${lesson.completedAt ? 'Completed' : lesson.positionSeconds ? 'In progress' : lesson.objective}`}
      onPress={() => openLesson(navigation, lesson)} />)}
    {!resource.loading && !resource.error && !matching.length &&
      <Empty title={lessons.length ? 'No matching lessons' : 'No published lessons yet'} />}
    {resource.data.truncated && <Txt muted>Showing the 100 most recent lessons.</Txt>}
  </Page>;
}

function openLesson(navigation: any, lesson: Data) {
  navigation.navigate('VendorLesson', {
    id: lesson.id, version: lesson.contentVersion, position: lesson.positionSeconds, completed: Boolean(lesson.completedAt),
  });
}

export function VendorGrowthCards({ navigation }: any) {
  const academy = useResource(external, academyPath);
  const meetings = useResource(external, `${meetingPath}/next`);
  const continuing = (academy.data.lessons || []).filter((lesson: Data) =>
    lesson.positionSeconds > 0 && !lesson.completedAt).slice(0, 3);
  const next = meetings.data.meeting;
  return <Card>
    <Txt bold size={23}>Learning & Growth</Txt>
    <Txt bold>Continue Watching</Txt>
    {academy.loading ? <Txt muted>Loading lesson progress…</Txt> :
      academy.error ? <Txt muted>Lesson progress is unavailable.</Txt> :
      continuing.length ? continuing.map((lesson: Data) =>
        <MenuRow key={lesson.id} title={lesson.title} onPress={() => openLesson(navigation, lesson)} />) :
      <Txt muted>Lessons you start will appear here.</Txt>}
    <Button title="Partner Academy" secondary onPress={() => navigation.navigate('VendorAcademy')} />
    <Txt bold>Next Growth Meeting</Txt>
    {next && !meetings.error ? <><Txt>{next.title}</Txt><Txt muted>{meetingTime(next)}</Txt></> :
      <Txt muted>{meetings.loading ? 'Loading schedule…' : meetings.error ? meetings.error : 'No upcoming meetings.'}</Txt>}
    <Button title="Growth Meetings" secondary onPress={() => navigation.navigate('VendorMeetings')} />
  </Card>;
}

export function VendorLesson({ route }: any) {
  const { id, version, position, completed } = route.params;
  const path = `${academyPath}/${encodeURIComponent(id)}`;
  const resource = useResource(external, path);
  const action = useAction();
  const playbackAction = useAction();
  const checkpoint = useAction();
  const [playbackError, setPlaybackError] = useState('');
  const [playback, setPlayback] = useState<{ url: string; position: number; version: number } | null>(null);
  const [progress, setProgress] = useState({ version, position, completed });
  const lesson = resource.data.lesson;
  const current = progress.version === lesson?.contentVersion ? progress : { position: 0, completed: false };
  async function save(positionSeconds: number, complete = false) {
    const contentVersion = lesson.contentVersion;
    const result = await external.call(`${path}/progress`, 'PUT', {
      contentVersion, positionSeconds: Math.min(lesson.durationSeconds, Math.max(0, Math.floor(positionSeconds))), complete,
    });
    setProgress(previous => previous.version > contentVersion ? previous : ({
      version: contentVersion,
      position: Math.max(previous.version === contentVersion ? previous.position : 0, result.positionSeconds),
      completed: Boolean(result.completedAt) || (previous.version === contentVersion && previous.completed),
    }));
  }
  return <Page {...resource} title={lesson?.title || 'Academy lesson'}>
    {lesson && <Card>
      <Txt muted>{lesson.category}</Txt>
      <Txt bold>{lesson.objective}</Txt>
      {lesson.hasVideo && <>
        {playback && playback.version === lesson.contentVersion && !resource.error &&
          <AcademyVideo key={playback.url} url={playback.url} position={playback.position} captions={lesson.captions}
            onError={() => setPlaybackError('Playback stopped. Refresh video access to try again.')}
            onProgress={(seconds, ended) => { void (ended ? action : checkpoint).run(() => save(seconds, ended)); }} />}
        <ErrorNotice message={playbackAction.error || playbackError || checkpoint.error} />
        <Button title={playback ? 'Refresh video access' : 'Open video'} secondary busy={playbackAction.busy}
          onPress={() => void playbackAction.run(async () => {
            setPlaybackError('');
            const { url } = await external.call(`${path}/playback`, 'POST');
            if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('Secure video access is unavailable.');
            setPlayback({ url, position: current.position, version: lesson.contentVersion });
          })} />
      </>}
      <Txt>{lesson.content}</Txt>
      {!!lesson.resources && <><Txt bold>Resources</Txt><Txt>{lesson.resources}</Txt></>}
      <ErrorNotice message={action.error} />
      {current.completed ? <Txt bold>Completed</Txt> : <Button title="Mark complete" busy={action.busy}
        onPress={() => void action.run(() => save(current.position, true))} />}
      <LessonFeedback key={`${lesson.id}:${lesson.contentVersion}`} path={path} version={lesson.contentVersion} saved={resource.data.feedback} />
    </Card>}
  </Page>;
}

function LessonFeedback({ path, version, saved }: { path: string; version: number; saved?: Data }) {
  const action = useAction();
  const [rating, setRating] = useState(String(saved?.rating || 5)), [comment, setComment] = useState(saved?.comment || ''), [notice, setNotice] = useState('');
  const pending = useRef<{ content: string; key: string } | null>(null);
  return <Card>
    <Txt bold>Private lesson feedback</Txt>
    <Choice label="Usefulness (1–5)" values={['1', '2', '3', '4', '5']} value={rating} onChange={setRating} />
    <Field label="Comment (optional)" value={comment} onChangeText={setComment} multiline maxLength={1500} editable={!action.busy} />
    <ErrorNotice message={action.error} />
    {!!notice && <Txt>{notice}</Txt>}
    <Button title="Save lesson feedback" busy={action.busy} onPress={() => void action.run(async () => {
      setNotice('');
      const content = JSON.stringify({ rating: Number(rating), comment, contentVersion: version });
      if (pending.current?.content !== content) pending.current = { content, key: `feedback-${Date.now()}-${Math.random().toString(36).slice(2)}` };
      await external.call(`${path}/feedback`, 'POST', { rating: Number(rating), comment, contentVersion: version, requestKey: pending.current.key });
      setNotice('Private lesson feedback saved for this version.');
    })} />
  </Card>;
}

export function VendorMeetings() {
  const resource = useResource(external, meetingPath, 30_000);
  const meetings: Data[] = resource.data.meetings || [];
  return <Page {...resource} title="Growth Meetings" subtitle="See your upcoming meetings, RSVP and review notes from past sessions.">
    {meetings.map(meeting => <MeetingCard key={`${meeting.id}:${meeting.scheduleVersion}`} meeting={meeting} refresh={resource.refresh} />)}
    {!resource.loading && !resource.error && !meetings.length && <Empty title="No meetings available" />}
    {resource.data.truncated && <Txt muted>Showing up to 50 upcoming and 50 past meetings.</Txt>}
  </Page>;
}

function MeetingCard({ meeting, refresh }: { meeting: Data; refresh: () => Promise<void> }) {
  const action = useAction();
  const [feedbackDraft, setFeedbackDraft] = useState<string | null>(null);
  const path = `${meetingPath}/${encodeURIComponent(meeting.id)}`;
  const schedule = { scheduleVersion: meeting.scheduleVersion };
  const cancelled = meeting.status === 'CANCELLED';
  const past = Date.parse(meeting.endsAt) <= Date.now();
  function rsvp(value: string) {
    void action.run(async () => {
      await external.call(`${path}/rsvp`, 'PUT', { ...schedule, rsvp: value });
      await refresh();
    });
  }
  return <Card>
    <Txt bold size={20}>{meeting.title}</Txt>
    <Txt muted>{meetingTime(meeting)}</Txt>
    <Txt>{meeting.agenda}</Txt>
    {cancelled && <Txt>Cancelled · {meeting.cancellationReason}</Txt>}
    {!cancelled && !past && <>
      <Txt>RSVP · {meeting.rsvp === 'GOING' ? 'Going' : meeting.rsvp === 'NOT_GOING' ? 'Not going' : 'Awaiting response'}</Txt>
      <Button title="Going" secondary disabled={action.busy || meeting.rsvp === 'GOING'} onPress={() => rsvp('GOING')} />
      <Button title="Not going" secondary disabled={action.busy || meeting.rsvp === 'NOT_GOING'} onPress={() => rsvp('NOT_GOING')} />
      {meeting.canJoin ? <Button title="Join Google Meet" busy={action.busy} onPress={() => void action.run(async () => {
        const { url } = await external.call(`${path}/join`, 'POST', schedule);
        if (typeof url !== 'string' || new URL(url).origin !== 'https://meet.google.com') throw new Error('Meeting link is unavailable.');
        await Linking.openURL(url);
      })} /> : <Txt muted>The join link opens 15 minutes before the meeting.</Txt>}
    </>}
    {!!meeting.summary && <><Txt bold>Meeting summary</Txt><Txt>{meeting.summary}</Txt></>}
    {!!meeting.resources && <><Txt bold>Resources</Txt><Txt>{meeting.resources}</Txt></>}
    {!cancelled && past && meeting.attended === true && <>
      <Field label="Private meeting feedback" multiline value={feedbackDraft ?? meeting.feedback} maxLength={1500}
        editable={!action.busy} onChangeText={setFeedbackDraft} />
      <Button title="Save feedback" busy={action.busy} disabled={!feedbackDraft?.trim()} onPress={() => void action.run(async () => {
        await external.call(`${path}/feedback`, 'PUT', { ...schedule, feedback: feedbackDraft?.trim() });
        await refresh();
        setFeedbackDraft(null);
      })} />
    </>}
    <ErrorNotice message={action.error} retry={refresh} />
  </Card>;
}
