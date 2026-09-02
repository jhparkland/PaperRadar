# Trust and schedule-state policy

PaperRadar never guesses a date. Every deadline it shows, exports or sends a
reminder for traces back to a registered official page.

## Status of a milestone

| Status | Meaning | D-day | Calendar | Reminders |
|---|---|---|---|---|
| **Verified** | Date **and** timezone confirmed on the registered official CFP (declarative adapter matched, or a person entered it with `verifiedAt`). | yes | `STATUS:CONFIRMED` | yes |
| **Verification needed** | The page could not be re-confirmed (fetch failed, wording changed, implausible date, broken chronology). The **last verified value is kept**. | yes, marked | `STATUS:TENTATIVE` + warning | **no** |
| **TBA** | The organisers have not announced it. | no | no | no |
| **Not required** | The milestone does not exist for this round (e.g. no abstract registration). | — | — | — |

## Status of a venue card

| Status | When |
|---|---|
| Verified / Verification needed | The next future deadline has that status. |
| Previous edition reference | No future deadline is known; the most recent past one is shown for orientation only. |
| TBA | The current edition is registered but no dates are announced. |
| Rolling submission | Journal without deadlines (`submission: rolling`). |
| Not tracked | No `cfp` adapter for this venue yet. |

## Rules the refresh step obeys

1. **Allow-list only.** A venue's adapter can read only the hosts listed in
   `cfp.allowedHosts`, including after redirects.
2. **All-or-nothing per edition.** If any dated milestone of an edition does not
   match, nothing from that fetch is stored. The previous milestones are kept
   and downgraded to *Verification needed*.
3. **Never overwrite good data with bad.** Empty bodies, HTTP errors, timeouts,
   unparseable or implausible dates and milestone chronology violations
   (abstract after paper, …) all count as failures.
4. **Manual entries are never touched by automation.** They carry the date a
   person checked the page (`verifiedAt`) and show it on the site.
5. **Change log.** Every added, changed, removed, failed or recovered milestone
   is appended to `data/updates.json` and shown on the *Sources & updates* tab.
6. **Reminders go out only for Verified dates** of author-actionable
   milestones (abstract, paper, camera-ready, other — never notification or
   event dates) whose timezone the page actually states. They fire once per
   threshold, and the sent state lives in `data/state/reminders.json` so a
   re-run never repeats a message.
7. **Unstated timezones are assumptions, and labelled as such.** A CFP that
   gives dates without a timezone is stored with `timezone: unspecified`:
   displayed as AoE with a visible note, exported to calendars with a warning,
   excluded from reminders.
8. **Calendars update in place.** Stable UIDs, `SEQUENCE` bumps on change,
   `STATUS:CANCELLED` for removed deadlines (kept 30 days).

## Timezones

Deadlines are stored with the official UTC offset (AoE = UTC−12 is the most
common). The site shows the official time and the same instant in the
configured `site.timezone` (or the viewer's browser timezone). D-day is counted
in calendar days of the display timezone.
