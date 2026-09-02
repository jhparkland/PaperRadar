#!/usr/bin/env node
// `npm run remind` — send today's digest through the configured channels.
//
// One message a day, grouped into the categories a reader acts on:
//   🆕 새로 등장 · 🔴 오늘 마감 · 🟠 마감 임박 · 🟡 N일 남음
//   (+ 🔁 변경 · ❌ 삭제 · ✅ 재확인, when reminders.notifyChanges is on)
//
//   --test       send a plain "channel works" ping to every configured channel
//   --sample [n] preview a real digest built from the next n (default 5) verified
//                deadlines, without touching the sent-state
//   --dry-run    print what would be sent, send nothing, write nothing
//   --channel x  only this channel (google-chat | email)
//
// Exit codes: 0 sent or nothing due · 1 every channel failed while something was due
import { loadContext, loadDotEnv, nowIso, parseArgs } from './lib/context.mjs';
import { ROOT, PATHS, readJson, writeJson, join } from './lib/io.mjs';
import { emptySchedules, flattenDeadlines, upcomingDeadlines } from './lib/schedule.mjs';
import { dueReminders, markSent, isRemindable } from './lib/reminders.mjs';
import { normalizeReminderState, pendingChanges, isBootstrap, markChangesNotified } from './lib/changes.mjs';
import { buildDigest, testDigest } from './lib/notify/format.mjs';
import { daysUntil } from './lib/dates.mjs';
import * as googleChat from './lib/notify/google-chat.mjs';
import * as email from './lib/notify/email.mjs';

const CHANNELS = { 'google-chat': googleChat, email };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadDotEnv(join(ROOT, '.env'));
  const ctx = loadContext();
  const { config, venues } = ctx;
  const now = nowIso();
  const dryRun = Boolean(args['dry-run']);
  const channels = (typeof args.channel === 'string' ? [args.channel] : config.reminders.channels).filter((c) => {
    if (!CHANNELS[c]) console.error(`unknown channel "${c}"`);
    return CHANNELS[c];
  });
  const siteTitle = config.site.title;
  const opts = {
    lang: config.reminders.language,
    timeZone: config.site.timezone,
    imminentDays: config.reminders.imminentDays,
    siteTitle,
    siteUrl: config.site.baseUrl,
  };

  if (args.test) {
    const results = await deliver(testDigest({ lang: opts.lang, siteTitle }), channels, { siteTitle, dryRun });
    process.exit(results.some((r) => r.ok) || channels.length === 0 ? 0 : 1);
  }

  const schedules = readJson(PATHS.schedules, emptySchedules());
  const rows = venues.flatMap((v) => flattenDeadlines(v, schedules.venues[v.id]));

  if (args.sample) {
    // `--sample` with no value parses to boolean true, and Number(true) is 1 —
    // only treat an explicit integer argument as a count.
    const n = typeof args.sample === 'string' && Number.isInteger(Number(args.sample)) && Number(args.sample) > 0
      ? Number(args.sample)
      : 5;
    const soon = upcomingDeadlines(rows, now, 365).filter(isRemindable).slice(0, n);
    if (soon.length === 0) {
      console.log('sample: no verified upcoming deadlines to show');
      return;
    }
    const thresholds = [...config.reminders.daysBefore].sort((a, b) => a - b);
    const due = soon.map((r) => {
      const remaining = daysUntil(r.at, now, opts.timeZone);
      return { row: r, remaining, threshold: thresholds.find((d) => remaining <= d) ?? thresholds.at(-1) };
    });
    const digest = buildDigest({ due }, opts);
    console.log(digest.text, '\n');
    const results = await deliver(digest, channels, { siteTitle, dryRun });
    console.log('(sample — sent-state untouched, these deadlines will still be reminded normally)');
    process.exit(dryRun || results.some((r) => r.ok) || channels.length === 0 ? 0 : 1);
  }

  const updates = readJson(PATHS.updates, { version: 1, entries: [] });
  let state = normalizeReminderState(readJson(PATHS.reminderState, null));

  const due = dueReminders(rows, state.deadlines, { now, timeZone: opts.timeZone, daysBefore: config.reminders.daysBefore });

  // Changes are only notified once a starting point exists, so a fresh
  // deployment does not announce every deadline it just imported.
  let changes = [];
  let bootstrapping = false;
  if (config.reminders.notifyChanges) {
    if (isBootstrap(state)) {
      bootstrapping = true;
      console.log('changes: first run — recording the starting point; changes from now on will be notified');
    } else {
      changes = pendingChanges(updates, state, { now, includeFailures: config.reminders.notifyFailures });
    }
  }

  if (due.length === 0 && changes.length === 0) {
    console.log('nothing to send today');
    if (bootstrapping && !dryRun) writeJson(PATHS.reminderState, markChangesNotified(state, [], { now }));
    return;
  }

  const digest = buildDigest({ due, changes }, {
    ...opts,
    rowsByUid: new Map(rows.map((r) => [r.uid, r])),
    venuesById: new Map(venues.map((v) => [v.id, v])),
  });
  console.log(digest.text, '\n');
  console.log(`sections: ${digest.sections.map((s) => `${s.id}${s.id === 'window' ? '' : ''}=${s.items.length}`).join(' · ')}`);

  if (dryRun) {
    console.log('(dry run — nothing sent, state unchanged)');
    return;
  }

  const results = await deliver(digest, channels, { siteTitle });
  if (channels.length === 0) {
    console.log('no channels configured — digest printed only (add reminders.channels in config/radar.yaml)');
    return;
  }
  if (!results.some((r) => r.ok)) {
    console.error('no channel delivered the digest — state left unchanged so it is retried next run');
    process.exit(1);
  }
  state = { ...state, deadlines: markSent(state.deadlines, due, rows, { now }) };
  if (config.reminders.notifyChanges) state = markChangesNotified(state, changes, { now });
  writeJson(PATHS.reminderState, state);
  console.log(`recorded ${due.length} reminder(s) and ${changes.length} change(s) as notified`);
}

async function deliver(digest, channels, { siteTitle, dryRun = false }) {
  const results = [];
  for (const name of channels) {
    if (dryRun) {
      console.log(`[dry run] would send via ${name}`);
      results.push({ ok: true });
      continue;
    }
    const r = await CHANNELS[name].send(digest, { siteTitle });
    if (r.ok) console.log(`sent via ${name}`);
    else console.error(`${r.skipped ? 'skipped' : 'FAILED'} ${name}: ${r.error}`);
    results.push(r);
  }
  return results;
}

main().catch((err) => {
  console.error(err.stack ?? err.message);
  process.exit(1);
});
