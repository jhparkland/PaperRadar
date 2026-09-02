# PaperRadar

**A deadline radar for the conferences, journals and workshops of *your* research field.**
Fork it, list your fields in one config file, and get a static site with
D-days, subscribable calendars and Google Chat / email reminders — refreshed
every day from the official CFPs by GitHub Actions. No server, no database.

[한국어 → README.md](README.md)

- **Config-driven.** `config/radar.yaml` picks fields, venues, rankings,
  timezone, languages and reminder thresholds. Everything else is shared.
- **Catalog, not scraping heuristics.** `catalog/` holds one file per venue
  with a declarative adapter for its CFP page. Add your field's venues once;
  everyone benefits.
- **Verified or nothing.** Dates are read only from registered official pages.
  A failed check keeps the last good value and flags it; nothing is guessed.
  See [docs/trust-policy.md](docs/trust-policy.md).
- **Calendars that update in place.** RFC 5545 feeds for everything, per type,
  per ranking tier and per venue, with `SEQUENCE`/`CANCELLED` handling.
- **Reminders where you already are.** Google Chat webhook (a one-person space
  works as a personal channel) and/or SMTP email, 60/30/15/3 days before.
- **Bilingual UI** (Korean / English), official time + your timezone, dark mode,
  keyboard accessible, and a built-in *Setup guide* tab.

## Quick start

```bash
git clone https://github.com/<you>/PaperRadar.git
cd PaperRadar
npm ci
cp config/radar.example.yaml config/radar.yaml   # then edit it
npm run doctor        # explains what is configured and what is missing
npm run refresh       # reads every tracked CFP → data/schedules.json
npm run build         # → dist/ (site, data.json, calendars/*.ics)
npm run dev           # http://127.0.0.1:4173
```

Requires Node.js 22+.

### Point it at your field

```yaml
# config/radar.yaml
select:
  fields: [systems, cloud, sustainable-computing]   # ids in catalog/fields.json
  venues: [neurips, tpds]                           # ids in catalog/venues/
  types: [conference, journal, workshop]
rankings:
  show: [kiise-2024, core-2026, sjr-2025]
  primary: kiise-2024
site:
  timezone: Asia/Seoul
  languages: [ko, en]
  baseUrl: https://<you>.github.io/PaperRadar/
reminders:
  daysBefore: [60, 30, 15, 3]
  channels: [google-chat]
```

Venues missing from the catalog? `npm run new-venue` scaffolds a file and
`npm run probe` helps you write the pattern —
[docs/adding-a-venue.md](docs/adding-a-venue.md). Pages that cannot be
parsed take a `manual` adapter with the date you checked them.

### Filling in your field — let an LLM do it

The catalog is one documented JSON file per venue, so the fastest way to cover
a field is to **hand the job to a coding agent** (Claude Code, Codex, Cursor,
…). [AGENTS.md](AGENTS.md) at the repo root tells agents the rules. Open the
repository and ask:

```text
My research field is <field>. Add the conferences, journals and workshops I
should submit to under catalog/venues/ and set select in config/radar.yaml.
- For each venue find the official CFP page, write a declarative adapter and
  show me the real extraction via `npm run probe -- --venue <id>`.
- If a page cannot be parsed, use the manual adapter with today's verifiedAt.
- Never invent dates or ranking tiers; leave out anything without a source URL.
- Finish with npm run validate and npm test passing.
```

When it is done, two human checks remain:

1. do the dates in `npm run probe -- --venue <id>` match the official page?
2. does `npm run doctor` list what you expect?

LLMs produce plausible dates easily. PaperRadar's validation (schema, year
plausibility, milestone order, mandatory `verifiedAt`) catches a lot, but the
final comparison against the official page is yours.

### Deploy

1. Repository *Settings → Pages → Source: GitHub Actions*.
2. Push to `main`. The *Deploy Pages* workflow builds and publishes `dist/`.
3. *Settings → Secrets → Actions*: add `GOOGLE_CHAT_WEBHOOK_URL`
   ([how](docs/setup-google-chat.md)) and/or the SMTP secrets. To keep your own
   secret name, leave it and set the repository **variable**
   `GOOGLE_CHAT_SECRET_NAME` to that name (e.g. `NOTI`).
4. *Actions → Daily refresh → Run workflow* with **test_notification** ticked
   to confirm the channel works.

From then on `refresh.yml` runs daily (02:17 KST by default): refresh → test
→ validate → build → reminders → commit `data/` → deploy. A source that fails
verification opens (or updates) one issue labelled `source-failure`; the site
keeps the last verified dates.

## What gets sent, and when

| What | When | Where |
|---|---|---|
| **Deadline reminders** | once per `daysBefore` threshold for each verified deadline — 60·30·15·3 days by default | Google Chat space / email |
| **Source verification failures** | a page could not be read or its wording changed | one GitHub issue (accumulates, auto-closes on recovery) |
| **Schedule-change digest** | a date was announced (TBA → date), moved, removed, or a source verified again — once per day | Google Chat / email (`reminders.notifyChanges`, on by default) + the *Sources & updates* tab |

Reminder rules:

- One run per day; everything due that day goes out as **a single digest**.
- Only author-actionable milestones: abstract, paper, camera-ready.
  Notification and event dates go to the calendars but never to reminders.
