#!/usr/bin/env node
// `npm run doctor` — a friendly health check for people setting PaperRadar up.
// Explains what is configured, what will be tracked and what is still missing.
import { loadContext, loadDotEnv } from './lib/context.mjs';
import { ROOT, PATHS, readJson, existsSync, join } from './lib/io.mjs';
import { emptySchedules } from './lib/schedule.mjs';
import * as googleChat from './lib/notify/google-chat.mjs';
import * as email from './lib/notify/email.mjs';

const ok = (s) => `  ✔ ${s}`;
const bad = (s) => `  ✘ ${s}`;
const info = (s) => `  · ${s}`;

async function main() {
  await loadDotEnv(join(ROOT, '.env'));
  const lines = [];
  let failed = false;

  // Node
  const major = Number(process.versions.node.split('.')[0]);
  lines.push('Runtime');
  if (major >= 22) lines.push(ok(`Node ${process.versions.node}`));
  else { lines.push(bad(`Node ${process.versions.node} — PaperRadar needs Node 22 or newer`)); failed = true; }

  // Config
  lines.push('', 'Config');
  if (!existsSync(PATHS.config)) {
    lines.push(bad('config/radar.yaml not found'));
    lines.push(info('copy config/radar.example.yaml → config/radar.yaml and edit it'));
    print(lines);
    process.exit(1);
  }
  lines.push(ok('config/radar.yaml found'));

  let ctx;
  try {
    ctx = loadContext({ quiet: true });
  } catch (err) {
    lines.push(bad('setup has errors:'));
    for (const l of (err.report?.format() ?? err.message).split('\n')) lines.push(`      ${l}`);
    print(lines);
    process.exit(1);
  }
  for (const w of ctx.report.warnings) lines.push(info(`warning · ${w.path}: ${w.message}`));
  const { config, catalog, venues } = ctx;
  lines.push(ok(`site "${config.site.title}" · languages ${config.site.languages.join('/')} · timezone ${config.site.timezone}`));
  if (!config.site.baseUrl) lines.push(info('site.baseUrl is empty — reminders will not include a link to the site'));
  lines.push(ok(`rankings shown: ${config.rankings.show.join(', ') || '(none)'}`));

  // Selection
  lines.push('', `Tracked venues (${venues.length})`);
  if (venues.length === 0) {
    lines.push(bad('nothing selected — set select.fields / select.venues in config/radar.yaml'));
    failed = true;
  }
  const primary = config.rankings.primary;
  const width = Math.max(8, ...venues.map((v) => v.acronym.length));
  for (const v of venues) {
    const adapter = v.cfp?.adapter ?? 'none';
    const edition = v.cfp?.edition?.label ?? '—';
    const tier = primary && v.rankings[primary] ? `${primary}:${v.rankings[primary]}` : '';
    const flag = adapter === 'none' ? ' (not tracked)' : '';
    lines.push(`  ${v.acronym.padEnd(width)}  ${v.type.padEnd(10)}  ${adapter.padEnd(11)}  ${edition.padEnd(22)}  ${tier}${flag}`);
  }
  const untracked = venues.filter((v) => !v.cfp || v.cfp.adapter === 'none');
  if (untracked.length) lines.push(info(`${untracked.length} venue(s) have no cfp adapter yet — see docs/adding-a-venue.md`));

  // Data
  lines.push('', 'Data');
  const schedules = readJson(PATHS.schedules, emptySchedules());
  const withData = venues.filter((v) => schedules.venues[v.id]?.editions?.length).length;
  if (schedules.updatedAt) lines.push(ok(`data/schedules.json updated ${schedules.updatedAt} · ${withData}/${venues.length} tracked venues have data`));
  else lines.push(info('no schedule data yet — run `npm run refresh`'));

  // Channels
  lines.push('', `Reminder channels (${config.reminders.channels.join(', ') || 'none'}) · ${config.reminders.daysBefore.join('/')} days before · ${config.reminders.language}`);
  for (const ch of config.reminders.channels) {
    if (ch === 'google-chat') {
      if (googleChat.isConfigured()) lines.push(ok('GOOGLE_CHAT_WEBHOOK_URL is set'));
      else lines.push(info('GOOGLE_CHAT_WEBHOOK_URL not set here — add it as a GitHub Actions secret (docs/setup-google-chat.md); local runs will dry-run'));
    }
    if (ch === 'email') {
      if (email.isConfigured()) lines.push(ok('SMTP settings are set'));
      else lines.push(info(`email not configured here — needs ${email.ENV_VARS.join(', ')} as secrets`));
    }
  }

  lines.push('', failed ? 'Result: problems found' : 'Result: ready. Next: npm run refresh && npm run build && npm run dev');
  print(lines);
  process.exit(failed ? 1 : 0);
}

function print(lines) {
  console.log(lines.join('\n'));
}

main().catch((err) => {
  console.error(err.stack ?? err.message);
  process.exit(1);
});
