import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rememberCatalog, catalogScopeFor } from '../src/customer/aura/catalogMemory.js';
import { transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';

test('search overrides persist until event details change, then cards follow updated facts', () => {
  const event = { id: 'event-a', city: 'Delhi', guestCount: 100, updatedAt: '2026-10-19T10:00:00Z' };
  const memory = rememberCatalog('Show catering', { ...event, guestCount: 50, city: 'Kapkote' }, event);
  assert.equal(catalogScopeFor(memory, event).guestCount, 50);
  assert.equal(catalogScopeFor(memory, { ...event, guestCount: 200, updatedAt: '2026-10-19T10:01:00Z' }).guestCount, 200);
  assert.equal(catalogScopeFor(memory, { ...event, updatedAt: '2026-10-19T10:02:00Z' }).guestCount, 100, 'Reverting a fact must not restore a stale search override');
  assert.equal(catalogScopeFor(memory, { ...event, id: 'event-b' }), null);
});

test('long sessions keep the latest 100 saved messages in chronological order', async () => {
  const records = Array.from({ length: 130 }, (_, index) => ({ createdAt: index, _id: index, content: `Message ${index}` }));
  const query = { rows: records, sort(order) { this.rows = [...this.rows].sort((a, b) => (a.createdAt - b.createdAt) * order.createdAt); return this; }, limit(count) { this.rows = this.rows.slice(0, count); return this; }, async lean() { return this.rows; } };
  const module = { exports: {} };
  const source = transformSync(readFileSync(new URL('../src/customer/repositories/aura.repo.js', import.meta.url), 'utf8'), { format: 'cjs' }).code;
  new Function('require', 'module', 'exports', source)(() => ({ AuraMessage: { find: () => query } }), module, module.exports);
  const messages = await module.exports.listMessages('session');
  assert.equal(messages.length, 100);
  assert.equal(messages[0].content, 'Message 30');
  assert.equal(messages.at(-1).content, 'Message 129');
});
