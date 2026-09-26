# Design System — Daybook

Part of the four-document set: `product-requirements.md` · **design-system.md** ·
`architecture.md` · `AGENTS.md`. The single source of the values below is
`app/src/index.css` — change them there and the whole app follows.

## Principles

1. **Calm above all.** The product answers "what is true today?" — the UI must never shout,
   never gamify, never decorate. No streaks, scores, percentages, or celebration graphics
   anywhere, ever (law 18).
2. **Honesty is a visual property.** Empty states show an em dash *and a reason*. Sample or
   missing data gets a loud banner, never a plausible-looking placeholder. Failed states are
   shown, not hidden.
3. **Unbranded by default.** The palette is deliberately neutral; nothing in the UI is
   product copy. Warm, direct, second-person, no hype, no guilt.

## Theming mechanics

- **Everything is a CSS variable** in `src/index.css` under `@theme` — a full re-theme is
  that one block. Components never hard-code colours; they reference
  `var(--color-*)`.
- **Dark mode** follows the OS (`color-scheme: light dark`) via a `prefers-color-scheme`
  override of the same variables; `:root[data-theme="dark"]` forces it manually. Every new
  colour must define both light and dark values or it is wrong.

## Palette

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--color-canvas` | `#f6f5f3` | `#14151a` | App background |
| `--color-surface` | `#fffefc` | `#1c1e24` | Cards, inputs |
| `--color-ink` | `#1c1b19` | `#ecebe8` | Primary text |
| `--color-ink-soft` | `#5d5a55` | `#a7a49e` | Secondary text, notes |
| `--color-ink-faint` | `#8b877f` | `#74716b` | Labels, hints, metadata |
| `--color-line` | `#e3e0da` | `#2b2e36` | Borders, dividers |
| `--color-accent` | `#2f4858` | `#9fc0d4` | Primary buttons, focus rings, positive ticks |
| `--color-warn` | `#8a4b2a` | `#d79a70` | Warnings, honest-failure banners |
| `--color-wait` | `#6b7f9e` | `#8ba3c2` | Board rows on WAIT (future) |
| `--color-chase` | `#b1663c` | `#d08a5e` | Board rows on CHASE (future) |
| `--radius-card` | `14px` | — | Cards, inputs, banners |

## Type

- System font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", …`) — nothing custom,
  nothing loaded.
- Scale in use: `text-2xl` (login title) · `text-xl` (page titles) · `text-sm` (body) ·
  `text-xs` (hints, metadata) · `text-[0.7–0.72rem] uppercase tracking-[0.09em]`
  (card titles and step labels — the one decorative convention, keep it consistent).
- `font-medium` for emphasis; `font-semibold tracking-tight` for titles; `font-mono text-xs`
  for paths, times and code.

## Components

shadcn-style: **copied into `src/components/ui/`, not installed** — owned, restyled freely,
no upgrade can break them. Radix sits underneath only where keyboard/ARIA behaviour matters.

- **Button** (`button.tsx`) — pill shape, three variants: `primary` (accent fill),
  `secondary` (bordered surface), `ghost` (text only). `focus-visible` ring on accent.
  Disabled = 50% opacity, cursor not-allowed.
- **Field + inputClass** — uppercase micro-label above the input, hint below it. Inputs are
  surface-bordered rounded cards; `focus:` border turns accent. Time inputs use the native
  `<input type="time">`.
- **Card** (`card.tsx`) — `CardHeader` / `CardTitle` (the uppercase micro-label) /
  `CardContent`. The container for every scoreboard and settings section.
- **Badge** (`badge.tsx`) — `pass` / `fail` / `neutral` pills; used for verification
  results, statuses, and small counts.

**Icons:** `lucide-react`, `size-3`–`size-4`, always with a text label nearby — an icon never
carries meaning alone.

## Layout

- Content column: `max-w-4xl mx-auto px-4 py-8`; onboarding screens narrow to `max-w-md`
  and vertically centre (`min-h-[70vh] justify-center`).
- Onboarding shows its position: `Step N of 3` as the uppercase micro-label above the title.
- Scoreboard is a 2-column card grid (`md:grid-cols-2`), plans card spanning full width.
- The window is 1020×720, min 880×600.

## Copy voice

- Second person, warm, direct: *"This folder is your secretary's whole world."*
- State limits and refusals plainly: *"needs the Daybook app — the browser preview cannot
  touch your machine."*
- Honest-system copy pattern: name the situation, then the consequence, then the next step
  (*"Sample data — not your day. … The next stage wires the morning brief to this screen."*).
- Never: hype, exclamation marks, guilt, fake numbers, "Oops".

## Motion and feedback

- Transitions are colour/opacity only (`transition-colors`, `hover:` states); no animations
  elsewhere. Spinners only on explicit user-triggered work (`animate-spin` on a refresh
  icon). The app must never look busy while waiting on nothing.
