"""Rendering the brief as one self-contained HTML file.

No external assets, no build step, no browser storage. Opening it is the entire
deployment. It must still open in five years, on a machine with no app installed, from a
folder restored out of a backup — which is also what lets it render when everything else
is down. Its two typefaces (Newsreader for the date and the day's list, Hanken Grotesk
for the rest; SIL Open Font License) are embedded in the file, Latin only, about 85 KB.

It reads in the spec's order — where am I, what now, what matters, how am I doing, what am
I keeping up, who am I waiting on, a human note — laid out in two columns when the window
is wide (the day beside today's list) and one when it is narrow. Light and dark both, and
phone width, because it will be opened on a phone from a synced folder.
"""

from __future__ import annotations

import base64
import html
from datetime import date
from functools import lru_cache
from pathlib import Path

from . import dial
from .brief import BriefData
from .folder import UNPLANNED

FONT_DIR = Path(__file__).parent / "fonts"
# (family, weight, file, format). Latin only: anything else falls back to the system face.
FONTS = (
    ("Newsreader", "500", "Newsreader-500-latin.woff", "woff"),
    ("Hanken Grotesk", "400 700", "HankenGrotesk-latin.woff2", "woff2"),
)
LATIN = ("U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, "
         "U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, "
         "U+FEFF, U+FFFD")

# Blocks are tints of Daybook's ink; sleep is the deepest; the block you are in is the
# accent; unplanned time is the quiet ring underneath, never one more colour.
BLOCK_TINTS = ("var(--b1)", "var(--b2)", "var(--b3)")

CX = CY = 160.0
R_OUTER, R_INNER = 124.0, 104.0
R_TICK_IN, R_TICK_OUT = 128.0, 138.0
R_HAND_IN, R_HAND_OUT = 72.0, 99.0  # the hand stops short of the time in the middle


def esc(text: str) -> str:
    return html.escape(str(text), quote=True)


def _fmt_date(when: date) -> str:
    return when.strftime("%A %-d %B %Y")


def _fmt_day(text: str) -> str:
    """A board date as a person reads it ("Thu 12 Mar"); anything that is not an ISO date
    is shown exactly as written."""
    try:
        return date.fromisoformat(text.strip()).strftime("%a %-d %b")
    except ValueError:
        return text


@lru_cache(maxsize=1)
def _font_faces() -> str:
    """@font-face rules with the fonts inlined. A missing file is skipped, never fatal:
    the stack falls back to the system's own faces."""
    faces = []
    for family, weight, name, fmt in FONTS:
        try:
            data = base64.b64encode((FONT_DIR / name).read_bytes()).decode("ascii")
        except OSError:
            continue
        faces.append(
            f'@font-face {{ font-family: "{family}"; font-style: normal; font-weight: {weight}; '
            f'font-display: swap; src: url(data:font/{fmt};base64,{data}) format("{fmt}"); '
            f"unicode-range: {LATIN}; }}"
        )
    return "\n".join(faces)


def _label_colours(blocks) -> dict[str, str]:
    """One colour per label, so a block that appears twice looks like itself twice."""
    colours: dict[str, str] = {}
    for block in blocks:
        if block.label in colours:
            continue
        if block.label == UNPLANNED:
            colours[block.label] = "var(--unplanned)"
        elif block.label.lower() == "sleep":
            colours[block.label] = "var(--sleep)"
        else:
            planned = sum(1 for label in colours if label not in (UNPLANNED,) and label.lower() != "sleep")
            colours[block.label] = BLOCK_TINTS[planned % len(BLOCK_TINTS)]
    return colours


