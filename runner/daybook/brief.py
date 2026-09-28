"""Building the brief's data.

The seven sections and their order are the argument — where am I, what now, what matters,
how am I doing, what am I keeping up, who am I waiting on, and a human note. This module
produces the *data*; ``render`` produces the view; ``assertions`` checks the data before
anything is delivered. Keeping them apart is what makes the eleven assertions survive a
change of renderer.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from . import dial
from .daystate import Action, BoardRow, Habit, Metric
from .folder import Folder
from .schedule import ActionTarget


@dataclass
class DialData:
    blocks: list[dial.Block]
    non_negotiables: list[dict]
    now_minutes: int
    current: dial.Block | None
    until_minutes: int
    coverage: dial.Coverage


@dataclass
class NextUp:
    title: str
    at: str
    in_minutes: int
    message: str
    actions: list[ActionTarget] = field(default_factory=list)

    def describe(self) -> str:
        if self.in_minutes <= 0:
            return f"{self.title} — now, {self.at}"
        if self.in_minutes < 60:
            return f"{self.title} at {self.at} — in {self.in_minutes} minutes"
        hours, minutes = divmod(self.in_minutes, 60)
        tail = f"{hours}h" if not minutes else f"{hours}h {minutes}m"
        return f"{self.title} at {self.at} — in {tail}"


@dataclass
class Delivery:
    """What the system knows about whether it reached the user.

    Law 14 — never judge a day against instructions that were never delivered.
    """

    heartbeat_present: bool
    last_tick: str
    alert_style: str
    buttons_reachable: bool
    undelivered_days: list[date] = field(default_factory=list)

    yesterday_delivered: bool = True

    @property
    def healthy(self) -> bool:
        return self.heartbeat_present and self.buttons_reachable and not self.undelivered_days

    @property
    def currently_broken(self) -> bool:
        """Delivery is broken *now* — as opposed to having been broken earlier in the week.

        The distinction matters for the closing line. A gap four days ago is a fact the
        brief must state, so that nothing on that day is counted against the user; it is
        not a reason for every closing line for the rest of the week to be an outage
        notice. Law 14 is about not judging an undelivered day, not about never moving on.
        """
        return (
            not self.heartbeat_present
            or not self.buttons_reachable
            or not self.yesterday_delivered
        )

    def sentence(self) -> str:
        if not self.heartbeat_present:
            return (
                "There is no heartbeat file, so this brief cannot tell whether "
                "yesterday's reminders reached you. Nothing below is a judgement on "
                "your day."
            )
        parts = []
        if self.undelivered_days:
            days = ", ".join(d.strftime("%-d %B") for d in self.undelivered_days)
            parts.append(
                f"The system did not reach you on {days}. That is a system failure, "
                f"not a day you missed, and nothing on it is counted against you."
            )
        if not self.buttons_reachable:
            parts.append(
                f"Notification alert style is '{self.alert_style}', not 'alerts', so "
                f"action buttons are not reachable. Instructions sent this way count as "
                f"undelivered."
            )
        if not parts:
            parts.append(f"The system has reached you every day. Last tick {self.last_tick}.")
        return " ".join(parts)


@dataclass
class ClosingLine:
    text: str
    source: str


@dataclass
class PathReference:
    where: str
    recorded: str
    exists: bool
    pending: bool = False

    @property
    def satisfied(self) -> bool:
        return self.exists or self.pending


@dataclass
class BriefData:
    generated_for: date
    true_for: str
    owner_name: str
    timezone: str
    clock_description: str
    clock_frozen: bool

    dial: DialData
    next_up: NextUp | None
    three: list[Action]
    three_reason: str
    done_for_you: str
    scoreboard: list[Metric]
    habits: list[Habit]
    light_schedule_line: str
    light_schedule_source: str
    board_live: list[BoardRow]
    board_closed: list[BoardRow]
    board_note: str
    not_on_list: list[str]
    questions: list[str]
    delivery: Delivery
    closing: ClosingLine

    references: list[PathReference] = field(default_factory=list)
    pending_outputs: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    finished_labels: list[str] = field(default_factory=list)


def build(folder: Folder, pending_outputs: list[str] | None = None) -> BriefData:
    state = folder.day_state
    now = folder.clock.now
    minutes = folder.clock.minutes
    pending = list(pending_outputs or [])

    blocks = dial.blocks_from_config(folder.day_shape())
    current = dial.current_block(blocks, minutes)
    dial_data = DialData(
        blocks=blocks,
        non_negotiables=_todays_non_negotiables(folder, folder.today),
        now_minutes=minutes,
        current=current,
        until_minutes=dial.until(current, minutes) if current else 0,
        coverage=dial.coverage(blocks),
    )

    upcoming = folder.schedule.next_after(now)
    next_up = None
    if upcoming:
        reminder, moment = upcoming
        next_up = NextUp(
            title=reminder.title,
            at=moment.strftime("%H:%M"),
            in_minutes=int((moment - now).total_seconds() // 60),
            message=reminder.message,
            actions=reminder.actions,
        )

    light = folder.light_schedule()
    delivery = _delivery(folder)

    return BriefData(
        generated_for=folder.today,
        true_for=state.true_for,
        owner_name=folder.owner_name,
        timezone=folder.timezone,
        clock_description=folder.clock.describe(),
        clock_frozen=folder.clock.frozen,
        dial=dial_data,
        next_up=next_up,
        three=state.three,
        three_reason=state.three_reason or _no_three_reason(state),
        done_for_you=state.done_for_you,
        scoreboard=state.metrics,
        habits=state.habits,
        light_schedule_line=light.describe() if light else "",
        light_schedule_source=_light_source(folder, light),
        board_live=state.live_board,
        board_closed=state.closed_board,
        board_note=state.board_note or _board_note(state.live_board, folder.today),
        not_on_list=state.not_on_list,
        questions=state.questions,
        delivery=delivery,
        closing=_closing_line(folder, delivery),
        references=_references(folder, pending),
        pending_outputs=pending,
        warnings=list(folder.warnings),
        finished_labels=[f.label for f in state.finished],
    )


def _no_three_reason(state) -> str:
    """A day state that lists nothing for today — a folder set up today, before any nightly
    close — still owes the reader a reason (V6). The reason is the fact: there is no list
    yet. Nothing is invented to fill the gap (never manufacture an item)."""
    if state.three:
        return ""
    return (
        "Nothing is listed for today yet — the day state has no list, and nothing is "
        "invented to fill one. The first nightly close writes it from what actually happened."
    )


def _light_source(folder: Folder, light) -> str:
    if light is None:
        return ""
    module = folder.config.get("daily_schedule_module", {})
    for source in sorted(module.get("source_precedence", []), key=lambda s: s["rank"]):
        if source.get("kind") == light.source_kind:
            return f"rank {source['rank']}, {source['kind']}"
    return light.source_kind


def _todays_non_negotiables(folder: Folder, when: date) -> list[dict]:
    key = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][when.weekday()]
    out = []
    for item in folder.config.get("non_negotiables", []):
        days = [d.lower() for d in item.get("days", ["all"])]
        if "all" in days or key in days:
            out.append(item)
    return out


def _board_note(rows: list[BoardRow], today: date) -> str:
    """Silence stated as expected. Without this, silence on day twenty reads the same as
    silence on day two and nothing ever gets chased."""
    waiting = [r for r in rows if r.status.upper() == "WAIT"]
    if not waiting:
        return ""
    ages = []
    for row in waiting:
        try:
            ages.append((date.fromisoformat(row.date) - today).days)
        except ValueError:
            continue
    if not ages:
        return f"{len(waiting)} waiting on someone else."
    soonest = min(ages)
    if soonest >= 0:
        return (
            f"{len(waiting)} of {len(rows)} waiting on someone else. "
            f"Nothing here is late yet — the earliest move is due in {soonest} day"
            f"{'s' if soonest != 1 else ''}."
        )
    return f"{len(waiting)} waiting, and {sum(1 for a in ages if a < 0)} past its date."


def _delivery(folder: Folder) -> Delivery:
    window_start = folder.today - timedelta(days=7)
    failures = folder.log.system_failures_between(window_start, folder.today)
    failed_days = [e.day for e in failures]
    return Delivery(
        heartbeat_present=folder.heartbeat.present,
        last_tick=folder.heartbeat.last_tick,
        alert_style=folder.heartbeat.alert_style,
        buttons_reachable=folder.heartbeat.buttons_reachable,
        undelivered_days=failed_days,
        yesterday_delivered=(folder.today - timedelta(days=1)) not in failed_days,
    )


def _closing_line(folder: Folder, delivery: Delivery) -> ClosingLine:
    """Grounded in something that actually happened, never generic encouragement.

    Week 1 has no provider layer — that is week 3 — so this is assembled from the log
    rather than written by a model, and it says so. Naming the source is law 5; inventing
    a warm line and presenting it as the secretary's voice would be the dishonest option.
    """
    if delivery.currently_broken:
        return ClosingLine(text=delivery.sentence(), source="delivery evidence")

    previous = folder.log.most_recent_before(folder.today)
    if previous and previous.bullets:
        when = previous.day.strftime("%A")
        return ClosingLine(
            text=f"{when}: {previous.bullets[0]}",
            source=f"LOG.md, {previous.day.isoformat()}",
        )
    return ClosingLine(
        text="No entry in the log for yesterday, so there is nothing to point at here.",
        source="LOG.md",
    )


def _references(folder: Folder, pending: list[str]) -> list[PathReference]:
    """Every path the folder points at. V5 asserts each one resolves to something real.

    A path the run is about to write counts as satisfied — otherwise a fresh folder could
    never pass its own first brief, because ``briefs/latest.html`` does not exist until
    the brief that references it has been written.
    """
    out: list[PathReference] = []
    seen: set[tuple[str, str]] = set()

    def add(where: str, recorded: str) -> None:
        key = (where, recorded)
        if key in seen:
            return
        seen.add(key)
        normalised = recorded.rstrip("/")
        is_pending = any(normalised.endswith(p.rstrip("/")) for p in pending)
        out.append(
            PathReference(
                where=where,
                recorded=recorded,
                exists=folder.scope.exists(recorded),
                pending=is_pending,
            )
        )

    for reminder in folder.schedule.reminders:
        for action in reminder.actions:
            if action.path:
                add(f"reminders.json: {reminder.id}", action.path)

    module = folder.config.get("daily_schedule_module", {})
    for source in module.get("source_precedence", []):
        if source.get("path"):
            add("config.json: daily_schedule_module", source["path"])

    from . import markdown as md

    for name in ("DAY-STATE.md", "MASTER-PLAN.md"):
        try:
            text = folder.scope.read_text(name)
        except FileNotFoundError:
            continue
        for span in md.code_spans(text):
            if "/" in span and not span.startswith(("http", "#")) and " " not in span:
                add(name, span)

    return out
