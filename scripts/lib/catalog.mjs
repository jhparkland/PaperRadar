// The catalog is the shared, community-editable knowledge base:
//   catalog/fields.json        research-field taxonomy
//   catalog/rankings/*.json    ranking schemes (CORE, KIISE, ...) keyed by venue id
//   catalog/venues/*.json      one venue per file: identity + how to read its CFP
// Users pick from it in config/radar.yaml; `custom` entries there use the same
// venue schema and are validated with the same rules.
import { basename } from 'node:path';
import { Report, isPlainObject, isNonEmptyString, ID_RE, isHttpUrl, isLocalized, DATE_ONLY_RE } from './errors.mjs';
import { DATE_RE_SOURCE, resolveOffset, normalizeTime, isValidDateOnly } from './dates.mjs';
import { PATHS, readJson, listJsonFiles, existsSync } from './io.mjs';
import { VENUE_TYPES } from './config.mjs';
import { validateRollover } from './rollover.mjs';

export const MILESTONE_TYPES = Object.freeze(['abstract', 'paper', 'notification', 'camera-ready', 'event', 'other']);
export const MILESTONE_STATES = Object.freeze(['dated', 'tba', 'not-required']);
export const ADAPTERS = Object.freeze(['declarative', 'manual', 'none']);
export const SUBMISSION_MODES = Object.freeze(['cfp', 'rolling']);

// ---------------------------------------------------------------- patterns

/** Expand {{DATE}} and compile. Throws with a readable message on bad regex. */
export function compilePattern(pattern) {
  const source = String(pattern).replaceAll('{{DATE}}', DATE_RE_SOURCE);
  let regex;
  try {
    regex = new RegExp(source, 'i');
  } catch (err) {
    throw new Error(`invalid regex: ${err.message}`);
  }
  return { regex, groups: countCaptureGroups(source) };
}

export function countCaptureGroups(source) {
  return new RegExp(`${source}|`).exec('').length - 1;
}

// ---------------------------------------------------------------- venue validation

/**
 * Validate one venue entry in place-agnostic fashion. `path` prefixes every
 * message ("catalog/venues/eurosys.json" or "custom[2]"). Returns the
 * normalized venue (defaults filled) or null when it is unusable.
 */
export function validateVenue(input, report, path, { fieldIds } = {}) {
  if (!isPlainObject(input)) {
    report.error(path, 'venue entry must be a mapping');
    return null;
  }
  const v = { ...input };
  const bad = (p, m) => report.error(`${path}.${p}`, m);
  const warn = (p, m) => report.warn(`${path}.${p}`, m);

  if (!(typeof v.id === 'string' && ID_RE.test(v.id))) bad('id', `invalid id ${JSON.stringify(v.id)} (lowercase letters, digits, hyphens)`);
  if (!isNonEmptyString(v.acronym)) bad('acronym', 'required, e.g. "EuroSys"');
  if (!isNonEmptyString(v.name)) bad('name', 'required: the official full name');
  if (!VENUE_TYPES.includes(v.type)) bad('type', `must be one of ${VENUE_TYPES.join(', ')}`);

  if (!Array.isArray(v.fields) || v.fields.length === 0 || !v.fields.every((f) => typeof f === 'string' && ID_RE.test(f))) {
    bad('fields', 'must be a non-empty list of field ids from catalog/fields.json');
  } else if (fieldIds) {
    for (const f of v.fields) if (!fieldIds.has(f)) bad('fields', `unknown field "${f}" — add it to catalog/fields.json or use an existing id`);
  }
  if (v.topics !== undefined && !(Array.isArray(v.topics) && v.topics.every(isNonEmptyString))) bad('topics', 'must be a list of strings');
  v.topics ??= [];
  if (v.homepage !== undefined && v.homepage !== null && !isHttpUrl(v.homepage)) bad('homepage', 'must be an http(s) URL');
  if (v.parent !== undefined && v.parent !== null && !isNonEmptyString(v.parent)) bad('parent', 'must be a string (e.g. the hosting conference)');
  if (v.note !== undefined && v.note !== null && !isLocalized(v.note)) bad('note', 'must be a string or {ko, en}');

  if (v.submission === undefined) v.submission = v.type === 'journal' ? 'rolling' : 'cfp';
  else if (!SUBMISSION_MODES.includes(v.submission)) bad('submission', `must be one of ${SUBMISSION_MODES.join(', ')}`);

  if (v.cfp === undefined || v.cfp === null) {
    v.cfp = null;
  } else {
    v.cfp = validateCfp(v.cfp, report, `${path}.cfp`, v);
  }
  if (v.cfp === null && v.submission === 'cfp' && v.type !== 'journal') {
    warn('cfp', 'no cfp block: deadlines will not be tracked for this venue');
  }
  return report.errors.some((e) => e.path.startsWith(`${path}.`) || e.path === path) ? null : v;
}

