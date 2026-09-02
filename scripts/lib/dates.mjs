// Date and timezone handling without external dependencies.
//
// Deadlines are stored as ISO-8601 strings *with the official UTC offset*
// (e.g. "2026-04-15T23:59:00-12:00" for AoE). Display in the user's timezone
// goes through Intl so IANA names like "Asia/Seoul" work in Node and browsers.

export const TZ_OFFSETS = Object.freeze({
  AoE: '-12:00', UTC: '+00:00', GMT: '+00:00',
  EST: '-05:00', EDT: '-04:00', CST: '-06:00', CDT: '-05:00',
  MST: '-07:00', MDT: '-06:00', PST: '-08:00', PDT: '-07:00',
  WET: '+00:00', WEST: '+01:00', BST: '+01:00', IST: '+05:30',
  CET: '+01:00', CEST: '+02:00', EET: '+02:00', EEST: '+03:00',
  KST: '+09:00', JST: '+09:00', HKT: '+08:00', SGT: '+08:00', CST_CN: '+08:00',
  AEST: '+10:00', AEDT: '+11:00', NZST: '+12:00', NZDT: '+13:00',
});

const OFFSET_RE = /^[+-](0\d|1[0-4]):[0-5]\d$/;

/** Resolve a timezone label or explicit offset to "+HH:MM". Returns null when unknown. */
export function resolveOffset(labelOrOffset) {
  if (!labelOrOffset) return null;
  const s = String(labelOrOffset).trim();
  if (OFFSET_RE.test(s)) return s;
  if (s === 'Z') return '+00:00';
  return TZ_OFFSETS[s] ?? null;
}

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH_ALT = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
const WEEKDAY = '(?:(?:Mon|Tues?|Wed(?:nes)?|Thu(?:rs)?|Fri|Sat(?:ur)?|Sun)(?:day)?,?\\s+)?';

/**
 * Regex source with exactly ONE capture group that matches the date formats
 * `parseDateText` understands. Adapters write `{{DATE}}` in patterns and it
 * expands to this, so contributors never hand-write date regexes.
 */
export const DATE_RE_SOURCE =
  `(${WEEKDAY}(?:(?:${MONTH_ALT})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}` +
  `|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_ALT})\\.?,?\\s+\\d{4}` +
  `|\\d{4}-\\d{2}-\\d{2}` +
  `|\\d{4}/\\d{2}/\\d{2}))`;

const NAMED_MDY = new RegExp(`^(?:[A-Za-z]+,?\\s+)?(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})$`, 'i');
const NAMED_DMY = new RegExp(`^(?:[A-Za-z]+,?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?,?\\s+(\\d{4})$`, 'i');
const ISO_YMD = /^(\d{4})[-/](\d{2})[-/](\d{2})$/;
const NUMERIC = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;

/**
 * Parse human date text into {year, month, day}. Unambiguous formats only:
 * numeric day/month order is accepted only when `dateFormat` is 'dmy' or 'mdy'.
 * Returns null when the text cannot be parsed with certainty.
 */
export function parseDateText(text, { dateFormat } = {}) {
  if (typeof text !== 'string') return null;
  const s = text.replace(/\s+/g, ' ').trim();
  let m;
  if ((m = s.match(NAMED_MDY))) return ymd(m[3], MONTHS[m[1].toLowerCase()], m[2]);
  if ((m = s.match(NAMED_DMY))) return ymd(m[3], MONTHS[m[2].toLowerCase()], m[1]);
  if ((m = s.match(ISO_YMD))) return ymd(m[1], m[2], m[3]);
  if ((m = s.match(NUMERIC))) {
    if (dateFormat === 'dmy') return ymd(m[3], m[2], m[1]);
    if (dateFormat === 'mdy') return ymd(m[3], m[1], m[2]);
    return null; // ambiguous without an explicit format
  }
  return null;
}

function ymd(y, m, d) {
  const year = Number(y), month = Number(m), day = Number(d);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** Combine a calendar date, wall-clock time ("23:59" or "23:59:00") and offset into an ISO string. */
export function toIsoWithOffset({ year, month, day }, time = '23:59:00', offset = '+00:00') {
  const t = normalizeTime(time);
  if (!t) throw new Error(`Invalid time: ${time}`);
  const off = resolveOffset(offset);
  if (!off) throw new Error(`Unknown timezone/offset: ${offset}`);
  return `${year}-${pad(month)}-${pad(day)}T${t}${off}`;
}

export function normalizeTime(time) {
  if (time == null) return '23:59:00';
  const m = String(time).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]), s = Number(m[3] ?? 0);
  if (h > 23 || mi > 59 || s > 59) return null;
  return `${pad(h)}:${pad(mi)}:${pad(s)}`;
}

export function isValidIso(iso) {
  return typeof iso === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(iso)
    && !Number.isNaN(Date.parse(iso));
}

export function isValidDateOnly(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return parseDateText(s) !== null;
}

export function isValidIanaTimeZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Calendar date parts of an instant in an IANA timezone. */
export function partsInTimeZone(iso, timeZone) {
  const d = iso instanceof Date ? iso : new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const out = {};
  for (const p of fmt.formatToParts(d)) if (p.type !== 'literal') out[p.type] = p.value;
  return {
    year: Number(out.year), month: Number(out.month), day: Number(out.day),
    hour: Number(out.hour), minute: Number(out.minute), weekday: out.weekday,
  };
}

/** "2026-04-16 04:59" style compact local string. */
export function formatLocal(iso, timeZone) {
  const p = partsInTimeZone(iso, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** Whole calendar days from `now` to `iso`, measured in `timeZone` (0 = today, negative = past). */
export function daysUntil(iso, now, timeZone) {
  const a = partsInTimeZone(iso, timeZone);
  const b = partsInTimeZone(now, timeZone);
  const ms = Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day);
  return Math.round(ms / 86_400_000);
}

export function isPast(iso, now) {
  return Date.parse(iso) < (now instanceof Date ? now.getTime() : Date.parse(now));
}

/** ICS UTC timestamp: 20260416T115900Z */
export function toIcsUtc(iso) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
    + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export function isoDateOnly(iso) {
  return String(iso).slice(0, 10);
}
