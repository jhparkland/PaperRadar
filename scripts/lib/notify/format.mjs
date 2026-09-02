// Builds the one daily digest, grouped into the categories a reader actually
// acts on. Channel-independent: Google Chat and email render this same shape.
//
//   🆕 새로 등장   a date that was just announced (TBA → date, or a new milestone)
//   🔴 오늘 마감   D-0
//   🟠 마감 임박   within reminders.imminentDays
//   🟡 N일 남음    one section per remaining threshold in reminders.daysBefore
//   🔁 일정 변경 / ❌ 삭제 / ✅ 재확인 / ⚠ 확인 실패   (only with notifyChanges)
//
// A deadline announced and already inside a threshold window appears once,
// under 새로 등장 — the date is in that line, so repeating it below is noise.
import { formatLocal } from '../dates.mjs';
import { t, dday, trackLabel } from '../i18n.mjs';
import { pickLang } from '../errors.mjs';

/** Category order in the message, most urgent first. `window` expands per threshold. */
export const CATEGORY_ORDER = Object.freeze(['new', 'today', 'imminent', 'window', 'changed', 'removed', 'recovered', 'failed']);

/** Which bucket a fired threshold belongs to. */
export function categoryForThreshold(threshold, imminentDays) {
  if (threshold === 0) return 'today';
  if (threshold <= imminentDays) return 'imminent';
  return 'window';
}

/** Which bucket an update-log entry belongs to. */
export function categoryForChange(entry) {
  if (entry.kind === 'added') return 'new';
  if (entry.kind === 'changed') return entry.before ? 'changed' : 'new';
  if (entry.kind === 'removed') return 'removed';
  if (entry.kind === 'recovered') return 'recovered';
  return 'failed';
}

