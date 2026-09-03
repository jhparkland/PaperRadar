// Following a venue into its next edition.
//
// Most conferences publish each edition at a URL that differs only by the
// year (2027.eurosys.org → 2028.eurosys.org). A venue can declare that shape:
//
//   "rollover": { "url": "https://{year}.eurosys.org/cfp.html",
//                 "allowedHosts": ["{year}.eurosys.org"], "maxAhead": 2 }
//
// When the tracked edition has no future deadline left, refresh probes the
// next year(s) and adopts the first page that really carries future dates.
// Everything here is deliberately conservative: guessing a URL is cheap, but
// silently tracking the wrong page — or a placeholder still showing last
// year's dates — is worse than going quiet and asking a human.
//
// Rules a candidate must satisfy to be adopted:
//   1. the URL comes from the declared template with a concrete year, and its
//      host is fetched under exactly that expanded allow-list (no wildcards);
//   2. the page parses with the venue's own adapter;
//   3. it yields at least one dated author milestone in the future;
//   4. every dated milestone is later than the current edition's last one, so
//      a stale copy of the previous CFP is rejected;
//   5. we never move backwards, and never further than `maxAhead` years.
export const MAX_AHEAD_LIMIT = 5;
const ACTIONABLE = new Set(['abstract', 'paper', 'camera-ready']);

/**
 * Replace the year placeholders in a template: `{year}` → 2028, `{yy}` → 28
 * (some venues host an edition at ppopp28.sigplan.org rather than 2028.*).
 * Returns null when the template carries no placeholder at all.
 */
export function expandYear(template, year) {
  if (typeof template !== 'string') return null;
  if (!template.includes('{year}') && !template.includes('{yy}')) return null;
  return template.replaceAll('{year}', String(year)).replaceAll('{yy}', String(year).slice(-2));
}

/** True when the edition has no dated author milestone left in the future. */
export function isEditionExhausted(edition, now) {
  const t = Date.parse(now);
  for (const r of edition?.rounds ?? []) {
    for (const m of r.milestones ?? []) {
      if (m.state !== 'dated' || !m.at) continue;
      if (!ACTIONABLE.has(m.type)) continue;
      if (Date.parse(m.at) > t) return false;
    }
  }
  return true;
}

/** The latest dated milestone in an edition, as epoch ms, or null. */
export function latestDate(edition) {
  let latest = null;
  for (const r of edition?.rounds ?? []) {
    for (const m of r.milestones ?? []) {
      if (m.state !== 'dated' || !m.at) continue;
      const t = Date.parse(m.at);
      if (!Number.isNaN(t) && (latest === null || t > latest)) latest = t;
    }
  }
  return latest;
}

/**
 * Years worth probing, nearest first. Empty when rollover is not configured,
 * the edition still has a future deadline, or we are already at the cap.
 */
export function candidateYears(cfp, currentEdition, { now }) {
  const ro = cfp?.rollover;
  if (!ro) return [];
  if (currentEdition && !isEditionExhausted(currentEdition, now)) return [];
  const from = cfp.edition.year;
  const maxAhead = Math.min(ro.maxAhead ?? 2, MAX_AHEAD_LIMIT);
  // Guard against a catalog whose edition.year is already far ahead: never
  // probe beyond two calendar years from today, however large maxAhead is.
  // Two, not one — an edition that ends late in year N is normally followed by
  // one in N+2 (EuroSys 2027 runs in April 2027; the next is EuroSys 2028,
  // and its page can appear while the calendar still says 2026).
  const ceiling = new Date(now).getUTCFullYear() + 2;
  const years = [];
  for (let y = from + 1; y <= from + maxAhead && y <= ceiling; y += 1) years.push(y);
  return years;
}

