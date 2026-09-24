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
        clock = Clock.system()

    folder = Folder(scope=scope, clock=clock, config=config)
    folder.day_state = ds.parse(scope.read_text("DAY-STATE.md"))
    folder.log = lf.parse(scope.read_text("LOG.md"))
    folder.schedule = sch.parse(scope.read_text("reminders.json"))
    folder.heartbeat = Heartbeat.read(scope)
    return folder
