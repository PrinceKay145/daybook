"""Rendering the brief as one self-contained HTML file.

No external assets, no build step, no browser storage. Opening it is the entire
deployment. It must still open in five years, on a machine with no app installed, from a
folder restored out of a backup — which is also what lets it render when everything else
is down. Its two typefaces (Newsreader for the date and the day's list, Hanken Grotesk
for the rest; SIL Open Font License) are embedded in the file, Latin only, about 85 KB.

It reads in the spec's order — where am I, what now, what matters, how am I doing, what am
I keeping up, who am I waiting on, a human note — laid out in two columns when the window
is wide (the day beside today's list) and one when it is narrow. Light and dark both, and
phone width, because it will be opened on a phone from a synced folder. Left open, its
small script keeps the dial, the block you are in and "Next up" true as the day moves,
and plays the morning moment when — and only when — the app that frames it asks.
"""

from __future__ import annotations

import base64
import html
import json
import math
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

# Each block takes one of a few muted inks, so blocks can be told apart at a glance — the
# dial is the one place with several hues, because that is its job. Sleep is the deepest;
# unplanned time is the quiet track underneath, never one more colour.
BLOCK_INKS = tuple(f"var(--c{n})" for n in range(1, 7))

CX = CY = 160.0
# A soft disc; the blocks as thick rounded arcs around its rim; the hours inside them; a
# solid hub in the middle for the time. The hand runs from the centre (under the hub) to
# the middle of the arcs, so its tip sits on the block you are in and never leaves the disc.
R_DISC = 124.0
R_ARC, ARC_W, ARC_GAP = 111.0, 20.0, 3.0
R_HOUR = 97.0
R_NUMERALS = 82.0
R_HUB = 72.0
R_HAND = R_ARC
R_MARK_IN, R_MARK_OUT, R_MARK_LABEL = 127.0, 134.0, 139.0
# Label room, in the dial's own units: a rough width per character at 10px, the height of
# a line, and how far a label may run past the dial's box into the page margin.
CHAR_W, LINE_H, SLACK = 5.0, 12.0, 40.0


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
            planned = sum(1 for label in colours if label != UNPLANNED and label.lower() != "sleep")
            colours[block.label] = BLOCK_INKS[planned % len(BLOCK_INKS)]
    return colours


def _marks(data: BriefData) -> list[tuple[int, str, str]]:
    """What is fixed in time today, as (minute, label, kind): the non-negotiables, and the
    light schedule (daylight, a prayer timetable, tides)."""
    marks: list[tuple[int, str, str]] = []
    for item in data.dial.non_negotiables:
        at = item.get("time") or item.get("start")
        if at:
            marks.append((dial.to_minutes(at), str(item.get("label", "")), "fixed"))
    for label, at in data.light_marks:
        try:
            marks.append((dial.to_minutes(at), label, "light"))
        except ValueError:
            continue
    for item in data.today_times:
        if item.end is None:
            marks.append((item.start, item.label, "today"))
    return sorted(marks)


