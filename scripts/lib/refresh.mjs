// Refresh orchestration for one venue. The one rule that matters: a failed
// fetch or parse never replaces good data. It keeps the last known values,
// flags them as needs-verification and records why.
import { fetchSource, htmlToText } from './fetch.mjs';
import { extractDeclarative } from './adapters/declarative.mjs';
import { extractManual } from './adapters/manual.mjs';
import { upsertEdition, deadlineUid } from './schedule.mjs';

/**
 * @param {object} venue      validated catalog venue
 * @param {object} previous   schedules.venues[venue.id] or undefined
 * @param {object} opts       { now: ISO string, fetchImpl }
 * @returns {Promise<{schedule:object, changes:object[], failure:null|{venueId,editionId,url,error}}>}
 */
export async function refreshVenue(venue, previous, { now, fetchImpl } = {}) {
  const cfp = venue.cfp;
  const prevSchedule = previous ?? { editions: [] };
  if (!cfp || cfp.adapter === 'none') {
    return { schedule: prevSchedule, changes: [], failure: null };
  }

  const prevEdition = prevSchedule.editions.find((e) => e.id === cfp.edition.id) ?? null;
  const editionBase = {
    id: cfp.edition.id,
    year: cfp.edition.year,
    label: cfp.edition.label,
    event: cfp.edition.event ?? null,
  };

  if (cfp.adapter === 'manual') {
    const result = extractManual(cfp);
    if (!result.ok) {
      return { schedule: prevSchedule, changes: [], failure: { venueId: venue.id, editionId: cfp.edition.id, url: cfp.url, error: result.errors.join('; ') } };
    }
    const edition = {
      ...editionBase,
      source: { url: cfp.url, adapter: 'manual', status: 'manual', checkedAt: now, lastOkAt: now, error: null, contentHash: null },
      rounds: result.rounds,
    };
    const changes = diffEditions(venue.id, prevEdition, edition, now);
    return { schedule: upsertEdition(prevSchedule, edition), changes, failure: null };
  }

  // declarative
  const fetched = await fetchSource(cfp.url, { allowedHosts: cfp.allowedHosts, fetchImpl });
  let error = null;
  let extracted = null;
  let contentHash = null;
  if (!fetched.ok) {
    error = `fetch failed: ${fetched.error}`;
  } else {
    contentHash = fetched.contentHash;
    extracted = extractDeclarative(cfp, htmlToText(fetched.text));
    if (!extracted.ok) error = `extraction failed: ${extracted.errors.join('; ')}`;
  }

  if (error) {
    const edition = degradeEdition(cfp, prevEdition, editionBase, { now, error, contentHash });
    const changes = diffEditions(venue.id, prevEdition, edition, now);
    changes.push({ at: now, venueId: venue.id, editionId: edition.id, kind: 'failed', message: error });
    return {
      schedule: upsertEdition(prevSchedule, edition),
      changes,
      failure: { venueId: venue.id, editionId: edition.id, url: cfp.url, error },
    };
  }

  const edition = {
    ...editionBase,
    source: { url: cfp.url, adapter: 'declarative', status: 'ok', checkedAt: now, lastOkAt: now, error: null, contentHash },
    rounds: extracted.rounds,
  };
  const changes = diffEditions(venue.id, prevEdition, edition, now);
  if (prevEdition?.source?.status === 'failed') {
    changes.push({ at: now, venueId: venue.id, editionId: edition.id, kind: 'recovered', message: 'source verified again' });
  }
  return { schedule: upsertEdition(prevSchedule, edition), changes, failure: null };
}

/**
 * Build the edition to store when the source could not be confirmed:
 * previous milestones survive (marked needs-verification); when there is no
 * previous data the catalog skeleton is stored with `at: null`.
 */
function degradeEdition(cfp, prevEdition, editionBase, { now, error, contentHash }) {
  const source = {
    url: cfp.url,
    adapter: 'declarative',
    status: 'failed',
    checkedAt: now,
    lastOkAt: prevEdition?.source?.lastOkAt ?? null,
    error,
    contentHash: contentHash ?? prevEdition?.source?.contentHash ?? null,
  };
  if (prevEdition) {
    const rounds = prevEdition.rounds.map((r) => ({
      ...r,
      milestones: r.milestones.map((m) => (m.state === 'dated' ? { ...m, verification: 'needs-verification' } : m)),
    }));
    return { ...editionBase, source, rounds };
  }
  const rounds = cfp.rounds.map((r) => ({
    id: r.id,
    label: r.label,
    track: r.track,
    milestones: r.milestones.map((m) => ({
      type: m.type,
      ...(m.label ? { label: m.label } : {}),
      state: m.state,
      at: null,
      tzLabel: null,
      tzOffset: null,
      sourceText: null,
      verification: m.state === 'dated' ? 'needs-verification' : 'verified',
    })),
  }));
  return { ...editionBase, source, rounds };
}

/** Per-milestone diff → change log entries (added / changed / removed). */
export function diffEditions(venueId, before, after, now) {
  const index = (edition) => {
    const map = new Map();
    for (const r of edition?.rounds ?? []) {
      for (const m of r.milestones ?? []) {
        map.set(deadlineUid(venueId, edition.id, r.id, r.track, m.type), { at: m.at ?? null, state: m.state, verification: m.verification });
      }
    }
    return map;
  };
  const a = index(before);
  const b = index(after);
  const changes = [];
  for (const [uid, next] of b) {
    const prev = a.get(uid);
    if (!prev) {
      if (next.at) changes.push({ at: now, venueId, editionId: after.id, kind: 'added', uid, after: next.at });
      continue;
    }
    if (prev.at !== next.at && (prev.at || next.at)) {
      changes.push({ at: now, venueId, editionId: after.id, kind: 'changed', uid, before: prev.at, after: next.at });
    }
  }
  for (const [uid, prev] of a) {
    if (!b.has(uid) && prev.at) changes.push({ at: now, venueId, editionId: after.id, kind: 'removed', uid, before: prev.at });
  }
  return changes;
}

/** Append change entries to the updates log, newest first, capped. */
export function appendUpdates(updates, entries, cap = 400) {
  const list = [...entries.slice().reverse(), ...(updates?.entries ?? [])];
  return { version: 1, entries: list.slice(0, cap) };
}
