import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDateText, toIsoWithOffset, resolveOffset, daysUntil, formatLocal, toIcsUtc, DATE_RE_SOURCE, normalizeTime, isValidIso,
} from '../scripts/lib/dates.mjs';

test('parseDateText understands unambiguous formats', () => {
  assert.deepEqual(parseDateText('April 15, 2026'), { year: 2026, month: 4, day: 15 });
  assert.deepEqual(parseDateText('Apr. 15, 2026'), { year: 2026, month: 4, day: 15 });
  assert.deepEqual(parseDateText('Wednesday, April 15th, 2026'), { year: 2026, month: 4, day: 15 });
  assert.deepEqual(parseDateText('15 April 2026'), { year: 2026, month: 4, day: 15 });
  assert.deepEqual(parseDateText('1st Sept 2026'), { year: 2026, month: 9, day: 1 });
  assert.deepEqual(parseDateText('2026-04-15'), { year: 2026, month: 4, day: 15 });
  assert.deepEqual(parseDateText('2026/04/15'), { year: 2026, month: 4, day: 15 });
});

test('parseDateText rejects ambiguous or invalid input', () => {
  assert.equal(parseDateText('04/05/2026'), null);
  assert.deepEqual(parseDateText('04/05/2026', { dateFormat: 'dmy' }), { year: 2026, month: 5, day: 4 });
  assert.deepEqual(parseDateText('04/05/2026', { dateFormat: 'mdy' }), { year: 2026, month: 4, day: 5 });
  assert.equal(parseDateText('February 30, 2026'), null);
  assert.equal(parseDateText('TBA'), null);
  assert.equal(parseDateText(null), null);
});

test('DATE_RE_SOURCE has one capture group and finds dates in text', () => {
  const re = new RegExp(DATE_RE_SOURCE, 'g');
  const text = 'Abstract: Thursday, September 24, 2026 (AoE). Paper: 1 October 2026. Camera-ready 2027-01-05.';
  const found = [...text.matchAll(re)].map((m) => m[1]);
  assert.deepEqual(found, ['Thursday, September 24, 2026', '1 October 2026', '2027-01-05']);
  assert.equal(new RegExp(`${DATE_RE_SOURCE}|`).exec('').length - 1, 1);
});

test('offset resolution and ISO composition', () => {
  assert.equal(resolveOffset('AoE'), '-12:00');
  assert.equal(resolveOffset('+09:00'), '+09:00');
  assert.equal(resolveOffset('KST'), '+09:00');
  assert.equal(resolveOffset('Mars'), null);
  assert.equal(toIsoWithOffset({ year: 2026, month: 4, day: 15 }, '23:59', '-12:00'), '2026-04-15T23:59:00-12:00');
  assert.ok(isValidIso('2026-04-15T23:59:00-12:00'));
  assert.equal(normalizeTime('9:05'), '09:05:00');
  assert.equal(normalizeTime('25:00'), null);
  assert.throws(() => toIsoWithOffset({ year: 2026, month: 4, day: 15 }, '23:59', 'Mars'));
});

test('timezone display and D-day are computed in the display timezone', () => {
  const aoe = '2026-04-15T23:59:00-12:00'; // = 2026-04-16T11:59Z = 2026-04-16 20:59 KST
  assert.equal(formatLocal(aoe, 'Asia/Seoul'), '2026-04-16 20:59');
  assert.equal(formatLocal(aoe, 'UTC'), '2026-04-16 11:59');
  assert.equal(daysUntil(aoe, '2026-04-16T00:00:00Z', 'Asia/Seoul'), 0);
  assert.equal(daysUntil(aoe, '2026-04-10T00:00:00Z', 'Asia/Seoul'), 6);
  assert.equal(daysUntil(aoe, '2026-04-20T00:00:00Z', 'Asia/Seoul'), -4);
  assert.equal(toIcsUtc(aoe), '20260416T115900Z');
});
