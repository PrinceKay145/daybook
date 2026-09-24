# The Morning Brief — specification

**What it is:** one self-contained HTML file, regenerated each morning. No external assets, no
build step, no browser storage. Opening it is the entire deployment.

**Why self-contained:** it must still open in five years, on a machine with no app installed,
from a folder restored out of a backup. It is also what lets the brief render when the server is
down — see architecture §2.

**This is the home screen.** Not a chat box. The product answers *"what is true today?"*, not
*"what can AI chat about?"* Nothing else may take this position in the UI.

---

## The seven sections — and the order is the argument

Do not reorder them. The sequence answers *where am I → what now → what matters → how am I doing
→ what am I keeping up → who am I waiting on → and a human note.* Reordering breaks the reasoning
even though every section still renders.

---

### 1. The 24-hour dial

The day as coloured arcs around a ring, midnight at the top, drawn from `day_shape` in config.

- **Non-negotiables tick *outside* the ring**, never as arcs within it. They are not blocks that
  can be moved or shortened, and drawing them as blocks invites treating them as negotiable.
- **A live hand** recomputes every 30 seconds against the user's timezone.
- **The centre** shows the current time, the current block's name, and `until HH:MM`.

🔴 **Blocks are asserted contiguous 00:00–24:00 at build time.** A gap silently produces a
current block of nothing, and the centre renders empty with no error. This assertion is the only
thing that catches it.

### 2. Next up

**One line.** What is happening next and when.

The dial answers *where am I*; this answers *what now*. Conflating them made both harder to read
— this was tried and reverted.

### 3. Today's three

**At most three actions.**

- 🔴 **Never manufacture a third.** If the honest count is one, it says one **and says why**.
  Padding this list is the fastest way to make the whole brief ignorable.
- **Each item is one concrete first click**, never a category of work. *"Open the Aldridge brief
  and write the first section"*, not *"work on Aldridge"*. An item that cannot be expressed as a
  physical action is not ready to be on the list.
- **Anything the system did *for* the user** goes in a separate note underneath, explicitly
  marked as not on their list. It is information, not a task, and mixing them inflates the count.
- 🔴 **Nothing marked done in `DAY-STATE.md` may appear here.** Ever.

### 4. Scoreboard

A handful of metrics from config.

- **Empty prints an em dash *and a sentence explaining why*.** Never blank, never zero, never
  last week's figure carried forward, never an estimate.
- **A metric the user stopped tracking prints a dash and says so** — so nobody helpfully re-adds
  it six weeks later.
- 🔴 Nothing is estimated, interpolated or inferred. If the file does not say it, it is not known.

### 5. Today's ticks

Habits and observances, read from the log.

- 🔴 **Shown, never graded.** Counts out of seven.
- **No streak counter** on anything where a missed day would read as a loss. No score, no
  percentage, no "you broke a run."

### 6. The board

Everything live and waiting on another person. Per row: **one status pill · one sentence · the
next dated move · and explicitly WAIT or CHASE.**

- 🔴 **Every row carries WAIT or CHASE and a date.** A row with neither is a slow leak — it looks
  tracked and is not.
- **Silence is stated as expected**: *"all four silent on day eight, expected."* Without this,
  silence on day twenty reads the same as silence on day two, and nothing ever gets chased.
- **An item that has had two prompts stops being a task and becomes a question** — a plain yes or
  no. A "no" closes it as cleanly as a "yes".

### 7. Closing line

Warm, different every day, grounded in something that actually happened.

- Never generic encouragement. Never hype.
- **When the day was bad, it does not pretend otherwise.**
- 🔴 **Never judge the user against a brief that never reached them.** If the heartbeat shows the
  system did not deliver, that is a system failure and the line says so.

---

## Verification — run before delivery, never eyeballed

*A brief that renders wrong is worse than no brief: it is read quickly, trusted, and acted on.*

**These are data assertions, not view concerns.** They survive a change of renderer. Rewriting
the brief in a new framework does not retire them — if anything makes them harder to run, the
change is wrong.

| # | Assertion | Catches |
|---|---|---|
| V1 | The embedded JavaScript is extracted and syntax-checked | A brief that opens to a blank page |
| V2 | `day_shape` blocks cover 00:00–24:00, contiguous, no overlap | A current block of nothing |
| V3 | Dial geometry spot-checked at three clock positions (00:00, 06:00, 18:00) | Arcs drawn from the wrong origin or in the wrong direction |
| V4 | Current-block lookup asserted against a known fixed time | Off-by-one at block boundaries |
| V5 | Every referenced file path is asserted to exist | A button that opens nothing |
| V6 | Today's three contains ≤ 3 items | Padding |
| V7 | No item marked done in `DAY-STATE.md` appears in today's three | 🔴 The trust-destroying failure |
| V8 | Every empty metric has a non-empty reason string | A silent blank read as a zero |
| V9 | Every board row has WAIT or CHASE **and** a date | Untracked items that look tracked |
| V10 | No habit renders a streak, score or percentage | Grading |
| V11 | The heartbeat was checked and its result is reflected | Judging an undelivered day |

**Run against `fixtures/sample-folder` on the frozen clock.** Every assertion above has a
deliberately planted case in there — V7 is the Hartley invoice, V8 is `newsletter_subscribers`,
V11 is the 6 March outage. If a build passes all eleven against the fixtures and the fixtures
were not changed, the brief is trustworthy.

---

## What the brief must never do

- Ask a question it could answer by opening a file
- Show a number it cannot trace to a source
- Re-surface anything finished
- Grade the user
- Imply the user ignored something the system never delivered
- Render partially and silently — if a section cannot be built honestly, it says so in place

---

## Implementation notes

- **Generated by the runner**, written to `briefs/YYYY-MM-DD.html` with `briefs/latest.html` as a
  copy (not a symlink — symlinks break when the folder is synced or zipped).
- **No external requests at render time.** Inline everything, including fonts and any icons.
- **No browser storage.** The brief holds no state; it is a view of the folder.
- **Renders correctly in both light and dark**, since it opens in whatever the OS is set to.
- **Readable at phone width**, because it will be opened on a phone from a synced folder even
  though mobile is not a v1 target.
