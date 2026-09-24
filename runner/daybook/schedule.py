"""reminders.json and the daily-shifting schedule.

Read from the file at tick time, never from an index. CLAUDE.md: a second copy of the
schedule is how calendar drift starts.

Week 1 uses this read-only, for the brief's "Next up" line and for the diagnostics. The
firing side of the daemon is week 4 and is not reimplemented here — see CLAUDE.md rule 2.
"""

from __future__ import annotations

import calendar
import json
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


@dataclass
class ActionTarget:
    """``{"label", and exactly one of "url" | "path"}``.

    The kind *is* the key — there is no kind/target pair. ``shell`` is disabled in v1:
    the agent writes this file, so "shell commands come only from the user's own config"
    would otherwise launder injected content into execution (CLAUDE.md rule 3, law 21).
    """

    label: str
    url: str | None = None
    path: str | None = None

    @property
    def kind(self) -> str:
        return "url" if self.url else "path"

    @property
    def target(self) -> str:
        return self.url or self.path or ""


@dataclass
class Reminder:
    id: str
    title: str
    message: str = ""
    time: str | None = None
    datetime_: str | None = None
    repeat: str = "daily"
    days: list[str] = field(default_factory=list)
    day: int | None = None
    lead_minutes: int = 10
    enabled: bool = True
    actions: list[ActionTarget] = field(default_factory=list)
    unmute: dict | None = None
    paused: str | None = None

    def due_on(self, when: date) -> datetime | None:
        """The moment this reminder comes due on ``when``, or None."""
        if self.repeat == "once":
            if not self.datetime_:
                return None
            moment = datetime.fromisoformat(self.datetime_)
            return moment if moment.date() == when else None

        if not self.time:
            return None
        hour, minute = (int(part) for part in self.time.split(":"))
        key = WEEKDAY_KEYS[when.weekday()]

        if self.repeat == "daily":
            matches = True
        elif self.repeat == "weekdays":
            matches = when.weekday() < 5
        elif self.repeat == "weekly":
            matches = key in [d.lower() for d in self.days]
        elif self.repeat == "monthly":
            last = calendar.monthrange(when.year, when.month)[1]
            wanted = last if self.day == -1 else self.day
            matches = when.day == wanted
        else:
            matches = False

        return datetime.combine(when, datetime.min.time()).replace(
            hour=hour, minute=minute
        ) if matches else None

    @property
    def has_dated_unmute(self) -> bool:
        return bool(self.unmute and self.unmute.get("date"))


@dataclass
class Schedule:
    config: dict = field(default_factory=dict)
    reminders: list[Reminder] = field(default_factory=list)

    @property
    def catchup_window(self) -> timedelta:
        return timedelta(minutes=self.config.get("catchup_window_minutes", 20))

    def due_between(self, start: datetime, end: datetime) -> list[tuple[Reminder, datetime]]:
        out = []
        for reminder in self.reminders:
            if not reminder.enabled:
                continue
            for offset in (0, 1):
                moment = reminder.due_on((start + timedelta(days=offset)).date())
                if moment and start <= moment < end:
                    out.append((reminder, moment))
        return sorted(out, key=lambda pair: pair[1])

    def next_after(self, moment: datetime) -> tuple[Reminder, datetime] | None:
        """The next enabled reminder due at or after ``moment``, looking two days out."""
        upcoming = self.due_between(moment, moment + timedelta(days=2))
        return upcoming[0] if upcoming else None

    def invalid_mutes(self) -> list[Reminder]:
        """Law 24: a mute without a dated companion that performs the un-mute is not a
        mute, it is a deletion with extra steps."""
        return [r for r in self.reminders if not r.enabled and not r.has_dated_unmute]


def parse(source: str) -> Schedule:
    raw = json.loads(source)
    schedule = Schedule(config=raw.get("config", {}))
    default_lead = schedule.config.get("default_lead_minutes", 10)
    for item in raw.get("reminders", []):
        schedule.reminders.append(
            Reminder(
                id=item["id"],
                title=item.get("title", item["id"]),
                message=item.get("message", ""),
                time=item.get("time"),
                datetime_=item.get("datetime"),
                repeat=item.get("repeat", "daily"),
                days=item.get("days", []),
                day=item.get("day"),
                lead_minutes=item.get("lead_minutes", default_lead),
                enabled=item.get("enabled", True),
                actions=[
                    ActionTarget(
                        label=a.get("label", ""), url=a.get("url"), path=a.get("path")
                    )
                    for a in item.get("actions", [])
                ],
                unmute=item.get("_unmute"),
                paused=item.get("_paused"),
            )
        )
    return schedule


# -- the daily-shifting schedule ------------------------------------------------

@dataclass
class DayLight:
    """One day of the generalised observance module's table."""

    entries: dict[str, str]
    source_kind: str
    source_label: str

    def describe(self) -> str:
        parts = ", ".join(
            f"{key.replace('_', ' ')} {value}" for key, value in self.entries.items()
        )
        return parts


def read_local_table(text: str, when: date, label: str) -> DayLight | None:
    """Rank 1 of the source precedence: a transcribed authoritative timetable.

    Never yesterday's times — they shift daily and a wrong time is worse than no time. If
    the table has no row for ``when``, this returns None and the caller falls through
    rather than reaching for the nearest row.
    """
    table = json.loads(text)
    for row in table.get("days", []):
        if row.get("date") == when.isoformat():
            entries = {k: v for k, v in row.items() if k != "date"}
            return DayLight(entries=entries, source_kind="local_table", source_label=label)
    return None
