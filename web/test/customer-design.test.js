import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const { StaticRouter } = require('react-router-dom/server');
function component(name) {
  const code = buildSync({ entryPoints: [fileURLToPath(new URL(`../src/pages/customer/${name}.jsx`, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom', 'react-router-dom'] }).outputFiles[0].text;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return module.exports.default;
}
const Summary = component('CustomerEventSummary');
const Hero = component('CustomerHero');
const render = (Component, props) => renderToStaticMarkup(React.createElement(StaticRouter, { location: '/customer' }, React.createElement(Component, props)));
test('reference styling never replaces missing event facts with mockup sample data', () => {
  const html = render(Summary, { event: { id: 'owned', title: 'My birthday', status: 'draft' }, summary: { items: [], progressPercent: 0 }, steps: [] });
  for (const text of ['My birthday', 'Date not set', 'Location not set', 'Guests not set', 'Budget not set', 'Confirm details to see options', 'Nothing paid yet']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /New Delhi|2 Nov 2026|30 guests|50,000/);
  assert.match(html, /\/customer\/events\/owned\?edit=1/);
});
test('the redesigned card displays saved facts and only verified payment amounts', () => {
  const html = render(Summary, { event: { id: 'saved', title: 'Family celebration', status: 'planning', eventDate: '2026-11-04', city: 'Kapkote', guestCount: 120, budget: 50000 }, summary: { items: [{ category: 'venue', label: 'Venue', status: 'missing', optionCount: 0 }], progressPercent: 25 }, steps: [{ key: 'planning', label: 'Planning', state: 'current' }], payments: [{ status: 'verified', amount: 6000 }, { status: 'processing', amount: 10000 }] });
  for (const text of ['Family celebration', 'Kapkote', '120 guests', '₹50,000', '₹6,000 paid', 'No options yet', '25%']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('₹16,000 paid'));
  assert.match(html, /customer-step-dot/);
  assert.match(html, /\/customer\/events\/saved\/services\?category=venue/);
});
test('the hero preserves the signed-in customer and real Aura entry points', () => {
  const html = render(Hero, { firstName: 'Ananya', eventId: 'saved' });
  assert.match(html, /Ananya/); assert.match(html, /Describe your event/);
  assert.match(html, /\/customer\/aura\?event=saved/);
  assert.doesNotMatch(html, /Dev Test Customer|New Delhi/);
});
