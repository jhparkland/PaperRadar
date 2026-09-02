import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeReminderState, emptyReminderState, pendingChanges, isBootstrap, markChangesNotified, buildChangesDigest,
} from '../scripts/lib/changes.mjs';
import { buildPayload } from '../scripts/lib/notify/google-chat.mjs';
import { buildMessage } from '../scripts/lib/notify/email.mjs';
import { normalizeConfig } from '../scripts/lib/config.mjs';

const NOW = '2026-09-10T00:00:00Z';
const e = (at, kind, extra = {}) => ({ at, venueId: 'eurosys', editionId: 'eurosys-2027', kind, ...extra });
const paper = 'eurosys/eurosys-2027/fall/full/paper';
const updates = {
  entries: [ // newest first, as written by refresh
    e('2026-09-09T02:00:00Z', 'changed', { uid: paper, before: '2026-09-24T23:59:00-12:00', after: '2026-10-01T23:59:00-12:00' }),
    e('2026-09-08T02:00:00Z', 'changed', { uid: paper, before: '2026-09-20T23:59:00-12:00', after: '2026-09-24T23:59:00-12:00' }),
    e('2026-09-08T02:00:00Z', 'failed', { message: 'fetch failed: HTTP 503' }),
    e('2026-09-07T02:00:00Z', 'recovered', { message: 'source verified again' }),
    e('2026-09-06T02:00:00Z', 'changed', { uid: 'hotos/hotos-2027/main/full/paper', venueId: 'hotos', editionId: 'hotos-2027', before: null, after: '2027-01-15T23:59:00-12:00' }),
    e('2026-09-05T02:00:00Z', 'removed', { uid: 'eurosys/eurosys-2027/spring/full/camera-ready', before: '2026-09-25T23:59:00-12:00' }),
    e('2026-08-01T02:00:00Z', 'added', { uid: paper, after: '2026-09-20T23:59:00-12:00' }), // older than 14 days
  ],
};

test('state normalization accepts the legacy uid map and the current shape', () => {
  assert.deepEqual(normalizeReminderState(null), emptyReminderState());
  const legacy = normalizeReminderState({ [paper]: { sent: { 30: 'x' } } });
  assert.deepEqual(legacy.deadlines[paper], { sent: { 30: 'x' } });
  assert.equal(legacy.changes.notifiedThrough, null);
  const cur = normalizeReminderState({ version: 1, deadlines: {}, changes: { notifiedThrough: NOW } });
  assert.equal(cur.changes.notifiedThrough, NOW);
});

test('first run is a bootstrap: nothing pending is sent, the watermark is set to now', () => {
  const state = emptyReminderState();
  assert.equal(isBootstrap(state), true);
  const next = markChangesNotified(state, [], { now: NOW });
  assert.equal(next.changes.notifiedThrough, NOW);
  assert.equal(isBootstrap(next), false);
});

test('pendingChanges filters by watermark, age and kind, dedupes per milestone, oldest first', () => {
  const state = { ...emptyReminderState(), changes: { notifiedThrough: '2026-09-04T00:00:00Z' } };
  const pending = pendingChanges(updates, state, { now: NOW });
  assert.deepEqual(pending.map((x) => [x.at.slice(0, 10), x.kind]), [
    ['2026-09-05', 'removed'], ['2026-09-06', 'changed'], ['2026-09-07', 'recovered'], ['2026-09-09', 'changed'],
  ]);
  assert.equal(pending.find((x) => x.uid === paper).after, '2026-10-01T23:59:00-12:00', 'newest entry per milestone wins');
  const withFailures = pendingChanges(updates, state, { now: NOW, includeFailures: true });
  assert.ok(withFailures.some((x) => x.kind === 'failed'));
  const later = pendingChanges(updates, { changes: { notifiedThrough: '2026-09-09T02:00:00Z' } }, { now: NOW });
  assert.equal(later.length, 0, 'entries at or before the watermark are not repeated');
  const next = markChangesNotified(state, pending, { now: NOW });
  assert.equal(next.changes.notifiedThrough, '2026-09-09T02:00:00Z');
});

