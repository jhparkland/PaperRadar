// Change notifications: "a date was announced / moved / removed / verified
// again". Entries come from data/updates.json (written by refresh); this
// module decides which ones are new since the last notification and renders
// a digest in the same shape the reminder channels already understand.
//
// Reminder state file (data/state/reminders.json):
//   { version: 1, deadlines: { [uid]: { sent: { [threshold]: ISO } } },
//     changes: { notifiedThrough: ISO | null } }
// A null notifiedThrough means "never notified": the first run only records
// the current time so a fresh deployment does not blast every deadline it
// imported as a "change".
import { t, trackLabel } from './i18n.mjs';
import { pickLang } from './errors.mjs';
import { formatLocal } from './dates.mjs';

export const NOTIFY_KINDS = Object.freeze(['added', 'changed', 'removed', 'recovered']);

export function emptyReminderState() {
  return { version: 1, deadlines: {}, changes: { notifiedThrough: null } };
}

/** Accept the current shape or the legacy uid-keyed map. */
export function normalizeReminderState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyReminderState();
  if (raw.version === 1 && raw.deadlines && typeof raw.deadlines === 'object') {
    return { version: 1, deadlines: { ...raw.deadlines }, changes: { notifiedThrough: raw.changes?.notifiedThrough ?? null } };
  }
  return { version: 1, deadlines: { ...raw }, changes: { notifiedThrough: null } };
}

/**
 * Update-log entries newer than the last notification, oldest first, one per
 * milestone (the newest entry wins). Entries older than `maxAgeDays` are
 * ignored so a long-silent channel never receives ancient history.
 */
export function pendingChanges(updates, state, { now, includeFailures = false, maxAgeDays = 14 } = {}) {
  const since = state.changes?.notifiedThrough ? Date.parse(state.changes.notifiedThrough) : null;
  const floor = Date.parse(now) - maxAgeDays * 86_400_000;
  const kinds = new Set(includeFailures ? [...NOTIFY_KINDS, 'failed'] : NOTIFY_KINDS);
  const seen = new Set();
  const out = [];
  for (const e of updates?.entries ?? []) { // newest first on disk
    if (!kinds.has(e.kind)) continue;
    const at = Date.parse(e.at);
    if (Number.isNaN(at) || at < floor) continue;
    if (since !== null && at <= since) continue;
    const key = e.uid ?? `${e.venueId}/${e.editionId}/${e.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.reverse();
}

export function isBootstrap(state) {
  return !state.changes?.notifiedThrough;
}

/** Advance the watermark to the newest notified entry (or to `now` when bootstrapping). */
export function markChangesNotified(state, entries, { now }) {
  let latest = state.changes?.notifiedThrough ?? null;
  for (const e of entries) if (!latest || Date.parse(e.at) > Date.parse(latest)) latest = e.at;
  return { ...state, changes: { notifiedThrough: latest ?? now } };
}

const fmtOfficial = (iso, tzLabel) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}${tzLabel ? ` ${tzLabel}` : ''}`.trim() : 'TBA');

/**
 * @param entries   from pendingChanges
 * @param opts      { lang, timeZone, siteTitle, siteUrl, rowsByUid, venuesById, limit }
 */
export function buildChangesDigest(entries, { lang, timeZone, siteTitle, siteUrl, rowsByUid = new Map(), venuesById = new Map(), limit = 30 }) {
  const items = entries.slice(0, limit).map((e) => {
    const row = e.uid ? rowsByUid.get(e.uid) : null;
    const venue = venuesById.get(e.venueId);
    const [, editionId = e.editionId ?? '', roundId = '', track = 'full', type = ''] = e.uid ? e.uid.split('/') : [];
    const year = row?.year ?? (editionId.match(/(\d{4})$/)?.[1] ?? '');
    const acronym = venue?.acronym ?? row?.acronym ?? e.venueId;
    const round = roundId && roundId !== 'main' ? `${row ? pickLang(row.roundLabel, lang) : roundId} ` : '';
    const trackText = track && track !== 'full' ? `${trackLabel(lang, track)} ` : '';
    const milestone = type ? (type === 'other' ? pickLang(row?.label, lang) : t(lang, `milestone.${type}`)) : '';
    const detail = `${round}${trackText}${milestone}`.trim();
    const tzLabel = row?.tzLabel ?? null;

    let kindKey = `changes.${e.kind}`;
    if (e.kind === 'changed' && !e.before && e.after) kindKey = 'changes.confirmed';
    let official;
    let local = '';
    if (e.kind === 'added') official = `→ ${fmtOfficial(e.after, tzLabel)}`;
    else if (e.kind === 'changed') official = `${fmtOfficial(e.before, tzLabel)} → ${fmtOfficial(e.after, tzLabel)}`;
    else if (e.kind === 'removed') official = `${fmtOfficial(e.before, tzLabel)} · ${t(lang, 'changes.removedNote')}`;
    else official = e.message ?? '';
    if (e.after) local = t(lang, 'remind.local', { tz: timeZone, when: formatLocal(e.after, timeZone) });

    return {
      dday: t(lang, kindKey),
      heading: `${acronym} ${year}`.trim(),
      detail: detail || (row?.editionLabel ?? editionId),
      venueName: venue?.name ?? row?.venueName ?? e.venueId,
      official,
      local,
      url: row?.sourceUrl ?? venue?.cfp?.url ?? null,
      kind: e.kind,
    };
  });
  const more = Math.max(0, entries.length - items.length);
  const title = t(lang, 'changes.title', { title: siteTitle });
  const subtitle = t(lang, 'changes.subtitle', { count: entries.length });
  const url = siteUrl || '(site url not configured)';
  const footer = [more ? t(lang, 'changes.more', { n: more, url }) : null, t(lang, 'changes.footer', { url })].filter(Boolean).join('\n');
  const text = [
    title, subtitle, '',
    ...items.map((i) => `${i.dday} · ${i.heading} · ${i.detail}\n  ${i.official}${i.local ? `\n  ${i.local}` : ''}${i.url ? `\n  ${i.url}` : ''}`),
    '', footer,
  ].join('\n');
  return { title, subtitle, items, footer, text, lang, subject: t(lang, 'email.changesSubject', { title: siteTitle, count: entries.length }) };
}
