"""The clock, and where it came from.

Law 5 — verify before asserting, and say which source. Nothing in this system states a
time without being able to name the clock it read. The reference system has seen a sandbox
clock twelve hours wrong and a machine timezone two hours out for weeks.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


@dataclass(frozen=True)
class Clock:
    """A point in time, and the provenance of that point."""

    now: datetime
    source: str
    frozen: bool

    @classmethod
    def from_iso(cls, value: str, source: str) -> "Clock":
        return cls(now=datetime.fromisoformat(value), source=source, frozen=True)

    @classmethod
    def system(cls, timezone: str = "") -> "Clock":
        """The live clock, in the user's own time zone when config.json names one — the
        user may live by a zone their Mac is not set to, and their brief time is theirs."""
        if timezone:
            try:
                zone = ZoneInfo(timezone)
            except (ZoneInfoNotFoundError, ValueError):
                zone = None
            if zone is not None:
                return cls(
                    now=datetime.now(zone).replace(tzinfo=None),
                    source=f"the machine's live clock, in {timezone} (config.json)",
                    frozen=False,
                )
            return cls(
                now=datetime.now(),
                source=f"the machine's live local clock — config.json's time zone "
                f"{timezone!r} is not one this machine knows",
                frozen=False,
            )
        return cls(now=datetime.now(), source="the machine's live local clock", frozen=False)

    @property
    def date(self):
        return self.now.date()

    @property
    def minutes(self) -> int:
        """Minutes since midnight."""
        return self.now.hour * 60 + self.now.minute

    def describe(self) -> str:
        return f"{self.now.isoformat(timespec='minutes')} ({self.source})"