def _fit(label: str, room: float) -> str:
    chars = int(room // CHAR_W)
    if len(label) <= chars:
        return label
    return label[: max(chars - 1, 1)].rstrip() + "…"


def _mark_labels(marks: list[tuple[int, str, str]]) -> list[str]:
    """Each mark's label beside its tick, outside the ring. A label that would collide with
    one already placed steps outward a line at a time; one that still collides is left to
    the tick's tooltip rather than drawn over another."""
    placed: list[tuple[float, float, float, float]] = []
    parts: list[str] = []
    width = CX * 2
    for minute, label, kind in marks:
        x, y = dial.polar_point(minute, R_MARK_LABEL, CX, CY)
        side = (x - CX) / R_MARK_LABEL
        if abs(side) < 0.3:
            anchor, room = "middle", 2 * (R_MARK_LABEL * 0.6)
            y += -5 if y < CY else 10
        elif side > 0:
            anchor, room = "start", width + SLACK - x
        else:
            anchor, room = "end", x + SLACK
        text = _fit(label, room)
        w = len(text) * CHAR_W
        step = LINE_H if y > CY else -LINE_H
        for _ in range(3):
            x0 = x - w / 2 if anchor == "middle" else (x if anchor == "start" else x - w)
            box = (x0 - 2, y - 9, x0 + w + 2, y + 3)
            if not any(box[0] < b[2] and b[0] < box[2] and box[1] < b[3] and b[1] < box[3] for b in placed):
                placed.append(box)
                parts.append(
                    f'<text class="dial-mark-label {kind}" x="{x:.2f}" y="{y:.2f}" '
                    f'text-anchor="{anchor}">{esc(text)}</text>'
                )
                break
            y += step
    return parts


def _centre(data: BriefData) -> tuple[str, str]:
    """The two lines under the time: the block you are in and until when. Unplanned time
    is not a place to be, so there it is the next thing at a set time today instead (what
    Next up reads), or a quiet "Nothing scheduled". The page's script says the same."""
    current, now = data.dial.current, data.dial.now_minutes
    if current is None:
        return "no block", "day shape has a gap"
    if current.label != UNPLANNED:
        return current.label, f"until {dial.to_hhmm(current.end)}"
    later = next(((title, at) for title, at in data.ahead if now <= at < dial.MINUTES_IN_DAY), None)
    if later:
        return later[0], f"at {dial.to_hhmm(later[1])} · {_until(later[1] - now)}"
    return "Nothing scheduled", ""


def _dial_svg(data: BriefData) -> str:
    blocks = data.dial.blocks
    colours = _label_colours(blocks)
    # The disc, lighter at its centre.
    parts = [
        '<defs><radialGradient id="dial-glow"><stop offset="0" class="dial-glow-in" />'
        '<stop offset="1" class="dial-glow-out" /></radialGradient></defs>'
        f'<circle class="dial-disc" cx="{CX}" cy="{CY}" r="{R_DISC}" />'
    ]

    # Each block a thick rounded arc, its ends pulled in by the cap and a small gap so
    # neighbours stay apart. Unplanned time draws nothing: the bare disc is the truth there.
    inset = (ARC_W + ARC_GAP) / 2 / (2 * math.pi * R_ARC / dial.MINUTES_IN_DAY)
    for block in blocks:
        if block.label == UNPLANNED:
            continue
        style = f"stroke:{colours[block.label]}"
        title = f"<title>{esc(block.label)} · {_hours(block)}</title>"
        if block.length >= dial.MINUTES_IN_DAY:
            # A whole-day block: an arc from a point back to itself draws nothing.
            parts.append(f'<circle class="dial-arc" cx="{CX}" cy="{CY}" r="{R_ARC}" style="{style}">{title}</circle>')
            continue
        # A wrapping block (Sleep 23:00–07:00) is one arc through midnight, not two.
        start, end = block.start, block.start + block.length
        cut = min(inset, block.length / 2 - 0.5)
        path = dial.arc_path(start + cut, end - cut, R_ARC, CX, CY)
        parts.append(f'<path class="dial-arc" d="{path}" style="{style}">{title}</path>')

    # Every hour inside the arcs, every sixth longer, every third numbered.
    for hour in range(24):
        minute = hour * 60
        major = hour % 6 == 0
        x1, y1 = dial.polar_point(minute, R_HOUR, CX, CY)
        x2, y2 = dial.polar_point(minute, R_HOUR - (8 if major else 4), CX, CY)
        parts.append(
            f'<line class="dial-hour{" major" if major else ""}" x1="{x1:.2f}" y1="{y1:.2f}" '
            f'x2="{x2:.2f}" y2="{y2:.2f}" />'
        )
        if hour % 3 == 0:
            lx, ly = dial.polar_point(minute, R_NUMERALS, CX, CY)
            parts.append(f'<text class="dial-numeral" x="{lx:.2f}" y="{ly:.2f}">{hour:02d}</text>')

    # What is fixed in time ticks OUTSIDE the ring, never as arcs within it. Non-negotiables
    # are not blocks that can be moved or shortened, and drawing them as blocks invites
    # treating them as negotiable. Today's own moments are dots on the rim at their time,
    # unnamed there: the legend and Next up name them in full.
    marks = _marks(data)
    for minute, label, kind in marks:
        what = {"fixed": "non-negotiable", "light": "today's times", "today": "today"}[kind]
        title = f"<title>{esc(label)} · {dial.to_hhmm(minute)} · {what}</title>"
        if kind == "today":
            x, y = dial.polar_point(minute, R_ARC, CX, CY)
            parts.append(f'<circle class="dial-moment" cx="{x:.2f}" cy="{y:.2f}" r="4">{title}</circle>')
            continue
        x1, y1 = dial.polar_point(minute, R_MARK_IN, CX, CY)
        x2, y2 = dial.polar_point(minute, R_MARK_OUT, CX, CY)
        parts.append(
            f'<line class="dial-mark {kind}" x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}">'
            f"{title}</line>"
        )
    parts.extend(_mark_labels([m for m in marks if m[2] != "today"]))

    # The hand's root is under the hub; its tip and dot sit on the arcs.
    hx, hy = dial.polar_point(data.dial.now_minutes, R_HAND, CX, CY)
    parts.append(
        f'<line id="hand" class="dial-hand" x1="{CX}" y1="{CY}" x2="{hx:.2f}" y2="{hy:.2f}" />'
        f'<circle id="hand-tip" class="dial-hand-tip" cx="{hx:.2f}" cy="{hy:.2f}" r="5.5" />'
        f'<circle class="dial-hub" cx="{CX}" cy="{CY}" r="{R_HUB}" />'
    )

    block_text, until_text = _centre(data)
    quiet = "" if until_text else " quiet"

    return f"""<svg class="dial" viewBox="0 0 320 320" role="img"
     aria-label="The day as a 24-hour dial, midnight at the top">
  {''.join(parts)}
  <text id="dial-now" class="dial-now" x="{CX}" y="{CY + 1}">{esc(dial.to_hhmm(data.dial.now_minutes))}</text>
  <text id="dial-block" class="dial-block{quiet}" x="{CX}" y="{CY + 21}">{esc(block_text)}</text>
  <text id="dial-until" class="dial-until" x="{CX}" y="{CY + 37}">{esc(until_text)}</text>
</svg>"""


def _hours(block) -> str:
    if block.length >= dial.MINUTES_IN_DAY:
        return "all day"
    return f"{dial.to_hhmm(block.start)}–{dial.to_hhmm(block.end)}"


def _legend(data: BriefData) -> str:
    """Each block of the day with its hours, in the order the day shape lists them; then
    today's moments by name, since the rim marks them only with a dot. A day with no
    blocks set is one Unplanned block, and a row saying so tells nobody anything."""
    colours = _label_colours(data.dial.blocks)
    rows = []
    for index, block in enumerate(data.dial.blocks):
        if block.label == UNPLANNED and block.length >= dial.MINUTES_IN_DAY:
            continue
        now = block is data.dial.current
        rows.append(
            f'<li data-block="{index}" class="{"now" if now else ""}">'
            f'<i style="background:{colours[block.label]}"></i>'
            f"<span>{esc(block.label)}</span><time>{_hours(block)}</time></li>"
        )
    for item in data.today_times:
        if item.end is None:
            rows.append(f'<li class="moment"><i></i><span>{esc(item.label)}</span><time>{item.at}</time></li>')
    return f'<ul class="legend">{"".join(rows)}</ul>'


def _until(minutes: int) -> str:
    """How long until something, the same way the page's script says it."""
    if minutes <= 0:
        return "now"
    if minutes < 60:
        return f"in {minutes} minutes"
    hours, rest = divmod(minutes, 60)
    return f"in {hours}h" if not rest else f"in {hours}h {rest}m"


def _next_up(data: BriefData) -> str:
    nxt = data.next_up
    if not nxt:
        return '<p id="next-line" class="next-line empty">Nothing else is scheduled today.</p>'
    later = " tomorrow" if data.ahead and data.ahead[0][1] >= dial.MINUTES_IN_DAY else ""
    return (f'<p id="next-line" class="next-line"><strong>{esc(nxt.title)}</strong> at '
            f"<time>{esc(nxt.at)}</time>{later}, {_until(nxt.in_minutes)}</p>")


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


def _spans(data: BriefData) -> list[list]:
    return [[start, end, block.label, index, block.end]
            for index, block in enumerate(data.dial.blocks) for start, end in block.spans()]


def _script_json(value) -> str:
    """Data for the page's script. ``<`` is escaped so no label can close the script."""
    return json.dumps(value, ensure_ascii=False).replace("<", "\\u003c")


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
  --c1: #7f9cc8; --c2: #d6ab60; --c3: #8db39f; --c4: #c98f78; --c5: #a594c7; --c6: #72adb1;
  --sleep: #4d6187; --unplanned: #e3e6df;
  --glow: #ffffff; --rim: #e6e9e2; --hub: #fbfbf9;
  --display: "Newsreader", "Iowan Old Style", Georgia, serif;
  --text: "Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #121416; --surface: #1a1d20; --sunken: #202428;
    --ink: #e7e9ea; --ink-soft: #a8afb5; --ink-faint: #838b92; --line: #2a2f34;
    --accent: #93b2e6; --warn: #e3a08a; --wait: #93a6c4; --chase: #d8a45c;
    --c1: #6482ad; --c2: #b38c4d; --c3: #6b9382; --c4: #a5715e; --c5: #8475a6; --c6: #5a9095;
    --sleep: #394d6c; --unplanned: #24282c;
    --glow: #2b3035; --rim: #17191c; --hub: #121416;
  }
}
:root[data-theme="dark"] {
  --bg: #121416; --surface: #1a1d20; --sunken: #202428;
  --ink: #e7e9ea; --ink-soft: #a8afb5; --ink-faint: #838b92; --line: #2a2f34;
  --accent: #93b2e6; --warn: #e3a08a; --wait: #93a6c4; --chase: #d8a45c;
  --c1: #6482ad; --c2: #b38c4d; --c3: #6b9382; --c4: #a5715e; --c5: #8475a6; --c6: #5a9095;
  --sleep: #394d6c; --unplanned: #24282c;
  --glow: #2b3035; --rim: #17191c; --hub: #121416;
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
.grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 44px; }
.dial { width: 300px; max-width: 100%; height: auto; display: block; overflow: visible; margin: -6px 0 -14px; }
.dial-disc { fill: url(#dial-glow); stroke: var(--line); stroke-width: 1; }
.dial-glow-in { stop-color: var(--glow); }
.dial-glow-out { stop-color: var(--rim); }
.dial-hub { fill: var(--hub); stroke: var(--line); stroke-width: 1; }
.dial-arc { fill: none; stroke-width: 20; stroke-linecap: round; }
.dial-hour { stroke: var(--ink-faint); stroke-width: 1; opacity: .45; }
.dial-hour.major { stroke-width: 1.6; opacity: .8; }
.dial-numeral {
  fill: var(--ink-faint); font: 600 9px var(--text); text-anchor: middle;
  dominant-baseline: central; font-variant-numeric: tabular-nums; letter-spacing: .02em;
}
.dial-moment { fill: var(--accent); stroke: var(--hub); stroke-width: 1.5; }
.dial-mark { stroke-linecap: round; }
.dial-mark.fixed { stroke: var(--ink); stroke-width: 2.2; }
.dial-mark.light { stroke: var(--ink-faint); stroke-width: 1.6; }
.dial-mark.today { stroke: var(--accent); stroke-width: 2.2; }
.dial-mark-label { font: 500 10px var(--text); }
.dial-mark-label.fixed { fill: var(--ink-soft); }
.dial-mark-label.light { fill: var(--ink-faint); }
.dial-mark-label.today { fill: var(--accent); }
.dial-hand { stroke: var(--ink); stroke-width: 2.5; stroke-linecap: round; }
.dial-hand-tip { fill: var(--ink); }
.dial-now {
  fill: var(--ink); font: 500 34px var(--display); letter-spacing: -.01em;
  text-anchor: middle; font-variant-numeric: tabular-nums lining-nums;
}
.dial-block { fill: var(--accent); font: 700 13.5px var(--text); text-anchor: middle; }
.dial-block.quiet { fill: var(--ink-faint); font-weight: 400; }
.dial-until { fill: var(--ink-faint); font: 11.5px var(--text); text-anchor: middle; font-variant-numeric: tabular-nums; }
.legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; font-size: 12.5px; }
.legend li { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 9px; align-items: center; color: var(--ink-soft); }
.legend li.now { color: var(--ink); font-weight: 600; }
.legend i { width: 10px; height: 10px; border-radius: 3px; display: block; }
.legend time { color: var(--ink-faint); font-size: 12px; font-weight: 400; }
.legend li.moment i { width: 7px; height: 7px; border-radius: 50%; margin: auto; background: var(--accent); }
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
  .legend { max-width: 340px; margin-left: auto; margin-right: auto; }
}
@media (max-width: 520px) {
  .page { padding: 22px 16px 40px; }
  .head { flex-direction: column; align-items: flex-start; gap: 8px; }
  .clock { text-align: left; }
  h1 { font-size: 38px; }
  .dial { width: 264px; }
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
  var DAY = "{data.generated_for.isoformat()}";
  var TIME_ZONE = {_script_json(data.timezone or "")};
  var CX = {CX}, CY = {CY}, R_HAND = {R_HAND};
  var UNPLANNED = {_script_json(UNPLANNED)};
  // Each block's spans as [start, end, block, the block's own end]; the reminders ahead as
  // [title, minutes from this day's midnight].
  var SPANS = {_script_json(_spans(data))};
  var AHEAD = {_script_json(data.ahead)};

  function pointAt(minutes, r) {{
    var theta = 2 * Math.PI * ((minutes % 1440) / 1440);
    return {{ x: CX + r * Math.sin(theta), y: CY - r * Math.cos(theta) }};
  }}

  function pad(n) {{ return (n < 10 ? "0" : "") + n; }}
  function hhmm(m) {{ m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }}

  function until(m) {{
    if (m <= 0) {{ return "now"; }}
    if (m < 60) {{ return "in " + m + " minutes"; }}
    var h = Math.floor(m / 60), rest = m % 60;
    return rest ? "in " + h + "h " + rest + "m" : "in " + h + "h";
  }}

  // Days between this brief's day and today on this Mac: a brief opened on another day
  // keeps its own day's words and only moves the hand.
  function daysSince(now) {{
    var p = DAY.split("-");
    var then = Date.UTC(+p[0], +p[1] - 1, +p[2]);
    var parts;
    try {{
      parts = new Intl.DateTimeFormat("en-CA", {{ timeZone: TIME_ZONE || undefined,
        year: "numeric", month: "2-digit", day: "2-digit" }}).formatToParts(now);
    }} catch (_) {{
      parts = new Intl.DateTimeFormat("en-CA", {{ year: "numeric", month: "2-digit", day: "2-digit" }}).formatToParts(now);
    }}
    var values = {{}};
    parts.forEach(function (part) {{ values[part.type] = part.value; }});
    var today = Date.UTC(+values.year, +values.month - 1, +values.day);
    return Math.round((today - then) / 86400000);
  }}

  function setText(id, text) {{
    var el = document.getElementById(id);
    if (el && el.textContent !== text) {{ el.textContent = text; }}
    return el;
  }}

  // A long block name shrinks to fit inside the face rather than running into the ring.
  function fit(el, widest, size, smallest) {{
    if (!el || !el.getComputedTextLength) {{ return; }}
    el.style.fontSize = size + "px";
    while (el.getComputedTextLength() > widest && size > smallest) {{
      size -= 0.5;
      el.style.fontSize = size + "px";
    }}
  }}

  function words(minutes) {{
    var block = null, next = null, i;
    for (i = 0; i < SPANS.length; i++) {{
      if (SPANS[i][0] <= minutes && minutes < SPANS[i][1]) {{ block = SPANS[i]; break; }}
    }}
    for (i = 0; i < AHEAD.length; i++) {{
      if (AHEAD[i][1] >= minutes) {{ next = AHEAD[i]; break; }}
    }}
    // The same rule as _centre(): in unplanned time, the next thing at a set time today.
    var name = "Nothing scheduled", sub = "";
    if (!block) {{ name = "no block"; sub = "day shape has a gap"; }}
    else if (block[2] !== UNPLANNED) {{ name = block[2]; sub = "until " + hhmm(block[4]); }}
    else if (next && next[1] < 1440) {{ name = next[0]; sub = "at " + hhmm(next[1]) + " · " + until(next[1] - minutes); }}
    var centre = setText("dial-block", name);
    if (centre) {{ centre.setAttribute("class", sub ? "dial-block" : "dial-block quiet"); }}
    fit(centre, 124, 13.5, 9);
    fit(setText("dial-until", sub), 124, 11.5, 8.5);
    var rows = document.querySelectorAll(".legend li[data-block]");
    for (i = 0; i < rows.length; i++) {{
      rows[i].className = block && rows[i].getAttribute("data-block") === String(block[3]) ? "now" : "";
    }}

    var line = document.getElementById("next-line");
    if (!line) {{ return; }}
    if (!next) {{
      line.className = "next-line empty";
      line.textContent = "Nothing else is scheduled today.";
      return;
    }}
    line.className = "next-line";
    line.textContent = "";
    var title = document.createElement("strong"), at = document.createElement("time");
    title.textContent = next[0];
    at.textContent = hhmm(next[1]);
    line.appendChild(title);
    line.appendChild(document.createTextNode(" at "));
    line.appendChild(at);
    line.appendChild(document.createTextNode((next[1] >= 1440 ? " tomorrow" : "") + ", " + until(next[1] - minutes)));
  }}

  // The hand runs from the centre; only its tip and the dot on it move.
  function drawHand(minutes) {{
    var b = pointAt(minutes, R_HAND);
    var hand = document.getElementById("hand"), tip = document.getElementById("hand-tip");
    if (hand) {{
      hand.setAttribute("x2", b.x.toFixed(2));
      hand.setAttribute("y2", b.y.toFixed(2));
    }}
    if (tip) {{
      tip.setAttribute("cx", b.x.toFixed(2));
      tip.setAttribute("cy", b.y.toFixed(2));
    }}
  }}

  var shown = BASE_MINUTES, sweeping = false;

  function tick() {{
    var minutes, days = 0;
    if (FROZEN) {{
      minutes = BASE_MINUTES;
    }} else {{
      var now = new Date();
      var local;
      try {{ local = new Intl.DateTimeFormat("en-GB", {{ timeZone: TIME_ZONE || undefined,
        hour: "2-digit", minute: "2-digit", hourCycle: "h23" }}).formatToParts(now); }}
      catch (_) {{ local = new Intl.DateTimeFormat("en-GB", {{ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }}).formatToParts(now); }}
      var clock = {{}};
      local.forEach(function (part) {{ clock[part.type] = part.value; }});
      minutes = (+clock.hour) * 60 + (+clock.minute);
      days = daysSince(now);
    }}
    shown = minutes;
    if (!sweeping) {{ drawHand(minutes); }}
    setText("dial-now", hhmm(minutes));
    if (days === 0) {{ words(minutes); }}
  }}

  function easeOut(t) {{ t = Math.min(Math.max(t, 0), 1); return 1 - Math.pow(1 - t, 3); }}

  // The morning moment, played only when the app asks (the first brief it shows each day):
  // the hand sweeps clockwise from midnight to now, and today's list writes itself in line
  // by line. Opened on its own the page never plays it, and it ends in the page's rest state.
  function morning() {{
    var items = document.querySelectorAll(".today-list li"), start = null, i;
    var total = Math.max(900, 200 + 70 * (items.length - 1) + 300);
    function rise(item, e) {{
      item.style.opacity = String(e);
      item.style.transform = "translateY(" + (6 * (1 - e)).toFixed(2) + "px)";
    }}
    function frame(time) {{
      if (start === null) {{ start = time; }}
      var t = time - start;
      drawHand(shown * easeOut(t / 900));
      for (i = 0; i < items.length; i++) {{ rise(items[i], easeOut((t - 200 - 70 * i) / 300)); }}
      if (t < total) {{ window.requestAnimationFrame(frame); return; }}
      for (i = 0; i < items.length; i++) {{ items[i].style.opacity = ""; items[i].style.transform = ""; }}
      sweeping = false;
      tick();
    }}
    sweeping = true;
    drawHand(0);
    for (i = 0; i < items.length; i++) {{ rise(items[i], 0); }}
    window.requestAnimationFrame(frame);
  }}

  var played = false;
  window.addEventListener("message", function (event) {{
    var data = event.data;
    if (played || event.source !== window.parent || !data || data.type !== "daybook:morning") {{ return; }}
    played = true;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {{ return; }}
    morning();
  }});

  tick();
  if (!FROZEN) {{
    window.setInterval(tick, 30000);
  }}
}})();
</script>
</body>
</html>
"""