function validateCfp(input, report, path, venue) {
  if (!isPlainObject(input)) {
    report.error(path, 'must be a mapping');
    return null;
  }
  const cfp = { ...input };
  const bad = (p, m) => report.error(`${path}.${p}`, m);

  if (!ADAPTERS.includes(cfp.adapter)) {
    bad('adapter', `must be one of ${ADAPTERS.join(', ')}`);
    return null;
  }
  if (cfp.adapter === 'none') return { adapter: 'none', url: isHttpUrl(cfp.url) ? cfp.url : null };

  if (!isHttpUrl(cfp.url)) bad('url', 'required: the official CFP / important-dates page URL');
  if (cfp.adapter === 'declarative') {
    if (!Array.isArray(cfp.allowedHosts) || cfp.allowedHosts.length === 0 || !cfp.allowedHosts.every(isNonEmptyString)) {
      bad('allowedHosts', 'required: list of hostnames the fetcher may read, e.g. ["www.eurosys.org"]');
    } else if (isHttpUrl(cfp.url)) {
      const host = new URL(cfp.url).hostname;
      if (!cfp.allowedHosts.includes(host)) bad('allowedHosts', `must include the url host "${host}"`);
    }
  }

  // edition
  if (!isPlainObject(cfp.edition)) {
    bad('edition', 'required: {year, label}');
  } else {
    const e = cfp.edition;
    if (!(Number.isInteger(e.year) && e.year >= 2000 && e.year <= 2100)) bad('edition.year', 'must be a 4-digit year');
    if (!isNonEmptyString(e.label)) bad('edition.label', 'required, e.g. "EuroSys 2027"');
    if (e.id !== undefined && !(typeof e.id === 'string' && ID_RE.test(e.id))) bad('edition.id', 'invalid id');
    if (e.event !== undefined && e.event !== null) {
      if (!isPlainObject(e.event)) bad('edition.event', 'must be {start, end, location}');
      else {
        for (const k of ['start', 'end']) {
          if (e.event[k] !== undefined && e.event[k] !== null && !isValidDateOnly(e.event[k])) bad(`edition.event.${k}`, 'must be YYYY-MM-DD');
        }
        if (e.event.location !== undefined && e.event.location !== null && !isNonEmptyString(e.event.location)) bad('edition.event.location', 'must be a string');
      }
    }
    cfp.edition = { id: e.id ?? `${venue.id}-${e.year}`, year: e.year, label: e.label, event: e.event ?? null };
  }

  // optional: how to follow this venue into its next edition
  if (cfp.rollover !== undefined && cfp.rollover !== null) {
    if (cfp.adapter !== 'declarative') {
      bad('rollover', 'only a declarative adapter can follow a venue to the next year');
      cfp.rollover = null;
    } else {
      cfp.rollover = validateRollover(cfp.rollover, report, `${path}.rollover`, cfp);
    }
  } else {
    cfp.rollover = null;
  }

  // timezone defaults
  const tz = isPlainObject(cfp.timezone) ? { ...cfp.timezone } : {};
  if (cfp.timezone !== undefined && !isPlainObject(cfp.timezone)) bad('timezone', 'must be {label, offset?, time?}');
  tz.label ??= 'AoE';
  if (tz.label === 'unspecified') {
    // The official page states no timezone. Assume AoE (the most lenient) but
    // remember that it is an assumption: no reminders, and the site says so.
    tz.offset = '-12:00';
    tz.confirmed = false;
  } else {
    tz.offset = resolveOffset(tz.offset ?? tz.label);
    tz.confirmed = true;
    if (!tz.offset) bad('timezone', `unknown timezone label "${tz.label}" — add an explicit offset like "+09:00", or "unspecified" if the page states none`);
  }
  tz.time = normalizeTime(tz.time);
  if (!tz.time) bad('timezone.time', 'must be HH:MM or HH:MM:SS');
  cfp.timezone = tz;

  // rounds
  if (!Array.isArray(cfp.rounds) || cfp.rounds.length === 0) {
    bad('rounds', 'required: at least one round with milestones');
  } else {
    const ids = new Set();
    cfp.rounds = cfp.rounds.map((r, i) => validateRound(r, report, `${path}.rounds[${i}]`, cfp, ids));
  }
  return cfp;
}

