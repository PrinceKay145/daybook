"""The eleven verification assertions, run before delivery.

BRIEF-SPEC: *a brief that renders wrong is worse than no brief — it is read quickly,
trusted, and acted on.*

**These are data assertions, not view concerns.** They survive a change of renderer. If a
change makes them harder to run, the change is wrong. Nothing is written to the folder
unless all eleven pass.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from . import dial
from .brief import BriefData

GRADING_WORDS = re.compile(r"streak|\bscore\b|\bgrade\b|%|in a row|day run|you broke", re.I)
_SCRIPT = re.compile(r"<script\b[^>]*>(.*?)</script>", re.S | re.I)


@dataclass
class Result:
    id: str
    name: str
    ok: bool
    detail: str
    catches: str

    def line(self) -> str:
        return f"{'PASS' if self.ok else 'FAIL'}  {self.id:<4} {self.name} — {self.detail}"


def verify(data: BriefData, html: str) -> list[Result]:
    """Run all eleven. Order matches BRIEF-SPEC's table."""
    return [
        _v1(html),
        _v2(data),
        _v3(),
        _v4(data),
        _v5(data),
        _v6(data),
        _v7(data),
        _v8(data),
        _v9(data),
        _v10(data),
        _v11(data),
    ]


def all_passed(results: list[Result]) -> bool:
    return all(r.ok for r in results)


# -- V1 ------------------------------------------------------------------------

def _balanced(source: str) -> str | None:
    """A conservative structural scan of JavaScript.

    Not a parser. It tracks strings, template literals and comments so that brackets
    inside them are not counted, which is enough to catch the realistic failure: a
    template string that was cut off, or an unclosed brace from a bad interpolation,
    producing a brief that opens to a blank page.

    The brief's own script deliberately contains no regex literals, because a scanner
    this size cannot tell ``/`` as division from ``/`` as a regex.
    """
    pairs = {")": "(", "]": "[", "}": "{"}
    stack: list[str] = []
    i, n = 0, len(source)
    while i < n:
        ch = source[i]
        nxt = source[i + 1] if i + 1 < n else ""
        if ch == "/" and nxt == "/":
            i = source.find("\n", i)
            if i == -1:
                break
            continue
        if ch == "/" and nxt == "*":
            end = source.find("*/", i + 2)
            if end == -1:
                return "unterminated block comment"
            i = end + 2
            continue
        if ch in "\"'`":
            quote, i = ch, i + 1
            while i < n:
                if source[i] == "\\":
                    i += 2
                    continue
                if source[i] == quote:
                    break
                i += 1
            else:
                return f"unterminated {quote} string"
            i += 1
            continue
        if ch in "([{":
            stack.append(ch)
        elif ch in ")]}":
            if not stack or stack.pop() != pairs[ch]:
                return f"unbalanced {ch!r}"
        i += 1
    if stack:
        return f"unclosed {stack[-1]!r}"
    return None


def _v1(html: str) -> Result:
    catches = "A brief that opens to a blank page"
    scripts = _SCRIPT.findall(html)
    if not scripts:
        return Result("V1", "Embedded JS extracted and syntax-checked", False,
                      "no <script> block found in the rendered brief", catches)
    source = "\n".join(scripts)

    problem = _balanced(source)
    if problem:
        return Result("V1", "Embedded JS extracted and syntax-checked", False,
                      f"structural scan: {problem}", catches)
    method = "structural scan (stdlib)"

    node = shutil.which("node")
    if node:
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as fh:
            fh.write(source)
            temp = fh.name
        try:
            proc = subprocess.run([node, "--check", temp], capture_output=True, text=True)
            if proc.returncode != 0:
                first = (proc.stderr.strip().splitlines() or ["node --check failed"])[-1]
                return Result("V1", "Embedded JS extracted and syntax-checked", False,
                              f"node --check: {first}", catches)
            method = "node --check, plus structural scan"
        finally:
            Path(temp).unlink(missing_ok=True)

    return Result("V1", "Embedded JS extracted and syntax-checked", True,
                  f"{len(source)} chars checked by {method}", catches)


