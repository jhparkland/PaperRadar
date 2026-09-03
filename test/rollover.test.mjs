import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  expandYear, isEditionExhausted, latestDate, candidateYears, candidateSource, candidateCfp, acceptCandidate, validateRollover,
} from '../scripts/lib/rollover.mjs';
import { refreshVenue } from '../scripts/lib/refresh.mjs';
import { Report } from '../scripts/lib/errors.mjs';

const NOW = '2026-11-01T00:00:00Z';
const dated = (type, at) => ({ type, state: 'dated', at, verification: 'verified' });

const cfp = () => ({
  adapter: 'declarative',
  url: 'https://2027.eurosys.org/cfp.html',
  allowedHosts: ['2027.eurosys.org'],
  edition: { id: 'eurosys-2027', year: 2027, label: 'EuroSys 2027', event: null },
  timezone: { label: 'AoE', offset: '-12:00', time: '23:59:00', confirmed: true },
  rollover: { url: 'https://{year}.eurosys.org/cfp.html', allowedHosts: ['{year}.eurosys.org'], maxAhead: 2 },
  rounds: [{
    id: 'fall',
    label: { ko: '가을', en: 'Fall' },
    track: 'full',
    milestones: [{ type: 'paper', state: 'dated', pattern: 'Full paper submissions due:\\s*{{DATE}}' }],
  }],
});

const edition = (milestones) => ({ id: 'eurosys-2027', year: 2027, label: 'EuroSys 2027', rounds: [{ id: 'fall', track: 'full', milestones }] });

test('expandYear only substitutes a real template', () => {
  assert.equal(expandYear('https://{year}.eurosys.org/cfp.html', 2028), 'https://2028.eurosys.org/cfp.html');
  assert.equal(expandYear('https://2027.eurosys.org/cfp.html', 2028), null);
  assert.equal(expandYear(undefined, 2028), null);
});

test('an edition is exhausted only when no author deadline is still ahead', () => {
  assert.equal(isEditionExhausted(edition([dated('paper', '2026-12-01T23:59:00-12:00')]), NOW), false);
  assert.equal(isEditionExhausted(edition([dated('paper', '2026-09-01T23:59:00-12:00')]), NOW), true);
  // a future *notification* is not something the author acts on: still exhausted
  assert.equal(isEditionExhausted(edition([
    dated('paper', '2026-09-01T23:59:00-12:00'), dated('notification', '2027-01-20T23:59:00-12:00'),
  ]), NOW), true);
  assert.equal(latestDate(edition([dated('paper', '2026-09-01T23:59:00-12:00'), dated('notification', '2027-01-20T23:59:00-12:00')])),
    Date.parse('2027-01-20T23:59:00-12:00'));
});

test('candidate years stop at the cap and at what the calendar can justify', () => {
  const c = cfp();
  const past = edition([dated('paper', '2026-09-01T23:59:00-12:00')]);
  // in 2026, a 2029 CFP is not plausible yet: only 2028 is probed
  assert.deepEqual(candidateYears(c, past, { now: NOW }), [2028]);
  // in 2027 both remaining candidates are in range
  assert.deepEqual(candidateYears(c, past, { now: '2027-06-01T00:00:00Z' }), [2028, 2029]);
  // still-live edition, or no rollover block → nothing is probed
  assert.deepEqual(candidateYears(c, edition([dated('paper', '2026-12-01T23:59:00-12:00')]), { now: NOW }), []);
  assert.deepEqual(candidateYears({ ...c, rollover: null }, past, { now: NOW }), []);
});

