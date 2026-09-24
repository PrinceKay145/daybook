# daybook

> Working name. `DECISIONS.md` **D1 is not final** — the name gates the repo, the domain,
> the bundle id and every import path, so expect one rename.

A personal chief of staff: a desktop application that holds a user's life in plain files
they own, wakes up on its own schedule, and is built so it cannot state something false
about their week.

**Start with [`START-HERE.md`](START-HERE.md).** It says what to read, in what order.

| | |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | The five rules that override everything |
| [`LAWS.md`](LAWS.md) | The 24 behavioural laws — the actual IP |
| [`DECISIONS.md`](DECISIONS.md) | Settled and deferred. Deferred means *do not decide it* |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How to build it |
| [`docs/PRODUCT-SPEC.md`](docs/PRODUCT-SPEC.md) | What it is |
| [`docs/BRIEF-SPEC.md`](docs/BRIEF-SPEC.md) | The morning brief and its eleven assertions |
| [`fixtures/`](fixtures/) | The invented test folder. Develop against this |

## Where the build is

**Week 1 of 8 — a window on screen rendering today's brief from the fixture folder.**
Read-only. No scheduler, no notifications, no Tauri.

```bash
# the runner: build, verify and serve the brief
cd runner && python3 -m daybook serve --folder ../fixtures/sample-folder

# the app, in another terminal
cd app && npm install && npm run dev     # http://127.0.0.1:5173
```

```bash
cd runner && python3 -m daybook check --folder ../fixtures/sample-folder   # the eleven
cd runner && python3 -m unittest discover -s tests -t tests                # the suite
```

See [`runner/README.md`](runner/README.md) and [`app/README.md`](app/README.md).

## Two things that are not what they look like

**The reminder daemon is finished.** 828 lines of dependency-free Python, in production,
delivering without a miss. It is bundled as a sidecar **unchanged** in week 7. It is not
a component to build, spike, port or start with.

**Nothing here is real.** Everything in `fixtures/` is invented. No real name, employer,
city, institution, goal, faith detail or financial state goes in this repo — not in the
code, not in the tests, not in a commit message. The system is the product; the data
never is.
