"""Reading a handover from another AI.

Someone who already keeps their life in ChatGPT, Claude or Gemini copies Daybook's prompt
there, and pastes back the Markdown it writes (HANDOVER_HEADINGS below). This turns that
document into the setup form's fields — the person checks every one before anything is
written — and the whole document is kept in SETUP-CONTEXT.md, so nothing the form has no
field for is lost.

It is read here, not by a model: instantly, offline, and with nothing sent anywhere. It
is lenient about what chat assistants actually produce (bold lines for headings, bullets
of any kind, "7–9am" as well as "07:00–09:00", the whole thing inside a code fence), and
it never guesses: a line it cannot read is left out of the fields, said so in ``notes``,
and stays in the document the secretary reads. "Unknown" means unknown, not empty.

The same reading of one line of fixed time ("School run 08:20 on weekdays") serves the
setup form typed by hand, so the dial can mark it either way.
"""

from __future__ import annotations

import re
import unicodedata

# Section keys, and the words a heading may use for each. Order matters: the first match
# wins, and "numbers I track" must not be taken for a day "schedule".
SECTIONS = (
    ("name", ("name", "who i am", "about me")),
    ("goals", ("working toward", "working towards", "goal", "aim")),
    ("habits", ("habit",)),
    ("metrics", ("numbers", "track", "metric", "kpi")),
    ("waiting", ("waiting", "open loop", "pending")),
    ("fixed", ("fixed", "commitment", "non-negotiable", "non negotiable", "recurring")),
    ("day", ("typical day", "my day", "routine", "day shape", "shape of", "schedule", "usual day")),
    ("context", ("project", "context", "anything else", "notes", "preference", "how i like")),
)

_UNKNOWN = re.compile(r"^\(?\s*(unknown|none|n/?a|nothing|not sure|—|-)\s*\.?\)?$", re.I)
_BULLET = re.compile(r"^\s*(?:[-*•+▪◦]|\d+[.)])\s+")
_TIME = r"(?:\d{1,2}(?:[:.]\d{2})?\s*(?:[ap]\.?\s?m\.?)?|noon|midnight)"
_RANGE = re.compile(
    rf"(?P<a>{_TIME})\s*(?:-|–|—|to|until|till)\s*(?P<b>{_TIME})(?![\d:])", re.I)
_ONE_TIME = re.compile(rf"(?<![\d:])(?P<t>\d{{1,2}}[:.]\d{{2}}\s*(?:[ap]\.?\s?m\.?)?|\d{{1,2}}\s*[ap]\.?\s?m\.?|noon|midnight)(?![\d:])", re.I)

DAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
_DAY_WORD = r"(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?s?"
_DAY_RANGE = re.compile(rf"\b(?P<a>{_DAY_WORD})\s*(?:-|–|—|to|through)\s*(?P<b>{_DAY_WORD})\b", re.I)
_DAY_ONE = re.compile(rf"\b{_DAY_WORD}\b", re.I)
_EVERY_DAY = re.compile(r"\b(?:daily|every\s*day|everyday|all\s*days|each\s*day|7\s*days\s*a\s*week)\b|\(\s*all\s*\)", re.I)
_WEEKDAYS = re.compile(r"\b(?:week\s*days?|weekdays|work\s*days|mon(?:day)?\s*(?:-|–|to)\s*fri(?:day)?)\b", re.I)
_WEEKENDS = re.compile(r"\bweek\s*ends?\b", re.I)


# -- one line at a time --------------------------------------------------------------------

def to_hhmm(text: str, hint: str = "") -> str | None:
    """'7', '7:30', '07.30', '7am', '7:30 p.m.', 'noon' → 'HH:MM'. ``hint`` carries a
    range's am/pm to a start that has none ("7–9am")."""
    raw = text.strip().lower().replace(" ", "")
    if raw == "noon":
        return "12:00"
    if raw == "midnight":
        return "00:00"
    match = re.fullmatch(r"(\d{1,2})(?:[:.](\d{2}))?(a\.?m\.?|p\.?m\.?)?", raw)
    if not match:
        return None
    hour, minute = int(match.group(1)), int(match.group(2) or 0)
    suffix = (match.group(3) or hint or "").replace(".", "")
    if minute > 59 or hour > 24 or (suffix and not 1 <= hour <= 12):
        return None
    if suffix == "pm" and hour != 12:
        hour += 12
    elif suffix == "am" and hour == 12:
        hour = 0
    if hour == 24:
        hour = 0
    if not match.group(2) and not suffix:
        return None  # a bare "7" is a count, not a time
    return f"{hour:02d}:{minute:02d}"