test('a candidate is fetched only under its own expanded allow-list', () => {
  const s = candidateSource(cfp(), 2028);
  assert.deepEqual(s, { url: 'https://2028.eurosys.org/cfp.html', allowedHosts: ['2028.eurosys.org'] });
  // a template whose host does not cover its own URL is refused outright
  const mismatched = { ...cfp(), rollover: { url: 'https://{year}.evil.example/cfp', allowedHosts: ['{year}.eurosys.org'], maxAhead: 2 } };
  assert.equal(candidateSource(mismatched, 2028), null);
  // a host that carries no year is the same host every edition, and must
  // survive expansion rather than emptying the allow-list
  const staticHost = {
    ...cfp(),
    url: 'https://www.asplos-conference.org/asplos2027/cfp/',
    allowedHosts: ['www.asplos-conference.org'],
    rollover: { url: 'https://www.asplos-conference.org/asplos{year}/cfp/', allowedHosts: ['www.asplos-conference.org'], maxAhead: 2 },
  };
  assert.deepEqual(candidateSource(staticHost, 2028), {
    url: 'https://www.asplos-conference.org/asplos2028/cfp/',
    allowedHosts: ['www.asplos-conference.org'],
  });
  const next = candidateCfp(cfp(), 2028, s, 'EuroSys');
  assert.equal(next.edition.id, 'eurosys-2028');
  assert.equal(next.edition.label, 'EuroSys 2028');
  assert.equal(next.edition.event, null, 'event dates of the old edition must not be carried over');
  assert.deepEqual(next.rounds, cfp().rounds, 'the venue keeps its own patterns');
});

test('a candidate page is rejected unless it really carries the next edition', () => {
  const current = edition([dated('paper', '2026-09-01T23:59:00-12:00')]);
  const rounds = (ms) => [{ id: 'fall', track: 'full', milestones: ms }];
  assert.equal(acceptCandidate(rounds([{ type: 'paper', state: 'tba', at: null }]), current, { now: NOW }).ok, false);
  assert.match(acceptCandidate(rounds([]), current, { now: NOW }).reason, /no dated milestone/);
  assert.match(acceptCandidate(rounds([dated('paper', '2026-09-01T23:59:00-12:00')]), current, { now: NOW }).reason, /no future author deadline/);
  // a page still showing the previous edition's dates must not be adopted
  assert.match(
    acceptCandidate(rounds([dated('notification', '2026-10-01T00:00:00Z'), dated('paper', '2026-08-01T00:00:00Z')]), current, { now: NOW }).reason,
    /no future author deadline/,
  );
  assert.equal(acceptCandidate(rounds([dated('paper', '2027-09-01T23:59:00-12:00')]), current, { now: NOW }).ok, true);
});

test('validateRollover requires the template to reproduce the tracked url', () => {
  const check = (ro, c = cfp()) => {
    const report = new Report();
    const out = validateRollover(ro, report, 'v.cfp.rollover', c);
    return { out, errors: report.errors.map((e) => `${e.path}: ${e.message}`) };
  };
  assert.ok(check({ url: 'https://{year}.eurosys.org/cfp.html', allowedHosts: ['{year}.eurosys.org'] }).out);
  assert.match(check({ url: 'https://2028.eurosys.org/cfp.html', allowedHosts: ['{year}.eurosys.org'] }).errors[0], /\{year\}/);
  assert.match(check({ url: 'https://{year}.other.example/cfp.html', allowedHosts: ['{year}.other.example'] }).errors[0], /not the tracked url/);
  assert.match(check({ url: 'https://{year}.eurosys.org/cfp.html', allowedHosts: ['{year}.elsewhere.example'] }).errors[0], /not in cfp.allowedHosts/);
  assert.match(check({ url: 'https://{year}.eurosys.org/cfp.html', allowedHosts: ['{year}.eurosys.org'], maxAhead: 99 }).errors[0], /1 to 5/);
});

