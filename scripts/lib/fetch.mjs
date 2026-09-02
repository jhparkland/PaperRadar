// Allow-listed page fetching. A venue's adapter may only read hosts it
// declared, including after redirects, so a hijacked link cannot feed us data.
import { createHash } from 'node:crypto';

export const USER_AGENT = 'PaperRadar/1.0 (+https://github.com/jhparkland/PaperRadar; deadline tracker)';

export function hostAllowed(url, allowedHosts) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowedHosts.some((h) => h.toLowerCase() === host);
  } catch {
    return false;
  }
}

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * @returns {Promise<{ok:boolean, status?:number, text?:string, contentHash?:string, finalUrl?:string, error?:string}>}
 */
export async function fetchSource(url, { allowedHosts, timeoutMs = 20_000, fetchImpl = globalThis.fetch } = {}) {
  if (!hostAllowed(url, allowedHosts)) return { ok: false, error: `host of ${url} is not in allowedHosts` };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
    });
    const finalUrl = res.url || url;
    if (!hostAllowed(finalUrl, allowedHosts)) return { ok: false, status: res.status, error: `redirected to ${finalUrl}, which is not in allowedHosts` };
    if (!res.ok) return { ok: false, status: res.status, finalUrl, error: `HTTP ${res.status}` };
    const text = await res.text();
    if (!text || text.trim().length === 0) return { ok: false, status: res.status, finalUrl, error: 'empty response body' };
    return { ok: true, status: res.status, text, contentHash: sha256(text), finalUrl };
  } catch (err) {
    const reason = err?.name === 'AbortError' ? `timeout after ${timeoutMs} ms` : (err?.message ?? String(err));
    return { ok: false, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
};

/** HTML → single-line plain text with single spaces, so patterns are stable. */
export function htmlToText(html) {
  let s = String(html);
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
  // non-breaking / thin spaces and zero-width characters behave like plain spaces
  s = s.replace(/[    ]/g, ' ').replace(/[​‌‍﻿]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}
