"""Rendering the brief as one self-contained HTML file.

No external assets, no build step, no browser storage. Opening it is the entire
deployment. It must still open in five years, on a machine with no app installed, from a
folder restored out of a backup — which is also what lets it render when everything else
is down.

Renders correctly in light and dark, and at phone width, because it will be opened on a
phone from a synced folder even though mobile is not a v1 target.
"""

from __future__ import annotations

import html
from datetime import date

from . import dial
from .brief import BriefData
from .folder import UNPLANNED

# Muted, deliberately unbranded. Every colour is a CSS variable so a re-theme is one block.
BLOCK_COLOURS = [
    "#6b7f9e", "#c98f5a", "#7fa37a", "#b58ab0",
    "#8c93b8", "#c2a15c", "#7d9fa8", "#a88a7a",
]

CX = CY = 160.0
R_OUTER, R_INNER = 120.0, 92.0
R_TICK_IN, R_TICK_OUT = 126.0, 138.0
R_HAND = 118.0


def esc(text: str) -> str:
    return html.escape(str(text), quote=True)


def _fmt_date(when: date) -> str:
    return when.strftime("%A %-d %B %Y")


def _label_colours(blocks) -> dict[str, str]:
    """One colour per label, so a block that appears twice looks like itself twice. Every
    Unplanned stretch shares one quiet colour: it is the absence of a plan, and must not
    read as one more block."""
    colours: dict[str, str] = {}
    for block in blocks:
        if block.label in colours:
            continue
        colours[block.label] = (
            "var(--unplanned)"
            if block.label == UNPLANNED
            else BLOCK_COLOURS[
                sum(1 for label in colours if label != UNPLANNED) % len(BLOCK_COLOURS)
            ]
        )
    return colours


def _dial_svg(data: BriefData) -> str:
    parts: list[str] = []
    blocks = data.dial.blocks
    colours = _label_colours(blocks)

    for block in blocks:
        colour = colours[block.label]
        for start, end in block.spans():
            if end <= start:
                continue
            path = dial.arc_path(start, end, R_OUTER, R_INNER, CX, CY)
            live = " dial-arc-now" if block is data.dial.current else ""
            parts.append(
                f'<path class="dial-arc{live}" d="{path}" style="fill:{colour}">'
                f"<title>{esc(block.label)} · {dial.to_hhmm(block.start)}"
                f"–{dial.to_hhmm(block.end)}</title></path>"
            )

    for hour in range(0, 24, 3):
        minute = hour * 60
        x1, y1 = dial.polar_point(minute, R_OUTER + 2, CX, CY)
        x2, y2 = dial.polar_point(minute, R_OUTER + 8, CX, CY)
        lx, ly = dial.polar_point(minute, R_OUTER + 19, CX, CY)
        parts.append(
            f'<line class="dial-hour" x1="{x1:.2f}" y1="{y1:.2f}" '
            f'x2="{x2:.2f}" y2="{y2:.2f}" />'
        )
        parts.append(
            f'<text class="dial-hour-label" x="{lx:.2f}" y="{ly:.2f}">{hour:02d}</text>'
        )

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

    hx, hy = dial.polar_point(data.dial.now_minutes, R_HAND, CX, CY)
    parts.append(
        f'<line id="hand" class="dial-hand" x1="{CX}" y1="{CY}" '
        f'x2="{hx:.2f}" y2="{hy:.2f}" />'
    )
    parts.append(f'<circle class="dial-pin" cx="{CX}" cy="{CY}" r="3.5" />')

    current = data.dial.current
    now_text = dial.to_hhmm(data.dial.now_minutes)
    block_text = current.label if current else "no block"
    until_text = f"until {dial.to_hhmm(current.end)}" if current else "day shape has a gap"

    return f"""<svg class="dial" viewBox="0 0 320 320" role="img"
     aria-label="The day as a 24-hour dial, midnight at the top">
  {''.join(parts)}
  <text id="dial-now" class="dial-now" x="{CX}" y="{CY - 12}">{esc(now_text)}</text>
  <text class="dial-block" x="{CX}" y="{CY + 10}">{esc(block_text)}</text>
  <text class="dial-until" x="{CX}" y="{CY + 28}">{esc(until_text)}</text>
</svg>"""


