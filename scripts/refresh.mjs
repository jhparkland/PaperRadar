#!/usr/bin/env node
// `npm run refresh` — re-read every tracked CFP, update data/schedules.json,
// append to data/updates.json and advance the calendar state.
//
//   --only eurosys,sosp   refresh a subset
//   --dry-run             do everything except writing files
//   --report path.md      write a markdown summary of source failures (used by CI to file an issue)
//   --concurrency 4
import { loadContext, nowIso, mapLimit, parseArgs } from './lib/context.mjs';
import { PATHS, readJson, writeJson, writeText, join } from './lib/io.mjs';
import { emptySchedules, flattenDeadlines } from './lib/schedule.mjs';
import { refreshVenue, appendUpdates } from './lib/refresh.mjs';
import { planCalendar } from './lib/ics.mjs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ctx = loadContext();
  const { config, venues } = ctx;
  const now = nowIso();
  const only = typeof args.only === 'string' ? new Set(args.only.split(',').map((s) => s.trim())) : null;
  const concurrency = Number(args.concurrency ?? 4) || 4;

  const schedules = readJson(PATHS.schedules, emptySchedules());
  const updates = readJson(PATHS.updates, { version: 1, entries: [] });
  const calendarState = readJson(PATHS.calendarState, {});

  const targets = venues.filter((v) => v.cfp && v.cfp.adapter !== 'none' && (!only || only.has(v.id)));
  if (only) for (const id of only) if (!targets.some((v) => v.id === id)) console.error(`--only: "${id}" is not a tracked venue with an adapter`);
  console.log(`refreshing ${targets.length} venue(s) at ${now} (concurrency ${concurrency})`);

  const results = await mapLimit(targets, concurrency, async (v) => {
    const started = Date.now();
    const r = await refreshVenue(v, schedules.venues[v.id], { now });
    const ms = Date.now() - started;
    const status = r.failure ? `FAILED  ${r.failure.error}` : (v.cfp.adapter === 'manual' ? 'manual' : 'ok');
    const rolled = r.rollover ? `  → rolled over to ${r.rollover.edition.label}` : '';
    console.log(`  ${v.acronym.padEnd(14)} ${String(ms).padStart(5)} ms  ${status}${rolled}`);
    return { venue: v, ...r };
  });

  const changes = [];
  const failures = [];
  const rollovers = [];
  for (const r of results) {
    schedules.venues[r.venue.id] = r.schedule;
    changes.push(...r.changes);
    if (r.failure) failures.push({ ...r.failure, acronym: r.venue.acronym, adapter: r.venue.cfp.adapter });
    if (r.rollover) rollovers.push({ venue: r.venue, ...r.rollover });
  }
  schedules.updatedAt = now;

  const rows = venues.flatMap((v) => flattenDeadlines(v, schedules.venues[v.id]));
  const { nextState } = planCalendar(rows, calendarState, {
    now, lang: config.site.languages[0], timeZone: config.site.timezone,
  });

  const meaningful = changes.filter((c) => c.kind !== 'failed');
  console.log('');
  console.log(`ok ${results.length - failures.length} · failed ${failures.length} · changes ${meaningful.length}`);
  for (const c of meaningful) {
    const what = c.kind === 'changed' ? `${c.before ?? '—'} → ${c.after ?? '—'}` : (c.after ?? c.before ?? c.message ?? '');
    console.log(`  ${c.kind.padEnd(9)} ${c.uid ?? c.editionId}  ${what}`);
  }
  for (const f of failures) console.log(`  needs-verification ${f.acronym}: ${f.error}`);

  if (args.report) writeText(String(args.report), failureReport(failures, now));

  if (args['dry-run']) {
    console.log('\n(dry run — nothing written)');
    return;
  }
  writeJson(PATHS.schedules, schedules);
  writeJson(PATHS.updates, appendUpdates(updates, changes));
  writeJson(PATHS.calendarState, nextState);
  console.log(`\nwrote data/schedules.json, data/updates.json, data/state/calendar.json`);
  for (const r of rollovers) writeRolledOverVenue(r);
}

/**
 * Point the venue file at the edition we just adopted. The catalog stays the
 * source of truth, so the move lands in git as a reviewable diff instead of
 * living only in machine-written data.
 */
function writeRolledOverVenue({ venue, cfp, edition }) {
  const file = join(PATHS.venues, `${venue.id}.json`);
  const raw = readJson(file);
  raw.cfp.url = cfp.url;
  raw.cfp.allowedHosts = cfp.allowedHosts;
  raw.cfp.edition = { year: edition.year, label: edition.label };
  writeJson(file, raw);
  console.log(`updated catalog/venues/${venue.id}.json → ${edition.label} (${cfp.url})`);
}

function failureReport(failures, now) {
  if (failures.length === 0) return '';
  const lines = [
    `Automated refresh at ${now} could not verify ${failures.length} source(s).`,
    'Last known dates are kept and shown as **Verification needed** until a run succeeds or the venue file is updated.',
    '',
    '| Venue | Edition | Adapter | Error | Source |',
    '|---|---|---|---|---|',
  ];
  for (const f of failures) lines.push(`| ${f.acronym} | ${f.editionId} | ${f.adapter} | ${f.error.replace(/\|/g, '\\|')} | ${f.url} |`);
  lines.push('', 'To investigate locally: `npm run probe -- --venue <id>` (see docs/adding-a-venue.md).');
  return `${lines.join('\n')}\n`;
}

main().catch((err) => {
  console.error(err.stack ?? err.message);
  process.exit(1);
});
