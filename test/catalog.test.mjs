import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateVenue, compilePattern, loadCatalog } from '../scripts/lib/catalog.mjs';
import { Report } from '../scripts/lib/errors.mjs';
import { sampleVenue } from './helpers.mjs';

const fieldIds = new Set(['systems']);

test('a valid declarative venue passes and gets defaults', () => {
  const report = new Report();
  const raw = sampleVenue();
  delete raw.submission;
  delete raw.cfp.edition.id;
  const v = validateVenue(raw, report, 'x', { fieldIds });
  assert.ok(report.ok, report.format());
  assert.equal(v.submission, 'cfp');
  assert.equal(v.cfp.edition.id, 'sampleconf-2027');
  assert.equal(v.cfp.timezone.offset, '-12:00');
  assert.equal(v.cfp.rounds[0].milestones[2].state, 'tba');
});

test('declarative patterns must have exactly one capture group', () => {
  const report = new Report();
  const raw = sampleVenue();
  raw.cfp.rounds[0].milestones[0].pattern = 'Abstract (\\w+) {{DATE}}';
  raw.cfp.rounds[0].milestones[1].pattern = 'Paper [unclosed';
  validateVenue(raw, report, 'x', { fieldIds });
  const msgs = report.errors.map((e) => `${e.path}: ${e.message}`).join('\n');
  assert.match(msgs, /milestones\[0\]\.pattern: must contain exactly one capture group \(found 2\)/);
  assert.match(msgs, /milestones\[1\]\.pattern: invalid regex/);
});

test('manual venues need date + verifiedAt; other structural errors are caught', () => {
  const report = new Report();
  const raw = sampleVenue({
    id: 'Bad',
    type: 'podcast',
    fields: ['nope'],
    cfp: {
      adapter: 'manual',
      url: 'https://x.example/cfp',
      edition: { year: 2027, label: 'X 2027' },
      timezone: { label: 'Mars' },
      rounds: [
        { id: 'main', milestones: [{ type: 'paper', date: '2027-02-30' }, { type: 'paper', date: '2027-01-01', verifiedAt: '2026-09-02' }] },
        { id: 'main', milestones: [] },
      ],
    },
  });
  const v = validateVenue(raw, report, 'x', { fieldIds });
  assert.equal(v, null);
  const paths = report.errors.map((e) => e.path);
  for (const p of ['x.id', 'x.type', 'x.fields', 'x.cfp.timezone', 'x.cfp.rounds[0].milestones[0].date', 'x.cfp.rounds[0].milestones[0].verifiedAt', 'x.cfp.rounds[0].milestones[1].type', 'x.cfp.rounds[1].id', 'x.cfp.rounds[1].milestones']) {
    assert.ok(paths.includes(p), `expected ${p} in ${paths.join(', ')}`);
  }
});

test('url host must be in allowedHosts', () => {
  const report = new Report();
  const raw = sampleVenue();
  raw.cfp.allowedHosts = ['other.example'];
  validateVenue(raw, report, 'x', { fieldIds });
  assert.ok(report.errors.some((e) => e.path === 'x.cfp.allowedHosts'));
});

test('journals default to rolling submission with no cfp and no warning', () => {
  const report = new Report();
  const v = validateVenue({ id: 'tj', acronym: 'TJ', name: 'Test Journal', type: 'journal', fields: ['systems'] }, report, 'x', { fieldIds });
  assert.ok(report.ok);
  assert.equal(v.submission, 'rolling');
  assert.equal(v.cfp, null);
  assert.equal(report.warnings.length, 0);
});

test('compilePattern expands {{DATE}}', () => {
  const { regex, groups } = compilePattern('Paper due\\s*{{DATE}}');
  assert.equal(groups, 1);
  assert.equal(regex.exec('Paper due March 3, 2027')[1], 'March 3, 2027');
});

test('the real catalog on disk loads without errors', () => {
  const { report, venues, fields, rankings } = loadCatalog();
  assert.ok(report.ok, report.format());
  assert.ok(venues.size > 0);
  assert.ok(fields.length > 0);
  assert.ok(Object.keys(rankings).length > 0);
});
