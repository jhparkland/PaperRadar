// Validation results are collected rather than thrown so a user sees every
// problem in one run instead of fixing them one at a time.
export class Report {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  error(path, message) {
    this.errors.push({ path, message });
    return this;
  }

  warn(path, message) {
    this.warnings.push({ path, message });
    return this;
  }

  merge(other) {
    this.errors.push(...other.errors);
    this.warnings.push(...other.warnings);
    return this;
  }

  get ok() {
    return this.errors.length === 0;
  }

  format() {
    const lines = [];
    for (const e of this.errors) lines.push(`ERROR  ${e.path}: ${e.message}`);
    for (const w of this.warnings) lines.push(`WARN   ${w.path}: ${w.message}`);
    return lines.join('\n');
  }

  throwIfFailed(title = 'Validation failed') {
    if (!this.ok) {
      const err = new Error(`${title}\n${this.format()}`);
      err.report = this;
      throw err;
    }
    return this;
  }
}

export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
export const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
export const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isHttpUrl(v) {
  if (!isNonEmptyString(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Accepts either a plain string or a {ko, en} object; returns the text for `lang`. */
export function pickLang(value, lang, fallbackLang = 'en') {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[lang] ?? value[fallbackLang] ?? Object.values(value)[0] ?? '';
}

export function isLocalized(v) {
  return isNonEmptyString(v) || (isPlainObject(v) && Object.values(v).some(isNonEmptyString));
}
