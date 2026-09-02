// Small filesystem helpers shared by every script. Keeps JSON writes stable
// (2-space, trailing newline) so data commits produce readable diffs.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, cpSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PATHS = Object.freeze({
  config: join(ROOT, 'config', 'radar.yaml'),
  catalog: join(ROOT, 'catalog'),
  venues: join(ROOT, 'catalog', 'venues'),
  rankings: join(ROOT, 'catalog', 'rankings'),
  fields: join(ROOT, 'catalog', 'fields.json'),
  schedules: join(ROOT, 'data', 'schedules.json'),
  updates: join(ROOT, 'data', 'updates.json'),
  calendarState: join(ROOT, 'data', 'state', 'calendar.json'),
  reminderState: join(ROOT, 'data', 'state', 'reminders.json'),
  site: join(ROOT, 'site'),
  dist: join(ROOT, 'dist'),
});

export function readJson(path, fallback) {
  if (!existsSync(path)) {
    if (fallback !== undefined) return structuredClone(fallback);
    throw new Error(`Missing file: ${path}`);
  }
  const text = readFileSync(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${err.message}`);
  }
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function readText(path) {
  return readFileSync(path, 'utf8');
}

export function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
}

export function listJsonFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join(dir, name));
}

export function emptyDir(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

export { existsSync, mkdirSync, cpSync, join };
