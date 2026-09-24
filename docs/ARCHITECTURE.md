# PK Secretary — Architecture (FINAL)

**Version:** 3.0 · **Written:** 24 September 2026
**Status:** 🟢 **AUTHORITATIVE.** This is the single "how" document. Build from this.

**The shape, settled: a desktop app with a bundled local runner.** v1.0 said Tauri GUI. v2.0
swapped to a browser UI + terminal-installed runner after seeing Grothendieck. v3.0 takes the
runner architecture from v2 — which was the right part — and puts a desktop app in front of it
instead of a browser and a terminal command. **§2 explains why, and why this is cheaper than it
looks.** Files, storage boundaries, the laws and the daemon are unchanged throughout.

**This document supersedes:**
- `PKSECRETARY-BUILD-PLAN.md` · `PK_SECRETARY_MVP_ARCHITECTURE_NOTES.md` · `projects/pk-secretary-web/HANDOFF.md`

⚠️ **Do not hand those to a build session.** They contradict this file and each other.

**Read with:** `PKSECRETARY-PRODUCT-SPEC.md` — the **what** (features, laws, invariants), still
authoritative for everything it covers. This is the **how**.

---

## 0. Document map

| Document | Role | Status |
|---|---|---|
| `PKSECRETARY-PRODUCT-SPEC.md` | What it is. §5 inventory, **§6 the 24 laws**, §8.4 the 5 invariants | 🟢 Authoritative |
| **`PKSECRETARY-ARCHITECTURE.md`** (this) | How to build it | 🟢 Authoritative |
| `LAWS.md` | The 24 laws as a runtime-loadable file | 🟢 Written |
| `docs/BRIEF-SPEC.md` | The brief, section by section, with its 11 verification assertions | 🟢 Written |
| `DECISIONS.md` | Answered and deferred decisions | 🟢 Written — **D1 still blank** |
| `CLAUDE.md` (repo root) | Build conventions, the process model, what not to build | 🟢 Written |
| `fixtures/sample-folder/` | The invented test folder, 15 planted failure cases | 🟢 Written |
| `PKSECRETARY-BUILD-PLAN.md`, ChatGPT notes, web HANDOFF | Reasoning records | ⚪ Superseded |

⚠️ **Repo paths:** in the product repo the spec is `docs/PRODUCT-SPEC.md` and this file is
`docs/ARCHITECTURE.md`. `BRIEF-SPEC.md` belongs in `docs/` too. `CLAUDE.md`, `START-HERE.md`,
`LAWS.md`, `DECISIONS.md` and `fixtures/` sit at the root.

---

## 1. Settled by convergence

Three independent analyses agreed on these. Treat as closed:

- **Next.js / TypeScript / React / Tailwind / shadcn-ui** for all UI
- **A local component is unavoidable** — a browser alone cannot do this job
- **The website must not own user files**; the local component does
- **De-personalise the existing repo first**
- **Onboarding + Morning Brief first**; validate with 3–5 real users
- **The folder is the product, not a feature of it**
- **Thin UI:** three screens — Morning Brief · Board · Settings. Nothing else.
- **The disappearance test:** *"if my servers vanish tomorrow, does the user lose their secretary?"* If yes, the architecture is wrong.

---

## 2. ⭐ The shape: desktop app + bundled runner

### Take the runner from Grothendieck. Don't take the terminal.

Grothendieck's onboarding is: web app shows **"Add a compute runner"** → copy `groth-runner connect gk_2844374…` → **run it in your terminal** → the runner starts locally (`127.0.0.1:9740`), detects installed AI CLIs (`claude`, `codex`, `cursor-cli`) and exposes them as models.

**The runner half is right and this document adopts it.** The delivery half is wrong *for this product*, for two reasons that outweigh the build savings:

**1. The terminal step excludes the entire target audience.** Spec §2 says who this is for: *"job hunters, freelancers, founders, graduate students, people managing a migration or a career change... high load, no assistant, too many open threads."* Not developers. `npm install -g` and a paste-this-token command is a hard stop for most of them. Grothendieck can assume a terminal because it sells to researchers and engineers; a chief-of-staff product cannot.

**2. A dock icon is a re-entry point. A browser tab is not.** Spec §11 names the real risk: *"Retention is the whole game. A secretary that is not opened for a week is dead, and there is no natural re-entry point."* An application you installed, that sits in the dock, that opens at login and lives in the menu bar **is** that re-entry point. A URL you have to remember to visit is exactly the failure mode the spec warns about.

