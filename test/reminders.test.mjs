import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueReminders, markSent } from '../scripts/lib/reminders.mjs';
import { buildDigest, testDigest } from '../scripts/lib/notify/format.mjs';
import { buildPayload, isConfigured, send } from '../scripts/lib/notify/google-chat.mjs';
import { buildMessage } from '../scripts/lib/notify/email.mjs';

const tz = 'Asia/Seoul';
const daysBefore = [60, 30, 15, 3];
const row = (uid, at, status = 'verified') => ({
  uid, at, status, acronym: 'X', venueName: 'X Conf', venueType: 'conference', year: 2027, editionLabel: 'X 2027',
  roundId: 'main', roundLabel: 'Main', track: 'full', type: 'paper', tzLabel: 'AoE', sourceUrl: 'https://x.example/cfp',
});

test('sends the closest unsent threshold and covers larger ones', () => {
  const now = '2026-09-02T00:00:00Z';
  const rows = [row('a', '2026-09-12T23:59:00-12:00')]; // 11 days in KST
  let due = dueReminders(rows, {}, { now, timeZone: tz, daysBefore });
  assert.equal(due.length, 1);
  assert.equal(due[0].threshold, 15);
  assert.equal(due[0].remaining, 11);
  assert.deepEqual(due[0].covers, [60, 30, 15]);
  const state = markSent({}, due, rows, { now });
  assert.deepEqual(Object.keys(state.a.sent).sort(), ['15', '30', '60']);
  due = dueReminders(rows, state, { now, timeZone: tz, daysBefore });
  assert.equal(due.length, 0, 'nothing more today');
  due = dueReminders(rows, state, { now: '2026-09-10T00:00:00Z', timeZone: tz, daysBefore });
  assert.equal(due.length, 1);
  assert.equal(due[0].threshold, 3);
});

test('unverified, past and far-away deadlines are skipped; a missed day still fires', () => {
  const now = '2026-09-02T00:00:00Z';
  const rows = [
    row('tentative', '2026-09-05T23:59:00-12:00', 'needs-verification'),
    row('past', '2026-08-01T23:59:00-12:00'),
    row('far', '2027-01-01T23:59:00-12:00'),
    row('missed', '2026-09-30T23:59:00-12:00'), // 29 days → 30-day threshold was "yesterday"
  ];
  const due = dueReminders(rows, {}, { now, timeZone: tz, daysBefore });
  assert.deepEqual(due.map((d) => [d.row.uid, d.threshold]), [['missed', 30]]);
});

test('markSent prunes deadlines older than 60 days', () => {
  const now = '2026-09-02T00:00:00Z';
  const rows = [row('recent', '2026-08-01T00:00:00+00:00'), row('old', '2026-05-01T00:00:00+00:00')];
  const state = markSent({ recent: { sent: { 60: 'x' } }, old: { sent: { 60: 'x' } }, gone: { sent: {} } }, [], rows, { now });
  assert.deepEqual(Object.keys(state), ['recent']);
});

test('digest, Google Chat card and email message are well-formed', () => {
  const due = [{ row: row('a', '2026-09-12T23:59:00-12:00'), remaining: 11, threshold: 15, covers: [15] }];
  const digest = buildDigest(due, { lang: 'ko', timeZone: tz, siteTitle: 'Radar', siteUrl: 'https://s.example/' });
  assert.match(digest.text, /D-11 · X 2027 · 논문 마감/);
  assert.match(digest.text, /현지\(Asia\/Seoul\): 2026-09-13 20:59/);
  const payload = buildPayload(digest);
  assert.equal(payload.cardsV2[0].card.header.title, '📡 Radar · 마감 알림');
  assert.equal(payload.cardsV2[0].card.sections[0].header, 'D-11 · X 2027');
  assert.equal(payload.cardsV2[0].card.sections[0].widgets[1].buttonList.buttons[0].onClick.openLink.url, 'https://x.example/cfp');
  const mail = buildMessage(digest, { env: { REMINDER_EMAIL_TO: 'me@x', SMTP_USER: 'u' }, siteTitle: 'Radar' });
  assert.equal(mail.subject, '[Radar] 마감 알림 · 1건');
  assert.equal(mail.from, 'u');
  assert.match(mail.html, /<strong>D-11 · X 2027<\/strong>/);
  const t = testDigest({ lang: 'en', siteTitle: 'Radar' });
  assert.deepEqual(buildPayload(t), { text: t.text });
});

test('google chat channel requires a chat.googleapis.com webhook and reports HTTP errors', async () => {
  assert.equal(isConfigured({}), false);
  assert.equal(isConfigured({ GOOGLE_CHAT_WEBHOOK_URL: 'https://evil.example/x' }), false);
  const env = { GOOGLE_CHAT_WEBHOOK_URL: 'https://chat.googleapis.com/v1/spaces/x/messages?key=k&token=t' };
  const calls = [];
  const okFetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, text: async () => '' }; };
  const r = await send(testDigest({ lang: 'en', siteTitle: 'R' }), { env, fetchImpl: okFetch });
  assert.ok(r.ok);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(JSON.parse(calls[0].init.body).text.length > 0, true);
  const badFetch = async () => ({ ok: false, status: 403, text: async () => 'forbidden' });
  const r2 = await send(testDigest({ lang: 'en', siteTitle: 'R' }), { env, fetchImpl: badFetch });
  assert.match(r2.error, /HTTP 403/);
  const r3 = await send(testDigest({ lang: 'en', siteTitle: 'R' }), { env: {}, fetchImpl: okFetch });
  assert.equal(r3.skipped, true);
});