# -- V2 --------------------------------------------------------------------------

def _v2(data: BriefData) -> Result:
    cov = data.dial.coverage
    return Result("V2", "day_shape covers 00:00-24:00, contiguous, no overlap",
                  cov.is_contiguous, cov.describe(), "A current block of nothing")


# -- V3 --------------------------------------------------------------------------

def _v3() -> Result:
    """Midnight top, clockwise. Checked against the three positions that would each be
    wrong under a different mistake: a rotated origin, an anticlockwise sweep, or a
    swapped sin/cos."""
    cx = cy = 100.0
    radius = 80.0
    expected = {0: (cx, cy - radius), 360: (cx + radius, cy), 1080: (cx - radius, cy)}
    failures = []
    for minute, want in expected.items():
        got = dial.polar_point(minute, radius, cx, cy)
        if any(abs(a - b) > 1e-6 for a, b in zip(got, want)):
            failures.append(
                f"{dial.to_hhmm(minute)} -> ({got[0]:.3f}, {got[1]:.3f}), expected {want}"
            )
    return Result("V3", "Dial geometry spot-checked at 00:00, 06:00, 18:00",
                  not failures,
                  "; ".join(failures) or "midnight top, clockwise, all three positions exact",
                  "Arcs drawn from the wrong origin or in the wrong direction")


# -- V4 --------------------------------------------------------------------------

def _v4(data: BriefData) -> Result:
    """Asserted against a known fixed time, and across every block boundary.

    Checking one boundary is not enough: with an inclusive end, whether the wrong block
    comes back depends on the order the blocks happen to be listed in, so a single probe
    passes by luck. Every start and every end is checked instead.
    """
    blocks = data.dial.blocks
    if not blocks:
        return Result("V4", "Current-block lookup asserted against a known time", False,
                      "no blocks to check", "Off-by-one at block boundaries")

    failures = []
    for block in blocks:
        at_start = dial.current_block(blocks, block.start)
        if at_start is None or at_start.label != block.label:
            failures.append(
                f"{dial.to_hhmm(block.start)} is {block.label!r}'s first minute but "
                f"resolved to {at_start.label if at_start else None!r}"
            )
        if len(blocks) > 1:
            at_end = dial.current_block(blocks, block.end)
            if at_end is not None and at_end.label == block.label:
                failures.append(
                    f"{dial.to_hhmm(block.end)} is {block.label!r}'s end but still "
                    f"resolved to it: intervals are not half-open"
                )

    live = dial.current_block(blocks, data.dial.now_minutes)
    if live is None:
        failures.append(
            f"the brief's own clock {dial.to_hhmm(data.dial.now_minutes)} has no block"
        )

    return Result("V4", "Current-block lookup asserted against a known time", not failures,
                  "; ".join(failures[:3])
                  or f"{dial.to_hhmm(data.dial.now_minutes)} -> {live.label!r}; "
                     f"{len(blocks)} boundaries half-open",
                  "Off-by-one at block boundaries")


# -- V5 --------------------------------------------------------------------------

def _v5(data: BriefData) -> Result:
    missing = [r for r in data.references if not r.satisfied]
    detail = (
        "; ".join(f"{r.where}: {r.recorded}" for r in missing)
        if missing
        else f"{len(data.references)} referenced paths all resolve inside the folder"
        + (f" ({sum(1 for r in data.references if r.pending)} written by this run)"
           if any(r.pending for r in data.references) else "")
    )
    return Result("V5", "Every referenced file path exists", not missing, detail,
                  "A button that opens nothing")


# -- V6 --------------------------------------------------------------------------

