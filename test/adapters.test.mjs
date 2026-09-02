import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDeclarative } from '../scripts/lib/adapters/declarative.mjs';
import { extractManual } from '../scripts/lib/adapters/manual.mjs';
import { htmlToText, hostAllowed, fetchSource } from '../scripts/lib/fetch.mjs';
import { fixture, sampleVenue, fakeFetch } from './helpers.mjs';

const text = htmlToText(fixture('cfp-sample.html'));

test('htmlToText strips scripts/styles/tags and decodes entities', () => {
  assert.ok(!text.includes('1999'), 'script content must be dropped');
  assert.ok(!text.includes('color:red'));
  assert.ok(text.includes('April 12–16, 2027'));
  assert.ok(text.includes('pc-chairs@sampleconf.example'));
  assert.ok(!/\s{2,}/.test(text), 'whitespace is collapsed');
});

test('declarative extraction reads every milestone of every round', () => {
  const r = extractDeclarative(sampleVenue().cfp, text);
  assert.ok(r.ok, r.errors.join('; '));
  const [spring, fall] = r.rounds;
  assert.equal(spring.milestones[0].at, '2026-09-24T23:59:00-12:00');
  assert.equal(spring.milestones[0].sourceText, 'Thursday, September 24, 2026');
  assert.equal(spring.milestones[1].at, '2026-10-01T23:59:00-12:00');
  assert.equal(spring.milestones[2].state, 'tba');
  assert.equal(spring.milestones[2].at, null);
  assert.equal(fall.milestones[0].at, '2027-03-15T23:59:00-12:00');
  assert.equal(fall.milestones[1].at, '2027-03-22T23:59:00-12:00');
  assert.ok(r.rounds.flatMap((x) => x.milestones).every((m) => m.verification === 'verified'));
});

test('a single unmatched pattern fails the whole edition (nothing partial)', () => {
  const cfp = structuredClone(sampleVenue().cfp);
  cfp.rounds[1].milestones[1].pattern = 'Camera ready\\s*{{DATE}}';
  const r = extractDeclarative(cfp, text);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /fall\/paper: pattern not found/);
});

test('implausible years and broken chronology are rejected', () => {
  const cfp = structuredClone(sampleVenue().cfp);
  cfp.edition.year = 2030;
  let r = extractDeclarative(cfp, text);
  assert.ok(r.errors.some((e) => /implausible/.test(e)));

  const cfp2 = structuredClone(sampleVenue().cfp);
  // swap: abstract pattern now captures the paper date and vice versa
  cfp2.rounds[0].milestones[0].pattern = 'Spring cycle[\\s\\S]{0,120}?Full paper submission\\s*{{DATE}}';
  cfp2.rounds[0].milestones[1].pattern = 'Spring cycle[\\s\\S]{0,80}?Abstract registration\\s*{{DATE}}';
  r = extractDeclarative(cfp2, text);
  assert.ok(r.errors.some((e) => /spring: paper .* is earlier than abstract/.test(e)), r.errors.join('; '));
});

test('per-milestone time/tz overrides apply', () => {
  const cfp = structuredClone(sampleVenue().cfp);
  cfp.rounds[0].milestones[1].time = '17:00';
  cfp.rounds[0].milestones[1].tz = 'KST';
  const r = extractDeclarative(cfp, text);
  assert.equal(r.rounds[0].milestones[1].at, '2026-10-01T17:00:00+09:00');
  assert.equal(r.rounds[0].milestones[1].tzLabel, 'KST');
});

test('manual adapter produces verified milestones with verifiedAt', () => {
  const cfp = {
    adapter: 'manual', url: 'https://x.example/cfp',
    edition: { id: 'x-2027', year: 2027, label: 'X 2027' },
    timezone: { label: 'AoE', offset: '-12:00', time: '23:59:00' },
    rounds: [{ id: 'main', label: 'Main', track: 'full', milestones: [
      { type: 'abstract', state: 'dated', date: '2027-01-10', verifiedAt: '2026-09-02' },
      { type: 'paper', state: 'dated', date: '2027-01-17', verifiedAt: '2026-09-02', sourceUrl: 'https://x.example/dates' },
      { type: 'notification', state: 'tba' },
    ] }],
  };
  const r = extractManual(cfp);
  assert.ok(r.ok);
  assert.equal(r.rounds[0].milestones[1].at, '2027-01-17T23:59:00-12:00');
  assert.equal(r.rounds[0].milestones[1].verifiedAt, '2026-09-02');
  assert.equal(r.rounds[0].milestones[1].sourceUrl, 'https://x.example/dates');
});

test('fetchSource enforces the host allowlist, including redirects', async () => {
  const fetchImpl = fakeFetch({
    'https://ok.example/cfp': { body: '<p>hi</p>' },
    'https://ok.example/moved': { body: '<p>x</p>', finalUrl: 'https://evil.example/cfp' },
    'https://ok.example/empty': { body: '   ' },
    'https://ok.example/500': { status: 500, body: 'boom' },
  });
  assert.equal(hostAllowed('https://ok.example/a', ['ok.example']), true);
  assert.equal(hostAllowed('https://sub.ok.example/a', ['ok.example']), false);
  assert.equal((await fetchSource('https://ok.example/cfp', { allowedHosts: ['ok.example'], fetchImpl })).ok, true);
  assert.match((await fetchSource('https://evil.example/cfp', { allowedHosts: ['ok.example'], fetchImpl })).error, /not in allowedHosts/);
  assert.match((await fetchSource('https://ok.example/moved', { allowedHosts: ['ok.example'], fetchImpl })).error, /redirected/);
  assert.match((await fetchSource('https://ok.example/empty', { allowedHosts: ['ok.example'], fetchImpl })).error, /empty/);
  assert.match((await fetchSource('https://ok.example/500', { allowedHosts: ['ok.example'], fetchImpl })).error, /HTTP 500/);
  assert.match((await fetchSource('https://ok.example/404', { allowedHosts: ['ok.example'], fetchImpl })).error, /HTTP 404/);
});
