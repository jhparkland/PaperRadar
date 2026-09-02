// Google Chat incoming-webhook channel.
//
// Setup (Google Workspace account required — personal @gmail.com cannot add webhooks):
//   1. Google Chat → create a space (you can be the only member)
//   2. Space name ▾ → "Apps & integrations" → "Webhooks" → "Add webhook" → name it, save, copy the URL
//   3. GitHub repo → Settings → Secrets and variables → Actions → New secret GOOGLE_CHAT_WEBHOOK_URL
//   4. config/radar.yaml → reminders.channels includes "google-chat"
//   5. `npm run remind -- --test` locally (with .env) or run the "Daily refresh" workflow manually
import { t } from '../i18n.mjs';

export const ENV_VAR = 'GOOGLE_CHAT_WEBHOOK_URL';

export function isConfigured(env = process.env) {
  return configProblem(env) === null;
}

/**
 * Why the channel cannot be used, as a sentence the user can act on, or null.
 * The most common mistake is storing the URL under a different secret name —
 * GitHub Actions only injects the exact name the workflow references.
 */
export function configProblem(env = process.env) {
  const value = env[ENV_VAR];
  if (typeof value !== 'string' || value.trim() === '') {
    return `${ENV_VAR} is empty. Store the webhook URL as a repository secret (Settings → Secrets and `
      + `variables → Actions). If you name that secret ${ENV_VAR}, it is picked up as is; if you prefer `
      + 'another name, set the repository *variable* GOOGLE_CHAT_SECRET_NAME to that name. Locally, put '
      + `${ENV_VAR}=… in .env.`;
  }
  if (!value.startsWith('https://chat.googleapis.com/')) {
    return `${ENV_VAR} does not look like a Google Chat webhook URL (expected it to start with `
      + 'https://chat.googleapis.com/v1/spaces/…). Copy the whole URL from the space\'s webhook, '
      + 'including the ?key=…&token=… part.';
  }
  return null;
}

/** Build the webhook payload: plain-text fallback + a Cards v2 card. */
export function buildPayload(digest) {
  if (digest.isTest) return { text: digest.text };
  const sections = digest.items.map((i) => ({
    header: `${i.dday} · ${i.heading}`,
    widgets: [
      {
        decoratedText: {
          topLabel: i.detail,
          text: `<b>${escapeHtml(i.venueName)}</b>`,
          bottomLabel: `${i.official}  ·  ${i.local}`,
          wrapText: true,
        },
      },
      ...(i.url ? [{ buttonList: { buttons: [{ text: t(digest.lang, 'remind.open'), onClick: { openLink: { url: i.url } } }] } }] : []),
    ],
  }));
  sections.push({ widgets: [{ textParagraph: { text: `<i>${escapeHtml(digest.footer)}</i>` } }] });
  return {
    text: digest.text,
    cardsV2: [
      {
        cardId: `paperradar-${Date.now()}`,
        card: {
          header: { title: digest.title, subtitle: digest.subtitle },
          sections,
        },
      },
    ],
  };
}

export async function send(digest, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const problem = configProblem(env);
  if (problem) return { ok: false, skipped: true, error: problem };
  const payload = buildPayload(digest);
  try {
    const res = await fetchImpl(env[ENV_VAR], {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Google Chat webhook HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Google Chat webhook request failed: ${err.message}` };
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
