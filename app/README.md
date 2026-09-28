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

- `npm run dev:web` runs the UI in a plain browser tab (folder, keychain and outbound
  links refuse politely — they need the shell).
- `npm run build && npm run app:start` runs the production renderer inside Electron.
- `npm run typecheck` is the fast correctness gate.

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
3. **URL Configuration → Redirect URLs: add `daybook://auth`.** Without it the browser
   sign-in cannot hand the session back to the Mac app.
4. **Email** provider: enable. "Confirm email" can stay ON — sign-up then ends with a
   "check your inbox" notice and the first sign-in happens after clicking the mail link.
5. Copy Project URL + anon key into `app/.env` (see `.env.example`). Both values are
   public by design; the auth rules live in the Supabase project, not in secrecy.
6. Restart `npm run dev`.

Without a `.env`, the app runs in **developer mode**: the flow works end to end,
nothing is checked, and the login screen says so.

Google sign-in opens the system browser and returns via the `daybook://auth` protocol
(registered by the app on launch; in dev it points at your local Electron binary).

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
  (`safeStorage` → the macOS keychain), local CLI detection (PATH scan only — nothing
  is executed), setup answers written into the chosen folder as plain files
  (`config.json` is merged, never clobbered; markdown seeds are only created if absent).
- **A folder used before:** step 3 asks whether to **use this setup** (the default — no
  file changes but the AI choice in `config.json`) or **start over** (the questions again;
  the old `SETUP-CONTEXT.md` and `MASTER-PLAN.md` move to `archive/setup/<time>/` first).
- **Sample:** everything on the scoreboard below the warning banner. The morning-brief
  pipeline that fills it for real is the next stage, owner-decided.

## Known gaps — fixed in the Connect-AI rebuild

- **Finding Claude Code / Codex.** Detection only scans `PATH`. That works under
  `npm run dev` (launched from a terminal) but not in a packaged app opened from the Dock,
  which gets a minimal `PATH`. It also misses installs inside a Node version manager: an
  `npm install -g` under nvm lands in `~/.nvm/versions/node/<version>/bin/`, and switching
  Node versions hides it. Anthropic's native installer puts `claude` in `~/.local/bin/`;
  Homebrew uses `/opt/homebrew/bin/` (Apple Silicon) or `/usr/local/bin/`. The rebuild
  checks those locations and the login shell's `PATH`, and asks each CLI whether it is
  signed in.
- **`keychain_ref` in `config.json`** still reads `provider/<id>`; API keys are now stored
  per account (`user/<id>/provider/<id>`). Nothing reads the field yet.

## Troubleshooting the Google round-trip

The chain is: app → browser → Google consent → Supabase callback → `daybook://auth` →
macOS → app. Each hop fails differently:

- **The browser opened but Google shows "Access blocked"** — the OAuth client is in
  Testing mode and your Google account is not on its test-user list (Google Cloud
  Console → Google Auth Platform → Audience → Test users).
- **Consent completed, then a dead browser tab** — the `daybook://auth` redirect is not
  saved in Supabase (URL Configuration → Redirect URLs), so Supabase fell back to the
  Site URL.
- **Consent completed, browser silent, nothing in the app** — the OS→app hop. Run
  `open 'daybook://auth?ping=1'` in a terminal while the app is open:
  - If the app shows *"the daybook:// handler works — the link carried no sign-in"*,
    delivery is fine and the earlier failure was at consent.
  - If nothing happens at all, macOS has no handler bound. Restart `npm run dev` (the
    app registers `daybook://` on launch and prints the registration result to its
    terminal), then check what the OS thinks: the app's diagnostics call
    `app.getApplicationNameForProtocol('daybook://auth')`.
- The app terminal logs every callback it receives (`auth callback via open-url: …`).

## Layout

```
electron/main.cjs      window, IPC: folder picker, atomic writes, keychain, CLI scan,
                       daybook://auth delivery, https-only outbound links
electron/preload.cjs   the single doorway (contextBridge) — reviewable in one screen
src/lib/daybook.ts     typed bridge + browser fallbacks
src/lib/auth.ts        Supabase client; dev-mode fallback; daybook://auth completion
src/screens/*          Login · ConnectFolder · ConnectProvider · SetupQuestions · Scoreboard
```

`src/lib/api.ts` and `src/types.ts` still mirror the runner's brief payload — unused in
this stage, kept for the brief pipeline that comes next.

## Notes carried forward

- **Renderer stays shell-agnostic.** No `require('electron')` outside `electron/`. If the
  shell ever changes (Tauri remains a documented option), `src/` is untouched.
- **Atomic writes, always.** Every file the app writes (app data and the user's folder)
  goes through temp-file + rename.
- **No shell actions, no model-authored targets.** Nothing here runs a command on the
  user's behalf; CLI detection checks presence on PATH and nothing else.
- **Packaging milestone:** electron-builder + notarization, a strict CSP (the dev warning
  in the console disappears at that point), and the `daybook stop` / process contract —
  all still ahead of us.
