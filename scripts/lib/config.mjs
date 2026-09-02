// Loads and validates config/radar.yaml — the one file a user edits.
// Every problem is reported with its YAML path so it can be fixed in one pass.
import YAML from 'yaml';
import { Report, isPlainObject, isNonEmptyString, ID_RE, isHttpUrl, isLocalized } from './errors.mjs';
import { isValidIanaTimeZone } from './dates.mjs';
import { PATHS, readText, existsSync } from './io.mjs';

export const SUPPORTED_LANGUAGES = Object.freeze(['ko', 'en']);
export const VENUE_TYPES = Object.freeze(['conference', 'journal', 'workshop']);
export const CHANNELS = Object.freeze(['google-chat', 'email']);

export const DEFAULTS = Object.freeze({
  version: 1,
  site: {
    title: 'PaperRadar',
    tagline: '',
    languages: ['ko', 'en'],
    timezone: 'Asia/Seoul',
    baseUrl: '',
    upcomingDays: 120,
    archiveDays: 400,
  },
  rankings: { show: [], primary: null },
  select: { fields: [], types: [...VENUE_TYPES], venues: [], exclude: [], tiers: null },
  custom: [],
  reminders: {
    daysBefore: [30, 15, 3, 0], imminentDays: 3, language: null,
    channels: ['google-chat'], notifyChanges: true, notifyFailures: false,
  },
});

export function loadConfig(path = PATHS.config) {
  if (!existsSync(path)) {
    const err = new Error(
      `Config not found: ${path}\n` +
      `Copy config/radar.example.yaml to config/radar.yaml and edit it.`,
    );
    err.code = 'CONFIG_MISSING';
    throw err;
  }
  return parseConfig(readText(path));
}

export function parseConfig(text) {
  let raw;
  try {
    raw = YAML.parse(text) ?? {};
  } catch (err) {
    const report = new Report().error('(yaml)', `cannot parse YAML: ${err.message}`);
    return { config: null, report };
  }
  return normalizeConfig(raw);
}

/** Validate a raw config object and fill defaults. Returns {config, report}. */
export function normalizeConfig(raw) {
  const report = new Report();
  if (!isPlainObject(raw)) {
    report.error('(root)', 'config must be a YAML mapping');
    return { config: null, report };
  }
  if (raw.version !== 1) report.error('version', `must be 1 (got ${JSON.stringify(raw.version)})`);

  const site = normalizeSite(raw.site, report);
  const rankings = normalizeRankings(raw.rankings, report);
  const select = normalizeSelect(raw.select, report);
  const custom = normalizeCustom(raw.custom, report);
  const reminders = normalizeReminders(raw.reminders, site, report);

  for (const key of Object.keys(raw)) {
    if (!['version', 'site', 'rankings', 'select', 'custom', 'reminders'].includes(key)) {
      report.warn(key, 'unknown top-level key (ignored)');
    }
  }

  if (select.fields.length === 0 && select.venues.length === 0 && custom.length === 0) {
    report.warn('select', 'nothing selected: set select.fields and/or select.venues (or add custom venues)');
  }

  return { config: { version: 1, site, rankings, select, custom, reminders }, report };
}

function normalizeSite(input, report) {
  const site = { ...DEFAULTS.site, languages: [...DEFAULTS.site.languages] };
  if (input === undefined) return site;
  if (!isPlainObject(input)) {
    report.error('site', 'must be a mapping');
    return site;
  }
  if (input.title !== undefined) {
    if (isNonEmptyString(input.title)) site.title = input.title.trim();
    else report.error('site.title', 'must be a non-empty string');
  }
  if (input.tagline !== undefined) {
    if (isLocalized(input.tagline)) site.tagline = input.tagline;
    else report.error('site.tagline', 'must be a string or {ko, en} mapping');
  }
  if (input.languages !== undefined) {
    if (Array.isArray(input.languages) && input.languages.length > 0 && input.languages.every((l) => SUPPORTED_LANGUAGES.includes(l))) {
      site.languages = [...new Set(input.languages)];
    } else {
      report.error('site.languages', `must be a non-empty list drawn from ${SUPPORTED_LANGUAGES.join(', ')}`);
    }
  }
  if (input.timezone !== undefined) {
    if (isValidIanaTimeZone(input.timezone)) site.timezone = input.timezone;
    else report.error('site.timezone', `unknown IANA timezone "${input.timezone}" (example: Asia/Seoul, Europe/Berlin, America/New_York)`);
  }
  if (input.baseUrl !== undefined && input.baseUrl !== null && input.baseUrl !== '') {
    if (isHttpUrl(input.baseUrl)) site.baseUrl = input.baseUrl.endsWith('/') ? input.baseUrl : `${input.baseUrl}/`;
    else report.error('site.baseUrl', 'must be an http(s) URL such as https://you.github.io/PaperRadar/');
  }
  for (const key of ['upcomingDays', 'archiveDays']) {
    if (input[key] !== undefined) {
      if (Number.isInteger(input[key]) && input[key] > 0) site[key] = input[key];
      else report.error(`site.${key}`, 'must be a positive integer (days)');
    }
  }
  return site;
}

