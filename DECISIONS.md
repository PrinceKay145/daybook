# DECISIONS

**Purpose:** spec §14 lists questions only the owner can answer. Left inside a 540-line
document, a build session will either guess at them or stall. This file puts each one in one
place with an explicit answer — including *"deferred, don't decide this for me."*

**Rule for any build session reading this:** if a decision below is marked **DEFERRED**, you may
not decide it yourself, may not design around one option as if it were chosen, and may not ask
again mid-build. Build the part that is common to both options and leave a seam.

**Last updated:** 2026-10-05 · ⬜ = awaiting the owner

---

## 🔴 Blocking — the build cannot start without these

### D1. The product name
**Blocks:** domain, GitHub org, repo name, macOS bundle identifier, CLI name, every import path.
Renaming after the first commit is painful; after the first user it is worse.

**Shortlist:** Daybook · Adjutant · Sentry · Almanac · Majordomo · Steward · Cairn · Reveille · Understudy · Deputy · Firstlight · Plumb · (or keep PK Secretary)

**ANSWER:** ✅ Daybook (2026-09-27)

**Also fix at the same time:**
- Domain: ⬜ ______________________ *(check availability before committing to the name; the
  bundle id reads as `daybook.app` reversed, but it needs no working site)*
- GitHub org / repo: ⬜ ______________________ *(private — D2)*
- Bundle id: ✅ `app.daybook.mac` (2026-10-04). Permanent: macOS files the app's data folder,
  keychain items, notification and folder permissions, the `daybook://` handler and the
  launchd job labels under it — changing it after users install makes a different app. Set
  as `build.appId` in `app/package.json`.

---

### D2. Repository visibility from the first commit
**Blocks:** whether anything can be committed publicly, and whether the fixtures, the laws and
the daemon are readable by strangers on day one.

| Option | Consequence |
|---|---|
| **Open source (MIT/Apache)** | Anyone can fork it. The laws — the actual IP — become public. Good for trust and contribution, bad for differentiation. |
| **Source-available** | Readable, not freely reusable. Trust benefits, keeps the moat. |
| **Closed** | Simplest now. Can always open later; the reverse is not true. |

**Recommendation: start private and decide before the first public push.** Costs nothing, keeps
every option open, and "we opened it later" is a normal story while "we closed it" is not.

**ANSWER:** ✅ Private for now (2026-09-28). Whether it ever opens — and under which licence —
is decided before any public push.

