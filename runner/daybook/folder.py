"""The folder: the source of truth, opened read-only.

Week 1 reads. The write path — atomic temp-file-and-rename, the advisory lock, the file
watcher and the git auto-commit — is week 2 and is deliberately not here yet. Nothing in
this module may write to the folder.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date

from . import daystate as ds
from . import logfile as lf
from . import schedule as sch
from .clock import Clock
from .paths import FolderScope

# The label for any time the user's day shape does not cover. The setup interview writes
# it for the gaps between the blocks the user named; a folder with no shape at all is one
# Unplanned block. It is the truth about that time, not a placeholder.
UNPLANNED = "Unplanned"


@dataclass
class Heartbeat:
    """Delivery evidence the brief did not generate itself.

    Invariant 5 and law 14. A single process cannot report its own crash, so the daemon
    writes this and a separate party reads it. Without it there is no way to tell "the
    user ignored it" from "nothing ever reached them".
    """

    present: bool
    last_tick: str = ""
    total_fired: int = 0
    fired_this_tick: int = 0
    timezone_offset: str = ""
    schedule_source: str = ""
    alert_style: str = ""

    @property
    def buttons_reachable(self) -> bool:
        """ARCHITECTURE §9.1: under the macOS 'banners' default, 0 of 3 action buttons
        are usable. A brief whose buttons were never reachable is an undelivered
        instruction, so this is a delivery question, not a cosmetic one."""
        return self.alert_style.lower() == "alerts"

    @classmethod
    def read(cls, scope: FolderScope) -> "Heartbeat":
        try:
            raw = json.loads(scope.read_text(".agent-heartbeat.json"))
        except (FileNotFoundError, json.JSONDecodeError):
            return cls(present=False)
        return cls(
            present=True,
            last_tick=raw.get("last_tick", ""),
            total_fired=raw.get("total_fired", 0),
            fired_this_tick=raw.get("fired_this_tick", 0),
            timezone_offset=raw.get("timezone_offset", ""),
            schedule_source=raw.get("schedule_source", ""),
            alert_style=raw.get("alert_style", ""),
        )


@dataclass
class Folder:
    scope: FolderScope
    clock: Clock
    config: dict = field(default_factory=dict)
    day_state: ds.DayState = field(default_factory=ds.DayState)
    log: lf.Log = field(default_factory=lf.Log)
    schedule: sch.Schedule = field(default_factory=sch.Schedule)
    heartbeat: Heartbeat = field(default_factory=lambda: Heartbeat(present=False))
    warnings: list[str] = field(default_factory=list)

    @property
    def today(self) -> date:
        return self.clock.date

    @property
    def owner_name(self) -> str:
        owner = self.config.get("owner", {})
        return owner.get("address_as") or owner.get("name", "")

    @property
    def timezone(self) -> str:
        return self.config.get("owner", {}).get("timezone", "")

    def day_shape(self) -> list[dict]:
        """The blocks of the day from config.json. A folder with none recorded — set up
        before the setup interview asked, or skipped — is one Unplanned block for the whole
        day: the dial stays complete and says nothing that is not true."""
        shape = self.config.get("day_shape") or []
        if shape:
            return shape
        self.warnings.append(
            "No day shape is recorded, so the whole day shows as Unplanned. Describe your "
            "day's blocks in setup to fill the dial."
        )
        return [{"block": UNPLANNED, "start": "00:00", "end": "00:00"}]

    def light_schedule(self) -> sch.DayLight | None:
        """Rank 1 of the source precedence only, in week 1.

        The API and the computed fallback are the observance module's week-4 work. Until
        they exist this returns None rather than a guess — never yesterday's times.
        """
        module = self.config.get("daily_schedule_module", {})
        if not module.get("enabled"):
            return None
        for source in sorted(module.get("source_precedence", []), key=lambda s: s["rank"]):
            if source.get("kind") != "local_table":
                continue
            try:
                text = self.scope.read_text(source["path"])
            except (FileNotFoundError, OSError):
                self.warnings.append(
                    f"The daily schedule's rank-{source['rank']} table "
                    f"({source['path']}) is missing."
                )
                continue
            entry = sch.read_local_table(text, self.today, module.get("label", ""))
            if entry is None:
                self.warnings.append(
                    f"The rank-{source['rank']} table has no row for "
                    f"{self.today.isoformat()}. Not falling back to another day."
                )
                continue
            return entry
        return None


def open_folder(path: str, clock_override: str | None = None) -> Folder:
    """Open a folder and read everything the brief needs."""
    root_scope = FolderScope.open(path)
    config = json.loads((root_scope.root / "config.json").read_text(encoding="utf-8"))
    scope = FolderScope.open(path, alias=config.get("scope", {}).get("root", "~/Secretary"))

    if clock_override:
        clock = Clock.from_iso(clock_override, "the --clock flag")
    elif config.get("fixture_now"):
        clock = Clock.from_iso(config["fixture_now"], "fixture_now in config.json")
    else:
        clock = Clock.system(config.get("owner", {}).get("timezone", ""))

    folder = Folder(scope=scope, clock=clock, config=config)
    # A folder the setup interview has only just written has no reminders yet, and a
    # user may delete any file by hand. An absent file is read as empty and the brief says
    # so; it is never a crash, and never filled in with something plausible.
    folder.day_state = ds.parse(_read_or_empty(folder, "DAY-STATE.md", "No day has been recorded yet"))
    folder.log = lf.parse(_read_or_empty(folder, "LOG.md", "Nothing has been logged yet"))
    folder.schedule = sch.parse(
        _read_or_empty(folder, "reminders.json", "No reminders are set yet", empty="{}")
    )
    folder.heartbeat = Heartbeat.read(scope)
    return folder


def _read_or_empty(folder: Folder, name: str, reason: str, empty: str = "") -> str:
    try:
        return folder.scope.read_text(name)
    except FileNotFoundError:
        folder.warnings.append(f"{reason} — there is no {name} in the folder.")
        return empty
