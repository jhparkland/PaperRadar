// One entry point every script uses: config → catalog → selected venues.
// Prints the validation report and throws when there are errors, so scripts
// never run on a half-valid setup.
import { loadConfig } from './config.mjs';
import { loadCatalog } from './catalog.mjs';
import { selectVenues, withRankings } from './select.mjs';
import { Report } from './errors.mjs';
import { PATHS } from './io.mjs';

export function loadContext({ configPath = PATHS.config, quiet = false } = {}) {
  const { config, report: configReport } = loadConfig(configPath);
  const report = new Report().merge(configReport);
  if (!config) {
    printReport(report, quiet);
    report.throwIfFailed('Config is invalid');
  }
  const catalog = loadCatalog({ customVenues: config.custom, report });
  const { venues: selected } = selectVenues(catalog, config.select, report);
  const venues = withRankings(selected, catalog.rankings);
  for (const id of config.rankings.show) {
    if (!catalog.rankings[id]) report.error('rankings.show', `unknown ranking "${id}" — available: ${Object.keys(catalog.rankings).join(', ') || '(none)'}`);
  }
  printReport(report, quiet);
  report.throwIfFailed('Setup is invalid — fix the errors above');
  return { config, catalog, venues, report };
}

export function printReport(report, quiet) {
  if (quiet) return;
  const text = report.format();
  if (text) console.error(text);
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Run `fn` over items with bounded concurrency, preserving order. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Minimal argv parser: --flag, --key value, positional. */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

/** Load .env into process.env for local runs (never overrides existing vars). */
export async function loadDotEnv(path) {
  const { existsSync, readFileSync } = await import('node:fs');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
