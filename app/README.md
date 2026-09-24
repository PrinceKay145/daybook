# The app

React + TypeScript + Vite + Tailwind + shadcn-style components. Three screens —
**Brief · Board · Settings**. Nothing else.

**It talks to `127.0.0.1` and nothing else.** No bundle-specific APIs anywhere in here.
That is what keeps it runnable in a plain browser now and wrappable in Tauri in week 7
with the React code unchanged — and it is the one rule in this directory worth protecting.

## Running it

Two processes, in two terminals:

```bash
# 1. the runner
cd runner && python3 -m daybook serve --folder ../fixtures/sample-folder

# 2. the app
cd app && npm install && npm run dev      # http://127.0.0.1:5173
```

`VITE_RUNNER_URL` overrides where the runner is. It defaults to `http://127.0.0.1:8787`.

Screens are addressable: `#brief`, `#board`, `#settings`.

## The Brief screen shows the runner's HTML, not a React copy

The brief is *one self-contained HTML file*, and the same file the runner writes into the
folder is what this screen displays. A React reimplementation of the seven sections would
be a second renderer that drifts from the artefact the user actually opens out of their
folder, and the eleven verification assertions would only ever cover one of the two.

If verification fails, the screen says the brief was withheld and lists which assertions
failed. It does not fall back to showing it anyway.

## shadcn, copied not installed

`src/components/ui/` is ours. The components were written into the repo rather than
pulled from a package, so they can be restyled freely and no upgrade can break them.
Radix sits underneath the tabs, which is where the keyboard and screen-reader behaviour
comes from.

Every colour is a CSS variable in `src/index.css`. A full re-theme is that one block.

## Not here yet

Onboarding, the folder picker, writing anything back, notifications, the Tauri shell.
Week 1 is read-only: a window, on screen, showing today's brief from the fixture folder.