def _section_today_list(data: BriefData) -> str:
    if not data.today_list:
        # The reason is the brief's own (V6 asserts one exists); the page shows it rather
        # than a second, different explanation.
        return f'<p class="empty">— {esc(data.today_list_reason)}</p>'
    items = "".join(
        f'<li><span class="action-title">{esc(a.title)}</span>'
        f'<span class="action-detail">{esc(a.detail)}</span></li>'
        for a in data.today_list
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
        note = f'<td class="metric-note">{esc(metric.note)}</td>'
        rows.append(
            f'<tr class="{empty.strip()}"><td class="metric-key">{esc(metric.key)}</td>'
            f'<td class="metric-value">{value}</td>{note}</tr>'
        )
    return f'<table class="scoreboard">{"".join(rows)}</table>'


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
            f'<span class="source">source: {esc(data.light_schedule_source)}</span></p>'
        )
    if not data.habits:
        return f'<p class="empty">— No ticks yet: the day state tracks no habits.</p>{light}'
    return f'<ul class="ticks">{rows}</ul>{light}'


def _section_board(data: BriefData) -> str:
    if not data.board_live:
        return '<p class="empty">Nothing is waiting on anyone else.</p>'
    rows = []
    for row in data.board_live:
        pill = row.status.upper()
        rows.append(
            f'<li class="board-row">'
            f'<span class="pill pill-{pill.lower()}">{esc(pill)}</span>'
            f'<span class="board-who">{esc(row.who)}</span>'
            f'<span class="board-what">{esc(row.what)}</span>'
            f'<span class="board-next">{esc(row.next_move)} '
            f'<time>{esc(row.date)}</time></span></li>'
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
            '<section class="card"><h2>Not on the list, deliberately</h2>'
            f'<ul class="questions">{items}</ul></section>'
        )
    if data.questions:
        items = "".join(f"<li>{esc(q)}</li>" for q in data.questions)
        blocks.append(
            '<section class="card"><h2>Open questions</h2>'
            f'<ul class="questions">{items}</ul></section>'
        )
    return "".join(blocks)