test('the digest names venues, milestones and before → after, in Korean and English', () => {
  const state = { ...emptyReminderState(), changes: { notifiedThrough: '2026-09-04T00:00:00Z' } };
  const pending = pendingChanges(updates, state, { now: NOW });
  const rowsByUid = new Map([[paper, { uid: paper, acronym: 'EuroSys', venueName: 'European Conference on Computer Systems', year: 2027, editionLabel: 'EuroSys 2027', roundLabel: { ko: '가을', en: 'Fall' }, tzLabel: 'AoE', sourceUrl: 'https://2027.eurosys.org/cfp.html' }]]);
  const venuesById = new Map([
    ['eurosys', { id: 'eurosys', acronym: 'EuroSys', name: 'European Conference on Computer Systems', cfp: { url: 'https://2027.eurosys.org/cfp.html' } }],
    ['hotos', { id: 'hotos', acronym: 'HotOS', name: 'Workshop on Hot Topics in Operating Systems', cfp: { url: 'https://sigops.org/s/conferences/hotos/2027/cfp.html' } }],
  ]);
  const ko = buildChangesDigest(pending, { lang: 'ko', timeZone: 'Asia/Seoul', siteTitle: 'Radar', siteUrl: 'https://s.example/', rowsByUid, venuesById });
  assert.equal(ko.title, '📡 Radar · 일정 변경');
  assert.match(ko.text, /🔁 변경 · EuroSys 2027 · 가을 논문 마감\n {2}2026-09-24 23:59 AoE → 2026-10-01 23:59 AoE\n {2}현지\(Asia\/Seoul\): 2026-10-02 20:59/);
  assert.match(ko.text, /🆕 확정 \(TBA → 날짜\) · HotOS 2027 · 논문 마감\n {2}TBA → 2027-01-15 23:59/);
  assert.match(ko.text, /❌ 삭제 · EuroSys 2027 · spring 최종본 마감/, 'removed rows have no live row, so the raw round id is shown');
  assert.match(ko.text, /✅ 재확인 성공 · EuroSys 2027/);
  assert.equal(ko.subject, '[Radar] 일정 변경 · 4건');
  const en = buildChangesDigest(pending, { lang: 'en', timeZone: 'UTC', siteTitle: 'Radar', siteUrl: '', rowsByUid, venuesById });
  assert.match(en.text, /🔁 Changed · EuroSys 2027 · Fall Paper deadline/);
  assert.match(en.text, /🆕 Announced \(TBA → date\) · HotOS 2027 · Paper deadline/);

  const payload = buildPayload(ko);
  assert.equal(payload.cardsV2[0].card.header.title, ko.title);
  assert.equal(payload.cardsV2[0].card.sections[0].header, '❌ 삭제 · EuroSys 2027');
  const mail = buildMessage(ko, { env: { REMINDER_EMAIL_TO: 'me@x', SMTP_USER: 'u' }, siteTitle: 'Radar' });
  assert.equal(mail.subject, '[Radar] 일정 변경 · 4건');
});

test('digest is capped with a "+N more" line', () => {
  const many = Array.from({ length: 35 }, (_, i) => e(`2026-09-0${(i % 5) + 1}T0${i % 9}:00:00Z`, 'added', { uid: `v${i}/v${i}-2027/main/full/paper`, venueId: `v${i}`, editionId: `v${i}-2027`, after: '2027-01-01T23:59:00-12:00' }));
  const d = buildChangesDigest(many, { lang: 'en', timeZone: 'UTC', siteTitle: 'R', siteUrl: 'https://s.example/' });
  assert.equal(d.items.length, 30);
  assert.match(d.footer, /\+5 more/);
});

test('config exposes notifyChanges / notifyFailures with defaults and validation', () => {
  const { config } = normalizeConfig({ version: 1, select: { fields: ['systems'] } });
  assert.equal(config.reminders.notifyChanges, true);
  assert.equal(config.reminders.notifyFailures, false);
  const { config: c2, report } = normalizeConfig({ version: 1, select: { fields: ['systems'] }, reminders: { notifyChanges: false, notifyFailures: 'yes' } });
  assert.equal(c2.reminders.notifyChanges, false);
  assert.ok(report.errors.some((x) => x.path === 'reminders.notifyFailures'));
});
