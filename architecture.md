# Architecture — Daybook

Part of the four-document set: `product-requirements.md` · `design-system.md` ·
**architecture.md** · `AGENTS.md`. This describes the system as it stands, plus the parts
that are decided and not yet built (marked ⏳). `docs/ARCHITECTURE.md` is the historical
pre-restart record and loses where it disagrees.

## The shape

```
Electron shell (dock icon · autostart · updater — macOS in v1)
   └── React + TypeScript renderer (Vite, Tailwind 4)
         ├── HTTP ──▶ 127.0.0.1 runner  Python sidecar (runner/): brief builder and the
         │                              eleven assertions built; ⏳ spawned by the app,
         │                              ⏳ scheduler integration, file tools
         └── window.daybook bridge (preload) ──▶ Electron main process
                  folder picker · atomic writes · keychain · CLI detection ·
                  daybook://auth delivery · https-only outbound links
                        └──▶ THE FOLDER (plain files — the only source of truth)
   auth ──▶ Supabase (identity + licensing only; see "Accounts")
   ⏳ launchd: 60s reminder tick + hourly watchdog, user-level, runs when the app is closed
```

**The renderer never imports Electron or Node APIs.** It talks to `127.0.0.1`, to Supabase
for auth, and to the small `window.daybook` bridge — nothing else. That boundary keeps the
frontend runnable in a plain browser (fallbacks in `src/lib/daybook.ts`) and the shell
swappable (Tauri remains a documented option; DECISIONS.md S8).

## Processes

| Process | When | Resident? |
|---|---|---|
| Electron app | while the user has it open | dock icon |
| launchd `app.daybook.mac.tick` — every 60 s | `python -m daybook tick`: in the ten minutes before the user's brief time, asks their chosen model to plan the day, once (`plan.py`); once the brief time has passed (read from `config.json` each run), writes today's brief if all eleven pass, and notifies; ⏳ reminders join it when the reference daemon is bundled | never — runs and exits |
| launchd `app.daybook.mac.watchdog` — hourly | `python -m daybook watchdog`: notifies once if the tick has stopped or the brief is still missing 30 min after its time | never — runs and exits |
| Planning run — `python -m daybook plan` | spawned by the app for "Plan today" and for the first day after setup; the CLI it asks (`claude -p` / `codex exec`) runs beneath it and exits with it | never — runs and exits |
| ⏳ Job processes — nightly close | spawned by the tick, exit | never |
| Python sidecar runner (`runner/`) | spawned by the app when the scoreboard asks for a brief (`electron/runner.cjs`: one at a time, on a free 127.0.0.1 port); stopped on quit, and exits itself if the app is gone | only while app is open |

Quit the app and nothing of ours is resident; two launchd timers stay *registered* (a
registered timer is not a running process). User-level `~/Library/LaunchAgents/` only —
never sudo, never LaunchDaemons — written and loaded by `electron/schedule.cjs` when the
scoreboard opens, unless the user stopped them. Jobs are labelled after the bundle id, so
`launchctl list | grep daybook` finds them (the Python processes themselves show as
`python3`; their labels are the names). **Settings & status** is the `status` / `stop` /
`logs` surface: every job by label with what it does, whether macOS has it loaded, its last
exit code and the tick's last run, last brief and last error; the runner's PID; one log
directory. **Stop removes the job files, not only unloads them** — a file left in
`~/Library/LaunchAgents` comes back at the next login, and `pkill` alone lets launchd restart
the tick within 60 seconds — and the app never restarts jobs the user stopped
(`backgroundJobs: "off"` in their record). A test copy of the app (`DAYBOOK_USER_DATA`) uses
`app.daybook.mac.test.*` labels. ⏳ `uninstall` (jobs and app data, leaving the folder alone,
said before it happens) comes with packaging.

## Storage tiers

