// Channel-independent reminder digest. Each channel renders this its own way.
import { formatLocal } from '../dates.mjs';
import { t, dday, trackLabel } from '../i18n.mjs';
import { pickLang } from '../errors.mjs';

export function buildDigest(due, { lang, timeZone, siteTitle, siteUrl }) {
  const items = due.map(({ row: r, remaining, threshold }) => {
    const round = r.roundId === 'main' ? '' : `${pickLang(r.roundLabel, lang)} `;
    const track = r.track === 'full' ? '' : `${trackLabel(lang, r.track)} `;
    const milestone = r.type === 'other' ? pickLang(r.label, lang) : t(lang, `milestone.${r.type}`);
    return {
      dday: dday(lang, remaining),
      remaining,
      threshold,
      heading: `${r.acronym} ${r.year}`,
      detail: `${round}${track}${milestone}`.trim(),
      venueName: r.venueName,
      official: t(lang, 'remind.official', { when: r.at.slice(0, 16).replace('T', ' '), tz: r.tzLabel ?? '' }).trim(),
      local: t(lang, 'remind.local', { tz: timeZone, when: formatLocal(r.at, timeZone) }),
      url: r.sourceUrl,
      type: r.venueType,
    };
  });
  const title = t(lang, 'remind.title', { title: siteTitle });
  const subtitle = t(lang, 'remind.subtitle', { count: items.length });
  const footer = t(lang, 'remind.footer', { url: siteUrl || '(site url not configured)' });
  const text = [
    title, subtitle, '',
    ...items.map((i) => `${i.dday} · ${i.heading} · ${i.detail}\n  ${i.official}\n  ${i.local}${i.url ? `\n  ${i.url}` : ''}`),
    '', footer,
  ].join('\n');
  return { title, subtitle, items, footer, text, lang };
}

export function testDigest({ lang, siteTitle }) {
  const text = t(lang, 'remind.test');
  return { title: t(lang, 'remind.title', { title: siteTitle }), subtitle: '', items: [], footer: text, text, lang, isTest: true };
}
