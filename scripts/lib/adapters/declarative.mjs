// Declarative adapter: each dated milestone has a regex (with {{DATE}} or one
// capture group) that is run against the CFP page text. Extraction is
// all-or-nothing per edition — a single unmatched milestone means the page
// changed in a way a human should look at, so nothing is overwritten.
import { compilePattern } from '../catalog.mjs';
import { parseDateText, toIsoWithOffset, resolveOffset, normalizeTime } from '../dates.mjs';
import { checkChronology } from '../schedule.mjs';

/**
 * @param {object} cfp  venue.cfp (validated)
 * @param {string} text plain page text from htmlToText
 * @returns {{ok:boolean, rounds:object[], errors:string[]}}
 */
export function extractDeclarative(cfp, text) {
  const errors = [];
  const rounds = [];
  const { edition, timezone } = cfp;

  for (const round of cfp.rounds) {
    const milestones = [];
    for (const m of round.milestones) {
      const where = `${round.id}/${m.type}`;
      if (m.state !== 'dated') {
        milestones.push(baseMilestone(m, { at: null, tzLabel: null, tzOffset: null, sourceText: null }));
        continue;
      }
      const { regex } = compilePattern(m.pattern);
      const match = regex.exec(text);
      if (!match) {
        errors.push(`${where}: pattern not found on page`);
        continue;
      }
      const captured = (match[1] ?? '').trim();
      const date = parseDateText(captured, { dateFormat: m.dateFormat });
      if (!date) {
        errors.push(`${where}: captured "${captured}" is not a date I can parse unambiguously`);
        continue;
      }
      if (date.year < edition.year - 1 || date.year > edition.year) {
        errors.push(`${where}: captured year ${date.year} is implausible for ${edition.label}`);
        continue;
      }
      const tzLabel = m.tz ?? timezone.label;
      const tzOffset = resolveOffset(m.tz ?? timezone.offset);
      const time = normalizeTime(m.time ?? timezone.time);
      milestones.push(baseMilestone(m, {
        at: toIsoWithOffset(date, time, tzOffset),
        tzLabel,
        tzOffset,
        tzConfirmed: m.tz !== undefined ? true : timezone.confirmed !== false,
        sourceText: captured,
      }));
    }
    const chrono = checkChronology(milestones);
    if (chrono) errors.push(`${round.id}: ${chrono}`);
    rounds.push({ id: round.id, label: round.label, track: round.track, milestones });
  }

  return { ok: errors.length === 0, rounds, errors };
}

function baseMilestone(m, extra) {
  return {
    type: m.type,
    ...(m.label ? { label: m.label } : {}),
    state: m.state,
    ...extra,
    verification: 'verified',
  };
}
