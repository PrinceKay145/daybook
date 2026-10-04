# The runner

Package **daybook**, after the product (`DECISIONS.md` D1). Built before the docs restart,
and the base the brief stage builds on: it already builds the brief's data, runs the
eleven assertions and renders the brief.

**Zero third-party dependencies.** Standard library only. The reference daemon has none and
that is a feature — every dependency added here is something that can break an install on
someone else's machine.

## Running it

```bash
cd runner

# Run the eleven verification assertions and exit non-zero on any failure
python3 -m daybook check --folder ../fixtures/sample-folder

# Build, verify and print the brief (nothing is written)
python3 -m daybook brief --folder ../fixtures/sample-folder

# ...and write it into the folder as briefs/YYYY-MM-DD.html + briefs/latest.html
python3 -m daybook brief --folder /tmp/my-copy --write

# Serve it on 127.0.0.1 for the frontend
python3 -m daybook serve --folder ../fixtures/sample-folder --port 8787

# What launchd runs (the app installs the jobs): every minute, write today's brief once
# its time has passed; hourly, notice a stopped tick or a missing brief. --state-dir is
# app data, never the folder. Use a copy of a fixture — tick writes briefs/.
python3 -m daybook tick     --folder /tmp/my-copy --state-dir /tmp/daybook-state
python3 -m daybook watchdog --folder /tmp/my-copy --state-dir /tmp/daybook-state

# Tests
python3 -m unittest discover -s tests -t tests
```

The fixtures are read-only in the repo. **Copy the folder before running anything with
`--write`** — several of the planted cases are only visible in what a run changed.

## What is here, and what is deliberately not

| Module | Does |
|---|---|
| `clock.py` | The time, and the name of the clock it came from (law 5) |
| `paths.py` | Resolves recorded paths against the folder; refuses anything outside it |
| `folder.py` | Opens the folder read-only and reads every file the brief needs |
| `markdown.py`, `daystate.py`, `logfile.py` | Small strict parsers for the state files |
| `schedule.py` | `reminders.json`, read at use time. Never indexed |
| `dial.py` | Block coverage and arc geometry |
| `brief.py` | Builds the brief's **data** |
| `assertions.py` | The eleven, run against the data before anything is delivered |
| `render.py` | The **view** — one self-contained HTML file |
| `write.py` | Atomic writes only |
| `server.py` | HTTP on `127.0.0.1` for the frontend |

**Not here, on purpose:**

- **The reminder daemon.** Finished, in production, bundled unchanged as a sidecar in week 7.
  Not spiked, ported or reimplemented here — `CLAUDE.md` rule 2.
- **The rest of the write path** — advisory lock, read-modify-write diff, file watcher, git
  auto-commit. Week 2.
- **The provider layer.** Week 3. Which is why the brief's closing line is assembled from
  `LOG.md` and says so, rather than being written by a model.
- **Scheduler, notifications, watchdog.** Week 4.
- **The agent harness.** Weeks 5–6. Python, in this runner — no Vercel AI SDK.

## Why data and view are separate

The eleven assertions are **data assertions, not view concerns**. They survive a change of
renderer, and a rewrite that makes them harder to run is the wrong rewrite. `brief.py`
produces the data, `assertions.py` checks it, `render.py` draws it, and nothing is written
or served unless all eleven pass.
