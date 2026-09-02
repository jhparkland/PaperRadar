// Shared fixtures for tests.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const NOW = '2026-09-02T00:00:00Z';

export function fixture(name) {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

export function sampleVenue(overrides = {}) {
  return {
    id: 'sampleconf',
    acronym: 'SampleConf',
    name: 'Sample Conference on Testing',
    type: 'conference',
    fields: ['systems'],
    topics: [],
    submission: 'cfp',
    cfp: {
      adapter: 'declarative',
      url: 'https://sampleconf.example/2027/cfp.html',
      allowedHosts: ['sampleconf.example'],
      edition: { id: 'sampleconf-2027', year: 2027, label: 'SampleConf 2027', event: { start: '2027-04-12', end: '2027-04-16', location: 'Seoul' } },
      timezone: { label: 'AoE', offset: '-12:00', time: '23:59:00' },
      rounds: [
        {
          id: 'spring', label: { ko: '봄', en: 'Spring' }, track: 'full',
          milestones: [
            { type: 'abstract', state: 'dated', pattern: 'Spring cycle[\\s\\S]{0,80}?Abstract registration\\s*{{DATE}}' },
            { type: 'paper', state: 'dated', pattern: 'Spring cycle[\\s\\S]{0,120}?Full paper submission\\s*{{DATE}}' },
            { type: 'notification', state: 'tba' },
          ],
        },
        {
          id: 'fall', label: { ko: '가을', en: 'Fall' }, track: 'full',
          milestones: [
            { type: 'abstract', state: 'dated', pattern: 'Fall cycle[\\s\\S]{0,80}?Abstract registration\\s*{{DATE}}' },
            { type: 'paper', state: 'dated', pattern: 'Fall cycle[\\s\\S]{0,120}?Full paper submission\\s*{{DATE}}' },
          ],
        },
      ],
    },
    ...overrides,
  };
}

export function fakeFetch(map) {
  return async (url) => {
    const entry = map[url];
    if (!entry) return { ok: false, status: 404, url, text: async () => 'not found' };
    if (entry instanceof Error) throw entry;
    return { ok: entry.status ? entry.status < 400 : true, status: entry.status ?? 200, url: entry.finalUrl ?? url, text: async () => entry.body ?? '' };
  };
}

export function minimalCatalog(venues, rankings = {}) {
  return {
    fields: [{ id: 'systems', name: { ko: '시스템', en: 'Systems' }, parent: null }],
    fieldIds: new Set(['systems']),
    rankings,
    venues: new Map(venues.map((v) => [v.id, v])),
  };
}
