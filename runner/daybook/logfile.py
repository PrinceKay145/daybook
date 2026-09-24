"""Reading LOG.md — append-only history, newest first.

Its one job in the brief is evidence for law 14: which days the *system* failed on, so the
closing line never judges the user against instructions that were never delivered.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from . import markdown as md

_ENTRY = re.compile(r"^(\d{4}-\d{2}-\d{2})\s*(?:[—–-]\s*(.*))?$")
_FAILURE = re.compile(r"system failure|no brief|did not (?:run|fire|generate)", re.I)


@dataclass
class LogEntry:
    day: date
    label: str
    lines: list[str] = field(default_factory=list)

    @property
    def is_system_failure(self) -> bool:
        return bool(_FAILURE.search("\n".join(self.lines)))

    @property
    def summary(self) -> str:
        for para in md.paragraphs(self.lines):
            return para
        for item in md.bullet_items(self.lines):
            return md.strip_markup(item)
        return ""

    @property
    def bullets(self) -> list[str]:
        return [md.strip_markup(b) for b in md.bullet_items(self.lines)]


@dataclass
class Log:
    entries: list[LogEntry] = field(default_factory=list)

    def on(self, day: date) -> LogEntry | None:
        return next((e for e in self.entries if e.day == day), None)

    def most_recent_before(self, day: date) -> LogEntry | None:
        earlier = sorted((e for e in self.entries if e.day < day), key=lambda e: e.day)
        return earlier[-1] if earlier else None

    def system_failures_between(self, start: date, end: date) -> list[LogEntry]:
        return [
            e for e in self.entries if start <= e.day <= end and e.is_system_failure
        ]


def parse(source: str) -> Log:
    _, sections = md.split_sections(source)
    log = Log()
    for section in sections:
        match = _ENTRY.match(section.heading.strip())
        if not match:
            continue
        log.entries.append(
            LogEntry(
                day=date.fromisoformat(match.group(1)),
                label=(match.group(2) or "").strip(),
                lines=section.lines,
            )
        )
    return log