def _dial_svg(data: BriefData) -> str:
    parts: list[str] = []
    blocks = data.dial.blocks
    colours = _label_colours(blocks)

    # The ring's two edges, faint and dotted, so even a wholly unplanned day draws a dial.
    for r in (R_OUTER, R_INNER):
        parts.append(f'<circle class="dial-edge" cx="{CX}" cy="{CY}" r="{r}" />')

    for block in blocks:
        colour = _colour(data, block, colours)
        title = f"<title>{esc(block.label)} · {_hours(block)}</title>"
        live = " dial-arc-now" if block is data.dial.current else ""
        for start, end in block.spans():
            if end <= start:
                continue
            if end - start >= dial.MINUTES_IN_DAY:
                # A block that is the whole day: an arc from a point back to itself draws
                # nothing, so the whole ring is one circle.
                parts.append(
                    f'<circle class="dial-ring{live}" cx="{CX}" cy="{CY}" r="{(R_OUTER + R_INNER) / 2}" '
                    f'style="stroke:{colour};stroke-width:{R_OUTER - R_INNER}">{title}</circle>'
                )
                continue
            path = dial.arc_path(start, end, R_OUTER, R_INNER, CX, CY)
            parts.append(f'<path class="dial-arc{live}" d="{path}" style="fill:{colour}">{title}</path>')

    for hour in range(0, 24, 3):
        minute = hour * 60
        x1, y1 = dial.polar_point(minute, R_OUTER + 3, CX, CY)
        x2, y2 = dial.polar_point(minute, R_OUTER + 7, CX, CY)
        parts.append(f'<line class="dial-hour" x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" />')
        if hour % 6 == 0:
            lx, ly = dial.polar_point(minute, R_OUTER + 21, CX, CY)
            parts.append(f'<text class="dial-hour-label" x="{lx:.2f}" y="{ly:.2f}">{hour:02d}</text>')

    # Non-negotiables tick OUTSIDE the ring, never as arcs within it. They are not blocks
    # that can be moved or shortened, and drawing them as blocks invites treating them as
    # negotiable.
    for item in data.dial.non_negotiables:
        marks: list[int] = []
        if item.get("time"):
            marks.append(dial.to_minutes(item["time"]))
        elif item.get("start"):
            marks.append(dial.to_minutes(item["start"]))
        for minute in marks:
            x1, y1 = dial.polar_point(minute, R_TICK_IN, CX, CY)
            x2, y2 = dial.polar_point(minute, R_TICK_OUT, CX, CY)
            parts.append(
                f'<line class="dial-fixed" x1="{x1:.2f}" y1="{y1:.2f}" '
                f'x2="{x2:.2f}" y2="{y2:.2f}">'
                f'<title>{esc(item.get("label", ""))} · non-negotiable</title></line>'
            )

    hx1, hy1 = dial.polar_point(data.dial.now_minutes, R_HAND_IN, CX, CY)
    hx2, hy2 = dial.polar_point(data.dial.now_minutes, R_HAND_OUT, CX, CY)
    parts.append(
        f'<line id="hand" class="dial-hand" x1="{hx1:.2f}" y1="{hy1:.2f}" '
        f'x2="{hx2:.2f}" y2="{hy2:.2f}" />'
    )

    current = data.dial.current
    now_text = dial.to_hhmm(data.dial.now_minutes)
    block_text = current.label if current else "no block"
    until_text = f"until {dial.to_hhmm(current.end)}" if current else "day shape has a gap"

    return f"""<svg class="dial" viewBox="0 0 320 320" role="img"
     aria-label="The day as a 24-hour dial, midnight at the top">
  {''.join(parts)}
  <text id="dial-now" class="dial-now" x="{CX}" y="{CY - 4}">{esc(now_text)}</text>
  <text class="dial-block" x="{CX}" y="{CY + 17}">{esc(block_text)}</text>
  <text class="dial-until" x="{CX}" y="{CY + 33}">{esc(until_text)}</text>
</svg>"""


def _colour(data: BriefData, block, colours: dict[str, str]) -> str:
    """The block you are in takes the accent — unless it is unplanned time, which is not a
    plan and never looks like one."""
    if block is data.dial.current and block.label != UNPLANNED:
        return "var(--accent)"
    return colours[block.label]


def _hours(block) -> str:
    if block.length >= dial.MINUTES_IN_DAY:
        return "all day"
    return f"{dial.to_hhmm(block.start)}–{dial.to_hhmm(block.end)}"


def _legend(data: BriefData) -> str:
    """Each block of the day with its hours, in the order the day shape lists them."""
    colours = _label_colours(data.dial.blocks)
    rows = []
    for block in data.dial.blocks:
        now = block is data.dial.current
        rows.append(
            f'<li class="{"now" if now else ""}"><i style="background:{_colour(data, block, colours)}"></i>'
            f"<span>{esc(block.label)}</span><time>{_hours(block)}</time></li>"
        )
    return f'<ul class="legend">{"".join(rows)}</ul>'