v2.0 optimised for build cost. That was the wrong variable — it traded the product's audience and its retention story for roughly $99 a year.

### What it actually costs to go desktop

Much less than v1.0 claimed, because the runner does the hard parts:

| Concern | Answer |
|---|---|
| **Tauri's notification Actions API is mobile-only** | ⭐ **Irrelevant here.** Notifications come from the **runner** (`terminal-notifier` + detached-dialog fallback), which already does action buttons across 595 fires. The Tauri window is a viewer, not a notifier. The blocker that killed v1.0's stack is designed around. |
| **Apple Developer Program** | $99/yr. Real, and the only unavoidable new cost. |
| **Windows signing** | **Deferred.** Ship macOS-only to Mac-using friends first — already the recommendation, since Microsoft Artifact Signing is unavailable to you (US/Canada orgs, 3+ years, individual onboarding paused). |
| **Rust** | Near zero with v2 plugins. And CEMIS is already a Rust/axum/sqlx/SQLite project. |
| **Extra build time** | ~1 week, at the end, as a wrapper — not at the start, as a foundation. See the sequencing below. |

### ⭐ The sequencing that makes this cheap and keeps it reversible

**The runner and the UI are separable, so build them separately and decide the shell last.**

```
React + TypeScript frontend  ← ONE codebase, talks to 127.0.0.1
        │
        ├── during development: open it in a browser
        └── shipped: bundled inside Tauri          ← the product
                    ↓  HTTP / websocket to 127.0.0.1
        Local runner  (your Python daemon, extended)
                    ↓
        The folder
```

- Weeks 1–6 you build the runner and the frontend, and develop against a browser pointed at localhost. **No Tauri in the loop while you're doing the hard work.**
- Week 7 you wrap the same frontend in Tauri. The React code does not change — it was always talking to `127.0.0.1`.
- If Tauri fights you, you ship the browser version to the first two friends and wrap it later. **Nothing is wasted either way.**

### ⭐ And the desktop app fixes Grothendieck's worst step

**The app installs and pairs the runner itself.** The user downloads one `.dmg`, opens it, and the app starts the bundled runner as a sidecar and pairs it locally. No terminal, no token to copy, no `npm install`.

That is strictly better onboarding than the pattern you're copying — and it's the difference between a product your friends can use and a product only the technical ones can.

**Revised onboarding:** download → open → pick folder → connect AI → five questions → first brief.

### The disappearance test, passed outright

Because the frontend is bundled and the runner is local, **nothing needs your server to work.** Server down: notifications fire, the brief renders, the close runs, the folder is intact. Only account and update checks stop. Spec invariant #1 holds by construction, not by promise.

### Scope control — a caution about what you're copying

The reference shows **"Full access"** in its status bar. Don't copy that default. **The runner is scoped to the chosen folder and nothing else**, enforced in the file tools by path prefix, with the scope visible in the UI. A secretary that can read the whole disk is a very different security proposition from one that can read one folder, and the second is the one people will hand their life to.

---

## 3. 🔴 The credential question — corrected, with the nuance that kept getting lost

This has been answered differently in **four** sessions. Here is the verified position, and the distinction that resolves the disagreement.

### The distinction: who holds the credential

| Pattern | What happens | Status |
|---|---|---|
| **A. Hosted proxy** — your server holds the user's OAuth token and calls the provider | You collect, store and intermediate the credential | 🔴 **Prohibited.** Anthropic's docs: no routing through Free/Pro/Max credentials on a user's behalf; developers **may not collect, store or intermediate Claude.ai credentials or session tokens** |
| **B. Local CLI invocation** — the user installs and authenticates the vendor's own CLI; your runner shells out to it on their machine | You never see the credential. It stays in their `~/.claude`. You orchestrate a tool they already have | 🟡 **Grey zone, materially more defensible** — and shipping in production today |
| **C. Bring-your-own API key** | User pastes a key; it lives in their OS keychain; calls go direct | ✅ **Permitted, unambiguous** |

**My earlier blanket "the harness is prohibited" was right about A and overstated about B.** Correcting it.

**Why B is more defensible:** everything happens on the user's machine, the user installs and authenticates the CLI themselves, and your product never receives, stores or transmits the token. That is closer to a shell script than to a proxy. **Why it is still a grey zone:** Anthropic's stated intent is that subscription OAuth supports *"ordinary use of Claude Code and other native Anthropic applications,"* and that developers building products *"should use API key authentication."* Local orchestration isn't clearly on either side of that line.

