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

Stage 1 — the onboarding flow from the owner's drawing — works: login (Supabase) →
connect a folder → connect an AI provider (key into the keychain, or a detected local CLI)
→ setup questions (written into the folder as plain files) → scoreboard. The scoreboard
shows clearly-labelled sample data until the morning-brief pipeline is built.

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
