// Turns config.select (+ custom) into the concrete list of tracked venues.
import { Report } from './errors.mjs';
import { rankingsFor } from './catalog.mjs';

/**
 * @returns {{ venues: object[], report: Report }} venues sorted by acronym.
 */
export function selectVenues(catalog, select, report = new Report()) {
  const chosen = new Map();

  for (const id of select.venues) {
    const v = catalog.venues.get(id);
    if (!v) {
      report.error('select.venues', `unknown venue "${id}" — see catalog/venues/ or add it under custom:`);
      continue;
    }
    chosen.set(id, v);
  }

  for (const f of select.fields) {
    if (!catalog.fieldIds.has(f)) {
      report.error('select.fields', `unknown field "${f}" — see catalog/fields.json`);
      continue;
    }
  }
  const wantedFields = new Set(select.fields.filter((f) => catalog.fieldIds.has(f)));
  if (wantedFields.size > 0) {
    for (const v of catalog.venues.values()) {
      if (v.fields.some((f) => wantedFields.has(f))) chosen.set(v.id, v);
    }
  }
  // custom venues are always tracked — the user wrote them down on purpose
  for (const v of catalog.venues.values()) if (v.custom) chosen.set(v.id, v);

  const types = new Set(select.types);
  const exclude = new Set(select.exclude);
  for (const id of exclude) if (!catalog.venues.has(id)) report.warn('select.exclude', `"${id}" is not a known venue (ignored)`);

  const tiers = select.tiers;
  if (tiers && !catalog.rankings[tiers.scheme]) {
    report.error('select.tiers.scheme', `unknown ranking "${tiers.scheme}" — see catalog/rankings/`);
  }
  if (tiers && catalog.rankings[tiers.scheme]) {
    for (const t of tiers.include) {
      if (!catalog.rankings[tiers.scheme].tiers.includes(t)) {
        report.error('select.tiers.include', `"${t}" is not a tier of ${tiers.scheme} (${catalog.rankings[tiers.scheme].tiers.join(', ')})`);
      }
    }
  }

  const venues = [...chosen.values()].filter((v) => {
    if (!types.has(v.type)) return false;
    if (exclude.has(v.id)) return false;
    if (tiers && catalog.rankings[tiers.scheme] && !v.custom) {
      const tier = catalog.rankings[tiers.scheme].entries[v.id];
      if (tier === undefined) return tiers.keepUnranked;
      return tiers.include.includes(tier);
    }
    return true;
  });

  venues.sort((a, b) => a.acronym.localeCompare(b.acronym, 'en', { sensitivity: 'base' }));
  return { venues, report };
}

/** Convenience: attach ranking tiers to each selected venue. */
export function withRankings(venues, rankings) {
  return venues.map((v) => ({ ...v, rankings: rankingsFor(rankings, v.id) }));
}