| Tier | Where | What |
|---|---|---|
| **The folder** (chosen by the user) | plain files, git auto-committed | everything real: `DAY-STATE.md`, `MASTER-PLAN.md`, `LOG.md`, `CORRECTIONS.md` (append-only, never pruned), `SETUP-BACKLOG.md`, `reminders.json`, `config.json`, `briefs/` |
| **App data** (`userData/`) | `settings.json` (one record per account, keyed by Supabase user id: folder choice, connections, setup completion, whether background jobs are on), `logs/` (runner, tick, watchdog — the one log location), `state/tick-state.json` (the tick's last run, last brief, what it already said today), ⏳ SQLite index | app state only; SQLite is derived, deletable, rebuildable by folder rescan — and never holds the reminder schedule |
| **OS keychain** | via `safeStorage` / `keyring` | API keys, one entry per account and connection. Never a file, never a shell-side store |
| **Supabase** | minimal DB | account identity, licensing, usage counters — see Accounts |

Rules: every folder write is **atomic** (temp file + rename) and **git-committed**;
`config.json` is **merged, never clobbered** (setup preserves hand edits); markdown seeds
are created only if absent; a **file watcher is mandatory** once the write path goes live —
users edit these files by hand. `reminders.json` is read at tick time and never copied into
SQLite — a second copy of the schedule is how calendar drift starts.

## Auth (built)

Supabase, email + Google. **Implicit flow**: the system browser opens the authorize URL.
**Google returns to a loopback listener** (`electron/authLoopback.cjs`, RFC 8252): opened on
`127.0.0.1:53682–53689` only while a sign-in is in flight, it serves a page that posts the
URL fragment's tokens back (JSON plus a one-time nonce, so no other page can), clears them
from the address bar, and says "you can close this tab"; the listener closes and the app
comes forward. **The confirmation email returns to `daybook://auth`** — it can be opened
long after any listener — which macOS delivers via `open-url`/`second-instance`. Both reach
the renderer as the same `daybook://auth#…` URL, and `supabase.auth.setSession()` completes
it. Both addresses are allow-listed in Supabase's Redirect URLs. The protocol handler is
registered on launch (dev registration points at the local Electron binary). Sessions persist in renderer
localStorage. Without `.env` credentials the app runs in **developer mode** — the flow
works, nothing is checked, the login screen says so. Malformed credentials degrade to the
same mode with the rejection shown on the login screen; the session check is capped at 5s
so a stalled auth call can never hang the app on its loading screen. The confirmation
email redirects to `daybook://auth` too, so it signs the app in rather than a browser tab.

**Which screen shows is decided in one place** (`route` in `App.tsx`), and launch, every
sign-in path, the browser callback and sign-out all go through it. A saved session is
believed only after Supabase confirms its user still exists (`getUser`); a deleted or
revoked account signs out with a notice. When Supabase cannot be reached, the saved session
stands — the app must open offline. The account's **user id**, never its email, keys
everything on the Mac, so an account deleted and re-created with the same email is a new
account and walks onboarding from step 1. Sign-out always clears this Mac's session, even
when the server cannot be told.

**Accounts exist for identity and licensing only** (DECISIONS.md S9, superseding the old
no-accounts decision S7). The server holds account identity, licensing state and usage
counters — never folder content, reminder titles, people data, keys, prompts, file paths or
precise location. The leak test: if the server DB leaked tomorrow, would any user be
harmed? The answer must stay no. Billing is out of v1.

## AI providers (built)

`authKind: "local_cli" | "api_key"` is **data on the provider record** — the surface moved
three times in 2026, so a path is disabled by editing data, not logic. API keys go into the
keychain; local CLIs are invoked as subprocesses the user authenticated themselves, and only
with commands fixed in our code — checking sign-in (`claude auth status`, `codex login
status`), listing models (`codex app-server` → `model/list`) and invoking. No shell,
arguments as a list, nothing from model output or folder content as an argument, and a CLI's
own credentials are never read (D4). 🔴 No
hosted proxy of anyone's subscription, ever (S4). 🔴 No shell actions in v1 (S6): the agent
writes the config, so a model-authored action target is a laundering path — an action is
`{"label", and exactly one of "url" | "path"}` and nothing may originate from model output.

**Choosing a model (built: detection, sign-in state, model lists, selection; ⏳
invocation).** The connect step is "choose your secretary's model"; the connection it runs
through follows from the choice. `electron/cli.cjs` finds Claude Code and Codex in `PATH`
and the known install locations (native installers `~/.local/bin`, Homebrew, npm prefixes,
nvm/Volta/Bun) — an app opened from the Dock has a minimal `PATH` — and runs each child
with its own directory first on `PATH` (so an npm install's `node` resolves) and `USER`
set (without it Claude Code cannot reach its keychain entry). Sign-in state comes from
`claude auth status` (JSON: signed in, method, plan — the email and organisation are not
kept) and `codex login status` (exit code, method on stderr). Model sources: Claude Code
has no listing, so its choices are a catalog of full model IDs in `src/lib/models.ts`;
Codex lists its own through `codex app-server` (`initialize` → `initialized` →
`model/list`, JSONL over stdio); API keys list theirs through `connections:listModels`,
where the main process reads the key and calls `/v1/models`, so the key never enters the
renderer. Every source also takes a typed model ID, held to a plain-name pattern where it
enters the folder. The renderer only ever names a CLI (`claude` / `codex`); the path that
runs is the one the main process found. The active connection and model go into the
folder's `config.json` `providers` block — at setup, and again whenever the model is
switched from the scoreboard — with the binary's path, the model and its display name, and
no pointer to any key.

**Planning the day (built 2026-10-05, Beta 1).** `runner/daybook/plan.py` and
`secretary.py`. **The model proposes; Daybook writes.** The model is handed text — the
planning instructions and `LAWS.md` as its system prompt, and the folder (setup context,
master plan, day state, corrections, the newest part of the log, and the person-facing
parts of `config.json`) as the message, each file fenced by markers carrying a random token
so nothing inside a file can close its own block — and answers with one JSON object:
today's list, the board, what was newly finished, questions, a summary, and *flags* (text
in the folder that read like instructions). Daybook refuses an answer that breaks a rule
(over the user's cap, a short list with no reason, a board row without WAIT/CHASE and a
real date, malformed fields), neutralises markdown that would change the file's structure,
keeps a path's code marks only if the file really exists, and **writes the day state
itself**: finished things are carried over by Daybook — the model can add to them, never
remove one — and sections it does not plan (the scoreboard, the ticks) are kept as they
were. The candidate goes through the eleven assertions as if it were already the day state
(gate 1); a refused answer is sent back once with the exact reason, and a second refusal
leaves the day state untouched. On success the old day state moves to
`archive/day-state/<time>.md`, the new one is written atomically, and `LOG.md` gets one line
in Daybook's own words (never the model's — its text could otherwise pose as a log entry).
Today's plan is recorded in app data (`state/tick-state.json`), so the tick plans once a day
and a brief built later says, as a note, if planning failed; a failed retry never unsays a
plan that was written. A proposal made but not yet applied (`plan --propose`, for the
message box) is refused at `apply` if the day state changed in between. **The message box**
proposes with the user's words as the newest truth about the day (fenced like the files);
the proposal waits in the main process (`plan:run` with `propose`), the renderer gets what
to show and an id, never the day state's text, and `plan:apply` with that id writes it
after checking again. One planning run at a time; a second request is told so. Setup's
**own words** need no model call: the text goes verbatim into `SETUP-CONTEXT.md`, which the
first-day plan reads like any other file.

