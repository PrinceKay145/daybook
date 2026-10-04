# The app

Electron shell + React 19 + TypeScript + Vite + Tailwind 4 (shadcn-style components,
copied into the repo, not installed). The current build is the **onboarding stage from
the owner's drawing** (`docs/design/onboarding-flow.png`):

```
Login / Sign-up  →  Connect a folder  →  Connect your AI provider  →  Setup questions  →  Scoreboard
   (Supabase)        (the secretary's      (key → OS keychain,          (answers written        (home screen;
                      whole world)         or a detected local CLI)     into the folder)        sample data for now)
```

Subsequent launches go straight to the scoreboard.

**The renderer never imports Electron or Node APIs.** It talks to `127.0.0.1` and to the
small `window.daybook` bridge (`electron/preload.cjs`), and it still runs in a plain
browser tab with graceful fallbacks (`src/lib/daybook.ts`). That boundary is the one rule
in this directory worth protecting: it is what keeps the shell swappable.

## Running it

```bash
cd app
nvm use        # Node 22 — the pinned Electron needs it for install (see .nvmrc)
npm install
npm run dev    # Vite on 127.0.0.1:5173 + the Electron window
```

- **The brief needs Python 3.9+.** The app starts `runner/` itself when the scoreboard
  opens, with the first Python it finds (Homebrew, python.org, pyenv, conda, or the
  developer tools' `/usr/bin/python3` — only when those tools are really installed, since
  otherwise that path just opens an install dialog). Without one, the scoreboard says so.
  The packaged app carries its own (below). The runner's log in development:
  `~/Library/Application Support/daybook-app/logs/runner.log`.
- `npm run dev:web` runs the UI in a plain browser tab (folder, keychain and outbound
  links refuse politely — they need the shell). The scoreboard there reads a runner you
  start by hand on port 8787 (`runner/README.md`).
- `npm run build && npm run app:start` runs the production renderer inside Electron.
- `npm run typecheck` is the fast correctness gate.

## Building the tester install

```bash
cd app
npm run dist:mac    # → release/Daybook-0.1.0-arm64.dmg (and release/mac-arm64/Daybook.app)
```

- **It uses the real accounts project** from `app/.env` — Vite bakes `VITE_SUPABASE_URL` and
  the anon key into the bundle at build time (both are public by design).
- **Python is bundled.** `scripts/fetch-python.mjs` downloads one pinned build of
  python-build-standalone (3.12, Apple silicon), checks its SHA-256 against the digest
  recorded in the script, drops the parts the runner never uses (IDLE, Tk, pip) and
  unpacks it to `build/python-arm64/` (git-ignored, about 48 MB). The app uses it before
  any Python on the Mac — for the brief, for planning, and in the launchd jobs. No Python
  Daybook runs writes bytecode: a file written inside the app would break its signature.
- **runner/ and LAWS.md** are copied into `Resources/runner/` (the laws sit beside the
  package, where `plan.py` looks first).
- **Signed ad hoc, not by a developer account** (`mac.identity: "-"`): the signature is
  valid, so macOS offers "Open Anyway" instead of calling the app damaged. Gatekeeper still
  rejects it until it is notarized — the one-time approval is in `TESTERS.md`, the guide
  to send with the disk image. Notarizing needs an Apple Developer account (before any
  public release).
- **The installed app keeps its own app data** — `~/Library/Application Support/Daybook`,
  never the development copy's `daybook-app`. Both use the same launchd labels, so on one
  Mac whichever installed its jobs last owns them.
- **It must live in Applications.** Opened from Downloads or the disk image, macOS runs an
  unsigned app from a temporary copy that moves every launch, which would strand the
  launchd jobs; the app offers to move itself, and installs no jobs until it has.
- Apple silicon only for now; an Intel build needs `fetch-python.mjs x64` and an `x64`
  entry under `mac.target`.

## Accounts (Supabase)

The account is for **identity and licensing only**. No life data is ever sent — the
folder is the only place that knows anything about the user's week, and its contents
never leave it.

