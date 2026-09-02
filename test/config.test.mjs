import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, normalizeConfig } from '../scripts/lib/config.mjs';
import { githubPagesUrl } from '../scripts/lib/context.mjs';

const GOOD = `
version: 1
site:
  title: "My Radar"
  languages: [en, ko]
  timezone: Europe/Berlin
  baseUrl: https://me.github.io/PaperRadar
rankings:
  show: [core-2026]
select:
  fields: [systems]
  venues: [eurosys]
  types: [conference]
reminders:
  daysBefore: [3, 30, 30]
  language: en
  channels: [google-chat, email]
`;

test('a good config normalizes with defaults', () => {
  const { config, report } = parseConfig(GOOD);
  assert.ok(report.ok, report.format());
  assert.equal(config.site.title, 'My Radar');
  assert.equal(config.site.baseUrl, 'https://me.github.io/PaperRadar/');
  assert.equal(config.site.upcomingDays, 120);
  assert.equal(config.rankings.primary, 'core-2026');
  assert.deepEqual(config.select.types, ['conference']);
  assert.deepEqual(config.reminders.daysBefore, [30, 3]);
  assert.deepEqual(config.reminders.channels, ['google-chat', 'email']);
});

test('errors carry YAML paths and accumulate', () => {
  const { config, report } = normalizeConfig({
    version: 2,
    site: { timezone: 'Mars/Olympus', languages: ['fr'], upcomingDays: -1 },
    select: { venues: ['Bad Id'], types: ['podcast'], tiers: { scheme: 'x' } },
    reminders: { daysBefore: [], channels: ['pigeon'], language: 'jp' },
    bogus: true,
  });
  assert.ok(config);
  const paths = report.errors.map((e) => e.path);
  for (const p of ['version', 'site.timezone', 'site.languages', 'site.upcomingDays', 'select.venues[0]', 'select.types', 'select.tiers', 'reminders.daysBefore', 'reminders.channels', 'reminders.language']) {
    assert.ok(paths.includes(p), `expected error at ${p}, got ${paths.join(', ')}`);
  }
  assert.ok(report.warnings.some((w) => w.path === 'bogus'));
});

test('invalid YAML is reported, not thrown', () => {
  const { config, report } = parseConfig('site: [unclosed');
  assert.equal(config, null);
  assert.equal(report.errors.length, 1);
});

test('githubPagesUrl derives the Pages URL a fork publishes to', () => {
  // doctor compares this with site.baseUrl so a fork does not keep linking
  // reminders back to the upstream author's site
  const expected = 'https://someone.github.io/PaperRadar/';
  for (const remote of [
    'https://github.com/Someone/PaperRadar.git',
    'https://github.com/someone/PaperRadar',
    'git@github.com:someone/PaperRadar.git\n',
    'ssh://git@github.com/someone/PaperRadar.git',
  ]) {
    assert.equal(githubPagesUrl(remote), expected, remote);
  }
  assert.equal(githubPagesUrl('https://gitlab.com/someone/PaperRadar.git'), null);
  assert.equal(githubPagesUrl(undefined), null);
});

test('empty selection produces a warning', () => {
  const { report } = normalizeConfig({ version: 1 });
  assert.ok(report.ok);
  assert.ok(report.warnings.some((w) => w.path === 'select'));
});