**Bringing it from another AI.** The handover the other AI writes is read by the runner, not
a model — `python -m daybook handover` takes `{"text"}` on stdin and returns the setup
form's fields (`importer.py`): headings matched by their words, bullets of any kind, times
as "07:00–09:00" or "7–9am", "unknown" as unknown, and a list of what it left out. It reads
stdin and writes nothing; the main process calls it (`setup:readHandover`) and the
document is never logged. The same command reads `{"fixed": [lines]}` into config
non-negotiables at "Write my folder", so a fixed time typed by hand is marked on the dial
too. The whole document becomes `HANDOVER.md`, one of the files the planner is shown.

**Today's times.** The answer carries `today_times` (`{what, start, end}`; an empty end is a
moment, not a span). Daybook refuses a time that isn't HH:MM, an end equal to its start, and
spans that overlap, and writes them as the day state's "Today's times" table (regenerated
each plan, so none outlive their day). The brief uses them only when the day state is true
for today: spans are laid over the day shape as today's own blocks (`dial.overlay`, which
keeps the day contiguous for V2), moments are marked beside the ring and listed in the
legend, and Next up and the page's live script count both alongside reminders.

**Numbers and ticks.** The planning answer also carries `scoreboard` (`{id, value, note}`
for metrics in config.json, never one with `tracking: false`) and `ticked` (habit ids).
Daybook refuses an unknown id and a number without a note, drops a value the day state
already shows and any tick when there was no message, rewrites the Scoreboard table only
when a number arrived or a tracked metric has no row (dated notes, other rows kept as they
were), and counts "Today's ticks" from `TICKS.md` for habits it set up (they carry
`since`). Applying a plan appends the ticks to `TICKS.md`, once per habit per day.

