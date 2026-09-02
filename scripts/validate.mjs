#!/usr/bin/env node
// Validates config, catalog, selection and the committed data files.
// Exit 1 on any error so CI blocks broken changes.
import { loadContext } from './lib/context.mjs';
import { PATHS, readJson, existsSync } from './lib/io.mjs';
import { Report } from './lib/errors.mjs';
import { isValidIso } from './lib/dates.mjs';
import { emptySchedules } from './lib/schedule.mjs';
import { MILESTONE_TYPES, MILESTONE_STATES } from './lib/catalog.mjs';

const SOURCE_STATUSES = new Set(['ok', 'failed', 'manual', 'none']);
const VERIFICATIONS = new Set(['verified', 'needs-verification']);

function validateSchedules(schedules, catalog, report) {
  const p = 'data/schedules.json';
  if (schedules.version !== 1) report.error(p, 'version must be 1');
  if (schedules.updatedAt !== null && schedules.updatedAt !== undefined && Number.isNaN(Date.parse(schedules.updatedAt))) report.error(`${p}.updatedAt`, 'invalid timestamp');
  if (typeof schedules.venues !== 'object' || schedules.venues === null || Array.isArray(schedules.venues)) {
    report.error(`${p}.venues`, 'must be a mapping of venue id → {editions}');
    return;
  }
  for (const [venueId, vs] of Object.entries(schedules.venues)) {
    const vp = `${p}.venues.${venueId}`;
    if (!catalog.venues.has(venueId)) report.warn(vp, 'venue is no longer in the catalog (stale data kept)');
    if (!Array.isArray(vs?.editions)) {
      report.error(vp, 'must have an editions list');
      continue;
    }
    const ids = new Set();
    vs.editions.forEach((e, i) => {
      const ep = `${vp}.editions[${i}]`;
      if (typeof e.id !== 'string') report.error(ep, 'missing id');
      else if (ids.has(e.id)) report.error(ep, `duplicate edition id ${e.id}`);
      else ids.add(e.id);
      if (!Number.isInteger(e.year)) report.error(ep, 'missing year');
      if (!e.source || !SOURCE_STATUSES.has(e.source.status)) report.error(`${ep}.source`, 'missing or invalid status');
      if (!Array.isArray(e.rounds)) {
        report.error(ep, 'missing rounds');
        return;
      }
      e.rounds.forEach((r, j) => {
        const rp = `${ep}.rounds[${j}]`;
        if (typeof r.id !== 'string' || typeof r.track !== 'string') report.error(rp, 'round needs id and track');
        if (!Array.isArray(r.milestones)) return report.error(rp, 'missing milestones');
        r.milestones.forEach((m, k) => {
          const mp = `${rp}.milestones[${k}]`;
          if (!MILESTONE_TYPES.includes(m.type)) report.error(mp, `invalid type ${m.type}`);
          if (!MILESTONE_STATES.includes(m.state)) report.error(mp, `invalid state ${m.state}`);
          if (m.state === 'dated') {
            if (m.at !== null && !isValidIso(m.at)) report.error(mp, `invalid at ${m.at}`);
            if (!VERIFICATIONS.has(m.verification)) report.error(mp, `invalid verification ${m.verification}`);
            if (m.at === null && m.verification === 'verified') report.error(mp, 'dated milestone without a date cannot be verified');
          } else if (m.at) {
            report.error(mp, `state ${m.state} must not carry a date`);
          }
        });
      });
    });
  }
}

function validateState(report) {
  for (const [name, path] of [['calendar', PATHS.calendarState], ['reminders', PATHS.reminderState]]) {
    if (!existsSync(path)) continue;
    const s = readJson(path);
    if (typeof s !== 'object' || s === null || Array.isArray(s)) report.error(`data/state/${name}.json`, 'must be a mapping keyed by deadline uid');
  }
  if (existsSync(PATHS.updates)) {
    const u = readJson(PATHS.updates);
    if (!Array.isArray(u?.entries)) report.error('data/updates.json', 'must have an entries list');
  }
}

function main() {
  let ctx;
  try {
    ctx = loadContext();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const report = new Report();
  const schedules = readJson(PATHS.schedules, emptySchedules());
  validateSchedules(schedules, ctx.catalog, report);
  validateState(report);
  const text = report.format();
  if (text) console.error(text);

  const byType = {};
  const byAdapter = {};
  for (const v of ctx.venues) {
    byType[v.type] = (byType[v.type] ?? 0) + 1;
    const a = v.cfp?.adapter ?? 'none';
    byAdapter[a] = (byAdapter[a] ?? 0) + 1;
  }
  const scheduled = ctx.venues.filter((v) => schedules.venues[v.id]?.editions?.length).length;
  console.log(`catalog: ${ctx.catalog.venues.size} venues, ${ctx.catalog.fields.length} fields, ${Object.keys(ctx.catalog.rankings).length} rankings`);
  console.log(`tracked: ${ctx.venues.length} venues (${Object.entries(byType).map(([k, n]) => `${k} ${n}`).join(', ')})`);
  console.log(`adapters: ${Object.entries(byAdapter).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  console.log(`schedules: ${scheduled}/${ctx.venues.length} tracked venues have data (updated ${schedules.updatedAt ?? 'never'})`);
  const warnings = ctx.report.warnings.length + report.warnings.length;
  console.log(`result: ${report.ok ? 'OK' : 'FAILED'} — ${report.errors.length} errors, ${warnings} warnings`);
  process.exit(report.ok ? 0 : 1);
}

main();
