"""The brief, arriving on its own — the scheduled side of the runner.

``tick`` is run by launchd every minute (app.daybook.mac.tick) and exits. In the ten
minutes before the user's brief time it asks their chosen model to plan the day, once
(plan.py: the model proposes, Daybook writes, after the checks). Once the brief time has
passed — read from config.json at every tick, never a compiled constant —
and today's brief does not exist yet, it builds the brief, runs the eleven assertions, and
writes ``briefs/<date>.html`` and ``briefs/latest.html`` only if all eleven pass (ship
gate 2). Then it says so with a notification. A Mac asleep at the brief time gets its
brief at the first tick after it wakes, and the notification says it was late.

``watchdog`` is run by launchd hourly (app.daybook.mac.watchdog). It notices what the tick
cannot report about itself — that it has stopped running — and a brief still missing well
after its time.

Both keep their small bookkeeping (last tick, what was already said today) in a state
directory in app data, never in the user's folder. Notifications carry only what the
runner itself wrote; nothing from the folder's content is ever spoken as an instruction.

Reminders are not here: firing them is the reference daemon's job, bundled unchanged
later (AGENTS.md rule 2).
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable

from . import plan
from .assertions import all_passed, verify
from .brief import build
from .folder import Folder, open_folder
from .render import render
from .write import atomic_write_text

Notifier = Callable[[str, str], bool]
Planner = Callable[..., "plan.PlanOutcome"]

DEFAULT_BRIEF_TIME = "09:00"
LATE_AFTER = timedelta(minutes=15)  # a brief written later than this says it was late
PLAN_AHEAD = timedelta(minutes=10)  # the model plans the day this long before the brief
WATCHDOG_GRACE = timedelta(minutes=30)  # how long after the brief time a missing brief is news
TICK_STALE_AFTER = timedelta(minutes=10)  # a tick this old means the minute check has stopped


def notify_macos(title: str, message: str) -> bool:
    """A macOS notification. The text goes in as arguments to a fixed script, never spliced
    into it, so nothing in a title or message can change what runs."""
    try:
        done = subprocess.run(
            [
                "osascript",
                "-e", "on run argv",
                "-e", "display notification (item 2 of argv) with title (item 1 of argv)",
                "-e", "end run",
                title,
                message,
            ],
            capture_output=True,
            timeout=15,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return done.returncode == 0


@dataclass
class Outcome:
    """What one run did, in a line the log keeps."""

    status: str
    detail: str

    def line(self) -> str:
        return f"{self.status}: {self.detail}"


def _brief_moment(today, config: dict) -> datetime:
    hhmm = str(config.get("schedule", {}).get("brief_time") or DEFAULT_BRIEF_TIME)
    try:
        hour, minute = (int(part) for part in hhmm.split(":"))
    except ValueError:
        hour, minute = (int(part) for part in DEFAULT_BRIEF_TIME.split(":"))
    return datetime(today.year, today.month, today.day, hour, minute)


def _load_state(state_dir: Path) -> dict:
    try:
        return json.loads((state_dir / "tick-state.json").read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_state(state_dir: Path, state: dict) -> None:
    atomic_write_text(state_dir / "tick-state.json", json.dumps(state, indent=2) + "\n")


def record_plan(state_dir: str, day: str, outcome: "plan.PlanOutcome") -> None:
    """Today's planning, wherever it ran — the tick, or the app's "plan my day" — so the
    day is planned once, and a brief built later can say if planning failed."""
    states = Path(state_dir)
    state = _load_state(states)
    earlier = state.get("plan") or {}
    if earlier.get("day") == day and earlier.get("status") == "planned" and outcome.status != "planned":
        return  # today was planned; a retry that failed leaves that plan standing, and true
    state["plan"] = {"day": day, "status": outcome.status, "detail": outcome.detail,
                     "model": outcome.model, "at": datetime.now().isoformat(timespec="seconds")}
    _save_state(states, state)


def plan_note(state: dict, day: str) -> str | None:
    """A line for the brief when today's plan could not be refreshed (law 14: the system
    reports its own failures). None when it was planned, or not attempted."""
    entry = state.get("plan") or {}
    if entry.get("day") != day or entry.get("status") not in ("failed", "refused"):
        return None
    who = entry.get("model") or "your model"
    return (f"Today's plan wasn't refreshed by {who}: {entry.get('detail', '')} This brief is "
            "built from your day state as it stood.")


def add_plan_note(folder: Folder, state_dir: str | None) -> None:
    if not state_dir:
        return
    note = plan_note(_load_state(Path(state_dir)), folder.today.isoformat())
    if note:
        folder.warnings.append(note)


def run_tick(
    folder_path: str,
    state_dir: str,
    clock: str | None = None,
    notify: Notifier = notify_macos,
    plan_day: Planner | None = plan.run,
) -> Outcome:
    states = Path(state_dir)
    state = _load_state(states)
    try:
        folder = open_folder(folder_path, clock_override=clock)
    except Exception as exc:  # noqa: BLE001 — a folder that cannot be read is logged, not raised
        # The tick still ran: record that, so the watchdog reports the real problem (an
        # unreadable folder, seen in the log) rather than "the minute check has stopped".
        state["last_tick"] = datetime.now().isoformat(timespec="seconds")
        state["last_error"] = f"{type(exc).__name__}: {exc}"
        _save_state(states, state)
        return Outcome("error", f"the folder could not be read — {state['last_error']}")
    now = folder.clock.now
    today = folder.today
    state["last_tick"] = now.isoformat(timespec="seconds")
    state.pop("last_error", None)
    due = _brief_moment(today, folder.config)

    try:
        if now < due - PLAN_AHEAD:
            return Outcome("waiting", f"today's brief is due at {due:%H:%M}")

        dated = folder.scope.resolve(f"briefs/{today.isoformat()}.html")
        if dated.exists():
            return Outcome("done", f"today's brief already exists ({dated.name})")

        planned = (state.get("plan") or {}).get("day") == today.isoformat()
        if plan_day is not None and not planned:
            _save_state(states, state)  # the planning call can take minutes; keep the tick seen
            outcome = plan_day(folder_path, clock=clock)
            record_plan(state_dir, today.isoformat(), outcome)
            state = _load_state(states)
            folder = open_folder(folder_path, clock_override=clock)
            planned_detail = f"planned ({outcome.status}: {outcome.detail})"
        else:
            planned_detail = "already planned" if planned else "not planned"

        if now < due:
            return Outcome("waiting", f"{planned_detail}; today's brief is due at {due:%H:%M}")

        add_plan_note(folder, state_dir)
        pending = [f"briefs/{today.isoformat()}.html", "briefs/latest.html"]
        data = build(folder, pending_outputs=pending)
        html = render(data)
        results = verify(data, html)

        if not all_passed(results):
            failed = [r for r in results if not r.ok]
            if state.get("withheld_notified") != today.isoformat():
                notify(
                    "Today's brief is withheld",
                    f"It failed {len(failed)} of its {len(results)} checks, so it was not "
                    "written. Open Daybook to see which.",
                )
                state["withheld_notified"] = today.isoformat()
            names = ", ".join(r.id for r in failed)
            return Outcome("withheld", f"{len(failed)} check(s) failed: {names}")

        atomic_write_text(dated, html)
        # A copy, not a symlink: symlinks break when the folder is synced or zipped.
        atomic_write_text(folder.scope.resolve("briefs/latest.html"), html)
        late = now - due > LATE_AFTER
        when = f"{now:%A}'s brief"
        notify(
            "Your brief is ready",
            f"{when} — written at {now:%H:%M}, after its {due:%H:%M} time."
            if late
            else f"{when} is ready. All {len(results)} checks passed.",
        )
        state["last_brief"] = today.isoformat()
        return Outcome("delivered", f"wrote {dated.name}{' (late)' if late else ''}")
    finally:
        _save_state(states, state)


def run_watchdog(
    folder_path: str,
    state_dir: str,
    clock: str | None = None,
    notify: Notifier = notify_macos,
) -> Outcome:
    states = Path(state_dir)
    state = _load_state(states)
    try:
        folder = open_folder(folder_path, clock_override=clock)
    except Exception as exc:  # noqa: BLE001
        return Outcome("error", f"the folder could not be read — {type(exc).__name__}: {exc}")
    now = folder.clock.now
    today = folder.today
    due = _brief_moment(today, folder.config)

    if now < due + WATCHDOG_GRACE:
        return Outcome("ok", f"not yet {WATCHDOG_GRACE.seconds // 60} minutes past {due:%H:%M}")
    if folder.scope.resolve(f"briefs/{today.isoformat()}.html").exists():
        return Outcome("ok", "today's brief arrived")
    if state.get("withheld_notified") == today.isoformat():
        return Outcome("ok", "today's brief was withheld, and the tick already said so")
    if state.get("watchdog_notified") == today.isoformat():
        return Outcome("quiet", "already said today")

    last_tick = state.get("last_tick")
    try:
        stale = not last_tick or now - datetime.fromisoformat(last_tick) > TICK_STALE_AFTER
    except ValueError:
        stale = True
    if stale:
        since = f" since {datetime.fromisoformat(last_tick):%H:%M}" if last_tick else ""
        notify(
            "Daybook's brief check has stopped",
            f"The minute check hasn't run{since}, so today's {due:%H:%M} brief was not "
            "written. Open Daybook → Settings & status.",
        )
        detail = f"no tick{since or ' recorded'}"
    else:
        notify(
            "Today's brief hasn't arrived",
            f"Its time was {due:%H:%M} and the minute check is running, but no brief was "
            "written. Open Daybook to see why.",
        )
        detail = "tick running, brief missing"

    state["watchdog_notified"] = today.isoformat()
    _save_state(states, state)
    return Outcome("alerted", detail)