⚠️ **The residual risk is real and it is not yours to control.** Anthropic changed terms in Feb 2026 and enforced in April. Google enforced against proxied Gemini CLI tokens in Feb and deprecated consumer Code Assist OAuth in June. If a provider decides local orchestration counts, your product breaks for every user of that provider, overnight, with no notice.

### ✅ The decision: support both, from day one

```
authKind: "local_cli" | "api_key"
```

- **`local_cli`** — detect installed CLIs (`claude`, `codex`, `gemini`), invoke as subprocess. The headline path, the one that demos the vision, zero marginal cost to the user.
- **`api_key`** — keychain, direct calls. The fallback that keeps the product alive if a policy moves, and the only option for users who don't want a CLI.

**Building only the CLI path bets the company on someone else's policy. Building both costs maybe three extra days.** Make the auth method a property of the provider record, never an assumption in the schema.

⚠️ **Correction to your own files:** `projects/pk-secretary-web/HANDOFF.md` records OpenAI as ✅ for third-party subscription OAuth — *"shipped a Sign in with ChatGPT OAuth flow in March 2026"* — and says to build OpenAI first. **No such developer OAuth product exists.** `codex login` charges the ChatGPT plan but is for Codex CLI, the IDE extension and Codex Cloud. "Login with ChatGPT for developers" is an open feature request. That file is banner-corrected.

📌 **Re-verify all three providers before writing auth code.** This surface moved three times in 2026.

### 💡 Ask Nahum

He built the runner half of this and he's a friend — Telegram `@nahum_nm`. Worth asking: **how the runner detects and invokes the installed CLIs** (the single most useful thing he knows), how he handles a CLI that's installed but not authenticated, what broke in the runner that he didn't expect, and what his read is on the terms question. Thirty minutes with him is worth more than any amount of research here.

---

## 4. The architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  USER'S MACHINE — everything real lives here                         │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ THE FOLDER (user picks it)            ← SOURCE OF TRUTH        │  │
│  │   MASTER-PLAN.md · DAY-STATE.md · LOG.md · CORRECTIONS.md      │  │
│  │   LAWS.md · SETUP-BACKLOG.md · reminders.json · config.json    │  │
│  │   briefs/ · archive/ · .git/  ← auto-commit after every write  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│      ▲ atomic writes + lock          ▲ watch for hand-edits          │
│  ┌───┴───────────────────────────────┴──────────────────────────┐   │
│  │  THE DESKTOP APP  (Tauri — the shell, the dock icon)         │   │
│  │    React + TS frontend: Brief · Board · Settings              │   │
│  │    Bundles the runner · quit the app and nothing is resident  │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
│                              │ HTTP / websocket · 127.0.0.1          │
│  ┌───────────────────────────▼──────────────────────────────────┐   │
│  │  THE RUNNER  (your Python daemon, extended — sidecar)         │   │
│  │    • Scheduler — brief · close · 60s tick · catch-up          │   │
│  │    • Notifications WITH action buttons (terminal-notifier)    │   │
│  │    • Agent harness — prompt assembly, tool loop, LAWS         │   │
│  │    • Inference: local CLI subprocess  OR  API key             │   │
│  │    • Renders the brief as standalone HTML                     │   │
│  │    • SQLite index (app data, NOT the folder)                  │   │
│  │    • Scoped to the chosen folder. Nothing else.               │   │
│  └───────┬──────────────────────────────────────┬───────────────┘   │
│          │                                       │                    │
│  ┌───────▼────────────┐              ┌──────────▼─────────────────┐  │
│  │ WATCHDOG           │              │ THEIR AI                    │  │
│  │ launchd, hourly    │              │ claude / codex CLI (local)  │  │
│  │ "did 09:00 happen?"│              │  — or — direct API w/ key   │  │
│  └────────────────────┘              └─────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ account + updates only · no life data
                ┌──────────▼──────────────────────────┐
                │  WEBSITE (Next.js on Vercel)        │
                │   marketing · download · docs       │
                │   account · licence · update feed   │
                │   ← breach here leaks nothing       │
                └─────────────────────────────────────┘