How each connection is asked — arguments fixed in `secretary.py`, as a list, no shell, the
model id pattern-checked, the prompt on stdin, in an empty temporary directory, with a small
known environment:
- **Claude Code:** `claude -p --output-format json --tools "" --safe-mode
  --strict-mcp-config --no-session-persistence --system-prompt … --model …` — no tools at
  all, none of the user's CLAUDE.md, hooks, plugins or MCP servers, and the day is not kept
  in Claude Code's history. Its own sign-in (the user's plan) is used; `--bare` is never
  used, because it switches subscription sign-in off.
- **Codex:** `codex exec --sandbox read-only --skip-git-repo-check --ephemeral
  --ignore-user-config --ignore-rules --cd <empty dir>`, every tool-bearing feature switched
  off by name (`shell_tool`, `unified_exec`, `apps`, `plugins`, `hooks`, `browser_use`,
  `computer_use`, …) and web search disabled, the answer held to a JSON schema
  (`--output-schema`). Codex has no single "no tools" switch — the list is checked against
  `codex features list` when Codex updates. ⏳ Not yet verified: whether a global
  `~/.codex/AGENTS.md` still reaches the model under these flags.
- **API keys (Anthropic, OpenAI)** — built, not offered in Beta 1 (S12; the model step
  hides them behind `API_KEYS_OFFERED`): HTTPS from the runner with the standard library. The
  key is decrypted by the app and handed to that one run on stdin — never an argument or an
  environment variable — so **an API-key connection plans only while Daybook is open**; the
  unattended morning run says so in the brief instead.

Both CLIs were probed (2026-10-05) by asking them to list the home folder under these
flags; both answered that they had no tool to do it.

## Folder access and approvals (⏳ designed 2026-10-04; built with the secretary's file tools)

The owner's rule (DECISIONS.md S10): the secretary **reads, writes and edits inside the
connected folder**, edits subject to approval the user can set; it may **read** other
folders — Downloads, Documents, a specific folder — **only where the user granted it**, and
never writes outside the connected folder. None of this rests on a prompt. A model told
"only read inside the folder" can be talked out of it by any file it reads; so the boundary
is enforced in code, in four layers, and the model never holds the pen on its own
permissions.

