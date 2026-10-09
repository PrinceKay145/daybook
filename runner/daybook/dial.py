"""The 24-hour dial: block coverage and arc geometry.

Midnight at the top, clockwise. An angle is measured from 12 o'clock, so::

    theta = 2 * pi * minutes / 1440
    x = cx + r * sin(theta)
    y = cy - r * cos(theta)

which puts 00:00 at the top, 06:00 at the right, 12:00 at the bottom and 18:00 at the
left. V3 spot-checks exactly those positions, because an arc drawn from the wrong origin
or in the wrong direction renders a plausible-looking dial that is simply wrong.

The contiguity check is the other half. BRIEF-SPEC: a gap silently produces a current
block of nothing, and the centre renders empty with no error. This assertion is the only
thing that catches it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

MINUTES_IN_DAY = 1440


def to_minutes(hhmm: str) -> int:
    hour, minute = (int(part) for part in hhmm.strip().split(":"))
    return hour * 60 + minute


def to_hhmm(minutes: int) -> str:
    minutes %= MINUTES_IN_DAY
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


@dataclass(frozen=True)
class Block:
    """One block of the day shape, possibly wrapping midnight."""

    label: str
    start: int
    end: int

    @property
    def wraps(self) -> bool:
        return self.end <= self.start

    def spans(self) -> list[tuple[int, int]]:
        """As one or two non-wrapping [start, end) intervals."""
        if not self.wraps:
            return [(self.start, self.end)]
        return [(self.start, MINUTES_IN_DAY), (0, self.end)]

    def contains(self, minute: int) -> bool:
        return any(start <= minute < end for start, end in self.spans())

    @property
    def length(self) -> int:
        return sum(end - start for start, end in self.spans())


def blocks_from_config(day_shape: list[dict]) -> list[Block]:
    return [
        Block(label=b["block"], start=to_minutes(b["start"]), end=to_minutes(b["end"]))
        for b in day_shape
    ]


@dataclass
class Coverage:
    gaps: list[tuple[int, int]]
    overlaps: list[tuple[int, int]]

    @property
    def is_contiguous(self) -> bool:
        return not self.gaps and not self.overlaps

    def describe(self) -> str:
        if self.is_contiguous:
            return "00:00-24:00 covered, contiguous, no overlap"
        parts = []
        for start, end in self.gaps:
            parts.append(f"gap {to_hhmm(start)}-{to_hhmm(end)}")
        for start, end in self.overlaps:
            parts.append(f"overlap {to_hhmm(start)}-{to_hhmm(end)}")
        return "; ".join(parts)


def coverage(blocks: list[Block]) -> Coverage:
    """Minute-by-minute cover count. Cheap, exact, and impossible to get subtly wrong."""
    counts = [0] * MINUTES_IN_DAY
    for block in blocks:
        for start, end in block.spans():
            for minute in range(start, end):
                counts[minute] += 1

    def runs(predicate) -> list[tuple[int, int]]:
        out, start = [], None
        for minute, count in enumerate(counts):
            if predicate(count) and start is None:
                start = minute
            elif not predicate(count) and start is not None:
                out.append((start, minute))
                start = None
        if start is not None:
            out.append((start, MINUTES_IN_DAY))
        return out

    return Coverage(gaps=runs(lambda c: c == 0), overlaps=runs(lambda c: c > 1))


def overlay(blocks: list[Block], events: list[tuple[str, int, int]]) -> list[Block]:
    """Today's own blocks laid over the typical day. Each (label, start, end) takes its
    span from whatever the day shape had there, so the dial shows today rather than a
    typical day; the rest of the day shape stays as it was. With no events the day shape
    comes back unchanged. A gap in the day shape stays a gap, for V2 to report."""
    if not events:
        return blocks
    owner: list[tuple[str, int] | None] = [None] * MINUTES_IN_DAY
    for index, block in enumerate(blocks):
        for start, end in block.spans():
            for minute in range(start, end):
                owner[minute] = ("shape", index)
    for index, (label, start, end) in enumerate(events):
        for s, e in Block(label, start, end).spans():
            for minute in range(s, e):
                owner[minute] = ("today", index)
    runs: list[tuple[tuple[str, int] | None, int, int]] = []
    first = 0
    for minute in range(1, MINUTES_IN_DAY + 1):
        if minute == MINUTES_IN_DAY or owner[minute] != owner[first]:
            runs.append((owner[first], first, minute))
            first = minute
    # A run that touches midnight on both sides is one block that wraps (Sleep 23:30–06:30).
    if len(runs) > 1 and runs[0][0] is not None and runs[0][0] == runs[-1][0]:
        last, head = runs.pop(), runs.pop(0)
        runs.append((head[0], last[1], head[2]))
    out = []
    for who, start, end in runs:
        if who is None:
            continue
        kind, index = who
        label = blocks[index].label if kind == "shape" else events[index][0]
        out.append(Block(label=label, start=start, end=end % MINUTES_IN_DAY))
    return out


def current_block(blocks: list[Block], minute: int) -> Block | None:
    """The block containing ``minute``. Start inclusive, end exclusive.

    The half-open interval is what makes 09:00 belong to the block that starts at 09:00
    and not the one that ends there — V4's off-by-one at block boundaries.
    """
    return next((b for b in blocks if b.contains(minute % MINUTES_IN_DAY)), None)


def until(block: Block, minute: int) -> int:
    """Minutes remaining in ``block`` from ``minute``."""
    remaining = (block.end - minute) % MINUTES_IN_DAY
    return remaining or MINUTES_IN_DAY


# -- geometry -------------------------------------------------------------------

def polar_point(minute: int, radius: float, cx: float, cy: float) -> tuple[float, float]:
    theta = 2 * math.pi * (minute % MINUTES_IN_DAY) / MINUTES_IN_DAY
    return (cx + radius * math.sin(theta), cy - radius * math.cos(theta))


def arc_path(start: int, end: int, outer: float, inner: float, cx: float, cy: float) -> str:
    """An SVG path for one annular sector, drawn clockwise from ``start`` to ``end``."""
    sweep = (end - start) % MINUTES_IN_DAY or MINUTES_IN_DAY
    large = 1 if sweep > MINUTES_IN_DAY / 2 else 0
    x1, y1 = polar_point(start, outer, cx, cy)
    x2, y2 = polar_point(start + sweep, outer, cx, cy)
    x3, y3 = polar_point(start + sweep, inner, cx, cy)
    x4, y4 = polar_point(start, inner, cx, cy)
    return (
        f"M {x1:.3f} {y1:.3f} "
        f"A {outer:.3f} {outer:.3f} 0 {large} 1 {x2:.3f} {y2:.3f} "
        f"L {x3:.3f} {y3:.3f} "
        f"A {inner:.3f} {inner:.3f} 0 {large} 0 {x4:.3f} {y4:.3f} Z"
    )
