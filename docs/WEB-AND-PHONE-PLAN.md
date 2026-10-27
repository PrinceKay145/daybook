# Daybook on the phone: plan (draft, 27 Oct 2026)

Written after reading the repo as it stands: beta-1 is 18 commits ahead of main, 9 files
modified and uncommitted, 206 runner tests (1 failing in the uncommitted work), the only DMG
is from 5 Oct (before the design pass, the import and per-day planning).

## The idea in one line
Keep the Mac as the brain (the user's own Claude Code / Codex, their own folder). Add a
hosted web view of the day that works from any phone, laptop open or not.

## Why this fits the code you already have
- AGENTS.md: "the renderer never imports Electron or Node APIs ... runnable in a plain
  browser". The same React app can be deployed as a website.
- Supabase is already there for sign-in (S9).
- The runner already produces a verified brief (11 assertions) and a tick every minute.
- D4 stays intact: the unmodified `claude`/`codex` binary still runs only on the user's Mac.

## Phase 0: put the current build in hands (this week, 2 evenings)
1. Fix the failing test (`test_secretary`: the "wasn't found" message vs "didn't give an
   answer ... exit code 0").
2. Commit the 9 modified files; merge beta-1 into main.
3. Rebuild the DMG (`npm run dist:mac`): the 5 Oct one is stale.
4. Answer D7: name 2-3 Mac friends with Claude Code or Codex. Send TESTERS.md + DMG.
Nothing below should wait for this; it is the fastest real feedback you can get.

## Phase 1: read your day from the phone (week 1-2)
- On every brief write (and after each applied change), the runner publishes a **day
  snapshot**: the rendered brief data, the board, scoreboard, ticks.
- **End-to-end encrypted** before it leaves the Mac. The key is created on the Mac and
  given to the phone once by scanning a QR code in Settings. Supabase stores ciphertext
  keyed by user id, so the S9 leak test ("no harm") still holds.
- Web app: same renderer, deployed (e.g. Vercel). With no 127.0.0.1 runner, it reads the
  latest snapshot and shows "updated 07:58 from your Mac".
- Add to Home Screen (PWA manifest) so it opens like an app.

## Phase 2: update from the phone (week 2-3)
- Two kinds of update, decided by Daybook's code, not the model:
  - **Instant** (no AI): tick a habit, mark a task done, add a follow-up. Stored as an
    encrypted operation; the snapshot shows it straight away as "pending".
  - **Queued** (needs the model): the "tell your secretary" box. Encrypted, queued.
- The runner's minute tick pulls the queue when the Mac is awake, applies instant ops
  through the existing write path (atomic + git commit), runs queued messages through the
  existing propose/Apply flow, and publishes a new snapshot. The proposal can be applied
  from the phone.
- Mac asleep: the phone still shows the day and the pending items; they land on wake.

## Phase 3: tell me when it matters (week 3-4)
- Web push for "your brief is ready" and due follow-ups (delivered by the server from the
  snapshot's schedule, no AI needed).

## Decisions only you can make (D-items)
1. **D3 amendment:** allow an end-to-end encrypted day snapshot and update queue on the
   server (ciphertext only). Without this, the phone cannot see anything while the Mac sleeps.
2. **D7:** who the 2-3 testers are.
3. **D8:** free alpha (framed as alpha) or priced.
4. Before any public release: agree to Anthropic's Commercial Terms (D4 note).

## Not changing
Laws, folder-as-truth, no shell actions, no hosted model, no reading CLI credentials.