function normalizeRankings(input, report) {
  const rankings = { show: [], primary: null };
  if (input === undefined) return rankings;
  if (!isPlainObject(input)) {
    report.error('rankings', 'must be a mapping');
    return rankings;
  }
  if (input.show !== undefined) {
    if (Array.isArray(input.show) && input.show.every((id) => typeof id === 'string' && ID_RE.test(id))) {
      rankings.show = [...new Set(input.show)];
    } else {
      report.error('rankings.show', 'must be a list of ranking ids (lowercase, e.g. kiise-2024)');
    }
  }
  if (input.primary !== undefined && input.primary !== null) {
    if (typeof input.primary === 'string' && ID_RE.test(input.primary)) {
      rankings.primary = input.primary;
      if (!rankings.show.includes(input.primary)) rankings.show.unshift(input.primary);
    } else {
      report.error('rankings.primary', 'must be a ranking id');
    }
  } else if (rankings.show.length > 0) {
    rankings.primary = rankings.show[0];
  }
  return rankings;
}

function idList(input, path, report) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    report.error(path, 'must be a list');
    return [];
  }
  const out = [];
  input.forEach((v, i) => {
    if (typeof v === 'string' && ID_RE.test(v)) out.push(v);
    else report.error(`${path}[${i}]`, `invalid id ${JSON.stringify(v)} (lowercase letters, digits and hyphens)`);
  });
  return [...new Set(out)];
}

function normalizeSelect(input, report) {
  const select = { fields: [], types: [...VENUE_TYPES], venues: [], exclude: [], tiers: null };
  if (input === undefined) return select;
  if (!isPlainObject(input)) {
    report.error('select', 'must be a mapping');
    return select;
  }
  select.fields = idList(input.fields, 'select.fields', report);
  select.venues = idList(input.venues, 'select.venues', report);
  select.exclude = idList(input.exclude, 'select.exclude', report);
  if (input.types !== undefined) {
    if (Array.isArray(input.types) && input.types.length > 0 && input.types.every((t) => VENUE_TYPES.includes(t))) {
      select.types = [...new Set(input.types)];
    } else {
      report.error('select.types', `must be a non-empty list drawn from ${VENUE_TYPES.join(', ')}`);
    }
  }
  if (input.tiers !== undefined && input.tiers !== null) {
    const t = input.tiers;
    if (!isPlainObject(t) || !(typeof t.scheme === 'string' && ID_RE.test(t.scheme)) || !Array.isArray(t.include) || t.include.length === 0) {
      report.error('select.tiers', 'must be {scheme: <ranking id>, include: [<tier>, ...], keepUnranked: true|false}');
    } else {
      select.tiers = {
        scheme: t.scheme,
        include: t.include.map(String),
        keepUnranked: t.keepUnranked === undefined ? true : Boolean(t.keepUnranked),
      };
    }
  }
  return select;
}

function normalizeCustom(input, report) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    report.error('custom', 'must be a list of venue entries');
    return [];
  }
  // Structural validation happens in catalog.mjs (same rules as catalog files).
  return input;
}

function normalizeReminders(input, site, report) {
  const reminders = { ...DEFAULTS.reminders, daysBefore: [...DEFAULTS.reminders.daysBefore], channels: [...DEFAULTS.reminders.channels] };
  reminders.language = site.languages[0];
  if (input === undefined) return reminders;
  if (!isPlainObject(input)) {
    report.error('reminders', 'must be a mapping');
    return reminders;
  }
  if (input.daysBefore !== undefined) {
    if (Array.isArray(input.daysBefore) && input.daysBefore.length > 0 && input.daysBefore.every((d) => Number.isInteger(d) && d >= 0)) {
      reminders.daysBefore = [...new Set(input.daysBefore)].sort((a, b) => b - a);
    } else {
      report.error('reminders.daysBefore', 'must be a non-empty list of non-negative integers, e.g. [30, 15, 3, 0] (0 = on the day)');
    }
  }
  if (input.imminentDays !== undefined) {
    if (Number.isInteger(input.imminentDays) && input.imminentDays >= 0) reminders.imminentDays = input.imminentDays;
    else report.error('reminders.imminentDays', 'must be a non-negative integer: thresholds at or below it are grouped as "closing soon"');
  }
  if (input.language !== undefined) {
    if (site.languages.includes(input.language)) reminders.language = input.language;
    else report.error('reminders.language', `must be one of site.languages (${site.languages.join(', ')})`);
  }
  if (input.channels !== undefined) {
    if (Array.isArray(input.channels) && input.channels.every((c) => CHANNELS.includes(c))) {
      reminders.channels = [...new Set(input.channels)];
    } else {
      report.error('reminders.channels', `must be a list drawn from ${CHANNELS.join(', ')}`);
    }
  }
  for (const key of ['notifyChanges', 'notifyFailures']) {
    if (input[key] !== undefined) {
      if (typeof input[key] === 'boolean') reminders[key] = input[key];
      else report.error(`reminders.${key}`, 'must be true or false');
    }
  }
  return reminders;
}
