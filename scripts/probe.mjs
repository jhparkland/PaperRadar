#!/usr/bin/env node
// `npm run probe` — helper for writing and debugging CFP adapters.
//
//   npm run probe -- <url>                       list every date on the page with its preceding text
//   npm run probe -- <url> --grep "deadline"     show occurrences of a word with context
//   npm run probe -- <url> --pattern "Paper submission[\s\S]{0,60}?{{DATE}}"   test one pattern
//   npm run probe -- --venue eurosys             run a venue's adapter live and show what it extracts
//   npm run probe -- <url> --text                dump the normalized page text
import { parseArgs, loadContext, nowIso } from './lib/context.mjs';
import { fetchSource, htmlToText } from './lib/fetch.mjs';
import { DATE_RE_SOURCE, parseDateText } from './lib/dates.mjs';
import { compilePattern } from './lib/catalog.mjs';
import { refreshVenue } from './lib/refresh.mjs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const context = Number(args.context ?? 70);

  if (args.venue) {
    const ctx = loadContext({ quiet: true });
    const venue = ctx.catalog.venues.get(String(args.venue));
    if (!venue) return fail(`unknown venue "${args.venue}"`);
    if (!venue.cfp || venue.cfp.adapter === 'none') return fail(`${venue.acronym} has no cfp adapter`);
    const r = await refreshVenue(venue, undefined, { now: nowIso() });
    const edition = r.schedule.editions[0];
    console.log(`${venue.acronym} · ${edition.label} · source ${edition.source.status}${edition.source.error ? ` — ${edition.source.error}` : ''}`);
    for (const round of edition.rounds) {
      console.log(`  round ${round.id} (${round.track})`);
      for (const m of round.milestones) {
        console.log(`    ${m.type.padEnd(13)} ${m.state.padEnd(13)} ${m.at ?? '—'}  ${m.sourceText ? `"${m.sourceText}"` : ''}  [${m.verification}]`);
      }
    }
    process.exit(r.failure ? 1 : 0);
  }

  const url = args._[0];
  if (!url) return fail('usage: npm run probe -- <url> [--grep word] [--pattern regex] [--text] | --venue <id>');
  const host = new URL(url).hostname;
  const fetched = await fetchSource(url, { allowedHosts: [host] });
  if (!fetched.ok) return fail(`fetch failed: ${fetched.error}`);
  const text = htmlToText(fetched.text);
  console.log(`fetched ${url} — ${fetched.text.length} bytes html, ${text.length} chars text\n`);

  if (args.text) {
    console.log(text);
    return;
  }
  if (typeof args.pattern === 'string') {
    const { regex, groups } = compilePattern(args.pattern);
    if (groups !== 1) console.log(`warning: pattern has ${groups} capture groups (needs exactly 1)`);
    const m = regex.exec(text);
    if (!m) return fail('pattern not found');
    const date = parseDateText(m[1] ?? '', { dateFormat: args.dateFormat });
    console.log(`match     : "${m[0]}"`);
    console.log(`captured  : "${m[1]}"`);
    console.log(`parsed    : ${date ? `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}` : 'NOT A DATE'}`);
    return;
  }
  if (typeof args.grep === 'string') {
    const re = new RegExp(args.grep, 'gi');
    let m;
    let n = 0;
    while ((m = re.exec(text)) && n < 40) {
      n += 1;
      console.log(`…${text.slice(Math.max(0, m.index - context), m.index + m[0].length + context)}…\n`);
    }
    if (n === 0) console.log('no occurrences');
    return;
  }
  const re = new RegExp(DATE_RE_SOURCE, 'g');
  let m;
  let n = 0;
  console.log('dates found (preceding text → date):');
  while ((m = re.exec(text)) && n < 200) {
    n += 1;
    const before = text.slice(Math.max(0, m.index - context), m.index).trim();
    console.log(`  …${before}  →  ${m[1]}`);
  }
  if (n === 0) console.log('  none — the page may render dates with JavaScript; open it in a browser and use the manual adapter');
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

main().catch((err) => fail(err.stack ?? err.message));