function validateRound(input, report, path, cfp, ids) {
  if (!isPlainObject(input)) {
    report.error(path, 'round must be a mapping');
    return input;
  }
  const r = { ...input };
  const bad = (p, m) => report.error(`${path}.${p}`, m);
  if (!(typeof r.id === 'string' && ID_RE.test(r.id))) bad('id', 'invalid id (e.g. "spring", "main", "round-2")');
  else if (ids.has(r.id)) bad('id', `duplicate round id "${r.id}"`);
  else ids.add(r.id);
  if (r.label === undefined) r.label = r.id;
  else if (!isLocalized(r.label)) bad('label', 'must be a string or {ko, en}');
  if (r.track === undefined) r.track = 'full';
  else if (!isNonEmptyString(r.track)) bad('track', 'must be a string such as "full", "short", "poster", "special-issue"');
  if (!Array.isArray(r.milestones) || r.milestones.length === 0) {
    bad('milestones', 'required: list of {type, pattern|date, ...}');
  } else {
    const types = new Set();
    r.milestones = r.milestones.map((m, i) => validateMilestone(m, report, `${path}.milestones[${i}]`, cfp, types));
  }
  return r;
}

function validateMilestone(input, report, path, cfp, types) {
  if (!isPlainObject(input)) {
    report.error(path, 'milestone must be a mapping');
    return input;
  }
  const m = { ...input };
  const bad = (p, m2) => report.error(`${path}.${p}`, m2);
  if (!MILESTONE_TYPES.includes(m.type)) bad('type', `must be one of ${MILESTONE_TYPES.join(', ')}`);
  if (m.type === 'other' && !isLocalized(m.label)) bad('label', 'required for type "other"');
  if (m.type !== 'other' && types.has(m.type)) bad('type', `duplicate milestone type "${m.type}" in this round`);
  types.add(m.type);

  if (m.state === undefined) m.state = (m.pattern !== undefined || m.date !== undefined) ? 'dated' : 'tba';
  if (!MILESTONE_STATES.includes(m.state)) bad('state', `must be one of ${MILESTONE_STATES.join(', ')}`);

  if (m.time !== undefined && !normalizeTime(m.time)) bad('time', 'must be HH:MM or HH:MM:SS');
  if (m.tz !== undefined && !resolveOffset(m.tz)) bad('tz', `unknown timezone label/offset "${m.tz}"`);
  if (m.dateFormat !== undefined && !['dmy', 'mdy'].includes(m.dateFormat)) bad('dateFormat', 'must be "dmy" or "mdy"');

  if (m.state === 'dated') {
    if (cfp.adapter === 'declarative') {
      if (!isNonEmptyString(m.pattern)) {
        bad('pattern', 'required for a dated milestone: regex with {{DATE}} or one capture group');
      } else {
        try {
          const { groups } = compilePattern(m.pattern);
          if (groups !== 1) bad('pattern', `must contain exactly one capture group (found ${groups}); use {{DATE}} for the date`);
        } catch (err) {
          bad('pattern', err.message);
        }
      }
    } else if (cfp.adapter === 'manual') {
      if (!isValidDateOnly(m.date)) bad('date', 'required for a dated manual milestone: YYYY-MM-DD');
      if (!(typeof m.verifiedAt === 'string' && DATE_ONLY_RE.test(m.verifiedAt) && isValidDateOnly(m.verifiedAt))) {
        bad('verifiedAt', 'required for manual entries: the date (YYYY-MM-DD) you checked the official page');
      }
      if (m.sourceUrl !== undefined && !isHttpUrl(m.sourceUrl)) bad('sourceUrl', 'must be an http(s) URL');
    }
  }
  return m;
}

// ---------------------------------------------------------------- loading