def _next_up(data: BriefData) -> str:
    nxt = data.next_up
    if not nxt:
        return '<p class="next-line empty">Nothing else is scheduled today.</p>'
    if nxt.in_minutes <= 0:
        when = "now"
    elif nxt.in_minutes < 60:
        when = f"in {nxt.in_minutes} minutes"
    else:
        hours, minutes = divmod(nxt.in_minutes, 60)
        when = f"in {hours}h" if not minutes else f"in {hours}h {minutes}m"
    return (f'<p class="next-line"><strong>{esc(nxt.title)}</strong> at '
            f"<time>{esc(nxt.at)}</time>, {when}</p>")


def _section_today_list(data: BriefData) -> str:
    if not data.today_list:
        # The reason is the brief's own (V6 asserts one exists); the page shows it rather
        # than a second, different explanation.
        return f'<p class="empty">— {esc(data.today_list_reason)}</p>'
    items = "".join(
        f'<li><span class="ix">{n}</span><div><h3 class="action-title">{esc(a.title)}</h3>'
        f'<p class="action-detail">{esc(a.detail)}</p></div></li>'
        for n, a in enumerate(data.today_list, 1)
    )
    reason = (
        f'<p class="reason">{esc(data.today_list_reason)}</p>'
        if len(data.today_list) < data.list_max and data.today_list_reason
        else ""
    )
    note = (
        f'<p class="for-you"><span class="tag">not on your list</span>'
        f"{esc(data.done_for_you)}</p>"
        if data.done_for_you
        else ""
    )
    return f'{reason}<ol class="today-list">{items}</ol>{note}'


def _metric_label(data: BriefData, key: str) -> str:
    label = data.metric_labels.get(key)
    if label:
        return label
    words = key.replace("_", " ").strip()
    return words[:1].upper() + words[1:]


def _section_scoreboard(data: BriefData) -> str:
    if not data.scoreboard:
        return (
            '<p class="empty">— No metrics yet: the day state records none. Nothing is '
            "estimated to fill the table.</p>"
        )
    rows = []
    for metric in data.scoreboard:
        empty = " metric-empty" if metric.is_empty else ""
        value = "—" if metric.is_empty else esc(metric.value)
        note = f'<span class="metric-note">{esc(metric.note)}</span>' if metric.note else ""
        rows.append(
            f'<li class="metric{empty}"><span class="metric-key">{esc(_metric_label(data, metric.key))}</span>'
            f'<span class="metric-value">{value}</span>{note}</li>'
        )
    return f'<ul class="rows scoreboard">{"".join(rows)}</ul>'


def _light_source(source: str) -> str:
    kind = source.split(",")[-1].strip()
    return {"local_table": "your local table", "api": "the timetable service",
            "computed": "a calculation for your location"}.get(kind, kind.replace("_", " "))


def _section_ticks(data: BriefData) -> str:
    rows = "".join(
        f'<li><span class="habit-label">{esc(h.label)}</span>'
        f'<span class="habit-count">{esc(h.count)}</span></li>'
        for h in data.habits
    )
    light = ""
    if data.light_schedule_line:
        light = (
            f'<p class="light">{esc(data.light_schedule_line)}'
            f'<span class="source">From {esc(_light_source(data.light_schedule_source))}</span></p>'
        )
    if not data.habits:
        return f'<p class="empty">— No ticks yet: the day state tracks no habits.</p>{light}'
    return f'<ul class="rows ticks">{rows}</ul>{light}'


def _section_board(data: BriefData) -> str:
    if not data.board_live:
        return '<p class="empty">Nothing is waiting on anyone else.</p>'
    rows = []
    for row in data.board_live:
        status = row.status.upper()
        rows.append(
            f'<li class="board-row">'
            f'<span class="board-who">{esc(row.who)}</span>'
            f'<span class="board-state"><b class="status status-{esc(status.lower())}">{esc(status)}</b>'
            f'<time datetime="{esc(row.date)}">{esc(_fmt_day(row.date))}</time></span>'
            f'<span class="board-what">{esc(row.what)}</span>'
            f'<span class="board-next">{esc(row.next_move)}</span></li>'
        )
    note = f'<p class="board-note">{esc(data.board_note)}</p>' if data.board_note else ""
    closed = ""
    if data.board_closed:
        names = "; ".join(f"{r.who} — {r.what}" for r in data.board_closed)
        closed = f'<p class="board-closed">Closed, kept visible: {esc(names)}</p>'
    return f'<ul class="board">{"".join(rows)}</ul>{note}{closed}'