1. Create a free project at [supabase.com](https://supabase.com).
2. **Google provider** — Authentication → Sign In / Providers → Google, then either:
   - switch on **"Use Supabase-managed client"** if your project offers it — done; or
   - create your own OAuth client at [console.cloud.google.com](https://console.cloud.google.com)
     (type **Web application**) with:
     - JavaScript origin: `https://YOUR-PROJECT-REF.supabase.co`
     - Redirect URI: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
     - (`YOUR-PROJECT-REF` = the subdomain of your Supabase URL)
   and paste the Client ID + Secret into Supabase.
3. **URL Configuration → Redirect URLs: add both of these.** Supabase only sends a
   sign-in back to an address on this list; anything else falls back to the Site URL.
   - `http://127.0.0.1:5368?/auth/callback` — where **Google sign-in** returns: a
     listener the app opens on your own Mac for the one sign-in (ports 53680–53689; `?`
     matches one character).
   - `daybook://auth` — where the **confirmation email** returns, since that link can
     be opened long after the app stopped listening.
4. **Email** provider: enable. "Confirm email" can stay ON — sign-up then ends with a
   "check your inbox" notice and the first sign-in happens after clicking the mail link.
5. Copy Project URL + anon key into `app/.env` (see `.env.example`). Both values are
   public by design; the auth rules live in the Supabase project, not in secrecy.
6. Restart `npm run dev`.

Without a `.env`, the app runs in **developer mode**: the flow works end to end,
nothing is checked, and the login screen says so.

Google sign-in opens the system browser and returns to a listener on `127.0.0.1` that
exists only while that sign-in is in flight (RFC 8252's pattern for desktop apps). The tab
lands on "You're signed in to Daybook — you can close this tab", the app comes forward, and
the listener closes. A `daybook://` return would work too, but a browser cannot show a
page for a custom scheme, so the tab would be left spinning on Google's page.

**Keep "Confirm email" ON.** Supabase links identities sharing a *verified* email into one
user — with confirmation off, the same person can become two users (one via password, one
via Google), and nothing upstream prevents it. A duplicate sign-up attempt surfaces as
"An account with this email already exists" in the app.

**The confirmation link returns to the app.** Sign-up asks Supabase to redirect the
confirmation email to `daybook://auth`, so open the link on this Mac and the browser hands
the session back to Daybook. (Opened elsewhere, it confirms the account; then sign in.)

**Fresh-account test:** delete the user in the dashboard (Authentication → Users → ⋯ →
Delete). The open app notices at its next launch — it lands on login with a notice that
the account is gone. Sign up again with the same email: confirmation link first, then the
full onboarding from step 1. Everything on this Mac is keyed by the account's user id,
which a re-created account does not share with the deleted one.

**A first run without wiping your setup:** `DAYBOOK_USER_DATA` points the app at a
different app-data directory — session, settings and keys all live there.

```bash
VITE_DEV_SERVER_URL=http://127.0.0.1:5173 DAYBOOK_USER_DATA=/tmp/daybook-fresh npx electron .
```

(with `npm run dev:web` serving the UI on 5173).

## What is real vs sample

- **Real:** sign-up/sign-in, folder choice (persisted in app data), API-key storage
  (`safeStorage` → the macOS keychain), setup answers written into the chosen folder as
  plain files (`config.json` is merged, never clobbered; markdown seeds are only created
  if absent), and the model choice: Claude Code and Codex found on this Mac and asked
  whether they are signed in (fixed commands only — `claude auth status`, `codex login
  status`, `codex app-server` for its model list), Claude Code's model catalog, live
  model lists for API keys.
- **A folder used before:** step 3 asks whether to **use this setup** (the default — no
  file changes but the AI choice in `config.json`) or **start over** (the questions again;
  the old `SETUP-CONTEXT.md` and `MASTER-PLAN.md` move to `archive/setup/<time>/` first).
- **The scoreboard is today's real brief** — built from the folder by `runner/`, shown
  only when all eleven assertions pass, withheld (with the failed checks named) when one
  fails. No sample data anywhere.
- **The brief arrives on its own** — two launchd jobs, installed when the scoreboard opens
  (see below).
- **Not yet:** the secretary running on the chosen model — nothing here sends a prompt
  anywhere; every word of the brief comes from the folder.

## The background jobs — seeing and stopping them

| Job | Runs | Does |
|---|---|---|
| `app.daybook.mac.tick` | every minute, then exits | writes today's brief once its time (in `config.json`) has passed, if all eleven pass; notifies |
| `app.daybook.mac.watchdog` | hourly, then exits | notifies once if the tick has stopped or the brief is late |

They are user-level LaunchAgents in `~/Library/LaunchAgents` — no sudo — and run with
the app closed. **Settings & status** shows them and stops them; stopping removes their
files, so nothing returns at the next login, and the app won't restart them until you
press Start. From a terminal:

```bash
launchctl list | grep daybook
```

Logs (one place): `~/Library/Application Support/daybook-app/logs/` — `tick.log`,
`watchdog.log`, `runner.log`. The test copy of the app (`DAYBOOK_USER_DATA`) uses
`app.daybook.mac.test.*` labels and its own logs, so it never touches the real jobs.

## Where Claude Code and Codex are found

An app opened from the Dock gets a minimal `PATH`, so `electron/cli.cjs` also looks where
the installers put them: `~/.local/bin/` (Anthropic's and OpenAI's native installers),
`/opt/homebrew/bin/` and `/usr/local/bin/` (Homebrew), `~/.npm-global/bin/`, Volta, Bun,
and every Node version under `~/.nvm/versions/node/*/bin/` (newest first). An
`npm install -g` under nvm works, but it belongs to that one Node version — switch
versions and the CLI can vanish from the terminal, though Daybook still finds it. The
native installer is the steadier home.

## Troubleshooting the Google round-trip

The chain is: app → browser → Google consent → Supabase callback →
`http://127.0.0.1:5368x/auth/callback` (the app's listener) → app. Each hop fails
differently:

- **The browser opened but Google shows "Access blocked"** — the OAuth client is in
  Testing mode and your Google account is not on its test-user list (Google Cloud
  Console → Google Auth Platform → Audience → Test users).
- **Consent completed, then the browser lands on your Site URL (or a dead tab)** — the
  loopback address is not saved in Supabase (URL Configuration → Redirect URLs:
  `http://127.0.0.1:5368?/auth/callback`), so Supabase fell back to the Site URL.
- **"This sign-in link has already been used"** — the listener takes one sign-in and
  closes; choose Continue with Google again.
- **The confirmation email opens, browser silent, nothing in the app** — that link uses
  `daybook://auth`, the OS→app hop. Run `open 'daybook://auth?ping=1'` in a terminal
  while the app is open:
  - If the app shows *"the daybook:// handler works — the link carried no sign-in"*,
    delivery is fine and the earlier failure was at consent.
  - If nothing happens at all, macOS has no handler bound. Restart `npm run dev` (the
    app registers `daybook://` on launch and prints the registration result to its
    terminal), then check what the OS thinks: the app's diagnostics call
    `app.getApplicationNameForProtocol('daybook://auth')`.
- The app terminal logs every callback it receives (`auth callback via loopback: …` or
  `via open-url: …`), with the tokens withheld.

## Layout

```
electron/main.cjs      window, IPC: folder picker, atomic writes, keychain, settings,
                       daybook://auth delivery, https-only outbound links
electron/cli.cjs       Claude Code / Codex: find, sign-in state, Codex's model list
electron/runner.cjs    starts and stops runner/ for the brief; finds Python
electron/authLoopback.cjs  Google sign-in's one-shot 127.0.0.1 return listener
electron/schedule.cjs  the tick and watchdog launchd jobs: write, load, status, stop
src/screens/Settings.tsx  Settings & status: every job, the runner, logs, schedule, stop
electron/preload.cjs   the single doorway (contextBridge) — reviewable in one screen
src/lib/daybook.ts     typed bridge + browser fallbacks
src/lib/models.ts      the Claude Code model catalog (data — edit when models ship)
src/lib/dayShape.ts    the day's blocks, with the gaps filled as Unplanned
src/lib/api.ts         a browser tab's route to a runner started by hand
src/lib/auth.ts        Supabase client; dev-mode fallback; daybook://auth completion
src/screens/*          Login · ConnectFolder · ConnectProvider · SetupQuestions · Scoreboard
```


## Notes carried forward

- **Renderer stays shell-agnostic.** No `require('electron')` outside `electron/`. If the
  shell ever changes (Tauri remains a documented option), `src/` is untouched.
- **Atomic writes, always.** Every file the app writes (app data and the user's folder)
  goes through temp-file + rename.
- **No shell actions, no model-authored targets.** Nothing here runs a command on the
  user's behalf. The only programs the app runs are Claude Code and Codex, with commands
  fixed in `electron/cli.cjs`, no shell, and never an argument from model output.
- **Still ahead of packaging:** notarization (needs an Apple Developer account), a strict
  CSP (the dev warning in the console disappears at that point), Daybook's own notifier
  (notifications are credited to Script Editor), and an in-app uninstall.
