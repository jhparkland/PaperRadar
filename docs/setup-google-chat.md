# Reminders in Google Chat

PaperRadar posts a digest card to a Google Chat space through an **incoming
webhook**: no bot to install, no OAuth, one URL kept as a secret.

> Webhooks are a Google **Workspace** feature. A personal `@gmail.com`
> account cannot add one. If you only have a personal account, use the
> [email channel](#email-instead-or-in-addition) or ask your institution's
> Workspace admin whether webhooks are enabled for your domain.

## 1. Create a space (a one-person space is fine)

Google Chat → **+** next to *Spaces* → *Create a space* → name it
(e.g. `PaperRadar`) → *Create*. You do not have to invite anyone; a space with
only you in it behaves like a private notification channel.

## 2. Add the webhook

1. Open the space → click the space name at the top → **Apps & integrations**.
2. Under *Webhooks* click **Add webhooks**.
3. Name: `PaperRadar` (any name). Avatar URL: optional.
4. **Save** → copy the URL. It looks like
   `https://chat.googleapis.com/v1/spaces/AAAA…/messages?key=…&token=…`.

Treat the URL like a password: anyone who has it can post to the space.

## 3. Store it as a GitHub secret

Repository → **Settings → Secrets and variables → Actions → New repository secret**

- Name: `GOOGLE_CHAT_WEBHOOK_URL`
- Secret: the URL from step 2

### Prefer a different secret name?

A workflow reads secret names literally, so a secret called `NOTI` is invisible
to `${{ secrets.GOOGLE_CHAT_WEBHOOK_URL }}`. Instead of renaming your secret,
tell the workflow which one to read:

Repository → **Settings → Secrets and variables → Actions → Variables tab →
New repository variable**

- Name: `GOOGLE_CHAT_SECRET_NAME`
- Value: the name of your secret, e.g. `NOTI`

Variables are not secret — only the *name* is stored there, never the URL. Leave
the variable unset and the default `GOOGLE_CHAT_WEBHOOK_URL` is used. With the
`gh` CLI:

```bash
gh variable set GOOGLE_CHAT_SECRET_NAME --body "NOTI"
```

## 4. Make sure the channel is enabled

`config/radar.yaml`:

```yaml
reminders:
  daysBefore: [30, 15, 3, 0]
  language: ko           # or en
  channels: [google-chat]
```

## 5. Send a test message

- **From GitHub:** *Actions → Daily refresh → Run workflow* → tick
  **test_notification** → *Run workflow*. A test card should appear in the
  space within a minute.
- **Locally:** create `.env` from `.env.example`, paste the URL, then

  ```bash
  npm run remind -- --test
  ```

## What you will receive

One digest per day that has something due — never one message per deadline:

```
📡 PaperRadar · 마감 알림
2건의 마감이 다가옵니다

D-15 · EuroSys 2027 · 봄 논문 마감
  공식: 2026-09-24 23:59 AoE
  현지(Asia/Seoul): 2026-09-25 20:59
  [CFP 열기]
…
확인된(Verified) 일정만 알립니다. 전체 일정: https://you.github.io/PaperRadar/
```

Rules: only **Verified** deadlines; one message per threshold in `daysBefore`
(if the job skips a day the reminder still fires the next day); what was sent
is recorded in `data/state/reminders.json`, so re-running never repeats.

A second message arrives on days when the daily refresh detected changes —
a date announced (TBA → date), moved, removed, or a source verified again:

```
📡 PaperRadar · 일정 변경
2건이 바뀌었습니다

🆕 확정 (TBA → 날짜) · HotOS 2027 · 논문 마감
  TBA → 2027-01-15 23:59 AoE
  현지(Asia/Seoul): 2027-01-16 20:59
🔁 변경 · EuroSys 2027 · 가을 논문 마감
  2026-09-24 23:59 AoE → 2026-10-01 23:59 AoE
```

The very first run records a starting point and sends nothing. Disable with
`reminders.notifyChanges: false`; include verification failures with
`reminders.notifyFailures: true`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `GOOGLE_CHAT_WEBHOOK_URL is empty` | No secret under the expected name. Either name the secret `GOOGLE_CHAT_WEBHOOK_URL`, or keep your name and set the repository variable `GOOGLE_CHAT_SECRET_NAME` to it (see above). Names are case-sensitive, and the name you gave the webhook inside Google Chat is unrelated. |
| `does not look like a Google Chat webhook URL` | The value was truncated when pasted. Copy the whole URL including `?key=…&token=…`. |
| `HTTP 400 … Invalid …` | The URL was truncated when pasted. Copy it again including `?key=…&token=…`. |
| `HTTP 403` / `404` | The webhook was deleted, or the space was deleted. Create a new webhook. |
| Nothing arrives, workflow is green | `reminders.channels` does not include `google-chat`, or nothing is due today (check the *Send due reminders* step log: `nothing due today`). |
| Message arrives once, never again | Working as designed — each threshold fires once per deadline. |

## Email instead, or in addition

Add `email` to `reminders.channels` and these secrets: `SMTP_HOST`,
`SMTP_PORT` (587 or 465), `SMTP_USER`, `SMTP_PASS`, `REMINDER_EMAIL_TO`,
`REMINDER_EMAIL_FROM` (optional, defaults to `SMTP_USER`). For Gmail use an
[App Password](https://support.google.com/accounts/answer/185833) with
`smtp.gmail.com:587`. The email channel needs `nodemailer` — it is an optional
dependency that `npm ci` installs.
