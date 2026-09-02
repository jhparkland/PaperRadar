# catalog/ — the shared knowledge base

**What is here is an example, not a canonical list.** The venues, fields and
ranking schemes shipped with this repository come from the author's field
(systems, cloud, HPC, carbon-aware computing). If you forked PaperRadar for a
different field, expect to **replace most of this** — the value of the
repository is the structure and the automation, not this particular list.

See the README section *"The catalog is an example — fill it with your own
field"* for a prompt that hands the job to a coding agent, and
[../docs/adding-a-venue.md](../docs/adding-a-venue.md) for the schema.

## Layout

| Path | Contents |
|---|---|
| `fields.json` | The field taxonomy referenced by `venues/*.json` and `select.fields` |
| `venues/<id>.json` | One venue: identity, field tags, links, and how to read its CFP |
| `rankings/<scheme>.json` | A ranking scheme keyed by venue id (`kiise-2024`, `core-2026`, `sjr-2025`) |

`id` always equals the file name. Nothing here holds dates — those are
collected into `data/schedules.json` by `npm run refresh`.

## Rules

1. **Official sources only.** A deadline must be readable on the venue's own
   CFP page (`cfp.url`), and `allowedHosts` must name that host.
2. **Never invent** a date, a timezone or a ranking tier. If a page cannot be
   parsed, use `"adapter": "manual"` with `verifiedAt` set to the day you
   checked it, or `"adapter": "none"` to list the venue without tracking.
3. **Rankings need a source.** `rankings/*.json` carries the scheme's `url`;
   omit a venue rather than guessing its tier.
4. Run `npm run validate` before committing — it checks every reference,
   regex and date format in here.

## Current example content

- **Fields**: systems, architecture, HPC, cloud, networking, storage,
  performance, sustainable computing, machine learning, ML systems, IoT,
  simulation, energy systems.
- **Rankings**: `kiise-2024` (Korean KIISE top-conference list, used as a BK21
  reference), `core-2026` (CORE conference ranking), `sjr-2025` (SCImago
  journal quartiles).
- **Venues**: 71, of which about a third carry a working CFP adapter. The rest
  are listed for reference (rolling-submission journals, pages rendered with
  JavaScript, or venues with no current CFP).

Contributions that widen this to other fields are welcome — see
[../CONTRIBUTING.md](../CONTRIBUTING.md).
