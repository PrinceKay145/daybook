# Product Requirements — Daybook

Part of the four-document set: **product-requirements.md** (this file) · `design-system.md`
· `architecture.md` · `AGENTS.md`. Rank: `LAWS.md` outranks everything, then `DECISIONS.md`,
then this set. This file reflects the build as it exists; `docs/PRODUCT-SPEC.md`,
`docs/BRIEF-SPEC.md` and `docs/ARCHITECTURE.md` are the historical record of the
pre-restart design and lose where they disagree.

**What Daybook is:** a personal chief of staff — a desktop app that holds a user's life in
plain files they own, wakes up on its own schedule, and is built so it cannot state
something false about their week.

Three load-bearing ideas, everything below serves them:

1. **The folder is the product.** All state lives in plain files the user owns. The model
   is the reasoning layer; it is never the memory layer. Export is a folder copy.
2. **It wakes without you — on your schedule.** Each user sets their own brief time
   (default 09:00) and nightly close time (default 23:00); the schedule lives in their
   `config.json` and nothing reads a compiled constant.
3. **It cannot lie.** Numbers trace to sources, verification runs before delivery, the
   system reports its own failures.

---

## Status — 2026-09-27

**Stage 1 is built and working: the onboarding flow and the scoreboard shell.** Real
sign-up/sign-in (Supabase), folder connection, AI-provider credential storage, setup
interview writing plain files into the folder. The morning-brief pipeline is the next
stage; until it exists, the scoreboard shows clearly-labelled sample data.

---

## The v1 flow (normative)

From the owner's drawing (`docs/design/onboarding-flow.png`):

```
Launch
  └─▶ Login / Sign-up          (Google or email — identity only)
        └─▶ Connect a folder   ("for your secretary")
              └─▶ Connect your AI provider   (BYO key → keychain, or local CLI)
                    └─▶ Secretary setup questions (answers written LOCALLY, in the folder)
                          └─▶ Scoreboard home      (daily plans · metrics · actions)

Subsequent launches ──▶ straight to the scoreboard.
```

First run after onboarding ends with the first brief at the user's chosen brief time — or
an honest statement of when it will arrive.

---

## Screens — requirements and acceptance

**Login / Sign-up.** Google and email. Identity and licensing only; the screen says so.
Accept: signed-out users cannot reach the scoreboard; signing out never locks the user out
of their files.

**Connect a folder.** One picker. The folder is the secretary's whole world; the runner is
confined to it by path-prefix enforcement (not convention). Accept: relaunching with the
same folder resumes instead of re-onboarding; sync-hosted folders trigger the documented
warning.

**Choose your secretary's model.** The user picks a model — Fable 5.1, Opus 5.5, Sonnet 5,
a GPT model — and the connection follows from it: Claude Code or Codex already signed in
on this Mac (the user's own plan, through the CLI's own sign-in, which Daybook never sees),
or an API key (into the OS keychain, never shown again). Each CLI shows its state —
signed in (and how, and on which plan), signed out (with the exact command to run in
Terminal), or not installed (with where to get it) — and "Check again" re-reads it. CLIs
are found wherever their installers put them, not only on `PATH`, and are run only with
commands fixed in Daybook's code (AGENTS.md). Claude Code's models are a catalog of full
model IDs; Codex and API keys list their own live (the key never enters the renderer);
any source also takes a typed model ID. Switching is one click from the scoreboard, which
leads with the model's name, and the choice is written into the folder's `config.json` so
it outlives the app. `authKind` is data on the provider record. 🔴 No hosted proxy of
anyone's subscription, ever.

**Secretary setup questions.** Name/address-as, goals, non-negotiables, what's in flight,
**the user's brief time and close time**, timezone (auto-detected). Answers are written into
the folder as plain files: `config.json` (merged — hand edits survive), `SETUP-CONTEXT.md`,
`MASTER-PLAN.md`, `DAY-STATE.md`, `LOG.md`, `CORRECTIONS.md` (created only if absent).
Every write is atomic (temp file + rename). Nothing is sent anywhere.

**A folder that already has a setup** (a `config.json` with an owner) gets a choice before
the questions, and the choice is the user's. **Use this setup** is the default: every file
stays as it is and only the AI choice is recorded in `config.json`. **Start over** asks the
questions again, prefilled from the old setup; the previous `SETUP-CONTEXT.md` and
`MASTER-PLAN.md` move to `archive/setup/<time>/` first, `LOG.md` records the redo, and
`DAY-STATE.md`, `LOG.md` and `CORRECTIONS.md` are otherwise untouched — they are what
happened, not what was set up. Nothing is deleted either way.

