#!/usr/bin/env node
// `npm run remind` — send today's due reminders through the configured channels.
//
//   --test       send a test message to every configured channel (checks secrets)
//   --dry-run    print the digest, send nothing, write nothing
//   --channel x  only this channel (google-chat | email)
//
// Exit codes: 0 sent or nothing due · 1 every channel failed while something was due
import { loadContext, loadDotEnv, nowIso, parseArgs } from './lib/context.mjs';
import { ROOT, PATHS, readJson, writeJson, join } from './lib/io.mjs';
import { emptySchedules, flattenDeadlines } from './lib/schedule.mjs';
import { dueReminders, markSent } from './lib/reminders.mjs';
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
  const channels = (typeof args.channel === 'string' ? [args.channel] : config.reminders.channels).filter((c) => {
    if (!CHANNELS[c]) console.error(`unknown channel "${c}"`);
    return CHANNELS[c];
  });
  const siteTitle = config.site.title;
  const lang = config.reminders.language;

  if (args.test) {
    const digest = testDigest({ lang, siteTitle });
    const results = await deliver(digest, channels, { siteTitle, dryRun: Boolean(args['dry-run']) });
    process.exit(results.some((r) => r.ok) || channels.length === 0 ? 0 : 1);
  }

  const schedules = readJson(PATHS.schedules, emptySchedules());
  const state = readJson(PATHS.reminderState, {});
  const rows = venues.flatMap((v) => flattenDeadlines(v, schedules.venues[v.id]));
  const due = dueReminders(rows, state, { now, timeZone: config.site.timezone, daysBefore: config.reminders.daysBefore });

  if (due.length === 0) {
    console.log('nothing due today');
    return;
  }
  const digest = buildDigest(due, { lang, timeZone: config.site.timezone, siteTitle, siteUrl: config.site.baseUrl });
  console.log(digest.text);
  console.log('');

  if (args['dry-run']) {
    console.log('(dry run — nothing sent, state unchanged)');
    return;
  }
  const results = await deliver(digest, channels, { siteTitle });
  const delivered = results.filter((r) => r.ok).length;
  if (delivered === 0 && channels.length > 0) {
    console.error('no channel delivered the digest — state left unchanged so it is retried next run');
    process.exit(1);
  }
  if (channels.length === 0) {
    console.log('no channels configured — digest printed only (add reminders.channels in config/radar.yaml)');
    return;
  }
  writeJson(PATHS.reminderState, markSent(state, due, rows, { now }));
  console.log(`marked ${due.length} reminder(s) as sent`);
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
