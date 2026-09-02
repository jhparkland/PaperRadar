import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCalendar, renderIcs, feedsFor, fold, escapeText, eventSummary } from '../scripts/lib/ics.mjs';
import { refreshVenue } from '../scripts/lib/refresh.mjs';
import { flattenDeadlines } from '../scripts/lib/schedule.mjs';
import { fixture, sampleVenue, fakeFetch, NOW } from './helpers.mjs';

const venue = sampleVenue();
const opts = { now: NOW, lang: 'en', timeZone: 'Asia/Seoul' };

async function rowsFrom(html) {
  const r = await refreshVenue(venue, undefined, { now: NOW, fetchImpl: fakeFetch({ [venue.cfp.url]: { body: html } }) });
  return flattenDeadlines(venue, r.schedule);
}

test('plan emits confirmed events with sequence 0 and skips tba', async () => {
  const rows = await rowsFrom(fixture('cfp-sample.html'));
  const { events, nextState } = planCalendar(rows, {}, opts);
  assert.equal(events.length, 4);
  assert.ok(events.every((e) => e.status === 'CONFIRMED' && e.sequence === 0));
  assert.equal(events[0].dtstart, '20260925T115900Z');
  assert.equal(eventSummary(events[0].row, 'en'), 'SampleConf 2027 · Spring Abstract deadline');
  assert.equal(eventSummary(events[0].row, 'ko'), 'SampleConf 2027 · 봄 초록 마감');
  assert.equal(Object.keys(nextState).length, 4);
});

test('sequence bumps when a date changes and cancelled events are emitted then aged out', async () => {
  const rows1 = await rowsFrom(fixture('cfp-sample.html'));
  const p1 = planCalendar(rows1, {}, opts);
  const rows2 = await rowsFrom(fixture('cfp-sample.html').replace('October 1st, 2026', 'October 8, 2026'));
  // the spring paper date moved; the fall round disappeared from the catalog
  const removedRows = rows2.filter((r) => r.roundId !== 'fall');
  const p2 = planCalendar(removedRows, p1.nextState, opts);
  const paper = p2.events.find((e) => e.uid.endsWith('/spring/full/paper'));
  assert.equal(paper.sequence, 1, 'changed date bumps sequence');
  const cancelled = p2.events.filter((e) => e.status === 'CANCELLED');
  assert.equal(cancelled.length, 2);
  assert.ok(cancelled.every((e) => e.sequence === 1));
  assert.ok(cancelled.every((e) => p2.nextState[e.uid].cancelledAt === NOW));

  const later = { ...opts, now: '2026-10-20T00:00:00Z' };
  const p3 = planCalendar(removedRows, p2.nextState, later);
  assert.equal(p3.events.filter((e) => e.status === 'CANCELLED').length, 0, 'cancellations are dropped after retention');
});

test('needs-verification rows become TENTATIVE with a warning', async () => {
  const rows = await rowsFrom(fixture('cfp-sample.html'));
  rows[0].status = 'needs-verification';
  const { events } = planCalendar(rows, {}, opts);
  assert.equal(events[0].status, 'TENTATIVE');
  assert.match(events[0].description, /could not be re-verified/);
});

test('renderIcs produces a folded, escaped RFC 5545 document', async () => {
  const rows = await rowsFrom(fixture('cfp-sample.html'));
  const { events } = planCalendar(rows, {}, opts);
  const ics = renderIcs(events, { name: 'Test, Cal; x', now: NOW });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.includes('X-WR-CALNAME:Test\\, Cal\\; x'));
  assert.ok(ics.includes('UID:sampleconf/sampleconf-2027/spring/full/abstract@paperradar'));
  assert.ok(ics.includes('DTSTART:20260925T115900Z'));
  assert.ok(ics.includes('STATUS:CONFIRMED'));
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `line too long: ${line}`);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('fold splits on UTF-8 boundaries and escapeText handles all specials', () => {
  const s = `${'한'.repeat(40)}`;
  const folded = fold(`SUMMARY:${s}`);
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.equal(folded.replace(/\r\n /g, ''), `SUMMARY:${s}`);
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});

test('feedsFor splits by type, venue and tier and routes cancellations', async () => {
  const rows = await rowsFrom(fixture('cfp-sample.html'));
  const p1 = planCalendar(rows, {}, opts);
  const p2 = planCalendar(rows.filter((r) => r.roundId !== 'fall'), p1.nextState, opts);
  const rankings = { core: { tiers: ['A*', 'A'], entries: { sampleconf: 'A*' } } };
  const feeds = feedsFor(p2.events, { venues: [venue], rankings, showRankings: ['core'] });
  assert.equal(feeds.all.length, 4);
  assert.equal(feeds.conferences.length, 4);
  assert.equal(feeds.workshops.length, 0);
  assert.equal(feeds['venues/sampleconf'].length, 4);
  assert.equal(feeds['tiers/core/astar'].length, 4);
  assert.equal(feeds['tiers/core/a'].length, 0);
});