test('refresh follows a venue into its next edition and keeps the old one', async () => {
  const venue = { id: 'eurosys', acronym: 'EuroSys', name: 'EuroSys', type: 'conference', cfp: cfp() };
  const pages = {
    'https://2027.eurosys.org/cfp.html': '<p>Fall Deadline Full paper submissions due: September 24, 2026</p>',
    'https://2028.eurosys.org/cfp.html': '<p>Fall Deadline Full paper submissions due: September 23, 2027</p>',
  };
  const fetchImpl = async (url) => (pages[url]
    ? { ok: true, status: 200, url, text: async () => pages[url] }
    : { ok: false, status: 404, url, text: async () => '' });

  const r = await refreshVenue(venue, undefined, { now: NOW, fetchImpl });
  assert.ok(r.rollover, 'the 2027 edition is over, so 2028 is adopted');
  assert.equal(r.rollover.edition.label, 'EuroSys 2028');
  assert.equal(r.rollover.cfp.url, 'https://2028.eurosys.org/cfp.html');
  assert.deepEqual(r.schedule.editions.map((e) => e.id).sort(), ['eurosys-2027', 'eurosys-2028'], 'the past edition is kept as history');
  assert.equal(r.schedule.editions.find((e) => e.id === 'eurosys-2028').rounds[0].milestones[0].at.slice(0, 10), '2027-09-23');
  assert.ok(r.changes.some((c) => c.kind === 'rolled-over' && c.message === 'EuroSys 2027 → EuroSys 2028'));
  assert.equal(r.failure, null, 'a rollover is not a failure');

  // while the current edition still has a future deadline, nothing is probed
  const live = { ...venue, cfp: { ...cfp(), url: 'https://2027.eurosys.org/cfp.html' } };
  const early = await refreshVenue(live, undefined, { now: '2026-01-01T00:00:00Z', fetchImpl });
  assert.equal(early.rollover, undefined);
  assert.deepEqual(early.schedule.editions.map((e) => e.id), ['eurosys-2027']);
});

test('a dead CFP url is the usual rollover trigger, and is not reported as a failure', async () => {
  // The most common real sequence: the venue publishes the next edition and
  // takes the old page down. Refresh must follow instead of filing an issue.
  const venue = { id: 'eurosys', acronym: 'EuroSys', name: 'EuroSys', type: 'conference', cfp: cfp() };
  const fetchImpl = async (url) => (url === 'https://2028.eurosys.org/cfp.html'
    ? { ok: true, status: 200, url, text: async () => '<p>Fall Deadline Full paper submissions due: September 23, 2027</p>' }
    : { ok: false, status: 404, url, text: async () => '' });

  const r = await refreshVenue(venue, undefined, { now: NOW, fetchImpl });
  assert.ok(r.rollover, 'the dead 2027 page must not stop the 2028 probe');
  assert.equal(r.failure, null, 'following the venue forward is not a source failure');
  assert.equal(r.changes.some((c) => c.kind === 'failed'), false);
  assert.ok(r.changes.some((c) => c.kind === 'rolled-over'));

  // but a dead page with nowhere to go stays a failure that a human must see
  const stuck = await refreshVenue(
    { ...venue, cfp: { ...cfp(), rollover: null } }, undefined,
    { now: NOW, fetchImpl: async (url) => ({ ok: false, status: 404, url, text: async () => '' }) },
  );
  assert.equal(stuck.rollover, undefined);
  assert.match(stuck.failure.error, /HTTP 404/);
});

test('a venue whose next edition is not published yet simply stays put', async () => {
  const venue = { id: 'eurosys', acronym: 'EuroSys', name: 'EuroSys', type: 'conference', cfp: cfp() };
  const fetchImpl = async (url) => (url === 'https://2027.eurosys.org/cfp.html'
    ? { ok: true, status: 200, url, text: async () => '<p>Fall Deadline Full paper submissions due: September 24, 2026</p>' }
    : { ok: false, status: 404, url, text: async () => '' });
  const r = await refreshVenue(venue, undefined, { now: NOW, fetchImpl });
  assert.equal(r.rollover, undefined);
  assert.equal(r.failure, null, 'a 404 on next year is not a source failure');
  assert.deepEqual(r.schedule.editions.map((e) => e.id), ['eurosys-2027']);
});
