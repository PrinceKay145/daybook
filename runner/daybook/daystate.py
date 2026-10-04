"""Reading DAY-STATE.md.

Law 2 — one state file wins. When this file disagrees with any other file, it is newer and
it is right. Everything the brief asserts about today comes from here; the other files
supply schedule, history and evidence.

The parser is strict about shape and silent about nothing. A section it cannot read is
recorded as unreadable and the brief says so in place, because BRIEF-SPEC's rule is that a
brief never renders partially and silently.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from . import markdown as md

EMPTY_MARKERS = {"", "-", "—", "–", "n/a", "none"}
DONE_MARKER = re.compile(r"\bDONE\b")


@dataclass
class Action:
    """One item on today's list: a title and the concrete first click."""

    title: str
    detail: str


@dataclass
class FinishedThing:
    """Something DAY-STATE records as finished. Law 1 — it never comes back."""

    label: str
    detail: str


@dataclass
class BoardRow:
    who: str
    what: str
    status: str
    next_move: str
    date: str

    @property
    def is_live(self) -> bool:
        return self.status.upper() in {"WAIT", "CHASE"}

    @property
    def is_explicitly_closed(self) -> bool:
        """Closed only when it says so in every cell.

        A row that is merely *missing* a status is not closed — it is untracked, and V9
        must fail on it. That distinction is the whole point of law 11: a row with no
        status and no date looks tracked and is not.
        """
        return all(
            cell.strip().lower() in EMPTY_MARKERS
            for cell in (self.status, self.next_move, self.date)
        )


@dataclass
class Metric:
    key: str
    value: str
    note: str

    @property
    def is_empty(self) -> bool:
        return md.strip_markup(self.value).lower() in EMPTY_MARKERS


@dataclass
class Habit:
    label: str
    count: str


@dataclass
class DayState:
    true_for: str = ""
    rewritten: str = ""
    today_list: list[Action] = field(default_factory=list)
    today_list_reason: str = ""
    done_for_you: str = ""
    finished: list[FinishedThing] = field(default_factory=list)
    not_on_list: list[str] = field(default_factory=list)
    questions: list[str] = field(default_factory=list)
    board: list[BoardRow] = field(default_factory=list)
    metrics: list[Metric] = field(default_factory=list)
    habits: list[Habit] = field(default_factory=list)
    schedule_line: str = ""
    board_note: str = ""
    unreadable: list[str] = field(default_factory=list)

    @property
    def live_board(self) -> list[BoardRow]:
        return [r for r in self.board if not r.is_explicitly_closed]

    @property
    def closed_board(self) -> list[BoardRow]:
        return [r for r in self.board if r.is_explicitly_closed]


def parse(source: str) -> DayState:
    preamble, sections = md.split_sections(source)
    state = DayState()

    for line in preamble:
        for label, attr in (("True for", "true_for"), ("Rewritten", "rewritten")):
            prefix = f"**{label}:**"
            if line.startswith(prefix):
                setattr(state, attr, md.strip_markup(line[len(prefix):]))

    # "Today's three" is the heading folders written before the list's size was the
    # user's setting still carry; both name the same section.
    _parse_today_list(md.find_section(sections, "today's list", "todays list",
                                      "today's three", "todays three"), state)
    _parse_finished(md.find_section(sections, "not on the list"), state)
    _parse_board(md.find_section(sections, "board"), state)
    _parse_scoreboard(md.find_section(sections, "scoreboard"), state)
    _parse_ticks(md.find_section(sections, "ticks"), state)
    _parse_questions(md.find_section(sections, "open questions"), state)
    return state


def _parse_today_list(section: md.Section | None, state: DayState) -> None:
    if section is None:
        state.unreadable.append("Today's list")
        return
    state.today_list = [Action(title=t, detail=d) for t, d in md.numbered_items(section.lines)]
    for para in md.paragraphs(section.lines):
        plain = md.strip_markup(para)
        if "not on your list" in plain.lower() or plain.lower().startswith("done for you"):
            state.done_for_you = plain
        elif not state.today_list_reason:
            state.today_list_reason = plain


def _parse_finished(section: md.Section | None, state: DayState) -> None:
    if section is None:
        return
    for item in md.bullet_items(section.lines):
        label = md.first_bold(item) or md.strip_markup(item)[:60]
        detail = md.strip_markup(item)
        if DONE_MARKER.search(item):
            state.finished.append(FinishedThing(label=label, detail=detail))
        else:
            # Kept off the list on purpose — a law 12 conversion, or a decision already
            # taken. Not a question: the "Open questions" section is where the crisp
            # form lives, and collecting both puts the same item on screen twice.
            state.not_on_list.append(detail)


def _parse_board(section: md.Section | None, state: DayState) -> None:
    if section is None:
        state.unreadable.append("The board")
        return
    for row in md.parse_table(section.lines):
        state.board.append(
            BoardRow(
                who=md.strip_markup(row.get("who", "")),
                what=md.strip_markup(row.get("what", "")),
                status=md.strip_markup(row.get("status", "")),
                next_move=md.strip_markup(row.get("next_move", "")),
                date=md.strip_markup(row.get("date", "")),
            )
        )
    # The summary sentence under the table is the author's, not ours to recompute.
    # "Silence is stated as expected" is a judgement about the specific people on the
    # board, and DAY-STATE is the file that gets to make it.
    for para in md.paragraphs(section.lines):
        state.board_note = md.strip_markup(para)
        break


def _parse_scoreboard(section: md.Section | None, state: DayState) -> None:
    if section is None:
        state.unreadable.append("Scoreboard")
        return
    for row in md.parse_table(section.lines):
        raw_key = row.get("metric", "")
        spans = md.code_spans(raw_key)
        state.metrics.append(
            Metric(
                key=spans[0] if spans else md.normalise_key(raw_key),
                value=md.strip_markup(row.get("this_week", "")),
                note=md.strip_markup(row.get("note", "")),
            )
        )


def _parse_ticks(section: md.Section | None, state: DayState) -> None:
    if section is None:
        state.unreadable.append("Today's ticks")
        return
    for row in md.parse_table(section.lines):
        state.habits.append(
            Habit(
                label=md.strip_markup(row.get("habit", "")),
                count=md.strip_markup(row.get("last_7_days", "")),
            )
        )
    for line in section.lines:
        stripped = line.strip()
        if stripped.startswith("*") and stripped.endswith("*") and ":" in stripped:
            state.schedule_line = md.strip_markup(stripped.strip("*"))
            break


def _parse_questions(section: md.Section | None, state: DayState) -> None:
    if section is None:
        return
    for raw in section.lines:
        match = re.match(r"^\s*\d+[.)]\s+(.*)$", raw)
        if match:
            state.questions.append(md.strip_markup(match.group(1)))