**Scoreboard (home).** Daily plans, metrics, actions — rendered from verified brief data
once that stage exists. Until then: sample data behind a loud banner. A placeholder that
pretends to be a real brief would break the only promise this product makes.

**Settings & status** (next stage, required by the process model): every running process
with PID and purpose, log path, a working stop button (that also unloads the launchd
timers — `pkill` alone restarts within 60s), autostart toggle, folder re-selection,
provider re-auth, schedule editing.

---

## The morning brief (requirements for the next stage)

One self-contained HTML file per day, at the user's configured time: no external assets,
no browser storage, opens in five years from a restored backup with no app installed.

**Seven sections — the order is the argument** (where am I → what now → what matters → how
am I doing → what am I keeping up → who am I waiting on → a human note):

1. **24-hour dial** — blocks contiguous 00:00–24:00, asserted at build time; non-negotiables
   tick *outside* the ring; live hand; centre shows time, current block, `until HH:MM`.
2. **Next up** — one line.
3. **Today's three** — at most three, each one concrete first click. 🔴 Never manufacture a
   third; nothing marked done in `DAY-STATE.md` may appear, ever.
4. **Scoreboard** — empty prints an em dash *and a sentence why*. 🔴 Nothing estimated,
   interpolated or inferred.
5. **Today's ticks** — 🔴 shown, never graded. No streaks, scores, percentages.
6. **The board** — every row carries WAIT or CHASE **and** a date; silence stated as
   expected; two prompts turn an item into a yes/no question.
7. **Closing line** — warm, grounded, never hype; 🔴 never judge the user against a brief
   that never reached them.

🔴 **Verified before delivery, never eyeballed.** The eleven data assertions (V1 embedded JS
syntax · V2 day-shape contiguity · V3 dial geometry · V4 block lookup · V5 referenced paths
exist · V6 ≤3 items · V7 nothing done re-surfaces · V8 every empty metric has a reason ·
V9 every board row WAIT/CHASE + date · V10 no grading · V11 heartbeat reflected) run against
`fixtures/sample-folder` on the frozen clock. They are data assertions, not view concerns —
they survive any renderer.

---

## Accounts

Identity and licensing only. The server may store: account identity, licensing state, usage
counters. It must never store: folder content, reminder titles, people data, keys, prompts,
file paths, precise location. **The leak test:** if the server DB leaked tomorrow, would any
user be harmed? The answer must stay no. Email confirmation stays ON. Account deletion in
the alpha is manual (Supabase dashboard → Authentication → Users); a self-serve deletion
flow is a later-stage requirement, not a v1 one.

**One human, one account.** Supabase automatically links identities sharing a *verified*
email into a single user — which only holds while email confirmation stays on, so it does.
Signing up with an email that already exists is an error with a path forward ("sign in, or
use Google"), never a silent second identity. Deleting the user server-side means the next
sign-in walks the full onboarding again: onboarding progress is remembered **per account**
(keyed by the account's user id, never its email), not per machine. Every launch asks
Supabase whether the account still exists; a deleted account lands on login with a notice
saying so. Offline, the saved session is trusted so the app still opens.

Accept: a new account walks folder → AI → setup → scoreboard; quitting and reopening
lands on the scoreboard; sign-out lands on login and signing back in lands on the
scoreboard; after the account is deleted in Supabase, reopening lands on login with the
notice; signing up again with the same email starts at step 1; opening offline while
signed in lands where the account is.

---

## Non-goals for v1

Billing · Windows · mobile · messaging bot · Gmail/Calendar connectors · the people lane ·
hosted AI proxy · Sentry or any third-party error service · shell actions · multi-user.

Every one is a good idea; every one is how a solo build becomes a nine-month one. If one
seems necessary, raise it — do not start it.

Open decisions live in `DECISIONS.md` and are awaiting the owner: D5 Windows · D6
prayer-timetable preset · D7 alpha users · D8 pricing · D9 telemetry default. Do not decide
them, do not design around one option. Settled there since: D2 (the repo stays private for
now) and D4 (`local_cli` ships, on the conditions recorded there).