**1 · Grants come from a person, in Daybook's own UI — never from the model.** Grants live
in app data, per account (`settings.json`: the connected folder, its approval mode, the list
of read-only folders), not in the user's folder and not anywhere a tool can write. A read
grant is made with the native folder picker in Settings, or by approving a request: the
secretary may *ask* for access ("may I read Downloads to find the invoice?"), which shows in
the app as a request the user approves by picking the folder themselves. Text in a chat, an
email or a file cannot grant anything; it can only cause a request a person sees.
`config.json`'s `scope.allow_outside_root: false` stays: the folder grants nothing on its
own. The first read of Documents, Downloads or Desktop also raises macOS's own privacy
prompt (TCC) — a second, OS-owned confirmation; the packaged app declares
`NSDocumentsFolderUsageDescription` / `NSDownloadsFolderUsageDescription` /
`NSDesktopFolderUsageDescription` for it.

**2 · Daybook's file tools check every path** (the API-key path, where Daybook runs the
tools itself). A requested path is resolved to the file it really is — `..`, symlinks,
APFS's case-insensitivity — and checked: inside the connected folder → read/write under its
approval mode; inside a read-only grant → read; anything else → refused, with the reason.
Deny wins over allow, and for a symlink the check covers both the link and its target. An
**always-denied list** applies even inside a grant: `~/.ssh`, `~/Library/Keychains`,
browser profiles, password-manager data, `.env`-style secret files, and the AI CLIs' own
credential stores (`~/.claude`, `~/.codex` — DECISIONS.md D4 forbids reading them).

**3 · Each CLI's own controls are set from the grants** (the Claude Code / Codex path, where
the CLI runs its own tools). Claude Code is started in `--restricted` mode (file tools
confined to its working directories; command and web-fetch tools removed), with the
connected folder as its working directory, each read grant as `--add-dir` plus deny rules
for `Edit`/`Write` under that path (deny is evaluated before allow and cannot be carved
out), the always-denied list as `Read` deny rules (`//absolute` / `~/` patterns), and
approvals routed to Daybook through `--permission-prompt-tool`; an unattended run uses
`--permission-prompts none`, so nothing waits on an absent person. Codex runs with `--cd`
the connected folder and `--sandbox workspace-write`, and **never** `--add-dir`, which
grants *write* access — Codex's flags do not confine its reads, which is why layer 4 exists.

**4 · A macOS sandbox around the whole secretary process.** The runner and any CLI it
starts run under a Seatbelt profile (`sandbox-exec`, the mechanism Claude Code's own shell
sandbox uses on macOS) generated from the grants: reads only in the connected folder, the
read grants and what the process needs to run (system libraries, the CLI's install and its
own config); writes only in the connected folder and a scratch area; network only to the
chosen model provider. This is the layer that holds when a tool has a bug or a model is
tricked, and the only one that confines Codex's reads. `sandbox-exec` is deprecated but
still shipped; if it goes, the boundary moves to the packaged app's own sandbox entitlements
— the design does not depend on the model obeying anything.

**Approvals for changes** — set per connected folder, like Claude Code's modes, and
changeable in Settings:
- **Ask before each change** (the default to start with): the change appears in Daybook as a
  diff — Approve / Reject.