def _questions(data: BriefData) -> str:
    blocks = []
    if data.not_on_list:
        items = "".join(f"<li>{esc(n)}</li>" for n in data.not_on_list)
        blocks.append(
            '<section class="sec"><h2 class="label">Not on the list, deliberately</h2>'
            f'<ul class="questions">{items}</ul></section>'
        )
    if data.questions:
        items = "".join(f"<li>{esc(q)}</li>" for q in data.questions)
        blocks.append(
            '<section class="sec"><h2 class="label">Questions for you</h2>'
            f'<ol class="questions">{items}</ol></section>'
        )
    return "".join(blocks)


def _clock_note(data: BriefData) -> str:
    """Which clock the times come from (law 5), said plainly."""
    if data.clock_frozen:
        return f"frozen clock — {esc(data.clock_description)}"
    zone = f", {esc(data.timezone)}" if data.timezone else ""
    return f"Times by this Mac's clock{zone}"


STYLE = """
:root {
  color-scheme: light dark;
  --bg: #f2f3ef; --surface: #fbfbf9; --sunken: #e8eae4;
  --ink: #16191c; --ink-soft: #4c535a; --ink-faint: #687078; --line: #d9dcd5;
  --accent: #26487a; --warn: #8f3b2a; --wait: #556884; --chase: #8a5410;
  --b1: #c9d3e0; --b2: #a9b9cf; --b3: #8aa0bd; --sleep: #5b6f8c; --unplanned: #e2e5de;
  --display: "Newsreader", "Iowan Old Style", Georgia, serif;
  --text: "Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #121416; --surface: #1a1d20; --sunken: #202428;
    --ink: #e7e9ea; --ink-soft: #a8afb5; --ink-faint: #838b92; --line: #2a2f34;
    --accent: #93b2e6; --warn: #e3a08a; --wait: #93a6c4; --chase: #d8a45c;
    --b1: #3a4757; --b2: #4a5d78; --b3: #5b7395; --sleep: #2c3b50; --unplanned: #24282c;
  }
}
:root[data-theme="dark"] {
  --bg: #121416; --surface: #1a1d20; --sunken: #202428;
  --ink: #e7e9ea; --ink-soft: #a8afb5; --ink-faint: #838b92; --line: #2a2f34;
  --accent: #93b2e6; --warn: #e3a08a; --wait: #93a6c4; --chase: #d8a45c;
  --b1: #3a4757; --b2: #4a5d78; --b3: #5b7395; --sleep: #2c3b50; --unplanned: #24282c;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.55 var(--text); -webkit-font-smoothing: antialiased;
}
.page { max-width: 1000px; margin: 0 auto; padding: 30px 44px 48px; }
.label {
  font: 600 11px/1.4 var(--text); letter-spacing: .09em; text-transform: uppercase;
  color: var(--ink-faint); margin: 0 0 10px;
}
time, .tnum { font-variant-numeric: tabular-nums; }
.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 26px; }
.head .label { margin: 0 0 6px; }
h1 {
  font: 500 46px/1 var(--display); letter-spacing: -.02em; margin: 0; text-wrap: balance;
}
.clock { color: var(--ink-faint); font-size: 12px; text-align: right; margin: 0; max-width: 34ch; }
.grid { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 44px; }
.dial { width: 260px; max-width: 100%; height: auto; display: block; margin: -8px 0 0 -10px; }
.dial-edge { fill: none; stroke: var(--line); stroke-width: 1; stroke-dasharray: 1.5 4; }
.dial-arc { stroke: var(--bg); stroke-width: 2; }
.dial-ring { fill: none; }
.dial-hour { stroke: var(--line); stroke-width: 1.5; }
.dial-hour-label {
  fill: var(--ink-faint); font: 10px var(--text); text-anchor: middle;
  dominant-baseline: middle; font-variant-numeric: tabular-nums;
}
.dial-fixed { stroke: var(--ink); stroke-width: 2.5; stroke-linecap: round; }
.dial-hand { stroke: var(--ink); stroke-width: 3; stroke-linecap: round; }
.dial-now {
  fill: var(--ink); font: 600 28px var(--text); text-anchor: middle; font-variant-numeric: tabular-nums;
}
.dial-block { fill: var(--ink-soft); font: 12px var(--text); text-anchor: middle; }
.dial-until { fill: var(--ink-faint); font: 11px var(--text); text-anchor: middle; font-variant-numeric: tabular-nums; }
.legend { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 3px; font-size: 12.5px; }
.legend li { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 9px; align-items: center; color: var(--ink-soft); }
.legend li.now { color: var(--ink); font-weight: 600; }
.legend i { width: 10px; height: 10px; border-radius: 2px; display: block; box-shadow: inset 0 0 0 1px rgba(128,128,128,.18); }
.legend time { color: var(--ink-faint); font-size: 12px; font-weight: 400; }
.next { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--line); }
.next-line { margin: 0; font-size: 14.5px; }
.sec { margin-bottom: 32px; }
.reason { color: var(--ink-soft); margin: 0 0 16px; max-width: 62ch; }
.today-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 18px; }
.today-list li { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 0 10px; }
.ix { font: 500 22px/1.15 var(--display); color: var(--accent); }
.action-title { font: 500 19px/1.3 var(--display); letter-spacing: -.005em; margin: 0; }
.action-detail { color: var(--ink-soft); margin: 4px 0 0; max-width: 64ch; }
.for-you { margin: 18px 0 0; padding-top: 12px; border-top: 1px solid var(--line); color: var(--ink-soft); font-size: 13.5px; }
.tag {
  font: 600 10.5px var(--text); letter-spacing: .08em; text-transform: uppercase;
  color: var(--ink-faint); margin-right: 8px;
}
.lower { display: grid; grid-template-columns: 1fr 1fr; gap: 44px; padding-top: 26px; border-top: 1px solid var(--line); margin-bottom: 8px; }
.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; }
.rows li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 14px; align-items: baseline; }
.metric-value, .habit-count { font-weight: 600; font-variant-numeric: tabular-nums; }
.metric-note { grid-column: 1 / -1; color: var(--ink-faint); font-size: 12.5px; }
.metric-empty .metric-value { color: var(--ink-faint); font-weight: 400; }
.light { margin: 14px 0 0; color: var(--ink-soft); font-size: 13px; }
.source { display: block; color: var(--ink-faint); font-size: 12px; margin-top: 2px; }
.board-wrap { padding-top: 26px; border-top: 1px solid var(--line); margin-top: 26px; }
.board { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.board-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 16px;
  padding: 11px 0; border-bottom: 1px solid var(--line);
}
.board-who { font-weight: 600; }
.board-state { grid-column: 2; grid-row: 1 / span 3; text-align: right; color: var(--ink-faint); font-size: 12px; align-self: center; }
.status { display: block; font-size: 11px; letter-spacing: .08em; }
.status::before {
  content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  margin-right: 6px; vertical-align: 1px; background: currentColor;
}
.status-wait { color: var(--wait); }
.status-chase { color: var(--chase); }
.board-what { color: var(--ink-soft); font-size: 13.5px; grid-column: 1; }
.board-next { color: var(--ink-faint); font-size: 12.5px; grid-column: 1; }
.board-note { margin: 12px 0 0; color: var(--ink-soft); font-size: 13.5px; }
.board-closed { margin: 6px 0 0; color: var(--ink-faint); font-size: 12.5px; }
.questions { margin: 0; padding-left: 1.2rem; color: var(--ink-soft); display: grid; gap: 6px; max-width: 70ch; }
.more { margin-top: 30px; }
.closing { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--line); }
.closing-text { font: 500 20px/1.45 var(--display); margin: 0; max-width: 58ch; text-wrap: pretty; }
.closing-source { margin: 8px 0 0; color: var(--ink-faint); font-size: 12px; }
.delivery { margin: 12px 0 0; color: var(--ink-soft); font-size: 13.5px; max-width: 64ch; }
.warn .label { color: var(--warn); }
.warn ul { margin: 0; padding-left: 1.2rem; color: var(--ink-soft); font-size: 13.5px; display: grid; gap: 4px; }
.empty { color: var(--ink-faint); margin: 0; }
@media (max-width: 760px) {
  .grid, .lower { grid-template-columns: minmax(0, 1fr); gap: 28px; }
  .dial { margin: 0 auto; }
}
@media (max-width: 520px) {
  .page { padding: 22px 16px 40px; }
  .head { flex-direction: column; align-items: flex-start; gap: 8px; }
  .clock { text-align: left; }
  h1 { font-size: 38px; }
}
"""


