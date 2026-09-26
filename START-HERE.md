# START HERE

You are a fresh build session on **Daybook** — a personal chief of staff: a desktop app
that holds a user's life in plain files they own, wakes up on its own schedule, and is
built so it cannot state something false about their week.

## Read in this order

| # | File | What you get |
|---|---|---|
| 1 | **`AGENTS.md`** | The five rules that override everything, the constraints, working style |
| 2 | **`DECISIONS.md`** | What is settled, what awaits the owner. **Never decide a ⬜ item** |
| 3 | **`product-requirements.md`** | What to build and what "done" means |
| 4 | **`architecture.md`** | How it fits together — built, and decided-not-built |
| 5 | **`design-system.md`** | The UI language |
| 6 | **`LAWS.md`** | The 24 behavioural laws — the actual IP |
| 7 | **`fixtures/README.md`** | The invented test folder and its planted failure cases |

Then run the app: `cd app && nvm use && npm install && npm run dev`.

`docs/` holds the pre-restart spec set — historical record only; the four documents above
win where they disagree.

## Before you write any code

- Read the five rules in `AGENTS.md`.
- Check `DECISIONS.md` — if the thing you need is ⬜, build the common part and leave a seam.
- If something looks wrong or contradictory, say so — do not quietly build around it.
