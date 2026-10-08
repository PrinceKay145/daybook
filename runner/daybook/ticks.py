"""TICKS.md — the habits a person said they did, one line per habit per day.

A plain, append-only file in their folder, written by Daybook (never by the model) when a
plan from their message is applied:

    - 2026-10-06 · morning_walk · Morning walk

The brief's "n of 7" is counted from it, never estimated (law 7) and never scored (law
18): the last seven days, today included — or, in a habit's first week, only the days
since it was set up, so a habit started on Monday reads "1 of 2" on Tuesday rather than
"1 of 7".
"""

from __future__ import annotations

import re
from datetime import date, timedelta

WINDOW = 7
HEADER = (
    "# Ticks\n\n"
    "Append-only. One line per habit done, per day, from what you told your secretary. "
    "Daybook counts the last seven days from here; nothing is estimated.\n"
)
_LINE = re.compile(r"^\s*[-*]\s*(\d{4}-\d{2}-\d{2})\s*·\s*([a-z0-9_]+)\b")


def read(text: str) -> set[tuple[date, str]]:
    """Every (day, habit id) the file records. Lines that are not ticks are ignored."""
    seen: set[tuple[date, str]] = set()
    for line in text.splitlines():
        match = _LINE.match(line)
        if not match:
            continue
        try:
            seen.add((date.fromisoformat(match.group(1)), match.group(2)))
        except ValueError:
            continue
    return seen


def count(habit: dict, ticks: set[tuple[date, str]], today: date) -> str:
    """ "n of m": the days in the window on which the habit was ticked, out of the days
    the window holds since the habit began."""
    days = WINDOW
    since = str(habit.get("since", "")).strip()
    if since:
        try:
            days = max(1, min(WINDOW, (today - date.fromisoformat(since)).days + 1))
        except ValueError:
            pass
    window = {today - timedelta(days=n) for n in range(days)}
    done = sum(1 for day, habit_id in ticks if habit_id == habit.get("id") and day in window)
    return f"{done} of {days}"


def table(habits: list[dict], ticks: set[tuple[date, str]], today: date) -> list[str]:
    """The day state's "Today's ticks" table, counted from the file."""
    rows = ["| Habit | Last 7 days |", "|---|---|"]
    for habit in habits:
        rows.append(f"| {habit.get('label') or habit.get('id')} | {count(habit, ticks, today)} |")
    return rows


def appended(text: str, habits: list[dict], ids: list[str], today: date) -> str:
    """The file with today's new ticks added — each habit at most once a day."""
    have = read(text)
    labels = {h.get("id"): h.get("label") or h.get("id") for h in habits}
    new = [i for i in dict.fromkeys(ids) if i in labels and (today, i) not in have]
    if not new:
        return text
    body = text if text.strip() else HEADER
    lines = [f"- {today.isoformat()} · {i} · {labels[i]}" for i in new]
    return body.rstrip("\n") + "\n" + ("\n" if not have else "") + "\n".join(lines) + "\n"