const fmtOfficial = (iso, tzLabel) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}${tzLabel ? ` ${tzLabel}` : ''}`.trim() : 'TBA');

function milestoneText(row, lang, { roundId, track, type, label } = {}) {
  const rid = roundId ?? row?.roundId;
  const trk = track ?? row?.track ?? 'full';
  const typ = type ?? row?.type;
  const round = rid && rid !== 'main' ? `${row ? pickLang(row.roundLabel, lang) : rid} ` : '';
  const trackText = trk && trk !== 'full' ? `${trackLabel(lang, trk)} ` : '';
  const milestone = typ ? (typ === 'other' ? pickLang(label ?? row?.label, lang) : t(lang, `milestone.${typ}`)) : '';
  return `${round}${trackText}${milestone}`.trim();
}

function deadlineItem(r, remaining, { lang, timeZone }) {
  return {
    uid: r.uid,
    dday: dday(lang, remaining),
    heading: `${r.acronym} ${r.year}`,
    detail: milestoneText(r, lang),
    venueName: r.venueName,
    official: t(lang, 'remind.official', { when: r.at.slice(0, 16).replace('T', ' '), tz: r.tzLabel ?? '' }).trim(),
    local: t(lang, 'remind.local', { tz: timeZone, when: formatLocal(r.at, timeZone) }),
    url: r.sourceUrl,
  };
}

function changeItem(e, { lang, timeZone, rowsByUid, venuesById }) {
  const row = e.uid ? rowsByUid.get(e.uid) : null;
  const venue = venuesById.get(e.venueId);
  const [, editionId = e.editionId ?? '', roundId = '', track = 'full', type = ''] = e.uid ? e.uid.split('/') : [];
  const year = row?.year ?? (editionId.match(/(\d{4})$/)?.[1] ?? '');
  const acronym = venue?.acronym ?? row?.acronym ?? e.venueId;
  const tzLabel = row?.tzLabel ?? null;
  const category = categoryForChange(e);

  let official;
  if (category === 'new') official = fmtOfficial(e.after, tzLabel);
  else if (category === 'changed') official = `${fmtOfficial(e.before, tzLabel)} → ${fmtOfficial(e.after, tzLabel)}`;
  else if (category === 'removed') official = `${fmtOfficial(e.before, tzLabel)} · ${t(lang, 'changes.removedNote')}`;
  else official = e.message ?? '';

  return {
    uid: e.uid ?? null,
    dday: '',
    heading: `${acronym} ${year}`.trim(),
    detail: type ? milestoneText(row, lang, { roundId, track, type }) : (row?.editionLabel ?? editionId),
    venueName: venue?.name ?? row?.venueName ?? e.venueId,
    official,
    local: e.after ? t(lang, 'remind.local', { tz: timeZone, when: formatLocal(e.after, timeZone) }) : '',
    url: row?.sourceUrl ?? venue?.cfp?.url ?? null,
  };
}

/**
 * @param {object}   input
 * @param {object[]} input.due      from dueReminders: {row, remaining, threshold}
 * @param {object[]} input.changes  from pendingChanges (already filtered by config)
 * @param {object}   opts           { lang, timeZone, siteTitle, siteUrl, imminentDays, rowsByUid, venuesById }
 * @returns {{sections: object[], count: number, ...}} sections are non-empty, in CATEGORY_ORDER
 */
export function buildDigest({ due = [], changes = [] }, opts) {
  const { lang, timeZone, siteTitle, siteUrl, imminentDays = 3, rowsByUid = new Map(), venuesById = new Map(), limit = 40 } = opts;
  const ctx = { lang, timeZone, rowsByUid, venuesById };

  const buckets = new Map(); // key -> {id, threshold, items}
  const push = (key, id, threshold, item) => {
    if (!buckets.has(key)) buckets.set(key, { id, threshold, items: [] });
    buckets.get(key).items.push(item);
  };

  const announced = new Set();
  for (const e of changes) {
    const id = categoryForChange(e);
    if (id === 'new' && e.uid) announced.add(e.uid);
    push(id, id, null, changeItem(e, ctx));
  }

  for (const d of due) {
    if (d.row.uid && announced.has(d.row.uid)) continue; // already listed under 새로 등장
    const id = categoryForThreshold(d.threshold, imminentDays);
    push(id === 'window' ? `window:${d.threshold}` : id, id, id === 'window' ? d.threshold : null, deadlineItem(d.row, d.remaining, ctx));
  }

  const sections = [...buckets.values()]
    .sort((a, b) => {
      const oa = CATEGORY_ORDER.indexOf(a.id);
      const ob = CATEGORY_ORDER.indexOf(b.id);
      return oa - ob || (a.threshold ?? 0) - (b.threshold ?? 0);
    })
    .map((b) => ({
      id: b.id,
      label: b.id === 'window' ? t(lang, 'digest.window', { n: b.threshold }) : t(lang, `digest.${b.id}`),
      items: b.items,
    }));

  const count = sections.reduce((n, s) => n + s.items.length, 0);
  const title = t(lang, 'remind.title', { title: siteTitle });
  const subtitle = t(lang, 'remind.subtitle', { count });
  const url = siteUrl || '(site url not configured)';
  const shown = capSections(sections, limit);
  const more = count - shown.reduce((n, s) => n + s.items.length, 0);
  const footer = [more > 0 ? t(lang, 'changes.more', { n: more, url }) : null, t(lang, 'remind.footer', { url })].filter(Boolean).join('\n');

  const text = [
    title, subtitle, '',
    ...shown.flatMap((s) => [
      `${s.label} (${s.items.length})`,
      ...s.items.map((i) => `  ${[i.dday, i.heading].filter(Boolean).join(' · ')} · ${i.detail}\n    ${i.official}${i.local ? `\n    ${i.local}` : ''}${i.url ? `\n    ${i.url}` : ''}`),
      '',
    ]),
    footer,
  ].join('\n');

  return {
    title, subtitle, sections: shown, count, footer, text, lang,
    subject: t(lang, 'email.subject', { title: siteTitle, count }),
  };
}

/** Keep whole sections in order until `limit` items are taken. */
function capSections(sections, limit) {
  const out = [];
  let taken = 0;
  for (const s of sections) {
    if (taken >= limit) break;
    const items = s.items.slice(0, limit - taken);
    taken += items.length;
    out.push({ ...s, items });
  }
  return out;
}

export function testDigest({ lang, siteTitle }) {
  const text = t(lang, 'remind.test');
  return { title: t(lang, 'remind.title', { title: siteTitle }), subtitle: '', sections: [], count: 0, footer: text, text, lang, isTest: true };
}