def render(data: BriefData) -> str:
    clock_note = (
        f"frozen clock — {esc(data.clock_description)}"
        if data.clock_frozen
        else f"clock: {esc(data.clock_description)}"
    )
    warnings = ""
    if data.warnings:
        items = "".join(f"<li>{esc(w)}</li>" for w in data.warnings)
        warnings = f'<section class="card warn"><h2>Notes</h2><ul>{items}</ul></section>'

    next_up = (
        esc(data.next_up.describe())
        if data.next_up
        else "Nothing else scheduled today."
    )

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Brief — {esc(_fmt_date(data.generated_for))}</title>
<style>
:root {{
  color-scheme: light dark;
  --bg: #f6f5f3;  --card: #fffefc;  --ink: #1c1b19;  --ink-soft: #5d5a55;
  --ink-faint: #8b877f; --line: #e3e0da; --accent: #2f4858; --warn: #8a4b2a;
  --pill-wait: #6b7f9e; --pill-chase: #b1663c; --unplanned: #dcd8d0;
  --radius: 14px;
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
    --bg: #14151a; --card: #1c1e24; --ink: #ecebe8; --ink-soft: #a7a49e;
    --ink-faint: #74716b; --line: #2b2e36; --accent: #9fc0d4; --warn: #d79a70;
    --pill-wait: #8ba3c2; --pill-chase: #d08a5e; --unplanned: #353841;
  }}
}}
:root[data-theme="dark"] {{
  --bg: #14151a; --card: #1c1e24; --ink: #ecebe8; --ink-soft: #a7a49e;
  --ink-faint: #74716b; --line: #2b2e36; --accent: #9fc0d4; --warn: #d79a70;
  --pill-wait: #8ba3c2; --pill-chase: #d08a5e; --unplanned: #353841;
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0; background: var(--bg); color: var(--ink);
  font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto,
        "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}}
.wrap {{ max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; }}
header {{ margin-bottom: 20px; }}
h1 {{ font-size: 1.45rem; margin: 0 0 2px; letter-spacing: -0.015em; }}
.sub {{ color: var(--ink-faint); font-size: .8rem; }}
.card {{
  background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 18px 20px; margin-bottom: 14px;
}}
.card h2 {{
  font-size: .72rem; text-transform: uppercase; letter-spacing: .09em;
  color: var(--ink-faint); margin: 0 0 12px; font-weight: 600;
}}
.dial-wrap {{ display: flex; justify-content: center; }}
.dial {{ width: 100%; max-width: 320px; height: auto; }}
.dial-arc {{ stroke: var(--card); stroke-width: 1.5; opacity: .82; }}
.dial-arc-now {{ opacity: 1; }}
.dial-hour {{ stroke: var(--line); stroke-width: 1.5; }}
.dial-hour-label {{
  fill: var(--ink-faint); font-size: 9px; text-anchor: middle;
  dominant-baseline: middle; font-family: inherit;
}}
.dial-fixed {{ stroke: var(--ink); stroke-width: 2.5; stroke-linecap: round; }}
.dial-hand {{ stroke: var(--warn); stroke-width: 2; stroke-linecap: round; }}
.dial-pin {{ fill: var(--warn); }}
.dial-now {{
  fill: var(--ink); font-size: 24px; font-weight: 600; text-anchor: middle;
  font-variant-numeric: tabular-nums; font-family: inherit;
}}
.dial-block {{ fill: var(--ink-soft); font-size: 11px; text-anchor: middle; font-family: inherit; }}
.dial-until {{ fill: var(--ink-faint); font-size: 10px; text-anchor: middle; font-family: inherit; }}
.legend {{
  display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 14px;
  font-size: .72rem; color: var(--ink-faint);
}}
.legend span i {{
  display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px;
}}
.nextup {{ font-size: 1.05rem; margin: 0; }}
.today-list {{ margin: 0; padding-left: 1.15rem; }}
.today-list li {{ margin-bottom: 14px; }}
.today-list li:last-child {{ margin-bottom: 0; }}
.action-title {{ display: block; font-weight: 600; }}
.action-detail {{ display: block; color: var(--ink-soft); font-size: .92rem; margin-top: 2px; }}
.reason {{ color: var(--ink-soft); font-size: .9rem; margin: 0 0 14px; }}
.for-you {{
  margin: 16px 0 0; padding-top: 12px; border-top: 1px dashed var(--line);
  color: var(--ink-soft); font-size: .88rem;
}}
.tag {{
  display: inline-block; font-size: .65rem; text-transform: uppercase;
  letter-spacing: .07em; color: var(--ink-faint); border: 1px solid var(--line);
  border-radius: 99px; padding: 1px 8px; margin-right: 8px;
}}
.scoreboard {{ width: 100%; border-collapse: collapse; font-size: .9rem; }}
.scoreboard td {{ padding: 7px 0; border-bottom: 1px solid var(--line); vertical-align: top; }}
.scoreboard tr:last-child td {{ border-bottom: 0; }}
.metric-key {{ color: var(--ink-soft); width: 38%; }}
.metric-value {{ font-weight: 600; width: 16%; font-variant-numeric: tabular-nums; }}
.metric-note {{ color: var(--ink-faint); font-size: .82rem; }}
.metric-empty .metric-value {{ color: var(--ink-faint); font-weight: 400; }}
.ticks {{ list-style: none; margin: 0; padding: 0; }}
.ticks li {{
  display: flex; justify-content: space-between; padding: 6px 0;
  border-bottom: 1px solid var(--line); font-size: .9rem;
}}
.ticks li:last-child {{ border-bottom: 0; }}
.habit-count {{ color: var(--ink-soft); font-variant-numeric: tabular-nums; }}
.light {{
  margin: 12px 0 0; padding-top: 10px; border-top: 1px dashed var(--line);
  color: var(--ink-soft); font-size: .84rem;
}}
.source {{ display: block; color: var(--ink-faint); font-size: .74rem; margin-top: 2px; }}
.board {{ list-style: none; margin: 0; padding: 0; }}
.board-row {{
  display: grid; grid-template-columns: 62px 1fr; gap: 3px 12px;
  padding: 11px 0; border-bottom: 1px solid var(--line);
}}
.board-row:last-child {{ border-bottom: 0; }}
.pill {{
  grid-row: 1 / span 3; align-self: start; font-size: .6rem; font-weight: 700;
  letter-spacing: .07em; color: #fff; border-radius: 99px; padding: 3px 0;
  text-align: center;
}}
.pill-wait {{ background: var(--pill-wait); }}
.pill-chase {{ background: var(--pill-chase); }}
.board-who {{ font-weight: 600; font-size: .92rem; }}
.board-what {{ color: var(--ink-soft); font-size: .88rem; }}
.board-next {{ color: var(--ink-faint); font-size: .8rem; }}
.board-note, .board-closed {{
  margin: 12px 0 0; color: var(--ink-soft); font-size: .85rem;
}}
.board-closed {{ color: var(--ink-faint); font-size: .8rem; margin-top: 6px; }}
.questions {{ margin: 0; padding-left: 1.1rem; color: var(--ink-soft); font-size: .9rem; }}
.closing {{ font-size: 1rem; margin: 0; }}
.closing-source, .delivery {{
  margin: 10px 0 0; color: var(--ink-faint); font-size: .78rem;
}}
.delivery {{ padding-top: 10px; border-top: 1px dashed var(--line); }}
.warn h2 {{ color: var(--warn); }}
.empty {{ color: var(--ink-faint); margin: 0; font-size: .9rem; }}
footer {{ color: var(--ink-faint); font-size: .72rem; text-align: center; margin-top: 22px; }}
@media (max-width: 520px) {{
  .wrap {{ padding: 20px 16px 48px; }}
  .card {{ padding: 15px 16px; }}
  .scoreboard td {{ font-size: .85rem; }}
  .metric-key {{ width: 42%; }}
}}
</style>
</head>
<body>
<div class="wrap">

<header>
  <h1>{esc(data.true_for or _fmt_date(data.generated_for))}</h1>
  <p class="sub">{esc(data.owner_name)} · {esc(data.timezone)} · {clock_note}</p>
</header>

<section class="card">
  <h2>The day</h2>
  <div class="dial-wrap">{_dial_svg(data)}</div>
  <div class="legend">{''.join(
      f'<span><i style="background:{colour}"></i>{esc(label)}</span>'
      for label, colour in _label_colours(data.dial.blocks).items())}</div>
</section>

<section class="card">
  <h2>Next up</h2>
  <p class="nextup">{next_up}</p>
</section>

<section class="card">
  <h2>Today</h2>
  {_section_today_list(data)}
</section>

<section class="card">
  <h2>Scoreboard</h2>
  {_section_scoreboard(data)}
</section>

<section class="card">
  <h2>Today's ticks</h2>
  {_section_ticks(data)}
</section>

<section class="card">
  <h2>The board</h2>
  {_section_board(data)}
</section>

{_questions(data)}
{warnings}

<section class="card">
  <p class="closing">{esc(data.closing.text)}</p>
  <p class="closing-source">source: {esc(data.closing.source)}</p>
  {'' if data.closing.text == data.delivery.sentence() else
   f'<p class="delivery">{esc(data.delivery.sentence())}</p>'}
</section>

<footer>daybook · generated for {esc(data.generated_for.isoformat())} · no network, no storage</footer>
</div>

<script>
(function () {{
  "use strict";
  var FROZEN = {str(data.clock_frozen).lower()};
  var BASE_MINUTES = {data.dial.now_minutes};
  var CX = {CX}, CY = {CY}, R = {R_HAND};

  function pointAt(minutes) {{
    var theta = 2 * Math.PI * ((minutes % 1440) / 1440);
    return {{ x: CX + R * Math.sin(theta), y: CY - R * Math.cos(theta) }};
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
    var p = pointAt(minutes);
    var hand = document.getElementById("hand");
    if (hand) {{
      hand.setAttribute("x2", p.x.toFixed(2));
      hand.setAttribute("y2", p.y.toFixed(2));
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
