// RFC 5545 calendar generation with stable UIDs, SEQUENCE bumps on change and
// STATUS:CANCELLED for deadlines that disappeared, so subscribed calendars
// update instead of duplicating.
import { toIcsUtc, formatLocal } from './dates.mjs';
import { t, trackLabel } from './i18n.mjs';
import { pickLang } from './errors.mjs';

const CANCEL_RETENTION_DAYS = 30;

/**
 * @param {object[]} rows   flattened deadline rows (schedule.flattenDeadlines) for all venues
 * @param {object} state    { [uid]: { sequence, fingerprint, cancelledAt } }
 * @param {object} opts     { now, lang, timeZone, siteTitle }
 * @returns {{events:object[], nextState:object}}
 */
export function planCalendar(rows, state, { now, lang, timeZone }) {
  const nextState = {};
  const events = [];
  const seen = new Set();
  const nowMs = Date.parse(now);

  for (const r of rows) {
    if (!r.at || !(r.status === 'verified' || r.status === 'needs-verification')) continue;
    seen.add(r.uid);
    const status = r.status === 'verified' ? 'CONFIRMED' : 'TENTATIVE';
    const summary = eventSummary(r, lang);
    const fingerprint = `${r.at}|${summary}|${status}`;
    const prev = state[r.uid];
    let sequence = prev?.sequence ?? 0;
    if (prev && prev.fingerprint !== fingerprint) sequence += 1;
    nextState[r.uid] = { sequence, fingerprint, cancelledAt: null };
    events.push({
      uid: r.uid,
      row: r,
      dtstart: toIcsUtc(r.at),
      summary,
      description: eventDescription(r, lang, timeZone),
      url: r.sourceUrl,
      status,
      sequence,
      categories: [r.venueType, r.acronym],
    });
  }

  for (const [uid, prev] of Object.entries(state)) {
    if (seen.has(uid)) continue;
    const cancelledAt = prev.cancelledAt ?? now;
    if (nowMs - Date.parse(cancelledAt) > CANCEL_RETENTION_DAYS * 86_400_000) continue;
    const sequence = prev.cancelledAt ? prev.sequence : prev.sequence + 1;
    nextState[uid] = { sequence, fingerprint: prev.fingerprint, cancelledAt };
    const dtstart = prev.fingerprint.split('|')[0];
    events.push({
      uid,
      row: null,
      dtstart: dtstart ? toIcsUtc(dtstart) : toIcsUtc(cancelledAt),
      summary: `[cancelled] ${uid}`,
      description: '',
      url: null,
      status: 'CANCELLED',
      sequence,
      categories: [],
    });
  }

  events.sort((a, b) => a.dtstart.localeCompare(b.dtstart) || a.uid.localeCompare(b.uid));
  return { events, nextState };
}

export function eventSummary(r, lang) {
  const round = r.roundId === 'main' ? '' : `${pickLang(r.roundLabel, lang)} `;
  const track = r.track === 'full' ? '' : `${trackLabel(lang, r.track)} `;
  const milestone = r.type === 'other' ? pickLang(r.label, lang) : t(lang, `milestone.${r.type}`);
  return `${r.acronym} ${r.year} · ${round}${track}${milestone}`.replace(/\s+/g, ' ').trim();
}

export function eventDescription(r, lang, timeZone) {
  const lines = [
    `${r.venueName} — ${r.editionLabel}`,
    `${t(lang, 'ics.official')}: ${r.at.slice(0, 16).replace('T', ' ')} ${r.tzLabel ?? ''}`.trim(),
    `${t(lang, 'ics.local')} (${timeZone}): ${formatLocal(r.at, timeZone)}`,
    `${t(lang, 'ics.status')}: ${t(lang, `status.${r.status}`)}`,
  ];
  if (r.status === 'needs-verification') lines.push(t(lang, 'ics.warning'));
  if (r.tzConfirmed === false) lines.push(t(lang, 'ics.tzUnspecified'));
  if (r.sourceUrl) lines.push(`${t(lang, 'ics.cfp')}: ${r.sourceUrl}`);
  return lines.join('\n');
}

/** Split events into named feeds. Returns { 'all': events, 'conferences': ..., 'venues/<id>': ... }. */
export function feedsFor(events, { venues, rankings, showRankings = [] }) {
  const feeds = { all: [] };
  const byType = { conference: 'conferences', journal: 'journals', workshop: 'workshops' };
  for (const key of Object.values(byType)) feeds[key] = [];
  for (const v of venues) feeds[`venues/${v.id}`] = [];
  for (const scheme of showRankings) {
    const r = rankings[scheme];
    if (!r) continue;
    for (const tier of r.tiers) feeds[`tiers/${scheme}/${slug(tier)}`] = [];
  }
  const venueById = new Map(venues.map((v) => [v.id, v]));
  for (const e of events) {
    feeds.all.push(e);
    if (!e.row) continue; // cancellations only go to "all" — every other feed is a subset that never had them
    const v = venueById.get(e.row.venueId);
    if (!v) continue;
    feeds[byType[v.type]]?.push(e);
    feeds[`venues/${v.id}`]?.push(e);
    for (const scheme of showRankings) {
      const tier = rankings[scheme]?.entries[v.id];
      if (tier !== undefined) feeds[`tiers/${scheme}/${slug(tier)}`]?.push(e);
    }
  }
  // cancelled events must also reach the feeds that used to contain them
  for (const e of events) {
    if (e.row) continue;
    const venueId = e.uid.split('/')[0];
    const v = venueById.get(venueId);
    if (!v) continue;
    feeds[byType[v.type]]?.push(e);
    feeds[`venues/${v.id}`]?.push(e);
    for (const scheme of showRankings) {
      const tier = rankings[scheme]?.entries[v.id];
      if (tier !== undefined) feeds[`tiers/${scheme}/${slug(tier)}`]?.push(e);
    }
  }
  return feeds;
}

export function slug(s) {
  return String(s).toLowerCase().replace(/\*/g, 'star').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function renderIcs(events, { name, now, prodId = '-//PaperRadar//EN' }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-PUBLISHED-TTL:PT12H',
  ];
  const stamp = toIcsUtc(now);
  for (const e of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.uid}@paperradar`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${e.dtstart}`);
    lines.push(`DTEND:${e.dtstart}`);
    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push(`SEQUENCE:${e.sequence}`);
    lines.push(`STATUS:${e.status}`);
    if (e.categories.length) lines.push(`CATEGORIES:${e.categories.map(escapeText).join(',')}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export function escapeText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1), splitting on UTF-8 boundaries. */
export function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end < bytes.length && end > start && (bytes[end] & 0xc0) === 0x80) end -= 1;
    out.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74; // continuation lines start with a space
  }
  return out.join('\r\n ');
}
