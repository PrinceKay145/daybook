# daybook

A personal chief of staff: a desktop application that holds a user's life in plain files
they own, wakes up on its own schedule, and is built so it cannot state something false
about their week.

**Start with [`START-HERE.md`](START-HERE.md).**

| | |
|---|---|
| [`AGENTS.md`](AGENTS.md) | The five rules that override everything |
| [`product-requirements.md`](product-requirements.md) | What to build; the current stage |
| [`architecture.md`](architecture.md) | How it fits together |
| [`design-system.md`](design-system.md) | The UI language |
| [`LAWS.md`](LAWS.md) | The 24 behavioural laws — the actual IP |
| [`DECISIONS.md`](DECISIONS.md) | Settled and owner-pending. ⬜ means *do not decide it* |
| [`fixtures/`](fixtures/) | The invented test folder. Develop against this |
| [`app/`](app/) | The Electron + React application |

## Where the build is

Beta 1 is built: sign-in → connect a folder → choose Claude Code or Codex → setup → a
verified daily brief, planned by the chosen model and correctable with a message. The brief
arrives on its own schedule, and Settings & status can stop the background jobs. The
microphone feature is paused pending tester feedback. The next step is to put the current
build in testers' hands; see [`TESTERS.md`](TESTERS.md).

```bash
cd app && nvm use && npm install && npm run dev
```

## Two things that are not what they look like

**The reminder daemon is finished.** Dependency-free Python, in production, delivering
without a miss. It becomes the sidecar unchanged. It is not a component to build, spike,
port or start with.

**Nothing here is real.** Everything in `fixtures/` is invented. No real name, employer,
city, institution, goal, faith detail or financial state goes in this repo — not in the
code, not in the tests, not in a commit message. The system is the product; the data
never is.