```

### 4.1 Onboarding order

1. **Download and open the app** — the bundled runner starts and self-pairs. No terminal.
2. **Pick the folder** — with a sync-folder warning (§5)
3. **Connect AI** — detected local CLIs listed first (`claude`, `codex`), "paste an API key" as the alternative
4. **Five-question setup interview** → writes `MASTER-PLAN.md` + `DAY-STATE.md`
5. **First brief within 24 hours**

Sign-in is optional and can come later — see §6. Nothing in steps 1–5 requires an account.

### 4.1a 🔴 The process model — and what this project explicitly does not use

**No Docker. No Kubernetes. No containers. No message queue. No microservices. No always-on
server process of any kind.**

This is worth stating explicitly because it is the default reflex for anything called "a
product", and every one of them is wrong here:

| Tool | Why not |
|---|---|
| **Docker** | Solves reproducible *server* environments. This runs on the user's Mac. You cannot ship a container runtime to someone who wants a secretary — and the daemon is dependency-free Python precisely so it doesn't need one. *(Later, optionally, for CI builds. Never for the product.)* |
| **Kubernetes** | Orchestrates many containers over many machines. You have one static site and one local process per user. There is nothing to orchestrate. |
| **A queue (Redis/SQS/Celery)** | Solves distributing work across workers. The work is one user's day, on their own machine, once. `launchd` is the queue. |
| **A backend service** | The server holds an account row and an update manifest. That is a static site with one route. |

**The whole point of the architecture is that no server is load-bearing.** Adding infrastructure
re-centralises what was deliberately decentralised, and breaks the disappearance test in §1.

#### What actually runs on a user's machine

| Process | When | Resident? |
|---|---|---|
| **launchd tick** — 60s reminder check | Every 60s, works, **exits** | ❌ Not a process 99% of the time |
| **launchd watchdog** — "did 09:00 happen?" | Hourly, **exits** | ❌ No |
| **Job processes** — brief, nightly close | Spawned by the tick, **exit** | ❌ No |
| **The runner** | Spawned by the app, **dies with the app** | Only while the app is open |
| **The app** | While open | Visible in the dock |

**Quit the app and nothing of ours is resident.** Two registered launchd timers remain, and a
registered timer is not a running process.

⚠️ **The runner must not become a permanently-resident menu-bar daemon.** Scheduled work is
spawned by the tick and does not need the app open, so residency buys nothing — and it *costs*
crash resilience. A fresh process per tick means a crash costs one tick; a resident process that
dies is dead until someone notices, which is the failure mode this system already has and is
trying to remove.

#### The findability requirements

A user hands this system their whole life. If it leaves processes they cannot account for, the
trust story is dead regardless of how good the brief is.

- **User-level only.** `~/Library/LaunchAgents/`, never `/Library/LaunchDaemons/`, never `sudo`,
  never a system extension.
- **Processes carry the product name**, so `ps`, Activity Monitor and `pkill -f <name>` find
  them. A bare `python3` in someone's process list is the thing being avoided.
- **`<name> status` · `<name> logs -f` · `<name> stop`** — the same three commands the
  Grothendieck runner exposes, and for the same reason.
- ⚠️ **`stop` must `launchctl unload`, not just kill.** `pkill` alone kills the current tick and
  launchd restarts it 60 seconds later. If `stop` doesn't unload, the first user who tries to
  stop it concludes it cannot be stopped — and they'd be right.
- **Uninstall unloads the jobs, deletes the plists and removes app data.** It leaves the user's
  folder alone, and says so first.

**Acceptance test, automated:** install → `stop` → **zero** of our processes in Activity Monitor,
nothing restarts within five minutes → uninstall → `~/Library/LaunchAgents/` is clean.

### 4.2 ⭐ The daemon stays Python, and stays separate

**The runner is your existing daemon, extended.** 830 lines, 595 fires, zero rewrites — spec §13's standing rule upheld. You keep, for free:

- **Working notification action buttons.** `terminal-notifier` and the detached-dialog fallback already do this. Spec §5.2 calls actionable notifications *"the feature that turned notifications from signposts into shortcuts."*
- **Per-tick crash resilience** — `launchd` re-invokes every 60s; a crash costs one tick.
- **Live timezone re-basing** — spec §5.2's timezone-following works *because* each tick reads local time fresh. Law 5 exists because a machine was two hours out for weeks.

⚠️ **Keep the tick process separate from the long-lived runner process.** Merging them loses all three properties above and breaks the two-party heartbeat below.

### 4.3 ⭐ The watchdog — why two parties are required

Spec §4: the daemon writes `.agent-heartbeat.json`; a **separate** party reads it. That is the only mechanism distinguishing *"the user ignored it"* from *"nothing ever reached them"* — **invariant #5** and **law 14**.

A single process cannot report its own crash. Merging scheduler, agent and UI would rename your highest-severity gap, not close it. **The watchdog is ~40 lines under `launchd`, hourly: did today's 09:00 artefact appear? If not, notify.**

### 4.4 ⚠️ The agent harness — the part every draft under-scoped

The Vercel AI SDK gives you `generateText` and normalised tool-calling. That is perhaps 20%. You still need:

- Skill loading and selection · system-prompt assembly from state files
- A tool loop with **turn limits** · file tools with **path scoping**
- Structured-output validation, retry, backoff
- **Mechanical assertion of the laws on output**

**2–3 weeks, and it is the part that *is* the product.** A law enforced only by prompt is a suggestion. `LAWS.md` loads into the system prompt **and** the assertions in §8 run on output. Both.

*(For `local_cli` providers, the CLI brings its own loop and tools — so the harness is thinner there but the law assertions still run on output. Design the provider interface so both shapes fit.)*

---

## 5. Storage

### Tier 1 — the user's folder (everything real)
- `DAY-STATE.md` — rewritten nightly; prior version to `archive/day-state/YYYY-MM-DD.md`
- `LOG.md` — current quarter live; older to `archive/log/2026-Q3.md`
- ⭐ **`CORRECTIONS.md` — its own append-only file, never pruned.** Spec §5.1 nests it inside DAY-STATE, which an LLM regenerates nightly. That is how law 1's enforcement quietly evaporates. **Move it out.**
- **Atomic writes** — temp file + rename, never in place
- Read-modify-write with re-read-and-diff + advisory lock
- **Git auto-commit after every write** — hours of work; buys history, undo, diffs

⚠️ **Sync folders are hostile.** iCloud "Optimize Storage" **evicts files to placeholders** — the 09:00 read returns a stub. Dropbox writes `conflicted copy` files, forking your source of truth silently. Lock files sync and become permanent stale locks. SQLite on a synced folder corrupts. macOS TCC-prompts on `~/Documents`, `~/Desktop`, iCloud Drive.
**→ Detect known sync paths at folder-pick and warn. Keep SQLite, locks and logs in app data.**

⭐ **A file watcher is mandatory.** Spec §4's first justification for files is *"the user can read and edit everything without the system running."* A lock protects app-vs-app; a human in a text editor doesn't take your lock. Without watch-and-reload you clobber their edits.

### Tier 2 — credentials
API keys in the **OS keychain** (`keyring` — macOS Keychain / Windows Credential Manager). CLI tokens are never yours: they stay wherever the vendor's CLI puts them.

### Tier 3 — SQLite, in app data (derived, disposable)
Search index, board items, people lane, FTS. Rebuilt from the folder in one pass. **Don't index `reminders.json`** — read the schedule from the file at tick time. A second copy of the schedule is the exact shape of spec §7's "calendar drift."

### Tier 4 — your server

**In v1 there is no account, so this tier is almost empty:** the current version and the signed update manifest, and that is all.

✅ **When accounts arrive with billing, store:** account id, email, auth subject · plan and subscription status · device registrations (install id, OS, app version, last-seen) · **opt-in, off by default:** anonymous event names and counts.

🚫 **Never store:**
❌ Content from DAY-STATE, MASTER-PLAN, LOG, CORRECTIONS, backlog · ❌ reminder **titles or messages** — *"Call the lawyer about the visa"* is the whole problem in six words · ❌ people-lane entries (third parties, never consented) · ❌ any API key or CLI token · ❌ any prompt or completion · ❌ observance data — **GDPR Art. 9 special category** · ❌ calendar or email content · ❌ file paths (they contain the user's real name) · ❌ precise location — observance needs lat/long; compute and keep it on device

⚠️ **Keep it this way as features arrive.** The temptation later will be to round-trip something through the server for convenience — rendering the brief, syncing between machines, "just the reminder titles" for a mobile push. Each one moves a user's life onto your infrastructure. If sync ever becomes necessary, move **ciphertext you cannot read**, not plaintext.

**The test for every feature:** *if the database leaked tomorrow and was posted publicly, would any user be harmed or embarrassed?* Must stay no.

### Export and deletion — week one
- **Export:** the folder *is* the export. Invariant #1, honestly satisfied.
- **Delete account:** wipes your rows; their folder stays on their disk — say so in the UI.
- **Privacy policy:** *"We store your email and whether you've paid. Your secretary's data never leaves your computer. Your AI provider sees your prompts; we never do."* Write it yourself.

### 🔐 Two security rules for the repo
1. **No action target may originate from model output.** The agent writes `reminders.json`; law 21 says shell commands come from "the user's own config." Combined, that's a laundering path: injected content → model → config → execution. **No shell actions in v1**, and when they return, user-authored at authoring time. A security boundary, not a scope cut.
2. **All file, web and connector content enters the prompt explicitly marked untrusted** (law 23). Injection has already been attempted against this system once.

---

## 6. Stack

| Layer | Choice |
|---|---|
| App shell | **Tauri v2** — dock icon, autostart, updater, bundles the runner as a sidecar. 10–15 MB vs Electron's ~150 MB. ⚠️ Not menu-bar resident — see §4.1a |
| **Infrastructure** | **None.** No Docker, no Kubernetes, no queue, no backend service. `launchd` is the scheduler; a static site is the server. See §4.1a |
| Frontend | **React + TypeScript + Vite** — one codebase, talks to `127.0.0.1`. Runs in a browser during development, bundled in Tauri when shipped |
| UI | **Tailwind + shadcn/ui** — ⭐ components are **copied into your repo**, not installed: you own and restyle them, upgrades break nothing. Radix underneath, so keyboard and screen-reader behaviour is right for free. Everything is a CSS variable — a full re-theme is one file. |
| Runner | **Your Python daemon, extended** — scheduler, notifier, harness, brief renderer. Shipped as a Tauri sidecar |
| **Notifications** | **The runner**, via `terminal-notifier` + detached-dialog fallback. ⚠️ **Not Tauri's notification plugin** — its Actions API is mobile-only |
| Provider layer | **Vercel AI SDK** for `api_key`; subprocess invocation for `local_cli`. `authKind` is data |
| Watchdog | ~40 lines, launchd hourly |
| Secrets | **`keyring`** (macOS Keychain / Windows Credential Manager) — not Tauri Stronghold, which needs a password you supply and lands the secret in a file |
| Versioning | **Git auto-commit on the folder** |
| Local index | SQLite, in app data |
| Website | **Next.js on Vercel** — marketing, download, docs, update manifest |
| Auth | **None in v1.** Nothing on the server needs an identity yet. Add it with billing, and don't hand-roll it then (Supabase Auth / Clerk / Auth.js) |
| Updates | Tauri updater + GitHub Releases. Wire it week one |
| Payments (later) | **Lemon Squeezy / Paddle** — merchant-of-record, they handle global VAT. Stripe direct puts tax compliance in 40 jurisdictions on you personally |
| Errors | Local log file the user can send. Not Sentry in v1 — stack traces carry real paths |

### ⭐ You are not starting over

| Layer | Status |
|---|---|
| **Runner — Python** | ✅ **Already built.** 830 lines, 595 fires. Background scheduling is what Python is good at, and this is the part that must not be rewritten |
| **Frontend — TypeScript / React** | ✅ **Already shipped.** The embassy document generator ran Flask + Next.js/TS + PostgreSQL in production for over a year. React in Tauri is the same JSX, hooks and Tailwind |
| **SQLite** | ✅ Familiar from CEMIS (axum/sqlx/SQLite) |
| **New** | Tauri's project structure, enough Rust to register plugins, and the agent harness |

**On "can I build a Mac app with Python?"** — technically yes (PyInstaller, py2app), but it's a poor path for a GUI in 2026. **You don't need to: the Python you have is a background daemon, and it stays Python as the sidecar.** The window around it is TypeScript, which you already write.

**Escape hatch:** if Rust fights you, ship the browser-pointed-at-localhost version to your first two friends and wrap it in Tauri later. The frontend is identical either way — nothing is wasted.

---

## 7. Build order

**Success:** *one person who is not you runs it for 14 days without you touching their machine.*

⭐ **Tauri enters in week 7, not week 1.** Weeks 1–6 you build the runner and the frontend and develop against a browser on `127.0.0.1`. That keeps the shell decision reversible right up until the end, and keeps the hard work uncontaminated by packaging.

| Week | Work |
|---|---|
| **0** | Answer `DECISIONS.md` **D1 (the name)**. **Buy the Apple Developer account** — approval isn't instant and week 7 depends on it. |
| **1** | **Name it** (domain, GitHub org, bundle id). React + Vite + Tailwind + shadcn skeleton. ⭐ **Milestone: a window on screen rendering today's brief from `fixtures/sample-folder`.** Read-only, no scheduler, no notifications — just the product, visible. |
| **2** | Runner: folder picker + sync warning, **scope enforcement by path prefix**, atomic writes, advisory lock, file watcher, git auto-commit. `schema_version` + migrations. |
| **3** | Provider layer both ways — detect local CLIs, and API key in keychain. **One real completion through each path.** Cost ceiling. |
| **4** | Scheduler + notifications with working action buttons + catch-up + watchdog. **Daemon test suite written.** |
| **5–6** | **Agent harness** — prompt assembly, tool loop, turn limits, path scoping, law assertions, eval harness. |
| **7** | **Wrap in Tauri.** Bundle the runner as a sidecar, autostart, menu bar, updater, sign and notarise. Morning Brief wired to real state. Nightly close behind the verification gate. Onboarding interview. |
| **8** | Clean-machine install from a `.dmg`, ship to 2 friends, watch over a call. Log every friction point. |

**~8 weeks.**

### Cut from v1
❌ Windows (defer — signing is unavailable to you; ship macOS-only first) · ❌ accounts/auth · ❌ mobile · ❌ messaging bot · ❌ Gmail/Calendar (restricted scopes trigger Google's CASA: ~$540–1,000+, 4–12+ weeks, annual re-verification) · ❌ people lane · ❌ billing · ❌ constitution-editor UI (laws are markdown; open them in an editor) · ❌ Sentry

---

## 8. Three gates that must exist before shipping

**1. The nightly close verification gate.** An unsupervised LLM rewriting your single source of truth every night is the highest-risk operation in the product. Write to a candidate file → diff against current → assert mechanically (**CORRECTIONS.md intact and not shorter; nothing marked DONE is now open; item count within bounds; every referenced path exists**) → only then commit. Never write DAY-STATE directly.

**2. The brief's verification assertions.** Spec §5.4 requires: JS extracted and syntax-checked, block coverage asserted contiguous 00:00–24:00, dial geometry spot-checked at three clock positions, current-block lookup asserted against a known time, every referenced path asserted to exist. These are **data assertions, not view concerns** — a rewrite would silently drop them. Keep the self-contained HTML generator; it is also what makes the offline fallback work. *"A brief that renders wrong is worse than no brief."*

**3. The law eval harness.** Five golden cases minimum: brief contains ≤3 items · nothing marked done in LOG reappears · an empty metric renders a dash **with a reason** · every board item carries WAIT or CHASE with a date · a mute without a dated un-mute is rejected (law 24). **Run on every prompt change and every model version bump** — spec §11 risk 4 names model changes breaking prompt behaviour, and this is the only defence.

### The daemon test suite (before porting anything, ever)
1. Catch-up fires ≤20 min late and labelled; older dropped · 2. Bootstrap suppression on first run · 3. Never fires twice (keyed by reminder + date, pruned at 7 days) · 4. No stale heads-up · 5. Fails loudly on malformed config · 6. Timezone-following off live system time, **plus a DST-boundary test** · 7. `monthly` `day: -1` across 28/29/30/31-day months

Same for the observance module's three-tier precedence and dated location override — already broken in production once.

### Cost control, not just a meter
Max turns per run · max tokens per run · hard monthly ceiling with defined behaviour at the cap · 429 backoff · context-overflow handling as DAY-STATE grows.
⚠️ **Per law 14:** a run that fails because a key is out of credit is a **system failure to report**, not a silent skip.
⚠️ **Publish no cost figure yet.** An agent loop re-sends context every turn, so billed tokens run roughly an order of magnitude above content tokens. **Measure your live system for 7 days first.** Asserting a number before then breaks law 4.

---

## 9. 🔴 Supporting documents still needed

All five documents are written. What remains are **owner actions**, not documents:

| # | Blocker | Status |
|---|---|---|
| 1 | **`DECISIONS.md` D1 — the product name.** Gates the repo, domain, bundle id, every import path, and the terminal-notifier bundle id (see 9.1) | 🔴 **Blank. Nothing starts without it.** |
| 2 | **Locate the reference daemon.** The 830-line implementation that "ships as a sidecar, unchanged" was not found on the build machine. Week 4 cannot proceed without the original — a reimplementation from the docs is a test seed, not a substitute | 🔴 **Not found** |
| 3 | Apple Developer Program | ⬜ Buy now — approval isn't instant, week 7 depends on it |
| 4 | 7-day token measurement on the live system | ⬜ So §8's cost question has a real answer |
| 5 | Thirty minutes with Nahum (§3) on CLI detection and invocation | ⬜ |

### 9.1 🔴 Verified by spike, 2026-09-24 — notification delivery

A spike against a Python sidecar confirmed three working action buttons, non-blocking dispatch,
and that `terminal-notifier` 3.1.0 is on the modern `UserNotifications` framework rather than the
removed `NSUserNotification`. Four findings the port must carry:

**1. ⚠️ macOS alert style must be `Alerts`, and the app must verify it.**
Run under the macOS default (`banners`): **0 of 3 buttons usable.** Buttons hide behind a hover
chevron on a banner that auto-dismisses, so the natural click hits the body and returns
`@ACTIONCLICKED` — **which does not say which action it was.** Under `alerts (stay until
dismissed)`: 3 of 3, each returning its exact label.

This **cannot be set programmatically** — the authorisation lives in the UserNotifications store,
not `com.apple.ncprefs`. So **onboarding must walk the user through setting it**, and startup
must verify it via `terminal-notifier -diagnose`, which prints the alert style machine-readably.

🔴 **This lands on law 14.** A brief whose buttons were never reachable is an undelivered
instruction. **The heartbeat must carry the alert style, not just the fire count.**

**2. `@ACTIONCLICKED` is not a button press.** The protocol has four outcomes — a label,
`@ACTIONCLICKED`, `@CLOSED`, `@TIMEOUT` — and only a label identifies an action. Treating
`@ACTIONCLICKED` as "they pressed the first button" fires an action the user never chose:
**law 21 violated by a parsing shortcut.** It means *seen, nothing chosen*.

**3. One notification buys one press.** The first press consumes it; there is no way to press a
second button. The standing rule (every reminder ships with at least one button) is unaffected,
but nothing may assume three buttons means three available actions.

**4. `-sender` and `-appIcon` are removed in 3.1.0.** Notifications otherwise show
terminal-notifier's name and icon rather than the product's. The fix is shipping your own copy of
the `.app` under your own bundle id — **which needs D1.** `-ignoreDnD` is also a no-op without an
Apple entitlement.

---

## 10. Shipping

| Item | Cost | Note |
|---|---|---|
| Domain | ~$12–15/yr | ⚠️ Name it first — gates repo, domain and bundle id |
| Vercel | $0 | Marketing, download, docs, update manifest |
| **Apple Developer Program** | **$99/yr** | ⚠️ **Buy it in week 0.** Unsigned apps get "damaged and can't be opened" on modern macOS — a refusal, not a warning. ⚠️ **macOS 15 Sequoia removed the Control-click → Open bypass**, so the old workaround for unsigned builds no longer exists. Approval isn't instant. |
| GitHub Releases | $0 | `.dmg` + signed `latest.json` |
| Windows signing | **Deferred** | Microsoft Artifact Signing is unavailable to you (US/Canada orgs, 3+ years, individual onboarding paused). A standard OV cert is ~$200–400/yr when you need it. ✅ **Don't buy EV** — since 2024 it no longer bypasses SmartScreen, so it buys nothing over OV. |

**Total to first user: ~$115.** That is the entire premium over the browser-and-terminal route, and it buys you an audience who will never open a terminal.

**Pipeline:** `git tag v0.1.0` → GitHub Action builds, signs, notarises → publishes to Releases with a signed manifest → running apps self-update. Build it in week 7 alongside the Tauri wrap.

---

## 11. Verified facts

| Claim | Source |
|---|---|
| Anthropic prohibits third parties routing through Pro/Max credentials and collecting/intermediating Claude.ai tokens; products should use API keys | Anthropic / Claude support docs |
| ChatGPT Plus ≠ API access; `codex login` is first-party Codex tooling; no third-party developer OAuth product | OpenAI help centre; openai/codex issue #10974 (open feature request) |
| Google enforced against proxied Gemini CLI OAuth tokens | Google / reported enforcement |
| Tauri v2 notification **Actions API is mobile-only** | Tauri v2 plugin docs |
| Vercel Cron: Hobby = once/day; Pro = per-minute | Vercel docs |
| Gmail restricted scopes require CASA: ~$540–1,000+, 4–12+ wks, annual renewal | Google identity docs |
| Microsoft Artifact Signing: US/Canada orgs, 3+ yrs; individual onboarding paused | Microsoft Learn |
| EV certs no longer bypass SmartScreen (2024) | Microsoft Learn |
| macOS 15 Sequoia removed the Control-click → Open bypass | Apple platform behaviour |

---

*The laws in spec §6 are fixed. Everything here is the mechanism for keeping them true in a system other people run. Nothing in this document is product-facing copy — the anonymisation rule binds the repo, the README, the website and all onboarding.*