export function loadFields(path = PATHS.fields, report = new Report()) {
  const raw = readJson(path, { version: 1, fields: [] });
  const fields = [];
  const ids = new Set();
  if (!Array.isArray(raw.fields)) {
    report.error('catalog/fields.json', 'must contain a "fields" list');
    return { fields, fieldIds: ids };
  }
  raw.fields.forEach((f, i) => {
    const p = `catalog/fields.json.fields[${i}]`;
    if (!isPlainObject(f) || !(typeof f.id === 'string' && ID_RE.test(f.id))) return report.error(p, 'needs an id');
    if (ids.has(f.id)) return report.error(p, `duplicate field id "${f.id}"`);
    if (!isLocalized(f.name)) return report.error(p, 'needs a name (string or {ko, en})');
    ids.add(f.id);
    fields.push({ id: f.id, name: f.name, parent: f.parent ?? null, description: f.description ?? null });
  });
  for (const f of fields) if (f.parent && !ids.has(f.parent)) report.error(`catalog/fields.json.${f.id}`, `unknown parent "${f.parent}"`);
  return { fields, fieldIds: ids };
}

export function loadRankings(dir = PATHS.rankings, report = new Report()) {
  const rankings = {};
  for (const file of listJsonFiles(dir)) {
    const p = `catalog/rankings/${basename(file)}`;
    const raw = readJson(file);
    const expectedId = basename(file, '.json');
    if (!isPlainObject(raw) || raw.id !== expectedId) {
      report.error(p, `"id" must equal the file name "${expectedId}"`);
      continue;
    }
    if (!isLocalized(raw.label)) report.error(p, 'needs a label (string or {ko, en})');
    if (raw.url !== undefined && raw.url !== null && !isHttpUrl(raw.url)) report.error(p, 'url must be http(s)');
    if (!Array.isArray(raw.tiers) || raw.tiers.length === 0 || !raw.tiers.every(isNonEmptyString)) {
      report.error(p, 'tiers must be a non-empty list ordered best → worst, e.g. ["A*", "A", "B", "C"]');
      continue;
    }
    if (!isPlainObject(raw.entries)) {
      report.error(p, 'entries must be a mapping of venue id → tier');
      continue;
    }
    for (const [venueId, tier] of Object.entries(raw.entries)) {
      if (!ID_RE.test(venueId)) report.error(`${p}.entries`, `invalid venue id "${venueId}"`);
      if (!raw.tiers.includes(tier)) report.error(`${p}.entries.${venueId}`, `tier "${tier}" is not in tiers ${JSON.stringify(raw.tiers)}`);
    }
    rankings[raw.id] = {
      id: raw.id, label: raw.label, url: raw.url ?? null, tiers: raw.tiers,
      description: raw.description ?? null, entries: raw.entries,
    };
  }
  return rankings;
}

export function loadCatalogVenues(dir = PATHS.venues, report = new Report(), { fieldIds } = {}) {
  const venues = new Map();
  for (const file of listJsonFiles(dir)) {
    const p = `catalog/venues/${basename(file)}`;
    let raw;
    try {
      raw = readJson(file);
    } catch (err) {
      report.error(p, err.message);
      continue;
    }
    const expectedId = basename(file, '.json');
    if (isPlainObject(raw) && raw.id !== expectedId) report.error(`${p}.id`, `must equal the file name "${expectedId}"`);
    const v = validateVenue(raw, report, p, { fieldIds });
    if (v) venues.set(v.id, v);
  }
  return venues;
}

/**
 * Load everything. `customVenues` (from config) are validated with the same
 * rules and override catalog entries with the same id (with a warning).
 */
export function loadCatalog({ customVenues = [], report = new Report(), root = PATHS } = {}) {
  const { fields, fieldIds } = loadFields(root.fields, report);
  const rankings = loadRankings(root.rankings, report);
  const venues = existsSync(root.venues) ? loadCatalogVenues(root.venues, report, { fieldIds }) : new Map();

  customVenues.forEach((raw, i) => {
    const v = validateVenue(raw, report, `custom[${i}]`, { fieldIds });
    if (!v) return;
    if (venues.has(v.id)) report.warn(`custom[${i}]`, `overrides catalog venue "${v.id}"`);
    venues.set(v.id, { ...v, custom: true });
  });

  for (const [rid, r] of Object.entries(rankings)) {
    for (const venueId of Object.keys(r.entries)) {
      if (!venues.has(venueId)) report.warn(`catalog/rankings/${rid}.json.entries.${venueId}`, 'venue is not in the catalog (entry ignored)');
    }
  }

  return { fields, fieldIds, rankings, venues, report };
}

/** {schemeId: tier} for one venue across all rankings. */
export function rankingsFor(rankings, venueId) {
  const out = {};
  for (const [id, r] of Object.entries(rankings)) if (r.entries[venueId] !== undefined) out[id] = r.entries[venueId];
  return out;
}
