# Design System — Daybook

Part of the four-document set: `product-requirements.md` · **design-system.md** ·
`architecture.md` · `AGENTS.md`. The single source of the app's values is
`app/src/index.css` (tokens) and `app/src/fonts.css` (typefaces); the brief carries the same
values in `runner/daybook/render.py`. Change a value in both places, or the brief and the app
drift apart. How this system was arrived at: `docs/design/design-pass-prompt.md` (the brief
for the design pass, 2026-10-05).

## Principles

1. **Calm above all.** The product answers "what is true today?" The UI never shouts, never
   gamifies, never decorates: no streaks, scores, percentages, badges or celebration, anywhere
   (law 18).
2. **Honesty is a visual property.** An empty state shows an em dash *and a reason*. A
   failure is shown, never hidden. No meta-text about the system the person didn't ask for
   (the "11 of 11 checks" line was removed at the owner's request; the checks still run).
3. **Typography does the work.** Hierarchy comes from type, space and a few rules — not
   from boxes, shadows or colour.
4. **Made by a person, not generated.** Avoid the tells: purple or blue gradients,
   glassmorphism and glows; sparkle or magic-wand icons for anything the AI does; emoji as
   UI; every block the same rounded card; badge and pill soup; stock hero layouts; filler
   copy; default-shadcn sameness; cream paper + serif + terracotta.

## The mark

The day as a dial: a ring for the 24 hours, the planned part of the day in ink blue, and a
short hand. Files in `brand/`:

| File | Use |
|---|---|
| `daybook-mark.svg` | The mark, adapting to light and dark (`prefers-color-scheme`) |
| `daybook-mark-on-light.svg` / `-on-dark.svg` | Fixed colours, for a known background |
| `daybook-app-icon.svg` | The macOS icon: the mark on a ledger-paper tile on Apple's 1024 grid; rendered to `app/resources/icon.png` for the build |

In the app it is `components/Logo.tsx`: `Mark` (the glyph, drawn from the theme tokens) and
`Wordmark` (the mark with "Daybook" in Newsreader). One brand moment per screen — the big
wordmark on sign-in, the small one in each bar. The brief's dial is the same idea at full
size.

## Theming

- **Everything is a CSS variable** in `src/index.css` under `@theme`; components reference
  `var(--color-*)` and never hard-code a colour.
- **Light and dark both, following the Mac** (`color-scheme: light dark`, a
  `prefers-color-scheme` override of the same variables, `:root[data-theme="dark"]` to force
  it). Settings → Appearance can pin light or dark instead; the main process sets
  Electron's `nativeTheme.themeSource`, so every page — the brief's frame too — and the
  native controls follow, with no second mechanism. Light was designed first; dark is graphite, drawn rather than inverted. Every new
  colour needs both values, and every text colour must pass WCAG AA (4.5:1) on the canvas
  and on surfaces, in both themes — the current set does.

## Palette

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--color-canvas` | `#f2f3ef` | `#121416` | The ground — ledger paper, cool not cream |
| `--color-surface` | `#fbfbf9` | `#1a1d20` | Fields, the proposed-day card, selected rows |
| `--color-sunken` | `#e8eae4` | `#202428` | Toggle tracks, selected list rows, code chips |
| `--color-ink` | `#16191c` | `#e7e9ea` | Text — blue-black ink |
| `--color-ink-soft` | `#4c535a` | `#a8afb5` | Secondary text, explanations |
| `--color-ink-faint` | `#687078` | `#838b92` | Labels, hints, meta (AA at 4.5:1) |
| `--color-line` | `#d9dcd5` | `#2a2f34` | Rules and borders |
| `--color-accent` | `#26487a` | `#93b2e6` | Daybook ink blue: primary buttons, focus, "Proposed for today" |
| `--color-accent-ink` | `#ffffff` | `#0e1a2b` | Text on the accent |
| `--color-wait` | `#556884` | `#93a6c4` | WAIT on the board |
| `--color-chase` | `#8a5410` | `#d8a45c` | CHASE on the board |
| `--color-warn` | `#8f3b2a` | `#e3a08a` | Failures and things needing attention |

**The dial's inks** (in the brief only) are the one place with several hues, because telling
the day's blocks apart is the dial's job. Six muted inks — blue, ochre, sage, clay,
lavender, teal (`--c1`…`--c6`) — go to the blocks in the order the day shape lists them, warm
and cool alternating so neighbours differ; a label that appears twice keeps its colour. Sleep
is a deeper slate (`--sleep`); unplanned time is the quiet track (`--unplanned`) and never one
more colour — it is not a plan.

| Token | Light | Dark |
|---|---|---|
| `--c1` … `--c6` | `#7f9cc8` `#d6ab60` `#8db39f` `#c98f78` `#a594c7` `#72adb1` | `#6482ad` `#b38c4d` `#6b9382` `#a5715e` `#8475a6` `#5a9095` |
| `--sleep` | `#4d6187` | `#394d6c` |
| `--unplanned` | `#e3e6df` | `#24282c` |

## Type

Two bundled typefaces, both SIL Open Font License (licences beside the files):

- **Newsreader** (`--font-display`, `font-display`) — the date, screen titles, the items on
  today's list, the wordmark, the closing line. Weight 500; optical sizes follow the size.
- **Hanken Grotesk** (`--font-sans`, the default) — everything you operate: buttons,
  questions, explanations, the board, metrics.
- `--font-mono` (the system's) — paths, file names, version numbers only.

The app bundles both (Latin and Latin Extended, about 540 KB, `src/assets/fonts/`); each
brief embeds Newsreader 500 and Hanken Grotesk (Latin only, about 85 KB) so it opens offline
for years. Anything outside Latin falls back to the system face.

| Role | Size | Face |
|---|---|---|
| Brand wordmark (sign-in) | 60 | Newsreader |
| Date (brief) | 46 | Newsreader |
| Screen title | 32 | Newsreader |
| Section title in a card | 19–26 | Newsreader |
| Item on today's list | 19 | Newsreader |
| Body | 14–15 | Hanken Grotesk |
| Interface (buttons, questions, rows) | 13–13.5 | Hanken Grotesk |
| Label | 11, caps, tracked .09em | Hanken Grotesk, `label` utility |
| Meta, hints | 12–12.5 | Hanken Grotesk |

Numbers that line up use tabular figures (`tnum` utility; `time` in the brief). The `label`
style is for section names only (Today, Waiting on others, Scoreboard) — never a form
question. Headings use `text-wrap: balance`.

## Spacing, corners, shadow

- A 4-point rhythm: 4, 8, 12, 16, 24, 32, 44. Screens pad 32–44 at the sides.
- Corners: `--radius-control` 6 for buttons, fields and rows; `--radius-card` 10 for the
  few things that float.
- One shadow in the product: under the proposed-day card, because it floats over the brief.
  While it is up, the brief steps back behind a wash of the page's own colour (72%) — no
  blur, no glass.

## Components

Copied into `src/components/`, not installed — owned and restyled freely.

- **Button** (`ui/button.tsx`) — 32 high (`size="lg"` 40), 6 corners. `primary` (accent
  fill; **one per screen**), `secondary` (outlined surface), `ghost` (text). A disabled
  button keeps its shape and dims to 45%, so it reads as waiting rather than broken.
- **Field + inputClass** — three weights, strongest first: the **question** (13.5,
  semibold, full ink, sentence case, `(optional)` in faint ink), the **guidance** (12.5,
  soft, *between* the question and the input), then the **input** (surface on the paper
  ground, line border, accent border and soft ring on focus). Native `<input type="time">`
  and `<select>` (which types-to-search).
- **Placeholders may carry examples** — the owner likes them. They must never pass for an
  answer: **italic, faint**, "e.g." on a one-line field, two example lines on a multi-line
  one. A password placeholder is words ("Your password"), never dots.
- **SectionLabel** — the `label` style as an `h2`.
- **Card** (`ui/card.tsx`) — only for what floats: the proposed day. Sections are never
  cards. The proposed day reads: "Proposed for today" in accent caps with the model on the
  right, the model's one-line summary as the headline (Newsreader 18), then the list, what
  is marked done, the board and questions, and Apply / Discard with "Nothing is written
  until you apply." It lies over the brief (which stays whole behind the wash, never cut off
  mid-line) and scrolls inside itself when it is long.
- **OnboardingFrame / PageFrame** (`OnboardingFrame.tsx`) — onboarding's left rail (the
  wordmark and the three steps; a finished step shows what was chosen) with the step on the
  right and an optional sticky action bar; `PageFrame` is the same page outside onboarding
  (Settings, changing the model) with the wordmark and a way back.
