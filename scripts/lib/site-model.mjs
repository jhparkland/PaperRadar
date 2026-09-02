// Builds dist/data.json — everything the static site renders. Pure function of
// (config, catalog, selected venues, schedules, updates, now) so it is testable.
import { MESSAGES } from './i18n.mjs';
import { flattenDeadlines, nextDeadline, previousReference, venueStatus, upcomingDeadlines, archivedDeadlines, milestoneStatus } from './schedule.mjs';
import { slug } from './ics.mjs';

export function buildSiteModel({ config, catalog, venues, schedules, updates, now }) {
  const nowIso = now instanceof Date ? now.toISOString() : now;
  const allRows = [];
  const venueModels = [];

  for (const v of venues) {
    const vs = schedules.venues?.[v.id];
    const rows = flattenDeadlines(v, vs);
    allRows.push(...rows);
    const next = nextDeadline(rows, nowIso);
    const previous = next ? null : previousReference(rows, nowIso);
    venueModels.push({
      id: v.id,
      acronym: v.acronym,
      name: v.name,
      type: v.type,
      fields: v.fields,
      topics: v.topics ?? [],
      homepage: v.homepage ?? null,
      parent: v.parent ?? null,
      note: v.note ?? null,
      submission: v.submission,
      custom: Boolean(v.custom),
      cfpUrl: v.cfp?.url ?? null,
      adapter: v.cfp?.adapter ?? 'none',
      rankings: v.rankings ?? {},
      status: venueStatus(v, rows, nowIso),
      next,
      previous,
      editions: (vs?.editions ?? []).map((e) => ({
        id: e.id,
        label: e.label,
        year: e.year,
        event: e.event ?? null,
        source: e.source ? {
          url: e.source.url, adapter: e.source.adapter, status: e.source.status,
          checkedAt: e.source.checkedAt, lastOkAt: e.source.lastOkAt, error: e.source.error,
        } : null,
        rounds: (e.rounds ?? []).map((r) => ({
          id: r.id,
          label: r.label,
          track: r.track,
          milestones: r.milestones.map((m) => ({
            type: m.type, label: m.label ?? null, state: m.state, at: m.at ?? null, tzLabel: m.tzLabel ?? null,
            sourceText: m.sourceText ?? null, verifiedAt: m.verifiedAt ?? null, status: milestoneStatus(m),
          })),
        })),
      })),
      icsPath: `calendars/venues/${v.id}.ics`,
    });
  }

  const showRankings = config.rankings.show.filter((id) => catalog.rankings[id]);
  const rankings = showRankings.map((id) => {
    const r = catalog.rankings[id];
    return {
      id, label: r.label, url: r.url, tiers: r.tiers, description: r.description,
      feeds: r.tiers.map((tier) => ({ tier, path: `calendars/tiers/${id}/${slug(tier)}.ics` })),
    };
  });

  const usedFieldIds = new Set(venues.flatMap((v) => v.fields));
  const fields = catalog.fields.filter((f) => usedFieldIds.has(f.id));

  const languages = config.site.languages;
  const i18n = Object.fromEntries(languages.map((l) => [l, MESSAGES[l]]));

  return {
    version: 1,
    generatedAt: nowIso,
    schedulesUpdatedAt: schedules.updatedAt ?? null,
    site: { ...config.site },
    i18n,
    fields,
    rankings,
    primaryRanking: config.rankings.primary && catalog.rankings[config.rankings.primary] ? config.rankings.primary : (showRankings[0] ?? null),
    venues: venueModels,
    upcoming: upcomingDeadlines(allRows, nowIso, config.site.upcomingDays),
    archive: archivedDeadlines(allRows, nowIso, config.site.archiveDays),
    updates: (updates?.entries ?? []).slice(0, 100),
    sources: venueModels
      .filter((v) => v.adapter !== 'none')
      .map((v) => {
        const current = v.editions[0] ?? null;
        return {
          venueId: v.id, acronym: v.acronym, adapter: v.adapter, url: v.cfpUrl,
          editionLabel: current?.label ?? null,
          status: current?.source?.status ?? 'pending',
          checkedAt: current?.source?.checkedAt ?? null,
          lastOkAt: current?.source?.lastOkAt ?? null,
          error: current?.source?.error ?? null,
        };
      }),
    reminders: { daysBefore: config.reminders.daysBefore, channels: config.reminders.channels, language: config.reminders.language },
    feeds: {
      all: 'calendars/all.ics',
      conferences: 'calendars/conferences.ics',
      journals: 'calendars/journals.ics',
      workshops: 'calendars/workshops.ics',
    },
  };
}
