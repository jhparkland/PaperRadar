#!/usr/bin/env node
// `npm run remind` — send today's due reminders and the schedule-change digest
// through the configured channels.
//
//   --test       send a plain "channel works" ping to every configured channel
//   --sample [n] send what a real digest looks like, built from the next n (default 5)
//                verified deadlines, without touching the sent-state
//   --dry-run    print what would be sent, send nothing, write nothing
//   --channel x  only this channel (google-chat | email)
//
// Two messages at most per run: deadline reminders (D-60/30/15/3) and, when
// reminders.notifyChanges is on, one digest of dates that were announced,
// moved, removed or verified again since the last run.
//
// Exit codes: 0 sent or nothing due · 1 every channel failed while something was due
import { loadContext, loadDotEnv, nowIso, parseArgs } from './lib/context.mjs';
import { ROOT, PATHS, readJson, writeJson, join } from './lib/io.mjs';
import { emptySchedules, flattenDeadlines, upcomingDeadlines } from './lib/schedule.mjs';
import { dueReminders, markSent, isRemindable } from './lib/reminders.mjs';
import { daysUntil } from './lib/dates.mjs';
import { normalizeReminderState, pendingChanges, isBootstrap, markChangesNotified, buildChangesDigest } from './lib/changes.mjs';
import { buildDigest, testDigest } from './lib/notify/format.mjs';
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
  const lang = config.reminders.language;
  const common = { lang, timeZone: config.site.timezone, siteTitle, siteUrl: config.site.baseUrl };

  if (args.test) {
    const results = await deliver(testDigest({ lang, siteTitle }), channels, { siteTitle, dryRun });
    process.exit(results.some((r) => r.ok) || channels.length === 0 ? 0 : 1);
  }

  if (args.sample) {
    // `--sample` with no value parses to boolean true, and Number(true) is 1 —
    // only treat an explicit numeric argument as a count.
    const n = typeof args.sample === 'string' && Number.isInteger(Number(args.sample)) && Number(args.sample) > 0
      ? Number(args.sample)
      : 5;
    const rows = venues.flatMap((v) => flattenDeadlines(v, readJson(PATHS.schedules, emptySchedules()).venues[v.id]));
    const soon = upcomingDeadlines(rows, now, 365).filter(isRemindable).slice(0, n);
    if (soon.length === 0) {
      console.log('sample: no verified upcoming deadlines to show');
      return;
    }
    const digest = buildDigest(
      soon.map((r) => ({ row: r, remaining: daysUntil(r.at, now, config.site.timezone), threshold: 0, covers: [] })),
      common,
    );
    console.log(digest.text, '\n');
    const results = await deliver(digest, channels, { siteTitle, dryRun });
    console.log('(sample — sent-state untouched, these deadlines will still be reminded normally)');
    process.exit(dryRun || results.some((r) => r.ok) || channels.length === 0 ? 0 : 1);
  }

  const schedules = readJson(PATHS.schedules, emptySchedules());
  const updates = readJson(PATHS.updates, { version: 1, entries: [] });
  let state = normalizeReminderState(readJson(PATHS.reminderState, null));
  const rows = venues.flatMap((v) => flattenDeadlines(v, schedules.venues[v.id]));
  let anyFailure = false;
  let stateDirty = false;

  // ---- 1. deadline reminders
  const due = dueReminders(rows, state.deadlines, { now, timeZone: config.site.timezone, daysBefore: config.reminders.daysBefore });
  if (due.length === 0) {
    console.log('reminders: nothing due today');
  } else {
    const digest = buildDigest(due, common);
    console.log(digest.text, '\n');
    if (!dryRun) {
      const results = await deliver(digest, channels, { siteTitle });
      if (channels.length === 0) {
        console.log('no channels configured — digest printed only (add reminders.channels in config/radar.yaml)');
      } else if (results.some((r) => r.ok)) {
        state = { ...state, deadlines: markSent(state.deadlines, due, rows, { now }) };
        stateDirty = true;
        console.log(`marked ${due.length} reminder(s) as sent`);
      } else {
        anyFailure = true;
        console.error('reminders: no channel delivered — state left unchanged so it is retried next run');
      }
    }
  }

  // ---- 2. schedule changes
  if (config.reminders.notifyChanges) {
    if (isBootstrap(state)) {
      console.log('changes: first run — recording the starting point; changes from now on will be notified');
      if (!dryRun) {
        state = markChangesNotified(state, [], { now });
        stateDirty = true;
      }
    } else {
      const pending = pendingChanges(updates, state, { now, includeFailures: config.reminders.notifyFailures });
      if (pending.length === 0) {
        console.log('changes: nothing new');
      } else {
        const rowsByUid = new Map(rows.map((r) => [r.uid, r]));
        const venuesById = new Map(venues.map((v) => [v.id, v]));
        const digest = buildChangesDigest(pending, { ...common, rowsByUid, venuesById });
        console.log(digest.text, '\n');
        if (!dryRun) {
          const results = await deliver(digest, channels, { siteTitle });
          if (channels.length === 0 || results.some((r) => r.ok)) {
            state = markChangesNotified(state, pending, { now });
            stateDirty = true;
            console.log(`changes: ${pending.length} entr${pending.length === 1 ? 'y' : 'ies'} notified`);
          } else {
            anyFailure = true;
            console.error('changes: no channel delivered — will retry next run');
          }
        }
      }
    }
  }

  if (dryRun) {
    console.log('(dry run — nothing sent, state unchanged)');
    return;
  }
  if (stateDirty) writeJson(PATHS.reminderState, state);
  if (anyFailure) process.exit(1);
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