def _suffix(text: str) -> str:
    match = re.search(r"([ap])\.?\s?m\.?\s*$", text.strip(), re.I)
    return f"{match.group(1).lower()}m" if match else ""


def read_range(text: str) -> tuple[str, str, tuple[int, int]] | None:
    """The first time range in a line, as (start, end, (span start, span end))."""
    match = _RANGE.search(text)
    if not match:
        return None
    a, b = match.group("a"), match.group("b")
    b_suffix = _suffix(b)
    end = to_hhmm(b)
    if end is None:
        return None
    start = to_hhmm(a)
    if start is None and b_suffix:
        # "7–9am", "11–1pm": the start takes the end's half of the day unless that would
        # put it after the end, when it is the other half.
        same = to_hhmm(a, b_suffix)
        other = to_hhmm(a, "am" if b_suffix == "pm" else "pm")
        start = same if same and same <= end else other
    if start is None and re.fullmatch(r"\d{1,2}", a.strip()) and int(a) < 24 and ":" in end:
        start = f"{int(a):02d}:00"  # "9–12:30": a bare hour beside a clock time is one too
    if start is None:
        return None
    return start, end, match.span()


def read_days(text: str) -> list[str]:
    """The days a line names, as config keys; ['all'] for every day or none named."""
    if _EVERY_DAY.search(text):
        return ["all"]
    if _WEEKDAYS.search(text):
        return list(DAY_KEYS[:5])
    days: list[str] = []
    if _WEEKENDS.search(text):
        days += ["sat", "sun"]
    for match in _DAY_RANGE.finditer(text):
        a, b = DAY_KEYS.index(match.group("a")[:3].lower()), DAY_KEYS.index(match.group("b")[:3].lower())
        span = range(a, b + 1) if a <= b else [*range(a, 7), *range(0, b + 1)]
        days += [DAY_KEYS[i] for i in span]
    stripped = _DAY_RANGE.sub(" ", text)
    days += [m.group(0)[:3].lower() for m in _DAY_ONE.finditer(stripped)]
    ordered = [d for d in DAY_KEYS if d in days]
    return ordered or ["all"]


def _label(text: str) -> str:
    text = _DAY_RANGE.sub(" ", text)
    text = _EVERY_DAY.sub(" ", text)
    text = _WEEKDAYS.sub(" ", text)
    text = _WEEKENDS.sub(" ", text)
    text = _DAY_ONE.sub(" ", text)
    text = re.sub(r"\(\s*[,/&\s]*\)", " ", text)
    text = re.sub(r"[()\[\]]", " ", text)
    text = " ".join(text.split()).strip(" :,-–—|/&")
    # The words that tied the time or days to the name ("School run on", "at 07:00 Gym").
    connector = re.compile(r"^(?:on|at|every|each|from|and)\s+|\s+(?:on|at|every|each|from|and)$", re.I)
    while connector.search(text):
        text = connector.sub("", text).strip(" :,-–—|/&")
    return text


def read_fixed(line: str) -> dict | None:
    """One fixed commitment ("08:20 School run (Mon–Fri)", "Gym Tue/Thu 07:00") as a
    config non-negotiable, or None when it names no time — it stays words, then."""
    text = _BULLET.sub("", line).strip()
    if not text or _UNKNOWN.match(text):
        return None
    item: dict = {}
    found = read_range(text)
    if found:
        item["start"], item["end"] = found[0], found[1]
        rest = text[: found[2][0]] + " " + text[found[2][1]:]
    else:
        one = _ONE_TIME.search(text)
        if not one or not (at := to_hhmm(one.group("t"))):
            return None
        item["time"] = at
        rest = text[: one.start()] + " " + text[one.end():]
    label = _label(rest)
    if not label:
        return None
    return {"label": label[:80], **item, "days": read_days(rest)}


def read_block(line: str) -> dict | None:
    """One block of a typical day ("07:00–09:00 Morning", "Deep work 9-12:30") as a day
    shape block, or None."""
    text = _BULLET.sub("", line).strip()
    found = read_range(text)
    if not found:
        return None
    label = (text[: found[2][0]] + " " + text[found[2][1]:])
    label = " ".join(label.split()).strip(" :,-–—|")
    if not label or found[0] == found[1]:
        return None
    return {"block": label[:60], "start": found[0], "end": found[1]}


def slug(label: str, taken: set[str] | None = None) -> str:
    """A stable id for a metric or habit: 'Applications sent' → 'applications_sent'."""
    ascii_text = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-z0-9]+", "_", ascii_text.lower()).strip("_")[:40] or "item"
    taken = taken if taken is not None else set()
    name, n = base, 2
    while name in taken:
        name, n = f"{base}_{n}", n + 1
    taken.add(name)
    return name


# -- the whole document -----------------------------------------------------------------------