/** The concrete URL and allow-list for one candidate year. */
export function candidateSource(cfp, year) {
  const url = expandYear(cfp.rollover.url, year);
  // A host without a placeholder is already the right host for every edition
  // (www.asplos-conference.org serves asplos2027/ and asplos2028/ alike).
  const allowedHosts = (cfp.rollover.allowedHosts ?? []).map((h) => expandYear(h, year) ?? h);
  if (!url || allowedHosts.length === 0) return null;
  try {
    if (!allowedHosts.includes(new URL(url).hostname)) return null;
  } catch {
    return null;
  }
  return { url, allowedHosts };
}

/** The cfp a candidate year should be parsed with: same rounds, new year/url. */
export function candidateCfp(cfp, year, source, acronym) {
  return {
    ...cfp,
    url: source.url,
    allowedHosts: source.allowedHosts,
    edition: {
      id: `${cfp.edition.id.replace(/-\d{4}$/, '')}-${year}`,
      year,
      label: `${acronym} ${year}`,
      event: null, // dates and venue of the new edition are not known yet
    },
  };
}

/**
 * Is an extracted candidate edition good enough to adopt?
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function acceptCandidate(rounds, currentEdition, { now }) {
  const t = Date.parse(now);
  const dated = rounds.flatMap((r) => (r.milestones ?? []).filter((m) => m.state === 'dated' && m.at));
  if (dated.length === 0) return { ok: false, reason: 'no dated milestone on the page' };
  const future = dated.filter((m) => ACTIONABLE.has(m.type) && Date.parse(m.at) > t);
  if (future.length === 0) return { ok: false, reason: 'no future author deadline on the page' };
  const previousLatest = latestDate(currentEdition);
  if (previousLatest !== null) {
    const stale = dated.filter((m) => Date.parse(m.at) <= previousLatest);
    if (stale.length === dated.length) return { ok: false, reason: 'every date is older than the current edition (page looks like a copy)' };
  }
  return { ok: true };
}

/** Validate a `rollover` block; returns the normalized block or null. */
export function validateRollover(input, report, path, cfp) {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    report.error(path, 'must be a mapping {url, allowedHosts, maxAhead?}');
    return null;
  }
  const ro = { url: input.url, allowedHosts: input.allowedHosts, maxAhead: input.maxAhead ?? 2 };
  let ok = true;
  if (typeof ro.url !== 'string' || !(ro.url.includes('{year}') || ro.url.includes('{yy}'))) {
    report.error(`${path}.url`, 'must be the CFP URL with the year replaced by {year} (or {yy} for a two-digit year), e.g. "https://{year}.eurosys.org/cfp.html"');
    ok = false;
  }
  if (!Array.isArray(ro.allowedHosts) || ro.allowedHosts.length === 0 || !ro.allowedHosts.every((h) => typeof h === 'string' && h.length > 0)) {
    report.error(`${path}.allowedHosts`, 'required: hostnames for the probed year, e.g. ["{year}.eurosys.org"]');
    ok = false;
  }
  if (!Number.isInteger(ro.maxAhead) || ro.maxAhead < 1 || ro.maxAhead > MAX_AHEAD_LIMIT) {
    report.error(`${path}.maxAhead`, `must be an integer from 1 to ${MAX_AHEAD_LIMIT}`);
    ok = false;
  }
  if (!ok) return null;
  // The template must reproduce the current url at the current year, otherwise
  // rollover would silently start reading a different page than the one the
  // catalog was verified against.
  const atCurrent = expandYear(ro.url, cfp.edition?.year);
  if (cfp.url && atCurrent && atCurrent !== cfp.url) {
    report.error(`${path}.url`, `with year ${cfp.edition.year} this yields ${atCurrent}, which is not the tracked url ${cfp.url}`);
    return null;
  }
  for (const h of ro.allowedHosts) {
    const expanded = expandYear(h, cfp.edition?.year) ?? h;
    if (cfp.allowedHosts && !cfp.allowedHosts.includes(expanded)) {
      report.error(`${path}.allowedHosts`, `"${h}" yields "${expanded}" at year ${cfp.edition.year}, which is not in cfp.allowedHosts`);
      return null;
    }
  }
  return ro;
}