- **Grouped sections** (setup, Settings) — the group's name and one-line purpose on the
  left (190 wide), its fields on the right, a rule above each group.
- **Segmented** (`ui/segmented.tsx`) — a choice among a few words (Appearance: Same as
  this Mac · Light · Dark; setup's way of answering): a sunken track, the chosen word raised
  on the surface.
- **Switch** (same file) — on or off for one thing that runs, labelled by the sentence
  beside it ("Write my brief even when Daybook is closed"). Accent when on.
- **Radio lists** (choosing a model) — one bordered list with dividers, a radio dot per row,
  the selected row on `--color-sunken`, "Recommended" in accent text. No pills.
- **Statuses** — WAIT and CHASE are words in small caps with a dot before them, never
  filled pills, so colour never carries the meaning alone.
- **Status line** (scoreboard) — one line above the message box with a dot (or a spinner
  while the model works): what is happening, what just happened, or when the brief arrives.

**Icons:** `lucide-react`, 14–15 px, always beside a text label. No sparkles for the AI —
"Plan again" uses the refresh arrows.

## Layout

- The window is 1020 × 720, minimum 880 × 600; every screen works at both.
- **Sign-in:** two columns — the mark, the big wordmark and one line of what Daybook is,
  centred in the left half, with what the account can and cannot see at its foot; the
  form on the right.
- **Onboarding:** the rail and the step, centred in what is left (`OnboardingFrame`);
  actions in a sticky bar. Settings and changing the model are a centred column under a
  bar with the wordmark and the way back (`PageFrame`).
- **Scoreboard:** the brief is the page. A 48-high bar above (wordmark, the model as a text
  button, Plan again, Settings) and the message box below with the status line over it. The
  proposed day floats between the brief and the box.
- **The brief** (`render.py`): a 1000-wide page; the date as a 46 headline with the weekday
  as a label above it; two columns at full width (the dial, its legend with hours, and Next
  up at 300; today's list beside it), then Scoreboard and Ticks side by side, then Waiting
  on others, questions, notes, and the closing line. One column under 760; phone padding
  and a 264 dial under 520. It keeps the spec's reading order.
- **The dial**: midnight at the top, clockwise. A thick ring of the day's blocks (the inks
  above) around a face in `--surface`; every hour ticked on the inside of the ring and every
  third numbered (00, 03 … 21). The hand crosses the ring, so it points at the block you
  are in, with a dot at its outer end; the time sits in the middle in Newsreader 36, the
  block's name and "until 09:00" beneath. What is fixed in time ticks *outside* the ring
  with its name beside it: non-negotiables in ink, the light schedule (daylight, a prayer
  timetable, tides) fainter. A label that would collide steps outward a line; one that
  still would is left to the tick's tooltip, never drawn over another. Labels may run into
  the page margin, never past the window. The page's script keeps the hand, the time, the
  block, "until", the legend's bold row and Next up true while the page stays open; a brief
  opened on another day only moves the hand.

## Copy voice

- Second person, warm, direct: *"Your day, planned each morning from a folder you own."*
- Say limits and failures plainly, then the next step: *"Today's plan wasn't written:
  Claude Code wasn't found … Your day is unchanged."*
- Name things by what people recognise, not how the system is built: "Today's brief is held
  back", not "V6 failed"; "Applications sent", not `applications_sent`; "Times by this Mac's
  clock", not a clock source in brackets.
- Never: hype, exclamation marks, guilt, fake numbers, "Oops".

## Motion

Colour and opacity transitions only (150 ms) — and a switch's knob, which slides because
that is what a switch is. Something new appears by fading in
(`fade-in`, the proposed day), never by sliding. A spinner appears only while the model is
actually working. The app never looks busy while waiting on nothing.
