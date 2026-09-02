// Cross-cutting trust-policy rules: unspecified timezones and non-actionable milestones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateVenue } from '../scripts/lib/catalog.mjs';
import { extractDeclarative } from '../scripts/lib/adapters/declarative.mjs';
import { flattenDeadlines, nextDeadline, ACTION_TYPES } from '../scripts/lib/schedule.mjs';
import { dueReminders } from '../scripts/lib/reminders.mjs';
import { planCalendar } from '../scripts/lib/ics.mjs';
import { Report } from '../scripts/lib/errors.mjs';
import { htmlToText } from '../scripts/lib/fetch.mjs';
import { fixture, sampleVenue, NOW } from './helpers.mjs';

test('timezone "unspecified" is accepted, assumes AoE and marks milestones unconfirmed', () => {
  const report = new Report();
  const raw = sampleVenue();
  raw.cfp.timezone = { label: 'unspecified' };
  raw.cfp.rounds[0].milestones[1].tz = 'KST'; // explicit override on one milestone
  const v = validateVenue(raw, report, 'x', { fieldIds: new Set(['systems']) });
  assert.ok(report.ok, report.format());
  assert.equal(v.cfp.timezone.offset, '-12:00');
  assert.equal(v.cfp.timezone.confirmed, false);
  const r = extractDeclarative(v.cfp, htmlToText(fixture('cfp-sample.html')));
  assert.ok(r.ok, r.errors.join('; '));
  const [abstract, paper] = r.rounds[0].milestones;
  assert.equal(abstract.tzConfirmed, false);
  assert.equal(abstract.tzLabel, 'unspecified');
  assert.equal(paper.tzConfirmed, true, 'per-milestone tz override counts as confirmed');
  assert.equal(paper.at, '2026-10-01T23:59:00+09:00');
});

test('reminders skip unconfirmed timezones and notification dates; calendars still carry them', () => {
  const venue = sampleVenue();
  const schedule = {
    editions: [{
      id: 'sampleconf-2027', year: 2027, label: 'SampleConf 2027', event: null,
      source: { url: venue.cfp.url, adapter: 'declarative', status: 'ok', checkedAt: NOW, lastOkAt: NOW, error: null, contentHash: 'x' },
      rounds: [{
        id: 'main', label: 'Main', track: 'full',
        milestones: [
          { type: 'paper', state: 'dated', at: '2026-09-10T23:59:00-12:00', tzLabel: 'unspecified', tzOffset: '-12:00', tzConfirmed: false, sourceText: 'x', verification: 'verified' },
          { type: 'notification', state: 'dated', at: '2026-09-12T23:59:00-12:00', tzLabel: 'AoE', tzOffset: '-12:00', tzConfirmed: true, sourceText: 'x', verification: 'verified' },
          { type: 'camera-ready', state: 'dated', at: '2026-09-20T23:59:00-12:00', tzLabel: 'AoE', tzOffset: '-12:00', tzConfirmed: true, sourceText: 'x', verification: 'verified' },
        ],
      }],
    }],
  };
  const rows = flattenDeadlines(venue, schedule);
  assert.ok(ACTION_TYPES.has('camera-ready') && !ACTION_TYPES.has('notification'));
  assert.equal(nextDeadline(rows, NOW).type, 'paper', 'next deadline may be an unconfirmed-tz date (it is shown, just not pushed)');
  const due = dueReminders(rows, {}, { now: NOW, timeZone: 'Asia/Seoul', daysBefore: [60, 30, 15, 3] });
  assert.deepEqual(due.map((d) => d.row.type), ['camera-ready']);
  const { events } = planCalendar(rows, {}, { now: NOW, lang: 'en', timeZone: 'Asia/Seoul' });
  assert.equal(events.length, 3);
  assert.match(events[0].description, /states no timezone/);
});
