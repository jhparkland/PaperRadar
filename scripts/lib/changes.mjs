// Change notifications: "a date was announced / moved / removed / verified
// again". Entries come from data/updates.json (written by refresh); this
// module decides which of them are new since the last notification.
// Rendering lives in notify/format.mjs.
//
// Reminder state file (data/state/reminders.json):
//   { version: 1, deadlines: { [uid]: { sent: { [threshold]: ISO } } },
//     changes: { notifiedThrough: ISO | null } }
// A null notifiedThrough means "never notified": the first run only records
// the current time so a fresh deployment does not blast every deadline it
// imported as a "change".
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
