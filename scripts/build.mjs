#!/usr/bin/env node
// `npm run build` — produce dist/: the static site, data.json and ICS feeds.
// Pure: reads config, catalog and data/, never writes outside dist/.
import { loadContext, nowIso } from './lib/context.mjs';
import { PATHS, readJson, writeJson, writeText, emptyDir, cpSync, join } from './lib/io.mjs';
import { emptySchedules, flattenDeadlines } from './lib/schedule.mjs';
import { buildSiteModel } from './lib/site-model.mjs';
import { planCalendar, feedsFor, renderIcs } from './lib/ics.mjs';
import { t } from './lib/i18n.mjs';
import { pickLang } from './lib/errors.mjs';

function main() {
  const ctx = loadContext();
  const { config, catalog, venues } = ctx;
  const now = nowIso();
  const schedules = readJson(PATHS.schedules, emptySchedules());
  const updates = readJson(PATHS.updates, { version: 1, entries: [] });
  const calendarState = readJson(PATHS.calendarState, {});

  const model = buildSiteModel({ config, catalog, venues, schedules, updates, now });

  emptyDir(PATHS.dist);
  cpSync(PATHS.site, PATHS.dist, { recursive: true });
  writeJson(join(PATHS.dist, 'data.json'), model);
  writeText(join(PATHS.dist, '.nojekyll'), '');

  const lang = config.site.languages[0];
  const rows = venues.flatMap((v) => flattenDeadlines(v, schedules.venues[v.id]));
  const { events } = planCalendar(rows, calendarState, { now, lang, timeZone: config.site.timezone });
  const feeds = feedsFor(events, { venues, rankings: catalog.rankings, showRankings: config.rankings.show });
  let files = 0;
  for (const [key, list] of Object.entries(feeds)) {
    const name = feedName(key, { venues, catalog, lang, title: config.site.title });
    writeText(join(PATHS.dist, 'calendars', `${key}.ics`), renderIcs(list, { name, now }));
    files += 1;
  }

  console.log(`built dist/ — ${model.venues.length} venues, ${model.upcoming.length} upcoming, ${events.length} calendar events, ${files} feeds`);
}

function feedName(key, { venues, catalog, lang, title }) {
  const base = t(lang, 'ics.calendarName', { title });
  if (key === 'all') return base;
  if (key.startsWith('venues/')) {
    const v = venues.find((x) => x.id === key.slice(7));
    return `${v?.acronym ?? key} · ${base}`;
  }
  if (key.startsWith('tiers/')) {
    const [, scheme, tier] = key.split('/');
    const label = pickLang(catalog.rankings[scheme]?.label, lang) || scheme;
    return `${label} ${tier.toUpperCase()} · ${base}`;
  }
  const typeKey = { conferences: 'type.conference', journals: 'type.journal', workshops: 'type.workshop' }[key];
  return `${typeKey ? t(lang, typeKey) : key} · ${base}`;
}

try {
  main();
} catch (err) {
  console.error(err.stack ?? err.message);
  process.exit(1);
}
