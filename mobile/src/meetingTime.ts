import type { Data } from './api/client';

export function meetingTime(meeting: Data) {
  const format = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: meeting.timezone,
  });
  return `${format.format(new Date(meeting.startsAt))} – ${format.format(new Date(meeting.endsAt))} (${meeting.timezone})`;
}
