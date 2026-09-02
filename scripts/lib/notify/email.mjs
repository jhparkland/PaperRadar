// Email channel via SMTP (nodemailer, optional dependency).
// Env: SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, REMINDER_EMAIL_TO, REMINDER_EMAIL_FROM
import { t } from '../i18n.mjs';

export const ENV_VARS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'REMINDER_EMAIL_TO'];

export function isConfigured(env = process.env) {
  return ENV_VARS.every((k) => typeof env[k] === 'string' && env[k].length > 0);
}

export function buildMessage(digest, { env = process.env, siteTitle }) {
  const subject = digest.isTest ? digest.title : (digest.subject ?? t(digest.lang, 'email.subject', { title: siteTitle, count: digest.items.length }));
  const html = digest.isTest
    ? `<p>${escapeHtml(digest.text)}</p>`
    : [
      `<h2>${escapeHtml(digest.title)}</h2>`,
      `<p>${escapeHtml(digest.subtitle)}</p>`,
      '<ul>',
      ...digest.items.map((i) => `<li><strong>${escapeHtml(i.dday)} · ${escapeHtml(i.heading)}</strong> — ${escapeHtml(i.detail)}<br>`
        + `<small>${escapeHtml(i.venueName)}<br>${escapeHtml(i.official)}<br>${escapeHtml(i.local)}</small>`
        + (i.url ? `<br><a href="${escapeAttr(i.url)}">${escapeHtml(i.url)}</a>` : '') + '</li>'),
      '</ul>',
      `<p><em>${escapeHtml(digest.footer)}</em></p>`,
    ].join('\n');
  return {
    from: env.REMINDER_EMAIL_FROM || env.SMTP_USER,
    to: env.REMINDER_EMAIL_TO,
    subject,
    text: digest.text,
    html,
  };
}

export async function send(digest, { env = process.env, siteTitle, transportFactory } = {}) {
  if (!isConfigured(env)) return { ok: false, skipped: true, error: `email not configured (need ${ENV_VARS.join(', ')})` };
  let createTransport = transportFactory;
  if (!createTransport) {
    try {
      ({ createTransport } = await import('nodemailer'));
    } catch {
      return { ok: false, error: 'nodemailer is not installed — run `npm install nodemailer` or remove "email" from reminders.channels' };
    }
  }
  try {
    const port = Number(env.SMTP_PORT || 587);
    const transport = createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    await transport.sendMail(buildMessage(digest, { env, siteTitle }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `email send failed: ${err.message}` };
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
