#!/usr/bin/env node
// `npm run new-venue` — scaffold a catalog venue file.
//
//   npm run new-venue -- --id eurosys --acronym EuroSys \
//     --name "European Conference on Computer Systems" --type conference \
//     --fields systems,cloud --url https://2027.eurosys.org/cfp.html --year 2027 [--manual]
import { parseArgs } from './lib/context.mjs';
import { PATHS, writeJson, existsSync, join } from './lib/io.mjs';
import { ID_RE } from './lib/errors.mjs';
import { VENUE_TYPES } from './lib/config.mjs';

function main() {
  const a = parseArgs(process.argv.slice(2));
  const missing = ['id', 'acronym', 'name', 'type', 'fields'].filter((k) => typeof a[k] !== 'string');
  if (missing.length) return fail(`missing: --${missing.join(' --')}`);
  if (!ID_RE.test(a.id)) return fail('--id must be lowercase letters, digits and hyphens');
  if (!VENUE_TYPES.includes(a.type)) return fail(`--type must be one of ${VENUE_TYPES.join(', ')}`);
  const file = join(PATHS.venues, `${a.id}.json`);
  if (existsSync(file)) return fail(`${file} already exists`);

  const year = Number(a.year) || new Date().getUTCFullYear() + 1;
  const manual = Boolean(a.manual);
  const venue = {
    id: a.id,
    acronym: a.acronym,
    name: a.name,
    type: a.type,
    fields: a.fields.split(',').map((s) => s.trim()).filter(Boolean),
    topics: [],
    homepage: typeof a.homepage === 'string' ? a.homepage : null,
  };
  if (a.type === 'journal' && typeof a.url !== 'string') {
    venue.submission = 'rolling';
    venue.cfp = null;
  } else if (typeof a.url === 'string') {
    const host = new URL(a.url).hostname;
    venue.cfp = manual
      ? {
        adapter: 'manual',
        url: a.url,
        edition: { year, label: `${a.acronym} ${year}` },
        timezone: { label: 'AoE', time: '23:59' },
        rounds: [{
          id: 'main', label: 'Main', track: 'full',
          milestones: [
            { type: 'abstract', date: 'YYYY-MM-DD', verifiedAt: today() },
            { type: 'paper', date: 'YYYY-MM-DD', verifiedAt: today() },
          ],
        }],
      }
      : {
        adapter: 'declarative',
        url: a.url,
        allowedHosts: [host],
        edition: { year, label: `${a.acronym} ${year}` },
        timezone: { label: 'AoE', time: '23:59' },
        rounds: [{
          id: 'main', label: 'Main', track: 'full',
          milestones: [
            { type: 'abstract', pattern: 'Abstract (?:registration|submission)[\\s\\S]{0,80}?{{DATE}}' },
            { type: 'paper', pattern: '(?:Full )?[Pp]aper submission[\\s\\S]{0,80}?{{DATE}}' },
          ],
        }],
      };
  } else {
    venue.cfp = null;
  }
  writeJson(file, venue);
  console.log(`created catalog/venues/${a.id}.json`);
  console.log('next steps:');
  if (venue.cfp?.adapter === 'declarative') {
    console.log(`  1. npm run probe -- ${a.url}            # see which dates the page exposes`);
    console.log('  2. edit the milestone patterns until `npm run probe -- --venue ' + a.id + '` extracts the right dates');
  } else if (venue.cfp?.adapter === 'manual') {
    console.log('  1. replace YYYY-MM-DD with the dates from the official page (verifiedAt = today)');
  }
  console.log('  3. npm run validate');
  console.log(`  4. add "${a.id}" to select.venues in config/radar.yaml (or rely on select.fields)`);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

main();
