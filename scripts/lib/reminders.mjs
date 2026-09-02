// Decides which reminders are due today and remembers what was sent.
//
// state = { [uid]: { sent: { [threshold]: ISO } } }
//
// Rule: for a verified future deadline with `remaining` days left, look at the
// thresholds (e.g. 60/30/15/3) that are >= remaining and not yet sent, and
// send the smallest one. Larger unsent thresholds are marked as covered so a
// newly added deadline 10 days out produces one message, not three. If the
// daily job skips a day the reminder still goes out the next day.
import { daysUntil } from './dates.mjs';
import { ACTION_TYPES } from './schedule.mjs';

export function dueReminders(rows, state, { now, timeZone, daysBefore }) {
  const thresholds = [...daysBefore].sort((a, b) => b - a);
  const due = [];
  for (const r of rows) {
    if (r.status !== 'verified' || !r.at) continue;
    if (!ACTION_TYPES.has(r.type)) continue; // notification / event dates are not something to act on
    if (r.tzConfirmed === false) continue; // the page states no timezone — we will not wake anyone on an assumption
    const remaining = daysUntil(r.at, now, timeZone);
    if (remaining < 0) continue;
    const sent = state[r.uid]?.sent ?? {};
    const candidates = thresholds.filter((d) => remaining <= d && sent[String(d)] === undefined);
    if (candidates.length === 0) continue;
    const threshold = Math.min(...candidates);
    due.push({ row: r, remaining, threshold, covers: candidates });
  }
  due.sort((a, b) => a.remaining - b.remaining || a.row.acronym.localeCompare(b.row.acronym));
  return due;
}

/** Record `due` items as sent and drop state for deadlines long past. */
export function markSent(state, due, rows, { now }) {
  const next = {};
  const nowMs = Date.parse(now);
  const keep = new Set(rows.filter((r) => r.at && Date.parse(r.at) >= nowMs - 60 * 86_400_000).map((r) => r.uid));
  for (const [uid, entry] of Object.entries(state)) if (keep.has(uid)) next[uid] = { sent: { ...entry.sent } };
  for (const d of due) {
    const uid = d.row.uid;
    next[uid] ??= { sent: {} };
    for (const c of d.covers) next[uid].sent[String(c)] = now;
  }
  return next;
}
