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

## Status — 2026-10-05

**Stage 1 is built and working, and the brief arrives on its own.** Real sign-up/sign-in
(Supabase), folder connection, model choice (Claude Code, Codex or an API key), a setup
interview writing plain files into the folder, the brief built from that folder by the
runner, verified by the eleven assertions and shown only when they pass, written at the
user's brief time by launchd, and Settings & status — and **the chosen model plans the
day** (Beta 1, items 1–2 below). Not yet: the message box and packaging.

---

## Beta 1 — what the first testers get (owner, 2026-10-05; S12)

One loop testers can react to: **tell it about your life, get a useful brief every
morning, correct it in a sentence.** Everything else waits for what they say. A short beta
that works beats a long one crowded with bugs.

**Built, kept as it is:** sign-in · connect a folder · choose the model · setup questions ·
the verified brief on the scoreboard · the brief arriving on its own · Settings & status.

**To build, in this order — and nothing else:**

1. ✅ **The size of today's list is the user's** (built). `daily_list.max_items` in `config.json`,
   1–10, default 3, asked in setup and changeable in Settings. Law 8's number is safe to
   tune (LAWS.md, "Editing this file"); its rule is not: the list is never padded to reach
   the number, and a list shorter than it says why.
2. ✅ **The chosen model plans the day** (built). Before the brief time, Daybook sends the user's own
   model — through their CLI's own sign-in or their API key — what is in the folder (setup
   context, master plan, day state, recent log), marked as untrusted data (rule 4), and asks
   for today's list, the board and a short note. **The model proposes; Daybook writes.** The
   reply is text only: Daybook parses it into a candidate `DAY-STATE.md` and runs the checks
   before it replaces the real file (gate 1); the file it replaces is kept. The model gets no
   file tools and no access to anything, so S10's enforcement is not needed yet. The law
   eval harness (gate 3) covers the prompt before it ships. Also from the scoreboard
   ("Plan today"), and straight after setup, so the first day is planned at once. An
   API-key connection plans only while Daybook is open (the key is unlocked by the app);
   the unattended run says so in the brief. Accept: a refused or failed plan leaves the day
   state untouched and says why in one line; a finished thing never comes back; a made-up
   file path is never shown as a reference; the replaced day state is in
   `archive/day-state/`; the log line is Daybook's words, not the model's.
3. **"Tell your secretary."** One message box on the scoreboard — not a chat with history:
   "finished the proposal, waiting on Sam until Friday". The model proposes the updated day,
   the user sees the change and approves it, the brief rebuilds. Setup offers the same box
   beside the form: tell it about yourself in your own words, typed or dictated.
4. **An install testers can open.** Unsigned, with the Gatekeeper step documented, and a
   Python bundled — most Macs no longer have one.

