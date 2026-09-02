import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshVenue, appendUpdates } from '../scripts/lib/refresh.mjs';
import { flattenDeadlines, nextDeadline, venueStatus, milestoneStatus } from '../scripts/lib/schedule.mjs';
import { fixture, sampleVenue, fakeFetch, NOW } from './helpers.mjs';

const venue = sampleVenue();
const URL = venue.cfp.url;
const good = fakeFetch({ [URL]: { body: fixture('cfp-sample.html') } });
const down = fakeFetch({ [URL]: { status: 503, body: 'maintenance' } });
const changed = fakeFetch({ [URL]: { body: fixture('cfp-sample.html').replace('October 1st, 2026', 'October 8, 2026') } });
const broken = fakeFetch({ [URL]: { body: fixture('cfp-sample.html').replace('Full paper submission', 'Manuscript due') } });

test('first successful refresh creates a verified edition', async () => {
  const r = await refreshVenue(venue, undefined, { now: NOW, fetchImpl: good });
  assert.equal(r.failure, null);
  const e = r.schedule.editions[0];
  assert.equal(e.id, 'sampleconf-2027');
  assert.equal(e.source.status, 'ok');
  assert.equal(e.source.lastOkAt, NOW);
  assert.ok(e.source.contentHash);
  assert.equal(r.changes.filter((c) => c.kind === 'added').length, 4);
  const rows = flattenDeadlines(venue, r.schedule);
  assert.equal(rows.length, 5);
  assert.equal(nextDeadline(rows, NOW).at, '2026-09-24T23:59:00-12:00');
  assert.equal(venueStatus(venue, rows, NOW), 'verified');
});

test('a failed fetch keeps the last good dates and marks them needs-verification', async () => {
  const first = await refreshVenue(venue, undefined, { now: NOW, fetchImpl: good });
  const r = await refreshVenue(venue, first.schedule, { now: '2026-09-03T00:00:00Z', fetchImpl: down });
  assert.match(r.failure.error, /HTTP 503/);
  const e = r.schedule.editions[0];
  assert.equal(e.source.status, 'failed');
  assert.equal(e.source.lastOkAt, NOW, 'lastOkAt is preserved');
  const paper = e.rounds[0].milestones[1];
  assert.equal(paper.at, '2026-10-01T23:59:00-12:00', 'date survives');
  assert.equal(paper.verification, 'needs-verification');
  assert.equal(milestoneStatus(paper), 'needs-verification');
  assert.equal(e.rounds[0].milestones[2].verification, 'verified', 'tba milestones are untouched');
  assert.ok(r.changes.some((c) => c.kind === 'failed'));
  assert.equal(r.changes.filter((c) => c.kind === 'changed').length, 0, 'no date changes are logged on failure');
});

test('a page whose wording changed also degrades instead of overwriting', async () => {
  const first = await refreshVenue(venue, undefined, { now: NOW, fetchImpl: good });
  const r = await refreshVenue(venue, first.schedule, { now: NOW, fetchImpl: broken });
  assert.match(r.failure.error, /extraction failed: .*pattern not found/);
  assert.equal(r.schedule.editions[0].rounds[0].milestones[1].at, '2026-10-01T23:59:00-12:00');
});

test('recovery after failure re-verifies and logs "recovered"; date changes are logged', async () => {
  const first = await refreshVenue(venue, undefined, { now: NOW, fetchImpl: good });
  const failed = await refreshVenue(venue, first.schedule, { now: NOW, fetchImpl: down });
  const r = await refreshVenue(venue, failed.schedule, { now: NOW, fetchImpl: changed });
  assert.equal(r.failure, null);
  assert.equal(r.schedule.editions[0].source.status, 'ok');
  assert.ok(r.changes.some((c) => c.kind === 'recovered'));
  const change = r.changes.find((c) => c.kind === 'changed');
  assert.equal(change.uid, 'sampleconf/sampleconf-2027/spring/full/paper');
  assert.equal(change.before, '2026-10-01T23:59:00-12:00');
  assert.equal(change.after, '2026-10-08T23:59:00-12:00');
  assert.ok(r.schedule.editions[0].rounds.flatMap((x) => x.milestones).every((m) => m.verification === 'verified'));
});

test('failure with no previous data stores a dated skeleton without dates', async () => {
  const r = await refreshVenue(venue, undefined, { now: NOW, fetchImpl: down });
  const e = r.schedule.editions[0];
  assert.equal(e.source.status, 'failed');
  assert.equal(e.source.lastOkAt, null);
  const paper = e.rounds[0].milestones[1];
  assert.equal(paper.at, null);
  assert.equal(paper.verification, 'needs-verification');
  const rows = flattenDeadlines(venue, r.schedule);
  assert.equal(nextDeadline(rows, NOW), null);
  assert.equal(venueStatus(venue, rows, NOW), 'needs-verification');
});

test('previous editions are kept when a new edition arrives', async () => {
  const first = await refreshVenue(venue, undefined, { now: NOW, fetchImpl: good });
  const v2 = structuredClone(venue);
  v2.cfp.edition = { id: 'sampleconf-2028', year: 2028, label: 'SampleConf 2028', event: null };
  const html = fixture('cfp-sample.html').replaceAll('2026', '2027').replaceAll('2027-03', '2028-03').replace('15 March 2027', '15 March 2028');
  const r = await refreshVenue(v2, first.schedule, { now: NOW, fetchImpl: fakeFetch({ [URL]: { body: html } }) });
  assert.deepEqual(r.schedule.editions.map((e) => e.id), ['sampleconf-2028', 'sampleconf-2027']);
});

test('manual venues never fetch and are marked manual', async () => {
  const manual = sampleVenue({
    cfp: {
      adapter: 'manual', url: 'https://x.example/cfp',
      edition: { id: 'sampleconf-2027', year: 2027, label: 'SampleConf 2027', event: null },
      timezone: { label: 'AoE', offset: '-12:00', time: '23:59:00' },
      rounds: [{ id: 'main', label: 'Main', track: 'full', milestones: [{ type: 'paper', state: 'dated', date: '2027-01-17', verifiedAt: '2026-09-02' }] }],
    },
  });
  const r = await refreshVenue(manual, undefined, { now: NOW, fetchImpl: () => { throw new Error('must not fetch'); } });
  assert.equal(r.failure, null);
  assert.equal(r.schedule.editions[0].source.status, 'manual');
  assert.equal(r.schedule.editions[0].rounds[0].milestones[0].verifiedAt, '2026-09-02');
});

test('appendUpdates is newest-first and capped', () => {
  const u = appendUpdates({ version: 1, entries: [{ at: 'old' }] }, [{ at: 'a' }, { at: 'b' }], 2);
  assert.deepEqual(u.entries.map((e) => e.at), ['b', 'a']);
});