def render(data: BriefData) -> str:
    warnings = ""
    if data.warnings:
        items = "".join(f"<li>{esc(w)}</li>" for w in data.warnings)
        warnings = f'<section class="sec warn"><h2 class="label">Notes</h2><ul>{items}</ul></section>'

    day = data.generated_for
    true_for = data.true_for or _fmt_date(day)
    # "Tuesday 10 March 2026" reads as a small weekday label over the date.
    weekday, _, rest = true_for.partition(" ")
    has_weekday = bool(rest) and weekday.rstrip(",").lower() in (
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
    headline = rest if has_weekday else true_for
    weekday_label = weekday.rstrip(",") if has_weekday else ""
    owner = f"For {esc(data.owner_name)} · " if data.owner_name else ""
    delivery = ("" if data.closing.text == data.delivery.sentence()
                else f'<p class="delivery">{esc(data.delivery.sentence())}</p>')

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Brief — {esc(_fmt_date(day))}</title>
<style>
{_font_faces()}
{STYLE}
</style>
</head>
<body>
<div class="page">

<header class="head">
  <div>
    {f'<p class="label">{esc(weekday_label)}</p>' if weekday_label else ''}
    <h1>{esc(headline)}</h1>
  </div>
  <p class="clock">{owner}{_clock_note(data)}</p>
</header>

<div class="grid">
  <aside>
    <section aria-label="The day">{_dial_svg(data)}</section>
    {_legend(data)}
    <section class="next"><h2 class="label">Next up</h2>{_next_up(data)}</section>
  </aside>
  <div>
    <section class="sec"><h2 class="label">Today</h2>{_section_today_list(data)}</section>
  </div>
</div>

<div class="lower">
  <section><h2 class="label">Scoreboard</h2>{_section_scoreboard(data)}</section>
  <section><h2 class="label">Ticks · last 7 days</h2>{_section_ticks(data)}</section>
</div>

<section class="board-wrap"><h2 class="label">Waiting on others</h2>{_section_board(data)}</section>

<div class="more">
{_questions(data)}
{warnings}
</div>

<section class="closing">
  <p class="closing-text">{esc(data.closing.text)}</p>
  <p class="closing-source">From {esc(data.closing.source)}</p>
  {delivery}
</section>

</div>

<script>
(function () {{
  "use strict";
  var FROZEN = {str(data.clock_frozen).lower()};
  var BASE_MINUTES = {data.dial.now_minutes};
  var CX = {CX}, CY = {CY}, R_IN = {R_HAND_IN}, R_OUT = {R_HAND_OUT};

  function pointAt(minutes, r) {{
    var theta = 2 * Math.PI * ((minutes % 1440) / 1440);
    return {{ x: CX + r * Math.sin(theta), y: CY - r * Math.cos(theta) }};
  }}

  function pad(n) {{ return (n < 10 ? "0" : "") + n; }}

  function tick() {{
    var minutes;
    if (FROZEN) {{
      minutes = BASE_MINUTES;
    }} else {{
      var now = new Date();
      minutes = now.getHours() * 60 + now.getMinutes();
    }}
    var a = pointAt(minutes, R_IN), b = pointAt(minutes, R_OUT);
    var hand = document.getElementById("hand");
    if (hand) {{
      hand.setAttribute("x1", a.x.toFixed(2));
      hand.setAttribute("y1", a.y.toFixed(2));
      hand.setAttribute("x2", b.x.toFixed(2));
      hand.setAttribute("y2", b.y.toFixed(2));
    }}
    var label = document.getElementById("dial-now");
    if (label) {{
      label.textContent = pad(Math.floor(minutes / 60)) + ":" + pad(minutes % 60);
    }}
  }}

  tick();
  if (!FROZEN) {{
    window.setInterval(tick, 30000);
  }}
}})();
</script>
</body>
</html>
"""
