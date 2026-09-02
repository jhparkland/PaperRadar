# `config/radar.yaml` reference

Run `npm run doctor` after every change — it points at the exact line that
needs fixing. `config/radar.example.yaml` shows every option with comments.

## `site`

| Key | Default | Notes |
|---|---|---|
| `title` | `PaperRadar` | Site and calendar name. |
| `tagline` | `""` | String or `{ko: …, en: …}`. |
| `languages` | `[ko, en]` | UI languages; the first is the default and the calendar language. Supported: `ko`, `en`. |
| `timezone` | `Asia/Seoul` | IANA name used for local times, D-day and reminder thresholds. |
| `baseUrl` | `""` | Public site URL, e.g. `https://you.github.io/PaperRadar/`. Used for links in reminders and absolute calendar URLs. |
| `upcomingDays` | `120` | Window of the *Upcoming* tab. |
| `archiveDays` | `400` | How far back the *Past* tab goes. |

## `rankings`

| Key | Notes |
|---|---|
| `show` | Ranking ids from `catalog/rankings/` to display as badges, in order. |
| `primary` | The ranking used to sort cards, for the tier filter and per-tier calendar feeds. Defaults to the first of `show`. |

## `select`

The tracked set is: `venues` ∪ (every catalog venue in any of `fields`) ∪
`custom`, filtered by `types`, minus `exclude`, optionally filtered by `tiers`.

| Key | Notes |
|---|---|
| `fields` | Field ids from `catalog/fields.json`. |
| `venues` | Venue ids from `catalog/venues/`. |
| `types` | Subset of `conference`, `journal`, `workshop`. Default: all three. |
| `exclude` | Venue ids to drop. |
| `tiers` | `{scheme: <ranking id>, include: [tiers…], keepUnranked: true}` — keep only venues at those tiers; `keepUnranked` decides what happens to venues the scheme does not rank. Custom venues are never dropped. |

## `custom`

A list of venue entries with the same schema as `catalog/venues/*.json`
(see [adding-a-venue.md](adding-a-venue.md)). They are always tracked and
override a catalog venue with the same id. Prefer contributing to the catalog.

## `reminders`

| Key | Default | Notes |
|---|---|---|
| `daysBefore` | `[60, 30, 15, 3]` | Thresholds. For each verified deadline the closest unsent threshold ≥ remaining days fires once; larger ones are marked covered. |
| `language` | first of `site.languages` | Language of reminder messages. |
| `channels` | `[google-chat]` | Any of `google-chat`, `email`. Credentials come from environment variables / GitHub secrets — see [setup-google-chat.md](setup-google-chat.md). |
| `notifyChanges` | `true` | Send one digest per day listing dates that were announced (TBA → date), moved, removed, or sources verified again since the last run. The first run only records a watermark. |
| `notifyFailures` | `false` | Include source-verification failures in the change digest (they always open a GitHub issue regardless). |

## Environment variables (secrets)

| Variable | Used by |
|---|---|
| `GOOGLE_CHAT_WEBHOOK_URL` | `google-chat` channel |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `REMINDER_EMAIL_TO`, `REMINDER_EMAIL_FROM` | `email` channel |

Locally, put them in `.env` (ignored by git). In GitHub, add them under
*Settings → Secrets and variables → Actions*.

## Commands

| Command | What it does |
|---|---|
| `npm run doctor` | Explains the current setup and what is missing. |
| `npm run validate` | Validates config, catalog, selection and `data/`. Exit 1 on errors (CI). |
| `npm run refresh` | Reads every tracked CFP and updates `data/`. `--only id`, `--dry-run`, `--report file.md`. |
| `npm run build` | Writes `dist/` (site, `data.json`, calendars). |
| `npm run dev` | Serves `dist/` on <http://127.0.0.1:4173>. |
| `npm run remind` | Sends due reminders. `--test`, `--dry-run`, `--channel x`. |
| `npm run probe` | Adapter authoring helper — see [adding-a-venue.md](adding-a-venue.md). |
| `npm run new-venue` | Scaffolds a catalog venue file. |
| `npm test` | Unit tests. |
