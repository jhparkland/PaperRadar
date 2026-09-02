// The schedule model: what data/schedules.json holds and how to read it.
//
// schedules = { version, updatedAt, venues: { [venueId]: { editions: Edition[] } } }
// Edition   = { id, year, label, event, source, rounds: Round[] }
// source    = { url, adapter, status: 'ok'|'failed'|'manual'|'none', checkedAt, lastOkAt, error, contentHash }
// Round     = { id, label, track, milestones: Milestone[] }
// Milestone = { type, label?, state: 'dated'|'tba'|'not-required', at: ISO|null,
//               tzLabel, tzOffset, sourceText, verification: 'verified'|'needs-verification', verifiedAt? }
//
// Trust policy (mirrors the README):
//   verified            dated, timezone known, source confirmed → D-day, ICS, reminders
//   needs-verification  last good value kept, page could not be re-confirmed → shown + ICS (tentative), no reminders
//   tba                 not announced → excluded everywhere
//   previous-edition    only past editions known → reference only
import { isPast } from './dates.mjs';

export const MILESTONE_ORDER = ['abstract', 'paper', 'notification', 'camera-ready', 'event', 'other'];
/** Milestones an author must act on — the ones that count as "the next deadline" and get reminders. */
export const ACTION_TYPES = new Set(['abstract', 'paper', 'camera-ready', 'other']);

export function emptySchedules() {
  return { version: 1, updatedAt: null, venues: {} };
}

export function milestoneStatus(m) {
  if (m.state === 'tba') return 'tba';
  if (m.state === 'not-required') return 'not-required';
  if (!m.at) return 'needs-verification';
  return m.verification === 'verified' ? 'verified' : 'needs-verification';
}

export function deadlineUid(venueId, editionId, roundId, track, type) {
  return `${venueId}/${editionId}/${roundId}/${track}/${type}`;
}

/**
 * Flatten one venue's schedule into deadline rows (one per milestone) with the
 * context the site, ICS and reminders need.
 */
export function flattenDeadlines(venue, venueSchedule) {
  const rows = [];
  for (const edition of venueSchedule?.editions ?? []) {
    for (const round of edition.rounds ?? []) {
      for (const m of round.milestones ?? []) {
        rows.push({
          uid: deadlineUid(venue.id, edition.id, round.id, round.track, m.type),
          venueId: venue.id,
          acronym: venue.acronym,
          venueName: venue.name,
          venueType: venue.type,
          editionId: edition.id,
          editionLabel: edition.label,
          year: edition.year,
          roundId: round.id,
          roundLabel: round.label,
          track: round.track,
          type: m.type,
          label: m.label ?? null,
          state: m.state,
          at: m.at ?? null,
          tzLabel: m.tzLabel ?? null,
          tzConfirmed: m.tzConfirmed !== false,
          sourceText: m.sourceText ?? null,
          sourceUrl: edition.source?.url ?? venue.cfp?.url ?? null,
          verifiedAt: m.verifiedAt ?? null,
          status: milestoneStatus(m),
        });
      }
    }
  }
  return rows;
}

const ACTIONABLE = new Set(['verified', 'needs-verification']);

/** Rows that can be placed on a timeline (have a date and are not tba). */
export function datedRows(rows) {
  return rows.filter((r) => r.at && ACTIONABLE.has(r.status));
}

export function nextDeadline(rows, now) {
  const future = datedRows(rows).filter((r) => ACTION_TYPES.has(r.type) && !isPast(r.at, now));
  future.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return future[0] ?? null;
}

export function previousReference(rows, now) {
  const past = datedRows(rows).filter((r) => ACTION_TYPES.has(r.type) && isPast(r.at, now));
  past.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return past.find((r) => r.type === 'paper') ?? past[0] ?? null;
}

/** Overall status for a venue card. */
export function venueStatus(venue, rows, now) {
  if (!venue.cfp || venue.cfp.adapter === 'none') return venue.submission === 'rolling' ? 'rolling' : 'untracked';
  const next = nextDeadline(rows, now);
  if (next) return next.status;
  if (previousReference(rows, now)) return 'previous-edition';
  if (rows.some((r) => r.status === 'needs-verification')) return 'needs-verification';
  return 'tba';
}

/** Deadlines in [now, now + days], sorted soonest first. */
export function upcomingDeadlines(rows, now, days) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const limit = nowMs + days * 86_400_000;
  return datedRows(rows)
    .filter((r) => {
      const ms = Date.parse(r.at);
      return ms >= nowMs && ms <= limit;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Past deadlines newest first, limited to `days` back. */
export function archivedDeadlines(rows, now, days) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const floor = nowMs - days * 86_400_000;
  return datedRows(rows)
    .filter((r) => {
      const ms = Date.parse(r.at);
      return ms < nowMs && ms >= floor;
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Milestone chronology check: abstract ≤ paper ≤ notification ≤ camera-ready (dated ones only). */
export function checkChronology(milestones) {
  const order = new Map(MILESTONE_ORDER.map((t, i) => [t, i]));
  const dated = milestones.filter((m) => m.state === 'dated' && m.at && m.type !== 'other' && m.type !== 'event');
  dated.sort((a, b) => order.get(a.type) - order.get(b.type));
  for (let i = 1; i < dated.length; i += 1) {
    if (Date.parse(dated[i].at) < Date.parse(dated[i - 1].at)) {
      return `${dated[i].type} (${dated[i].at}) is earlier than ${dated[i - 1].type} (${dated[i - 1].at})`;
    }
  }
  return null;
}

export function upsertEdition(venueSchedule, edition) {
  const editions = (venueSchedule?.editions ?? []).filter((e) => e.id !== edition.id);
  editions.push(edition);
  editions.sort((a, b) => b.year - a.year || a.id.localeCompare(b.id));
  return { editions };
}