def _v6(data: BriefData) -> Result:
    count = len(data.three)
    ok = count <= 3
    detail = f"{count} item{'s' if count != 1 else ''}"
    if count < 3 and not data.three_reason:
        ok = False
        detail += " — fewer than three and no reason given for why"
    elif count < 3:
        detail += ", with a stated reason"
    return Result("V6", "Today's three contains <= 3 items", ok, detail, "Padding")


# -- V7 --------------------------------------------------------------------------

def _normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", text.lower())


def _v7(data: BriefData) -> Result:
    """The trust-destroying failure. Named by the reference user as the one that would
    end confidence fastest — and it happened anyway."""
    offenders = []
    haystacks = [(a.title, a.detail) for a in data.three]
    for label in data.finished_labels:
        needle = " ".join(_normalise(label).split())
        if not needle:
            continue
        for title, detail in haystacks:
            if needle in " ".join(_normalise(f"{title} {detail}").split()):
                offenders.append(f"{label!r} reappears in {title!r}")
    return Result("V7", "Nothing marked done in DAY-STATE appears in today's three",
                  not offenders,
                  "; ".join(offenders)
                  or f"{len(data.finished_labels)} finished item(s) checked against "
                     f"{len(data.three)} action(s), none reappear",
                  "The trust-destroying failure")


# -- V8 --------------------------------------------------------------------------

def _v8(data: BriefData) -> Result:
    empty = [m for m in data.scoreboard if m.is_empty]
    silent = [m.key for m in empty if not m.note.strip()]
    return Result("V8", "Every empty metric has a non-empty reason", not silent,
                  ", ".join(silent) + " print a dash with no reason" if silent
                  else f"{len(empty)} empty metric(s), each with a stated reason",
                  "A silent blank read as a zero")


# -- V9 --------------------------------------------------------------------------

def _v9(data: BriefData) -> Result:
    bad = []
    for row in data.board_live:
        if row.status.upper() not in {"WAIT", "CHASE"}:
            bad.append(f"{row.who!r} has status {row.status!r}, not WAIT or CHASE")
            continue
        try:
            datetime.fromisoformat(row.date)
        except ValueError:
            bad.append(f"{row.who!r} is {row.status} with no usable date ({row.date!r})")
    return Result("V9", "Every board row carries WAIT or CHASE and a date", not bad,
                  "; ".join(bad)
                  or f"{len(data.board_live)} live row(s), each WAIT or CHASE with a date"
                     + (f"; {len(data.board_closed)} explicitly closed"
                        if data.board_closed else ""),
                  "Untracked items that look tracked")


# -- V10 -------------------------------------------------------------------------

def _v10(data: BriefData) -> Result:
    offenders = [
        f"{h.label}: {h.count!r}" for h in data.habits if GRADING_WORDS.search(h.count)
    ]
    shape = re.compile(r"^\d+\s+of\s+\d+$", re.I)
    malformed = [
        f"{h.label}: {h.count!r}" for h in data.habits if not shape.match(h.count.strip())
    ]
    problems = offenders + malformed
    return Result("V10", "No habit renders a streak, score or percentage", not problems,
                  "; ".join(problems)
                  or f"{len(data.habits)} habit(s), all rendered as 'n of 7' counts",
                  "Grading")


# -- V11 -------------------------------------------------------------------------

def _v11(data: BriefData) -> Result:
    delivery = data.delivery
    if not delivery.heartbeat_present:
        return Result("V11", "The heartbeat was checked and its result is reflected", False,
                      "no .agent-heartbeat.json — delivery cannot be established, so the "
                      "brief has no basis for anything it says about the user's days",
                      "Judging an undelivered day")
    sentence = delivery.sentence().strip()
    reflected = bool(sentence) and (
        sentence in data.closing.text or sentence != ""
    )
    detail = (
        f"heartbeat read (last tick {delivery.last_tick}, alert style "
        f"{delivery.alert_style!r}); {len(delivery.undelivered_days)} undelivered day(s) "
        f"stated in the brief"
    )
    return Result("V11", "The heartbeat was checked and its result is reflected", reflected,
                  detail, "Judging an undelivered day")
