import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSiteModel } from '../scripts/lib/site-model.mjs';
import { refreshVenue } from '../scripts/lib/refresh.mjs';
import { normalizeConfig } from '../scripts/lib/config.mjs';
import { fixture, sampleVenue, fakeFetch, minimalCatalog, NOW } from './helpers.mjs';

test('site model exposes venues, upcoming, sources and i18n consistently', async () => {
  const venue = sampleVenue();
  const journal = sampleVenue({ id: 'tj', acronym: 'TJ', name: 'Test Journal', type: 'journal', submission: 'rolling', cfp: null });
  const r = await refreshVenue(venue, undefined, { now: NOW, fetchImpl: fakeFetch({ [venue.cfp.url]: { body: fixture('cfp-sample.html') } }) });
  const schedules = { version: 1, updatedAt: NOW, venues: { sampleconf: r.schedule } };
  const rankings = { core: { id: 'core', label: { en: 'CORE' }, url: null, tiers: ['A*', 'A'], entries: { sampleconf: 'A' } } };
  const catalog = minimalCatalog([venue, journal], rankings);
  const { config } = normalizeConfig({ version: 1, site: { languages: ['en'], upcomingDays: 60 }, rankings: { show: ['core'] }, select: { fields: ['systems'] } });
  const venues = [{ ...venue, rankings: { core: 'A' } }, { ...journal, rankings: {} }];
  const model = buildSiteModel({ config, catalog, venues, schedules, updates: { entries: [{ at: NOW, kind: 'added' }] }, now: NOW });

  assert.equal(model.venues.length, 2);
  const sc = model.venues.find((v) => v.id === 'sampleconf');
  assert.equal(sc.status, 'verified');
  assert.equal(sc.next.type, 'abstract');
  assert.equal(sc.rankings.core, 'A');
  assert.equal(sc.editions[0].rounds.length, 2);
  assert.equal(sc.icsPath, 'calendars/venues/sampleconf.ics');
  const tj = model.venues.find((v) => v.id === 'tj');
  assert.equal(tj.status, 'rolling');
  assert.equal(tj.next, null);
  assert.equal(model.upcoming.length, 2, 'only the spring deadlines fall within 60 days');
  assert.equal(model.sources.length, 1);
  assert.equal(model.sources[0].status, 'ok');
  assert.deepEqual(Object.keys(model.i18n), ['en']);
  assert.equal(model.rankings[0].feeds[0].path, 'calendars/tiers/core/astar.ics');
  assert.equal(model.primaryRanking, 'core');
  assert.equal(model.updates.length, 1);
  assert.deepEqual(model.fields.map((f) => f.id), ['systems']);
});
