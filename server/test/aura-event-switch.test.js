import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveEventSwitch, eventChoices, switchReply } from '../src/customer/aura/eventSwitch.js';

const events = [
  { _id: 'a', title: "Daughter's Wedding", eventType: 'wedding', city: 'Delhi', eventDate: '2027-12-20' },
  { _id: 'b', title: 'My birthday', eventType: 'birthday', city: 'Mumbai', eventDate: '2027-11-12' },
  { _id: 'c', title: 'Family wedding', eventType: 'wedding', city: 'Jaipur', eventDate: '2028-01-20' },
];
test('spoken event navigation matches English, Hindi and Hinglish without modifying facts', () => {
  for (const text of ['Switch to my birthday', 'Open my birthday event', 'birthday wale event pe chalo', 'जन्मदिन वाले इवेंट पर चलो']) assert.equal(resolveEventSwitch(text, events).event._id, 'b', text);
  assert.equal(resolveEventSwitch('Switch to my wedding in Delhi', events).event._id, 'a');
  assert.equal(resolveEventSwitch('मेरी शादी वाले इवेंट पर चलो', events).kind, 'choose');
  assert.equal(resolveEventSwitch('switch to Family wedding', events).event._id, 'c');
});
test('ambiguous names ask for clarification and ordinal answers preserve the offered order', () => {
  const result = resolveEventSwitch('Switch to wedding', events);
  assert.equal(result.kind, 'choose');
  assert.deepEqual(result.events.map(event => event._id), ['a', 'c']);
  assert.equal(resolveEventSwitch('second one', events, { pendingIds: ['a', 'c'] }).event._id, 'c');
  assert.equal(resolveEventSwitch('Delhi', events, { pendingIds: ['a', 'c'] }).event._id, 'a');
  assert.equal(resolveEventSwitch('दूसरा वाला', events, { pendingIds: ['a', 'c'] }).event._id, 'c');
  assert.equal(resolveEventSwitch('2nd one', events, { pendingIds: ['a', 'c'] }).event._id, 'c');
  assert.equal(resolveEventSwitch('two', events, { pendingIds: ['a', 'c'] }).event._id, 'c');
  assert.equal(resolveEventSwitch('keep current event', events, { pendingIds: ['a', 'c'], currentId: 'b' }).event._id, 'b');
  assert.equal(resolveEventSwitch('30', events, { pendingIds: ['a', 'c'] }).kind, 'choose');
  assert.equal(resolveEventSwitch('My birthday', events, { pendingIds: ['b', 'c'] }).event._id, 'b');
});
test('listing and unknown names return owned choices; previous event and manual selection are deterministic', () => {
  assert.equal(resolveEventSwitch('show my events', events).events.length, 3);
  assert.equal(resolveEventSwitch('switch to my graduation event', events).notFound, true);
  assert.equal(resolveEventSwitch('go back to the previous event', events, { previousId: 'a' }).event._id, 'a');
  assert.equal(resolveEventSwitch('Switch', events, { explicitId: 'b' }).event._id, 'b');
  assert.equal(resolveEventSwitch('Switch', events, { explicitId: 'someone-elses-event' }).event, null);
  assert.equal(resolveEventSwitch('show my events', []).events.length, 0);
});
test('ordinary planning, budget edits and service actions do not switch events', () => {
  for (const text of ['Plan a wedding in Delhi', 'I need catering for my birthday', 'Change my event date to 20 December', 'Open venue options', 'Show me my wedding budget', 'date badal do', 'मेरे इवेंट का बजट बदल दो']) assert.equal(resolveEventSwitch(text, events), null, text);
});
test('switch replies keep feminine Hindi/Hinglish phrasing and never claim bookings', () => {
  assert.match(switchReply('hi', events[0], []), /रही हूँ/);
  assert.match(switchReply('hinglish', events[0], []), /rahi hoon/);
  assert.equal(eventChoices(events)[0].id, 'a');
  assert.equal(eventChoices(events)[0].date, '2027-12-20');
  assert.match(switchReply('en', null, []), /no saved events/);
});