**Before any public push, deal with** (checked 2026-10-04; fine for a private repo under the
owner's own account): every commit's author line carries the owner's real name and personal
email (GitHub's noreply address stops this for new commits; history keeps it unless
rewritten); the old working name "PK Secretary" — the owner's initials — runs through
`docs/` and twice here; and AGENTS.md rule 2 names the reference daemon's real path on the
owner's Mac. Nothing else in the files or history carries personal data.

---

## 🟡 Should be answered before week 3

### D3. Local-first, or server-side state?
**Spec §8.5 calls this "the one thing to decide early because it is architectural."**

`PKSECRETARY-ARCHITECTURE.md` **assumes local-first throughout** — the folder is the source of
truth, the server holds an account row and nothing about anyone's life. The reasoning: a breach
of a server holding DAY-STATE content ends a product whose whole pitch is trust, the observance
module would make you a controller of GDPR Art. 9 special-category data, and the people lane
holds data about third parties who never consented.

**Recommendation: confirm local-first.** If you disagree, say so now — the storage layer, the
sync story and the privacy policy all change, and changing it in month three means rewriting all
three.

**ANSWER:** ⬜ confirm local-first / ⬜ something else: ______________________

---

### D4. Does the `local_cli` path ship in v1?
Detecting an installed `claude` / `codex` CLI and invoking it as a subprocess is the path that
demos the original vision and costs the user nothing extra. It is also a **grey zone**: Anthropic
prohibits third parties routing through subscription credentials, and while local invocation
never touches the token, their stated intent is that subscription OAuth serves their own tools.
See architecture §3.

**Recommendation: ship both paths.** `local_cli` as the headline, `api_key` as the fallback that
keeps the product alive if a policy moves. Three extra days for insurance against an
externally-controlled single point of failure.

**ANSWER:** ✅ `local_cli` ships (2026-09-28), on the route Anthropic explicitly permits: the
end user signs in to the **unmodified** `claude` binary with their own subscription, through
Anthropic's own flow. The `api_key` path stays as built alongside it.

**What this commits the build to** (Anthropic's
[legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance), read
2026-09-28):
- Daybook runs `claude` exactly as published and never removes, disables or restricts any
  sign-in method built into it.
- Daybook never offers a Claude login of its own and never reads, stores or forwards Claude
  credentials or session tokens (`~/.claude`, its keychain entry). Not signed in → show the
  user `claude auth login` and let them finish in Claude Code's own flow.
- Usage bills to the user's own plan; Daybook never pays for, resells or intermediates it (S4).
- Daybook invokes the installed CLI directly, not through the Agent SDK — the same page tells
  Agent SDK builders to use API keys.
- "Claude Code" appears as plain text only — never in Daybook's name or logo, never implying
  endorsement.
- Codex is held to the same conditions until OpenAI states a policy of its own.
- ⏳ **Before publishing live:** the section this permission sits under says running Claude
  Code in a product requires agreeing to Anthropic's Commercial Terms. The owner agrees to
  them before any public release; the friends alpha proceeds without asking Anthropic.

---

### D5. Windows in v1?
Microsoft Artifact Signing is unavailable to you (US/Canada organisations, 3+ years of history,
individual onboarding paused). A standard OV certificate is ~$200–400/yr plus a hardware token.
Notifications, autostart and paths all differ and all will surprise you.

**Recommendation: defer.** Ship macOS-only to Mac-using friends, add Windows once the product
is proven.

**ANSWER:** ⬜ defer / ⬜ include — budget approved: £____

---

### D6. Does the religious timetable preset ship?
Spec §14 #6. This has changed shape since it was written: the architecture **generalises** the
module to "a daily-shifting, location-dependent schedule with source precedence," and the
fixture exercises it with a secular daylight schedule. So the engine ships either way.

**The remaining question is narrower:** does a prayer-timetable *preset* ship in the product,
with its three-source precedence and month-end timetable reminder?

It is the best engineering in the system and serves an audience nobody builds for. It is also
the most personal thing in it, and it will shape who thinks the product is for them.

**ANSWER:** ✅ **Not a default feature** (2026-10-04). Daybook's users will include Muslims and
Christians, so no faith's timetable is on by default or assumed: the generic daily-shifting
schedule engine ships, off until a user turns it on and sets it up for themselves. ⬜ Still
open: which traditions get a ready-made option (and whether any timetable is fetched from an
online source) — decide when the feature is built.

---

## ⚪ Not blocking — answer before week 8

### D7. How many alpha users, and who?
Sets the week 8 scope. Two is enough to learn from and few enough to support properly.
Spec §11 risk 2: the alpha's real job is finding out which laws are universal and which are
personal to one life.

**ANSWER:** ⬜ number: ____ · names: ______________________

### D8. Free for friends, or priced from the start?
Pricing at zero is hard to reverse. Free for the named alpha is normal and does not set a
precedent, provided it is framed as an alpha and not as "free".

**ANSWER:** ⬜ ______________________

### D9. Telemetry — on by default, or opt-in?
The architecture says **opt-in, off by default**. Anonymous event names and counts only; never
content. Slower learning, but consistent with a product whose pitch is "we never see anything."

**ANSWER:** ⬜ opt-in (recommended) / ⬜ on by default with a visible toggle

---

## ✅ Already settled — recorded so nobody reopens them

| # | Decision | Settled | When |
|---|---|---|---|
| S1 | **Desktop application**, not a website or a browser+terminal runner | Python daemon bundled as a sidecar runner. The terminal step excludes the audience in spec §2; a dock icon is a re-entry point where a browser tab is not. The shell is Electron (S8) — this row first said Tauri | 2026-09-24 |
| S2 | **Fully anonymised** product | No name, employer, city, institution, goal, faith detail or financial state from the owner's life enters the repo, README, website or onboarding | 2026-09-12 |
| S3 | **Do not rewrite the daemon** | Port only when the test suite is green and nothing is on a deadline | spec §13 |
| S4 | **Bring your own credential** | No hosted proxy of anyone's subscription. Ever. | 2026-09-24 |
| S5 | **The laws in spec §6 are fixed** | Everything from §8 on is negotiable; §6 is not | spec |
| S6 | **No shell actions in v1** | Security boundary, not a scope cut — the agent writes the config, so a model-authored action target is a laundering path | 2026-09-24 |
| S7 | ~~**No accounts in v1**~~ — **superseded by S9** | Nothing on the server needs an identity until billing exists | 2026-09-24 |
| S8 | **Electron shell** | The app was built on Electron (main process, preload bridge, React renderer). Tauri remains a documented option: the renderer never imports Electron or Node APIs, so the shell stays swappable (AGENTS.md) | 2026-09-27 |
| S9 | **Accounts in v1 — identity and licensing only** | Supabase sign-in (Google or email), supersedes S7. The server may hold account identity, licensing state and usage counters, never folder content, keys, prompts, paths or location; the leak test must stay "no harm" (product-requirements.md, "Accounts") | 2026-09-27 |
| S10 | **Folder access: write inside, read where granted** | The secretary reads, writes and edits inside the connected folder, changes subject to an approval mode the user sets (ask each time, or apply with git history and undo; deletes and whole-file replacements always ask). It may read other folders (Downloads, Documents, a chosen folder) only where the user granted read access in Daybook's UI, and never writes outside the connected folder. Enforced in code at four layers — UI-only grants in app data, Daybook's file tools, each CLI's own controls, a macOS sandbox — never by a prompt (architecture.md, "Folder access and approvals") | 2026-10-04 |
| S11 | **Reminders are a switch, off by default** | The reference reminder daemon joins Daybook as an opt-in feature: off until a user turns it on and sets it up. Before any of it enters the repo, every personal detail in it (name, initials, folder layout, city and travel, religious practice) is removed and becomes configuration — which overrides rule 2's "unchanged" for those lines. The known gaps it lives with today (an event missed across midnight is lost; daylight saving's skipped hour can drop a reminder; a crash re-sends a tick's notifications; a malformed file notifies every minute) are fixed while bringing it into Daybook, each behind a test. ⬜ Shell-command buttons vs rule 3: awaiting the owner | 2026-10-04 |
| S12 | **Beta 1 is one loop** | Tell it about your life, get a useful brief every morning, correct it in a sentence. Built: everything through Settings & status. Added, and nothing else: the user sets the size of today's list (law 8's number), the chosen model plans the day (it proposes as text, Daybook writes after the checks), one "tell your secretary" message box (also offered in setup), and a tester install with Python bundled. Waits for tester feedback: chat history, reminders (S11), read grants (S10's file tools), the automatic nightly close, daily-shifting schedules (D6), and API keys — built, but the beta runs on Claude Code and Codex only. A design and UI pass follows once the functionality is done (product-requirements.md, "Beta 1") | 2026-10-05 |

| S13 | **Bring it from another AI; numbers by message** | Setup can start from a handover written by the AI a person already uses: Daybook supplies the prompt, reads the answer itself (no model, nothing sent) into the setup form for them to check, and keeps the document as `HANDOVER.md`. The scoreboard and ticks are filled from the message box: the model reports a number with its source or a habit done; Daybook writes it after checking the metric is tracked, drops repeated values and unasked ticks, and counts ticks from `TICKS.md`. Both in Beta 1 at the owner's call (product-requirements.md, items 5–6) | 2026-10-06 |

---

*A decision recorded here in prose is not applied until the thing that actually reads it — the
config, the schema, the repo settings — has been changed to match.*