- Each threshold fires once per deadline. What was sent is recorded in
  `data/state/reminders.json`, so re-runs never repeat. If Actions skips a day
  the reminder goes out the next day.
- A deadline that appears 10 days out produces **one D-10 message**, not
  60/30/15 at once.
- Deadlines whose page states no timezone (`unspecified`) are shown on the
  site but never pushed — we do not wake people on an assumption.

Example:

```text
📡 PaperRadar · Deadline reminder
2 deadline(s) approaching

D-30 · EuroSys 2027 · Fall Paper deadline
  Official: 2026-09-24 23:59 AoE
  Local (Europe/Berlin): 2026-09-25 13:59
  [Open CFP]
…
Only verified deadlines are sent. Full schedule: https://<you>.github.io/PaperRadar/
```

The change digest looks like this:

```text
📡 PaperRadar · Schedule changes
2 change(s) detected

🆕 Announced (TBA → date) · HotOS 2027 · Paper deadline
  TBA → 2027-01-15 23:59 AoE
  Local (Europe/Berlin): 2027-01-16 12:59
🔁 Changed · EuroSys 2027 · Fall Paper deadline
  2026-09-24 23:59 AoE → 2026-10-01 23:59 AoE
  …
```

- The first run only records a starting point and sends nothing (so a fresh
  deployment does not announce the 120 deadlines it just imported). Changes
  detected by later refreshes are sent.
- Source failures already open a GitHub issue, so they are excluded by
  default; `reminders.notifyFailures: true` includes them.
- Turn it off with `reminders.notifyChanges: false`.

Nothing arriving? Check, in order: ① the `GOOGLE_CHAT_WEBHOOK_URL` secret
exists ② `reminders.channels` in `radar.yaml` contains `google-chat` ③ the
*Send due reminders* step log says `nothing due today` / `changes: nothing new`.
Details in [docs/setup-google-chat.md](docs/setup-google-chat.md).

## How it works

```mermaid
flowchart LR
  C[config/radar.yaml] --> S[select venues]
  K[catalog/ venues · fields · rankings] --> S
  S --> R[refresh: allow-listed fetch → declarative / manual adapter]
  R -->|verified| D[data/schedules.json]
  R -->|failed| D2[keep last good · Verification needed · issue]
  D --> B[build: site + data.json + ICS feeds]
  D --> N[remind: Google Chat / email, verified only]
  B --> P[GitHub Pages]
```

| Path | What lives there |
|---|---|
| `config/radar.yaml` | Your choices (the only file you edit) |
| `catalog/fields.json` | Field taxonomy |
| `catalog/rankings/*.json` | Ranking schemes keyed by venue id (KIISE 2024, CORE 2026, SJR quartiles, …) |
| `catalog/venues/*.json` | One venue per file: identity + CFP adapter |
| `data/schedules.json` | Collected deadlines with status and provenance |
| `data/updates.json` | Change log (added / changed / removed / failed / recovered) |
| `data/state/` | Calendar sequence numbers, sent reminders |
| `site/` | Static front-end |
| `scripts/` | `doctor`, `validate`, `refresh`, `build`, `remind`, `probe`, `new-venue`, `serve` |

Full option list: [docs/config-reference.md](docs/config-reference.md).

## Commands

| Command | Purpose |
|---|---|
| `npm run doctor` | Health check with plain-language guidance |
| `npm run validate` | Config + catalog + data validation (CI gate) |
| `npm run refresh` | Update `data/` from official CFPs (`--only`, `--dry-run`, `--report`) |
| `npm run build` / `npm run dev` | Build / serve `dist/` |
| `npm run remind` | Send due reminders (`--test`, `--dry-run`, `--channel`) |
| `npm run probe` | Inspect a CFP page or run one venue's adapter |
| `npm run new-venue` | Scaffold a catalog entry |
| `npm test` | Unit tests (Node test runner) |

## Catalog coverage

The seed catalog covers systems, architecture, HPC, cloud, networking,
performance, sustainable/carbon-aware computing, ML/ML-systems and energy
journals — the fields the original author works in. Rankings: KIISE 2024
(Korean BK21 reference), CORE 2026, SJR quartiles.

## Contributing

This repository is meant to be a **shared, growing catalog**, not one
person's tool.

| Situation | Do this |
|---|---|
| A date is wrong, the site broke, a command fails | [Open an issue](../../issues) with the venue, the official page URL and the command to reproduce |
| You added venues for your field / fixed an adapter | **Pull request** — usually just `catalog/venues/<id>.json` (+ `rankings/` if applicable) |
| You want another ranking scheme (CCF, a field-specific list, …) | PR adding `catalog/rankings/<scheme>.json` with a source URL |
| Code bugs, improvements | PR — behaviour changes come with a test under `test/` |

CI runs `npm test → validate → build` on every PR and catches schema errors,
broken regexes and malformed dates. Rules and the checklist (official sources
only, never invent, `verifiedAt`) are in [CONTRIBUTING.md](CONTRIBUTING.md).
If an LLM wrote the catalog files, say so in the PR and paste the `probe`
output — it makes review much faster.

## License

MIT
