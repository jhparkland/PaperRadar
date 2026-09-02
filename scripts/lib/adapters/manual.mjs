// Manual adapter: dates were read from the official page by a person and
// written into the venue file with the date they checked (`verifiedAt`).
// They count as verified — the same trust level as an automated match — and
// the refresh step never touches them.
import { parseDateText, toIsoWithOffset, resolveOffset, normalizeTime } from '../dates.mjs';
import { checkChronology } from '../schedule.mjs';

export function extractManual(cfp) {
  const errors = [];
  const rounds = [];
  for (const round of cfp.rounds) {
    const milestones = [];
    for (const m of round.milestones) {
      const base = { type: m.type, ...(m.label ? { label: m.label } : {}), state: m.state };
      if (m.state !== 'dated') {
        milestones.push({ ...base, at: null, tzLabel: null, tzOffset: null, sourceText: null, verification: 'verified' });
        continue;
      }
      const date = parseDateText(m.date);
      if (!date) {
        errors.push(`${round.id}/${m.type}: invalid date ${m.date}`);
        continue;
      }
      const tzLabel = m.tz ?? cfp.timezone.label;
      const tzOffset = resolveOffset(m.tz ?? cfp.timezone.offset);
      const time = normalizeTime(m.time ?? cfp.timezone.time);
      milestones.push({
        ...base,
        at: toIsoWithOffset(date, time, tzOffset),
        tzLabel,
        tzOffset,
        tzConfirmed: m.tz !== undefined ? true : cfp.timezone.confirmed !== false,
        sourceText: m.date,
        verification: 'verified',
        verifiedAt: m.verifiedAt,
        ...(m.sourceUrl ? { sourceUrl: m.sourceUrl } : {}),
      });
    }
    const chrono = checkChronology(milestones);
    if (chrono) errors.push(`${round.id}: ${chrono}`);
    rounds.push({ id: round.id, label: round.label, track: round.track, milestones });
  }
  return { ok: errors.length === 0, rounds, errors };
}
