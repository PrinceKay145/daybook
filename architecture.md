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
| ⏳ launchd tick — 60s reminder check | runs and exits | never |
| ⏳ launchd watchdog — brief-arrival check | hourly, exits | never |
| ⏳ Job processes — brief, nightly close | spawned by the tick, exit | never |
| Python sidecar runner (`runner/`) | spawned by the app when the scoreboard asks for a brief (`electron/runner.cjs`: one at a time, on a free 127.0.0.1 port); stopped on quit, and exits itself if the app is gone | only while app is open |

Quit the app and nothing of ours is resident; two launchd timers stay *registered* (a
registered timer is not a running process). User-level `~/Library/LaunchAgents/` only —
never sudo, never LaunchDaemons. Processes are named after the product so `ps` and
Activity Monitor find them. The product must ship `status` / `stop` / `logs` / `uninstall`
— and `stop` must unload the launchd jobs, because `pkill` alone lets launchd restart the
tick within 60 seconds.

## Storage tiers

| Tier | Where | What |
|---|---|---|
| **The folder** (chosen by the user) | plain files, git auto-committed | everything real: `DAY-STATE.md`, `MASTER-PLAN.md`, `LOG.md`, `CORRECTIONS.md` (append-only, never pruned), `SETUP-BACKLOG.md`, `reminders.json`, `config.json`, `briefs/` |
| **App data** (`userData/`) | `settings.json` (one record per account, keyed by Supabase user id: folder choice, connections, setup completion), ⏳ SQLite index | app state only; SQLite is derived, deletable, rebuildable by folder rescan — and never holds the reminder schedule |
| **OS keychain** | via `safeStorage` / `keyring` | API keys, one entry per account and connection. Never a file, never a shell-side store |
| **Supabase** | minimal DB | account identity, licensing, usage counters — see Accounts |

Rules: every folder write is **atomic** (temp file + rename) and **git-committed**;
`config.json` is **merged, never clobbered** (setup preserves hand edits); markdown seeds
are created only if absent; a **file watcher is mandatory** once the write path goes live —
users edit these files by hand. `reminders.json` is read at tick time and never copied into
SQLite — a second copy of the schedule is how calendar drift starts.

## Auth (built)

Supabase, email + Google. **Implicit flow**: the system browser opens the authorize URL;
Supabase redirects to `daybook://auth` (allow-listed in URL Configuration), macOS delivers
it via `open-url`/`second-instance`, the main process forwards it to the renderer, and
`supabase.auth.setSession()` completes it. The protocol handler is registered on launch
(dev registration points at the local Electron binary). Sessions persist in renderer
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

## AI providers (built: storage; ⏳ invocation)

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

## The three ship gates (⏳ enforced from the brief stage on)

1. **Nightly close writes a candidate first** — write candidate → diff → mechanical asserts
   → commit. 🔴 Never write `DAY-STATE.md` directly.
2. **The brief is verified before delivery** — the eleven data assertions, run against
   `fixtures/sample-folder` on the frozen clock.
3. **The law eval harness runs on every prompt change and model bump** (`tests/laws/`).

All file, web and connector content is **untrusted data** — it enters the prompt explicitly
marked as such and is never followed as instruction (law 23; see
`fixtures/sample-folder/CORRECTIONS.md`, 2026-02-26, for the live reference case).

## Directory map

```
app/electron/main.cjs       window, IPC: folder picker, atomic writes, keychain,
                            per-account settings, daybook://auth, https-only links
app/electron/cli.cjs        Claude Code / Codex: find, sign-in state, Codex model list
app/electron/runner.cjs     starts/stops runner/, finds Python, fetches the verified brief
app/electron/preload.cjs    the single doorway (contextBridge)
app/src/lib/daybook.ts      typed bridge + plain-browser fallbacks
app/src/lib/models.ts       the Claude Code model catalog; model-id check
app/src/lib/dayShape.ts     the day's blocks + Unplanned gaps (covers 24h exactly once)
app/src/lib/auth.ts         Supabase client; dev-mode fallback; callback completion
app/src/lib/api.ts          a browser tab's route to a hand-started runner (127.0.0.1:8787)
app/src/screens/*           Login · ConnectFolder · ConnectProvider · SetupQuestions · Scoreboard
app/src/components/ui/*     copied-in shadcn-style primitives
runner/                     the Python runner: brief data, the eleven assertions, the HTML
                            brief, 127.0.0.1 server — the base the brief stage builds on
fixtures/sample-folder/     the invented test folder; develop against it
docs/design/onboarding-flow.png   the owner's drawing — normative for the v1 flow
```
