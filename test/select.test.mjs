import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectVenues } from '../scripts/lib/select.mjs';
import { minimalCatalog, sampleVenue } from './helpers.mjs';

const a = sampleVenue({ id: 'a', acronym: 'AAA', type: 'conference' });
const b = sampleVenue({ id: 'b', acronym: 'BBB', type: 'workshop', cfp: null });
const c = sampleVenue({ id: 'c', acronym: 'CCC', type: 'journal', fields: ['systems'], cfp: null, submission: 'rolling' });
const custom = sampleVenue({ id: 'mine', acronym: 'MINE', type: 'conference', fields: ['other'], custom: true });
const rankings = { core: { id: 'core', tiers: ['A*', 'A', 'B'], entries: { a: 'A*', c: 'B' } } };
const catalog = minimalCatalog([a, b, c, custom], rankings);

test('fields, explicit venues, types and exclude combine', () => {
  const { venues, report } = selectVenues(catalog, { fields: ['systems'], venues: [], types: ['conference', 'workshop'], exclude: ['b'], tiers: null });
  assert.ok(report.ok, report.format());
  assert.deepEqual(venues.map((v) => v.id), ['a', 'mine']);
});

test('unknown ids are errors; unknown exclude is a warning', () => {
  const { report } = selectVenues(catalog, { fields: ['nope'], venues: ['zzz'], types: ['conference'], exclude: ['yyy'], tiers: null });
  assert.equal(report.errors.length, 2);
  assert.equal(report.warnings.length, 1);
});

test('tier filter keeps ranked venues in tiers, respects keepUnranked, never drops custom', () => {
  const base = { fields: ['systems'], venues: [], types: ['conference', 'workshop', 'journal'], exclude: [] };
  let r = selectVenues(catalog, { ...base, tiers: { scheme: 'core', include: ['A*'], keepUnranked: true } });
  assert.deepEqual(r.venues.map((v) => v.id), ['a', 'b', 'mine']);
  r = selectVenues(catalog, { ...base, tiers: { scheme: 'core', include: ['A*'], keepUnranked: false } });
  assert.deepEqual(r.venues.map((v) => v.id), ['a', 'mine']);
  r = selectVenues(catalog, { ...base, tiers: { scheme: 'nope', include: ['A*'], keepUnranked: true } });
  assert.ok(!r.report.ok);
});
