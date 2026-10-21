import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuraLive } from '../src/auraLive.ts';

const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
test('live cards apply changed data, preserve expanded cards on identical refreshes, and stop when hidden', async () => {
  let snapshot = { price: 100, checkedAt: 'first' }, scheduled: (() => void) | undefined;
  const applied: unknown[] = [];
  const live = createAuraLive({ read: async () => snapshot, apply: value => applied.push(value), schedule: callback => { scheduled = callback; return 1 as any; }, cancel: () => { scheduled = undefined; } });
  live.start(); await flush();
  assert.equal(applied.length, 1);
  snapshot = { price: 100, checkedAt: 'second' }; scheduled!(); await flush();
  assert.equal(applied.length, 1);
  snapshot = { price: 250, checkedAt: 'third' }; scheduled!(); await flush();
  assert.equal(applied.length, 2);
  live.stop(); assert.equal(scheduled, undefined);
  await live.refresh(); assert.equal(applied.length, 2);
});
test('a read started before a voice/text turn cannot roll the card back', async () => {
  const resolvers: ((value: any) => void)[] = [], applied: any[] = [];
  let scheduled: (() => void) | undefined;
  const live = createAuraLive({ read: () => new Promise(resolve => resolvers.push(resolve)), apply: value => applied.push(value), schedule: callback => { scheduled = callback; return 1 as any; }, cancel: () => { scheduled = undefined; } });
  live.start(); live.beginWrite();
  resolvers.shift()!({ event: 'old-event', guests: 20 }); await flush();
  assert.deepEqual(applied, []);
  live.endWrite(); resolvers.shift()!({ event: 'new-event', guests: 100 }); await flush();
  assert.deepEqual(applied, [{ event: 'new-event', guests: 100 }]);
  live.stop();
});
test('returning to Aura ignores a prior in-flight read and refreshes the current snapshot', async () => {
  const resolvers: ((value: any) => void)[] = [], applied: any[] = [];
  let scheduled: (() => void) | undefined;
  const live = createAuraLive({ read: () => new Promise(resolve => resolvers.push(resolve)), apply: value => applied.push(value), schedule: callback => { scheduled = callback; return 1 as any; }, cancel() {} });
  live.start(); live.stop(); live.start();
  resolvers.shift()!({ city: 'old' }); await flush(); assert.deepEqual(applied, []);
  scheduled!(); resolvers.shift()!({ city: 'updated' }); await flush();
  assert.deepEqual(applied, [{ city: 'updated' }]); live.stop();
});
