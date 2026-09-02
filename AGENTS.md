# Agent guide — PaperRadar

Read this before changing anything. It applies to Claude Code, Codex, Cursor
and any other coding agent, and to humans in a hurry.

## What this repository is

A config-driven deadline tracker for academic venues. Users edit
`config/radar.yaml`; the shared knowledge lives in `catalog/`; automation in
`scripts/` and `.github/workflows/` reads official CFP pages daily, builds a
static site into `dist/`, exports ICS calendars and sends reminders.

| Path | Purpose | Edit? |
|---|---|---|
| `config/radar.yaml` | The user's choices (fields, venues, rankings, timezone, reminders) | yes, when asked to set up a field |
| `catalog/fields.json` | Field taxonomy | add fields if none fits |
| `catalog/rankings/*.json` | Ranking schemes keyed by venue id | only with a source URL |
| `catalog/venues/*.json` | One venue per file: identity + `cfp` adapter | the main thing to add |
| `data/` | Machine-written schedules, change log, state | never by hand |
| `scripts/lib/*.mjs` | Pure library code, unit-tested | with tests |
| `site/` | Vanilla-JS front-end (copied to `dist/`) | with a browser check |
| `docs/` | User docs; `adding-a-venue.md` is the adapter reference | keep in sync with behaviour |

## Hard rules

1. **Never invent a date, a timezone or a ranking tier.** Every dated milestone
   must come from the venue's official page (`cfp.url`). If you cannot read
   the page, use `"adapter": "manual"` with the dates you actually saw and
   `verifiedAt` = today, or `"adapter": "none"`.
2. `cfp.allowedHosts` must contain the host of `cfp.url`. Do not add hosts you
   did not use.
3. Patterns contain exactly one capture group; write `{{DATE}}` for the date.
   Run against the plain text of the page (tags stripped, whitespace collapsed
   to single spaces). See `docs/adding-a-venue.md`.
4. If the official page states no timezone, use
   `"timezone": { "label": "unspecified" }`. Do not guess AoE silently.
5. Do not edit `data/*.json` by hand; run `npm run refresh` instead.
6. Behaviour changes ship with a test in `test/` (Node's built-in runner).

## Workflow for "add venues for field X"

```bash
npm run new-venue -- --id <id> --acronym <ACR> --name "<official name>" \
  --type conference|journal|workshop --fields <f1,f2> --url <official CFP url> --year <yyyy>
npm run probe -- <official CFP url>          # lists every date on the page with its preceding text
# edit catalog/venues/<id>.json: patterns, edition, timezone, rounds
npm run probe -- --venue <id>                # must show the expected dates, all "verified"
npm run validate
npm test
```

Then add the venue id (or its field) to `select` in `config/radar.yaml` and run
`npm run doctor`. Show the user the `probe --venue` output so they can compare
with the official page.

Journals without deadlines: `"submission": "rolling"`, `"cfp": null`.
Special issues with deadlines: a journal with a `cfp` block whose round has
`"track": "special-issue"`.

## Commands

| Command | Use |
|---|---|
| `npm run doctor` | Explain the current setup; exit 1 on problems |
| `npm run validate` | Config + catalog + data validation (CI gate) |
| `npm run refresh [-- --only id] [--dry-run]` | Read CFPs, update `data/` |
| `npm run build` / `npm run dev` | Build / serve `dist/` on :4173 |
| `npm run remind [-- --dry-run --test]` | Reminders |
| `npm run probe` | Adapter authoring helper |
| `npm test` | Unit tests |

## Conventions

- 2-space JSON, LF, final newline, `id` equals the file name, lowercase-hyphen ids.
- Conventional commits: `feat(catalog): add PODC`, `fix(ics): …`.
- UI strings live in `site/app.js` (`UI`) and `scripts/lib/i18n.mjs`; both
  `ko` and `en` must be updated together.
- Do not add dependencies without a reason; the runtime needs only `yaml`
  (config) and optionally `nodemailer` (email).