def _heading(line: str) -> str | None:
    stripped = line.strip()
    md = re.match(r"^#{1,6}\s+(.*?)\s*#*$", stripped)
    if md:
        return md.group(1)
    bold = re.match(r"^\*\*(.+?)\*\*:?$|^__(.+?)__:?$", stripped)
    if bold:
        return bold.group(1) or bold.group(2)
    return None


def _section_key(heading: str) -> str | None:
    lowered = re.sub(r"[*_`:]", "", heading).lower()
    for key, words in SECTIONS:
        if any(word in lowered for word in words):
            return key
    return None


def _unfenced(text: str) -> str:
    """The document without a code fence around it (chat apps wrap it to be copied)."""
    lines = text.replace("\r\n", "\n").split("\n")
    return "\n".join(line for line in lines if not re.match(r"^\s*```", line))


def _items(lines: list[str]) -> list[str]:
    out = []
    for line in lines:
        text = _BULLET.sub("", line).strip()
        text = re.sub(r"^\*\*(.+?)\*\*\s*", r"\1 ", text).strip()
        if text and not _UNKNOWN.match(text) and not text.startswith("("):
            out.append(text)
    return out


def _covers(blocks: list[dict]) -> list[int]:
    def minutes(hhmm: str) -> int:
        h, m = hhmm.split(":")
        return int(h) * 60 + int(m)
    count = [0] * 1440
    for b in blocks:
        start, end = minutes(b["start"]), minutes(b["end"])
        spans = [(start, end)] if end > start else [(start, 1440), (0, end)]
        for s, e in spans:
            for minute in range(s, e):
                count[minute] += 1
    return count


def read_handover(text: str) -> dict:
    """The setup fields a handover fills, plus what was found and what was left out."""
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for line in _unfenced(text).split("\n"):
        heading = _heading(line)
        if heading is not None:
            key = _section_key(heading)
            current = key or ("ignored" if "handover" in heading.lower() else "context")
            sections.setdefault(current, [])
            continue
        if current:
            sections.setdefault(current, []).append(line)

    draft: dict = {"name": "", "address_as": "", "goals": [], "day_shape": [], "fixed": [],
                   "waiting": [], "metrics": [], "habits": [], "found": [], "notes": []}

    for line in sections.get("name", []):
        text = _BULLET.sub("", line).strip().replace("**", "")
        match = re.match(r"^(full name|name|call me|address me as|preferred name)\s*[:\-–—]\s*(.+)$", text, re.I)
        if not match or _UNKNOWN.match(match.group(2).strip()):
            continue
        value = match.group(2).strip()[:80]
        if match.group(1).lower() in ("full name", "name"):
            draft["name"] = draft["name"] or value
        else:
            draft["address_as"] = draft["address_as"] or value

    draft["goals"] = _items(sections.get("goals", []))[:12]
    draft["waiting"] = _items(sections.get("waiting", []))[:20]

    fixed = _items(sections.get("fixed", []))[:20]
    draft["fixed"] = fixed
    unread = [line for line in fixed if read_fixed(line) is None]
    if len(unread) == 1:
        draft["notes"].append(f"“{unread[0][:80]}” names no time, so it's kept as words rather than marked on your dial.")
    elif unread:
        draft["notes"].append(f"{len(unread)} fixed things name no time, so they're kept as words rather than "
                              "marked on your dial: " + "; ".join(u[:60] for u in unread[:3]))

    accepted: list[dict] = []
    for line in _items(sections.get("day", [])):
        block = read_block(line)
        if block is None:
            draft["notes"].append(f"“{line[:80]}” has no clear times, so it was left out of your day.")
            continue
        if max(_covers([*accepted, block])) > 1:
            draft["notes"].append(f"“{block['block']}” overlaps an earlier block, so it was left out of your day.")
            continue
        accepted.append(block)
    draft["day_shape"] = accepted

    taken: set[str] = set()
    draft["metrics"] = [{"id": slug(label, taken), "label": label[:60]}
                        for label in _items(sections.get("metrics", []))[:12]]
    taken = set()
    draft["habits"] = [{"id": slug(label, taken), "label": label[:60]}
                       for label in _items(sections.get("habits", []))[:12]]

    filled = {"name": draft["name"] or draft["address_as"], "goals": draft["goals"],
              "day": draft["day_shape"], "fixed": draft["fixed"], "waiting": draft["waiting"],
              "metrics": draft["metrics"], "habits": draft["habits"]}
    draft["found"] = [key for key, value in filled.items() if value]
    if not draft["found"]:
        draft["notes"].append(
            "None of the handover's headings were found. Is this the document the prompt asked "
            "for? It is still kept for your secretary to read.")
    return draft