- **Apply changes, keep history**: changes land without asking; every one is git-committed
  (the folder's write rule), listed in the activity log, and undoable in one click.
- **Always asks, in every mode:** deleting a file, replacing a whole file, writing outside
  the secretary's own files into the user's documents.
- **When nobody is there** (the nightly close at 23:00): nothing waits on a prompt. Changes
  that would need approval queue as *proposed* for the user's next visit; the nightly close's
  own write path is already candidate → mechanical checks → commit (ship gate 1).

**Against prompt injection**, beyond the four layers: everything read — the folder, a read
grant, a web page — is untrusted data, marked as such in the prompt and never followed as
instruction (AGENTS.md rule 4). The dangerous combination is private data + untrusted
content + a way to send it out; Daybook removes the way out: network only to the model
provider, no general web fetch carrying data, and no action target taken from model output
(rule 3). Read access never implies write access, at every layer.

**Visible and revocable:** Settings & status lists every grant with its mode and a revoke
button, and an **activity log** records each file the secretary read or changed, when, and
under which grant (app data, one documented location).

## The reference reminder daemon (⏳ to be bundled — read 2026-10-04, nothing changed)

The finished daemon (AGENTS.md rule 2) was read, read-only, before any bundling work. What it
is, for whoever writes the behaviour tests:

- **Shape.** One dependency-free Python file, run by its own launchd job every 60 s with
  `RunAtLoad`; one tick per run. Reads `reminders.json` at every tick (keys beginning `_` are
  comments) and keeps its own state (`fired` keys of `<id>|<date>|lead/main`, pruned after 7
  days, written atomically). Writes `.agent-heartbeat.json` next to `reminders.json` on every
  tick that loaded its config: last tick, timezone offset, schedule source, `fired_this_tick`
  (attempts, not confirmed deliveries), running total. Daybook's watchdog and V11 read that
  heartbeat.
- **Schedule.** `once` (`datetime`), `daily`, `weekdays`, `weekly` (`days`, first three
  letters), `monthly` (`day`: positive values capped at the month's length, `-1` the last
  day, `-2` the one before); `lead_minutes` → `default_lead_minutes` → 10. Naive local time.
- **Delivery.** `osascript display notification` (credited to Script Editor) — the same path
  the brief tick uses; with buttons, `terminal-notifier` when present, else a detached System
  Events alert that gives up after 600 s. The result of a delivery is not checked.
- **The hard-won behaviours the tests must protect:** a late early-warning is dropped, not
  delivered; the first run swallows everything already past; a 20-minute catch-up after sleep,
  labelled "N min ago"; the no-repeat key and the atomic state write; broken JSON produces a
  loud notification, not silence; the monthly day rules; a daily-shifting schedule never
  reuses another day's times, and is shifted by the machine's live UTC offset; the tick never
  blocks (detached alerts, `-message " "`, no buttons on early warnings).

**How it joins Daybook — the owner's decisions (2026-10-04, DECISIONS.md S11 and D6):**
1. **A switch, off by default.** Reminders are opt-in: off until a user turns them on and
   sets them up. The tick fires them only when the switch is on.
2. **Personal details removed.** Every personal line — a first name and initials, a personal
   folder layout, a home city and travel, details of a religious practice — is removed or
   becomes configuration before any of it enters the repo (rule 1). This overrides rule 2's
   "unchanged" for those lines only.
3. **No faith schedule by default (D6).** The daily-shifting schedule engine ships generic and
   off; Daybook's users include Muslims and Christians, so no tradition's timetable is
   assumed. Which traditions get a ready-made option, and whether any is fetched online, is
   decided when the feature is built.
4. **The known gaps are fixed** while bringing it in, each behind a test: an event missed
   across midnight is lost; daylight saving's skipped hour can drop a reminder; a crash inside
   a tick re-sends that tick's notifications for up to 20 minutes; a malformed
   `reminders.json` notifies every minute.
5. ⬜ **Shell-command buttons** (`-execute`, an alert click, `do [n]` with `shell=True`) —
   rule 3 disables them in v1; awaiting the owner's confirmation that they are switched off.

## Packaging (built 2026-10-05, Beta 1)

`npm run dist:mac` (electron-builder) makes `Daybook-<version>-arm64.dmg`. Inside the app:
the renderer bundle and `electron/` in `app.asar`; `Resources/runner/daybook/` with
`LAWS.md` beside it; and `Resources/python/` — python-build-standalone 3.12, pinned by
SHA-256 in `app/scripts/fetch-python.mjs`, used before any Python on the Mac (the brief, the
planning run and the launchd jobs all point there). Nothing Daybook runs writes bytecode,
so the bundle stays as signed. Signed **ad hoc** — a valid signature without a developer
account, so macOS offers "Open Anyway" once rather than calling the app damaged; ⏳
notarization before any public release (D4's Commercial Terms note applies then too). The
installed app's app data is `~/Library/Application Support/Daybook` (a development copy
keeps `daybook-app`). An app run from Downloads or the disk image is translocated by macOS
to a path that changes every launch, so the packaged app offers to move itself to
Applications and refuses to install launchd jobs until it has. ⏳ An in-app uninstall; until
then `TESTERS.md` lists the steps (stop the jobs, remove the app, optionally its app data —
never the folder).

## The three ship gates

1. **A candidate first** — candidate → mechanical asserts → write, the previous file kept.
   🔴 Never write `DAY-STATE.md` directly. Built for planning (`plan.py`); ⏳ a diff to
   approve (the message box) and the git commit after each write.
2. **The brief is verified before delivery** — the eleven data assertions, run against
   `fixtures/sample-folder` and `fixtures/fresh-folder` on the frozen clock. Built.
3. **The law eval harness runs on every prompt change and model bump** —
   `python -m daybook evals --cli claude|codex [--model …]` (`runner/daybook/evals.py`).
   It times each model call, which is also how planning's latency is measured.
   Scenarios plant one temptation each in a copy of the sample folder (room to pad, a
   finished thing asked back, instructions planted in a file, a message that adds and
   closes) and check the laws on the model's *first* answer, before Daybook's refusals.
   It needs a signed-in CLI, so it runs on a developer's Mac; CI tests that the harness
   itself fails when a law is broken. 2026-10-05: Sonnet 5 through Claude Code and Codex's
   default model — every hard check passed.

All file, web and connector content is **untrusted data** — it enters the prompt explicitly
marked as such and is never followed as instruction (law 23; see
`fixtures/sample-folder/CORRECTIONS.md`, 2026-02-26, for the live reference case).

## Directory map

```
app/electron/main.cjs       window, IPC: folder picker, atomic writes, keychain,
                            per-account settings, daybook://auth, https-only links
app/electron/cli.cjs        Claude Code / Codex: find, sign-in state, Codex model list
app/electron/runner.cjs     starts/stops runner/, finds Python (bundled first), the brief, planning runs
app/scripts/fetch-python.mjs  the bundled Python: pinned, checksum-verified, trimmed
app/electron/authLoopback.cjs  Google sign-in's one-shot 127.0.0.1 return listener
app/electron/schedule.cjs   the tick and watchdog launchd jobs: write, load, status, stop
runner/daybook/tick.py      what those jobs run: tick (plans the day, then the brief), watchdog
runner/daybook/plan.py      the model proposes, Daybook writes: prompt, refusals, candidate
runner/daybook/secretary.py asking Claude Code, Codex or an API key — fixed arguments, no tools
runner/daybook/prompts/     the planning instructions (LAWS.md is appended at run time)
runner/daybook/evals.py     the law eval harness (gate 3)
app/electron/preload.cjs    the single doorway (contextBridge)
app/src/lib/daybook.ts      typed bridge + plain-browser fallbacks
app/src/lib/models.ts       the Claude Code model catalog; model-id check
app/src/lib/dayShape.ts     the day's blocks + Unplanned gaps (covers 24h exactly once)
app/src/lib/auth.ts         Supabase client; dev-mode fallback; callback completion
app/src/lib/api.ts          a browser tab's route to a hand-started runner (127.0.0.1:8787)
app/src/screens/*           Login · ConnectFolder · ConnectProvider · SetupQuestions · Scoreboard · Settings
app/src/components/ui/*     copied-in shadcn-style primitives (Button, Field, Card)
app/src/components/*        the Daybook mark (Logo), the onboarding and page frames
app/src/assets/fonts/       Newsreader and Hanken Grotesk, bundled (SIL OFL)
brand/                      the mark as SVG and the macOS icon; app/resources/icon.png is its render
runner/daybook/fonts/       the brief's embedded fonts (Latin subsets)
runner/                     the Python runner: brief data, the eleven assertions, the HTML
                            brief, 127.0.0.1 server — the base the brief stage builds on
fixtures/sample-folder/     the invented test folder; develop against it
docs/design/onboarding-flow.png   the owner's drawing — normative for the v1 flow
```
