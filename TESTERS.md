# Installing the Daybook beta

Thank you for trying Daybook. This is an early beta for a few friends — it works, it is
plain to look at, and your feedback decides what comes next.

## What you need

- **A Mac with Apple silicon** (M1 or later) on **macOS 12 or later**.
- **Claude Code or Codex, installed and signed in** — Daybook runs on the Claude or ChatGPT
  plan you already have, through them. Daybook never sees your sign-in.
  - Claude Code: install it ([code.claude.com/docs/en/setup](https://code.claude.com/docs/en/setup)), then
    run `claude auth login` in Terminal once.
  - Codex: install it ([github.com/openai/codex](https://github.com/openai/codex)),
    then run `codex login` in Terminal once.

## Install

1. Open **Daybook-0.1.0-arm64.dmg** and drag **Daybook** onto **Applications**. Eject the
   disk image.
2. Open **Daybook** from Applications. macOS says it can't check the app for malicious
   software, because this beta isn't registered with Apple yet. Click **Done**.
3. Open **System Settings → Privacy & Security**, scroll down to **Security**, and click
   **Open Anyway** next to "Daybook was blocked". Confirm with your password or Touch ID.
4. Open **Daybook** again and click **Open**. You only do this once.

If Daybook asks to **move itself to Applications**, say yes: your morning brief is written
from wherever the app lives, even when it's closed.

## First run

1. **Create an account** (Google, or email and password). The account is only who you
   are — it never sees your files.
2. **Choose a folder** for your secretary — a new, empty one is best (for example
   `Secretary` in your home folder). Everything Daybook knows about your life lives there as
   plain files you can open and edit.
3. **Choose a model** — Daybook finds Claude Code or Codex on your Mac.
4. **Answer the setup questions**, or tell it about your life in your own words (you can
   dictate: press the dictation key, or Fn twice). If ChatGPT, Claude or another AI already
   knows your life, choose **Bring it from another AI**: copy the prompt into it, paste back
   what it writes, and check what Daybook filled in. Add any numbers you want to keep and
   habits you want to tick.
5. Your secretary **plans your first day** straight away. After that, it plans each morning
   shortly before your brief time and writes the brief on its own.

To correct anything, type into **Tell your secretary** on the main screen — "finished the
proposal, waiting on Sam until Friday", "sent 3 applications today", "did my walk" — check
what it proposes, and click **Apply**. It takes a minute or two to answer.

## What runs on your Mac

Two small background jobs: one checks once a minute whether today's brief is due, one
checks hourly that the first is still running. Each runs for a moment and exits. In
**Settings**, turning off **Write my brief even when Daybook is closed** removes both.

## Uninstall

1. In Daybook, open **Settings** and turn off **Write my brief even when Daybook is closed**.
2. Quit Daybook and drag it from Applications to the Bin.
3. Optional: delete `~/Library/Application Support/Daybook` (your sign-in, settings and
   logs on this Mac).

Your folder is never touched — it's yours.

## Sending feedback

Tell us what was confusing, what was wrong, and what you wished it did. If something
broke, the logs are in `~/Library/Application Support/Daybook/logs` (Settings → "Show
Daybook's logs in Finder"). Read them before sending: they record what Daybook did, but check
there's nothing in them you'd rather keep to yourself.
