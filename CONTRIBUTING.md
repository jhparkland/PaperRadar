# Contributing

The most valuable contribution is a **venue** for a field that is not covered
yet, or a **ranking scheme** for a discipline outside computer science. See
[docs/adding-a-venue.md](docs/adding-a-venue.md).

## Ground rules

- Only official sources. A deadline must be readable on the venue's own CFP
  or important-dates page (`cfp.url`), and `allowedHosts` must name that host.
- Never invent dates or tiers. If a page cannot be parsed, use the `manual`
  adapter and set `verifiedAt` to the day you looked.
- Keep catalog files boring: one venue per file, `id` equals the file name,
  2-space JSON, no trailing whitespace.
- Every behaviour change ships with a test under `test/` (Node's built-in
  runner). Run `npm test && npm run validate && npm run build` before pushing.

## Layout

| Path | Purpose |
|---|---|
| `catalog/` | Shared knowledge: fields, rankings, venues + adapters |
| `config/radar.yaml` | This deployment's choices — the only file users edit |
| `data/` | Machine-written: schedules, change log, calendar/reminder state |
| `scripts/lib/` | Pure modules (config, catalog, adapters, refresh, ics, reminders, site model) |
| `scripts/*.mjs` | Commands (`doctor`, `validate`, `refresh`, `build`, `remind`, `probe`, `new-venue`, `serve`) |
| `site/` | Static front-end, copied verbatim into `dist/` |
| `.github/workflows/` | CI, daily refresh + deploy, manual deploy |

## Commit messages

Conventional commits: `feat(catalog): add PODC`, `fix(ics): fold UTF-8 lines`,
`chore(data): refresh 2026-09-02`.