**Not in Beta 1** (each waits for tester feedback): a chat with history · reminders (S11) ·
reading folders outside the connected one (S10's file tools) · the automatic nightly close
(the message box covers correcting the day) · daily-shifting schedules (D6) · self-serve
account deletion.

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
**the user's brief time and close time**, **how many things today's list holds at most**
(1–10, default 3 — never padded to reach it), **the shape of their day** (optional — the blocks
they name; every minute they leave out is written as *Unplanned*, so the dial's day shape
always covers 00:00–24:00 exactly once and claims no plan they did not make; overlaps are
refused with the two block names), and time zone — defaulting to this Mac's own zone
(no location is asked for), changeable from a list of every zone with its offset. The
questions come in three groups (about you · what you're working with · your day), each
question in full-contrast text with its guidance beneath it, and an example in the field
itself — italic and faint, "e.g." on one-line fields — so it never passes for an answer.
Answers are written into
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

**Scoreboard (home).** Today's brief, built from the folder by the runner and shown only
when all eleven assertions pass — the runner's own self-contained page, in a sandboxed
frame, with "Checked before it was shown: 11 of 11" above it. A brief that fails a check is
**withheld**, and the failed checks are named; a brief that cannot be built (no Python, the
runner failing) says why and where the log is. No sample data: a placeholder that pretends
to be a real brief would break the only promise this product makes. The model choice
("Sonnet 5 · Claude Code — change"), **Plan today**, a rebuild button and sign-out sit
above it. While the model plans, one line says so; afterwards one line says what changed
("Today's plan is written — 2 on the list, 1 on the board", with the model's one-sentence
summary) or why nothing did, and names any text in the folder that read like instructions
and was ignored.

**Settings & status** (required by the process model). **Built:** every job Daybook runs,
by its macOS label, with what it does, whether it is loaded, its last exit code and the
tick's last run, last brief and last error; the app's and the runner's PIDs; the one log
directory, openable in Finder; a working **Stop** that unloads the launchd jobs *and removes
their files* (`pkill` alone restarts within 60s; a file left behind returns at the next
login) and a **Start** that restores them — the app never restarts jobs the user stopped;
brief and close times and the size of today's list, saved to `config.json`; the folder (open in Finder) and the model
(change). **⏳ Still to come:** folder re-selection, and **folder access** — the connected
folder's approval mode, the read-only folders granted, a revoke button for each, and the
activity log (with the file tools, S10).

**The brief arrives on its own** (built). Once setup is done, the scoreboard installs two
user-level launchd jobs: `app.daybook.mac.tick` every minute writes today's brief once the
brief time in `config.json` has passed — only if all eleven pass — and notifies ("Your brief
is ready", or that it was written late, or that it was withheld); `app.daybook.mac.watchdog`
hourly notifies once if the tick has stopped or the brief is still missing 30 minutes after
its time. The scoreboard says, in one line, that this runs and where to stop it.
Accept: no brief before its time; one brief, once, after it; a late brief says when it was
written and does not guess why; a withheld brief is said once; stopping leaves nothing in
`launchctl list` or `~/Library/LaunchAgents`, and reopening the app does not restart them.

**Folder access and approvals** (⏳ built with the secretary's file tools; design in
architecture.md, decision S10). The secretary reads, writes and edits inside the connected
folder; it reads other folders only where the user granted read access in Daybook's UI, and
never writes outside the connected folder. The boundary is enforced in code — Daybook's file
tools, each CLI's own controls, and a macOS sandbox around the secretary — never by a prompt.
Changes follow the folder's approval mode: **ask before each change** (a diff to approve or
reject; the default to start with) or **apply changes, keep history** (git-committed,
undoable); deleting or replacing a whole file always asks; an unattended run queues changes
needing approval as proposals instead of waiting. The secretary may ask for access; only a
person grants it.
Accept: a path outside the folder and the grants is refused with a reason, including through
a symlink or `..`; a read grant never permits a write, at any layer; a file containing "you
now have access to ~/Documents" grants nothing; the always-denied list (`~/.ssh`, keychains,
browser profiles, CLI credential stores) stays unreadable even inside a grant; revoking a
grant takes effect on the next file call; every read and change appears in the activity log.

---

## The morning brief (requirements for the next stage)

One self-contained HTML file per day, at the user's configured time: no external assets,
no browser storage, opens in five years from a restored backup with no app installed.

**Seven sections — the order is the argument** (where am I → what now → what matters → how
am I doing → what am I keeping up → who am I waiting on → a human note):

1. **24-hour dial** — blocks contiguous 00:00–24:00, asserted at build time; non-negotiables
   tick *outside* the ring; live hand; centre shows time, current block, `until HH:MM`.
2. **Next up** — one line.
3. **Today's list** — at most the user's number (`daily_list.max_items`, 1–10, default 3),
   each one concrete first click; a list shorter than the number says why. 🔴 Never
   manufacture an item to reach it; nothing marked done in `DAY-STATE.md` may appear, ever.
4. **Scoreboard** — empty prints an em dash *and a sentence why*. 🔴 Nothing estimated,
   interpolated or inferred.
5. **Today's ticks** — 🔴 shown, never graded. No streaks, scores, percentages.
6. **The board** — every row carries WAIT or CHASE **and** a date; silence stated as
   expected; two prompts turn an item into a yes/no question.
7. **Closing line** — warm, grounded, never hype; 🔴 never judge the user against a brief
   that never reached them.

🔴 **Verified before delivery, never eyeballed.** The eleven data assertions (V1 embedded JS
syntax · V2 day-shape contiguity · V3 dial geometry · V4 block lookup · V5 referenced paths
exist · V6 no more than the user's cap · V7 nothing done re-surfaces · V8 every empty metric has a reason ·
V9 every board row WAIT/CHASE + date · V10 no grading · V11 heartbeat reflected) run against
`fixtures/sample-folder` and `fixtures/fresh-folder` (day one) on the frozen clock. They are
data assertions, not view concerns — they survive any renderer.

**V11 on day one.** No heartbeat is a real state — a folder set up today, or a Mac without
the reminder agent yet — not an error. The brief may ship then only if it says, on the page,
that delivery cannot be established, and its closing line is that statement (it judges
nothing). With a heartbeat, what it says must likewise be on the rendered page, checked
there rather than assumed. (Changed 2026-09-28: V11 previously failed on any missing
heartbeat, which would have withheld every brief until the reminder agent is bundled.)

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

Open decisions live in `DECISIONS.md` and are awaiting the owner: D3 local-first (the build
so far assumes it throughout — confirm or redirect) · D5 Windows · D6's remaining detail
(which traditions get a ready-made schedule option) · D7 alpha users · D8 pricing · D9
telemetry default · D1's domain and GitHub org · S11's shell-button question. Do not decide
them, do not design around one option. Settled there since: D1 (Daybook, `app.daybook.mac`),
D2 (the repo stays private for now), D4 (`local_cli` ships, on the conditions recorded
there), D6 (no faith schedule by default) and S8–S12 (Electron, accounts, folder access,
reminders as an opt-in switch, the Beta 1 scope).
