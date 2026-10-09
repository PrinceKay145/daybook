"""One planning run at a time, across processes.

The app plans as soon as setup finishes and whenever it is asked; the launchd tick plans
before the brief. They are separate processes, so the app's own "one at a time" could not
stop them colliding — and when they did (setup finished after the brief time, so both
started in the same second), the second was refused ("your day state changed") after
paying for a model call, and the person was told their plan wasn't written when it had
been. This lock file, in app data and never in the folder, makes the second one wait.

A lock whose process has gone, or that is older than any planning run could be, is stale
and taken over — a crash costs a lock file, never a day without a plan.
"""

from __future__ import annotations

import json
import os
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

NAME = "plan.lock"
STALE_AFTER = 15 * 60  # seconds — longer than two attempts at three minutes and the checks


class Busy(Exception):
    """Another process is planning, and this one would not wait (longer)."""


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def holder(state_dir: str | Path) -> dict | None:
    """Who holds the lock, or None. A stale lock is removed on the way."""
    path = Path(state_dir) / NAME
    try:
        info = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        info = {}
    pid, at = info.get("pid"), info.get("at", 0)
    if not isinstance(pid, int) or not _alive(pid) or time.time() - float(at or 0) > STALE_AFTER:
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        return None
    return info


@contextmanager
def holding(state_dir: str | Path, by: str, wait: float = 0, poll: float = 2.0) -> Iterator[bool]:
    """Hold the planning lock for the body. Waits up to ``wait`` seconds for another holder,
    then raises Busy. Yields whether it had to wait — the other run may have just done the
    work this one came to do."""
    path = Path(state_dir) / NAME
    path.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + wait
    waited = False
    while True:
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            other = holder(state_dir)
            if other is None:
                continue  # it was stale and is gone; try again at once
            if time.monotonic() >= deadline:
                raise Busy(f"{other.get('by', 'another run')} is planning today right now") from None
            waited = True
            time.sleep(poll)
            continue
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"pid": os.getpid(), "by": by, "at": time.time()}, handle)
        break
    try:
        yield waited
    finally:
        try:
            if json.loads(path.read_text(encoding="utf-8")).get("pid") == os.getpid():
                path.unlink()
        except (FileNotFoundError, ValueError):
            pass
