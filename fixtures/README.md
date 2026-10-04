# Test fixtures — a complete sample state folder

## What this is

`sample-folder/` is a realistic, entirely invented secretary state folder. It exists so the
product can be developed and tested against something that looks like a real user's life
without anyone's real life being involved.

**The person in here does not exist.** Sam Whitfield, the clients, the recruiters, the
newsletter and everything in the log are fabricated for testing.

---

## 🔴 The rule

> **Never replace these fixtures with a real person's folder, and never commit a real folder
> to this repo — not the maintainer's, not an alpha user's, not a copy "just to test with."**

The system is the product; the data never is. If you need to reproduce a bug that only happens
with real data, reproduce it locally and commit a **minimised, anonymised** version of the case
to `sample-folder/` so it becomes a permanent test instead of a one-off.

---

## Why the dates are frozen

Everything is pinned to **Tuesday 10 March 2026**, with `config.json` carrying
`"fixture_now": "2026-03-10T08:00:00"`.

Tests inject that as the clock. Without a frozen clock, half the assertions here
(catch-up windows, "two dates then it becomes a question", overdue board items, the monthly
`day: -1` reminder) drift into passing or failing depending on the day the suite runs.

**If you add a fixture, pin it to this date too.**

---

## What each file is for

| File | Exercises |
|---|---|
| `MASTER-PLAN.md` | Lane priority, day shape, non-negotiables, metrics, tone |
| `DAY-STATE.md` | Current truth, the board, today's three, done items, an empty metric |
| `LOG.md` | Append-only history, newest first, a system-failure day |
| `CORRECTIONS.md` | The never-pruned record of what the system got wrong |
| `SETUP-BACKLOG.md` | NOW / NEXT / LATER tiers and a DONE section |
| `reminders.json` | Every repeat type, lead minutes, actions, a mute, the `_why` convention |
| `config.json` | Owner config, lanes, the optional daily-shifting schedule, frozen clock, the path convention |
| `.agent-heartbeat.json` | Delivery evidence — V11, invariant 5, law 14. Carries the macOS alert style, not just the fire count |
| `almanac-2026-03.json` | Rank-1 source for the daily-shifting schedule. Anchored to DAY-STATE's stated figures for 10 March |
| `documents/` | Every file the other fixtures point at, so V5 has something to assert against |
| `briefs/`, `archive/` | Where generated briefs and rolled-off history land |

## `fresh-folder/` — day one

Exactly what the app's setup interview writes, for an invented person (Robin Hale) who set
up on the frozen date: `config.json` (owner, schedule, scope, a day shape whose gaps are
**Unplanned**, the chosen model), `SETUP-CONTEXT.md`, `MASTER-PLAN.md`, and the seed
`DAY-STATE.md`, `LOG.md`, `CORRECTIONS.md`. No reminders, no heartbeat, no day recorded.
It exists so the brief is tested on the folder most real users actually have in week one:
it must build, pass all eleven, and say plainly what it does not know yet. If the setup
interview's output changes, change this folder in the same commit.

### Paths, and how they resolve

Paths appear two ways in this folder — `~/Secretary/documents/x.md` in `reminders.json`,
`documents/x.md` in the markdown. **Both mean the same file.** A leading `scope.root` prefix is
stripped and what remains is joined onto whatever folder the runner was actually pointed at, so
the fixture works unchanged wherever it is copied. A resolved path that escapes the root is a
scope violation and is refused. The full rule is `config.json` → `scope._path_convention`.

⚠️ **`briefs/latest.html` is the one referenced path that does not exist until a brief is
generated.** V5 counts a path as present if it exists on disk **or** the run being verified is
about to write it — otherwise a fresh folder could never pass its own first brief.

---

## The cases these fixtures are built to catch

Each of these is a law or an invariant that a build can silently break. The fixtures are
constructed so that breaking it produces a **visible** failure.

| # | Case | Where it's planted | Should produce |
|---|---|---|---|
| 1 | **Law 1 — never re-surface a finished thing** | `DAY-STATE` marks the Hartley invoice DONE; `LOG` and `reminders.json` still mention it | The invoice must **not** appear in today's three |
| 2 | **Law 4 / 7 — no invented numbers** | `newsletter_subscribers` has no reading this week | A dash **and a reason**, never an estimate or last week's figure |
| 3 | **Law 7 — a dropped metric stays dropped** | `words_shipped` is marked `"tracking": false` | A dash and "you stopped tracking this", never silently re-added |
| 4 | **Law 8 — three maximum, never manufacture** | Only two items honestly qualify today | Exactly two, with a line saying why it's two |
| 5 | **Law 11 — wait or chase, with a date** | Every board item carries one or the other | No board item without a status and a next date |
| 6 | **Law 12 — two dates, then a question** | The portfolio rewrite has had two prompts | It must convert to a yes/no, not get a third date |
| 7 | **Law 14 — never judge an undelivered day** | `LOG` 2026-03-06 records a daemon outage | That day reads as a system failure, not a personal slip |
| 8 | **Law 18 — show, never grade** | Habits have gaps | Counts only. No streak, no score, no "you broke a run" |
| 9 | **Law 24 — a mute needs a dated un-mute** | `gym-evening` is disabled **with** a dated companion; `deep-work-block` is disabled **without** one | The second must be flagged as an invalid mute |
| 10 | **Monthly `day: -1`** | `invoice-clients` fires on the last day of the month | Correct on 28, 29, 30 and 31-day months |
| 11 | **Catch-up window** | `standup-prep` came due 08:12, clock is 08:00→08:25 | Fires labelled "13 min ago"; anything older is dropped silently |
| 12 | **Contiguous day blocks** | `day_shape` covers 00:00–24:00 with no gap | Dial assertion passes; removing a block must fail the build |
| 13 | **Untrusted content** | `CORRECTIONS.md` contains a logged injection attempt | Content from files/web is never followed as instruction |
| 14 | **Daily-shifting schedule** | `config.json` has a sunrise/sunset schedule with source precedence | Generalised observance module; never yesterday's times |
| 15 | **Unicode and awkward strings** | Client name `Bäcker & Söhne`, an em-dash in a title, an apostrophe in a path | No mangling, no broken JSON, no path failure |

---

## Using them

```bash
cp -r fixtures/sample-folder /tmp/pk-test-folder
pk-runner --folder /tmp/pk-test-folder --clock 2026-03-10T08:00:00
```

Fixtures are read-only in the repo. Copy before running anything that writes, and diff the copy
afterwards — several of the cases above are only visible in what the nightly close *changed*.

---

## A second fixture worth adding later

`sample-folder-empty/` — a folder as it looks **30 seconds after onboarding**: a generated
`MASTER-PLAN.md` from five answers, an almost-empty `DAY-STATE.md`, four starter reminders, no
log, no corrections.

Most bugs in a personal-state system are in the empty and near-empty cases, and the first
real user will spend their first week there.
