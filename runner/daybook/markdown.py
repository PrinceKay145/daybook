"""Small markdown helpers.

Deliberately not a markdown library. These files are read *and written* by a human in a
text editor — that is a core promise of the product — so the parser stays small enough to
predict, and loud enough to fail when a file does not have the shape it claims.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

_BOLD = re.compile(r"\*\*(.+?)\*\*", re.S)
_STRIKE = re.compile(r"~~(.+?)~~", re.S)
_CODE = re.compile(r"`([^`]+)`")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")


def strip_markup(text: str) -> str:
    """Plain text: no bold, strikethrough, code ticks or link syntax."""
    out = _LINK.sub(r"\1", text)
    out = _STRIKE.sub(r"\1", out)
    out = _BOLD.sub(r"\1", out)
    out = _CODE.sub(r"\1", out)
    return re.sub(r"\s+", " ", out).strip()


def first_bold(text: str) -> str | None:
    match = _BOLD.search(text)
    return strip_markup(match.group(1)) if match else None


def code_spans(text: str) -> list[str]:
    return [m.group(1) for m in _CODE.finditer(text)]


def normalise_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", strip_markup(text).lower()).strip("_")


@dataclass
class Section:
    """One ``## `` section of a document."""

    heading: str
    level: int
    lines: list[str] = field(default_factory=list)

    @property
    def key(self) -> str:
        return normalise_key(self.heading)

    @property
    def text(self) -> str:
        return "\n".join(self.lines)


def split_sections(source: str, level: int = 2) -> tuple[list[str], list[Section]]:
    """Split a document into (preamble lines, sections at ``level``)."""
    preamble: list[str] = []
    sections: list[Section] = []
    current: Section | None = None
    for raw in source.splitlines():
        match = _HEADING.match(raw)
        if match and len(match.group(1)) == level:
            current = Section(heading=match.group(2).strip(), level=level)
            sections.append(current)
            continue
        (current.lines if current is not None else preamble).append(raw)
    return preamble, sections


def find_section(sections: list[Section], *keywords: str) -> Section | None:
    """The first section whose heading contains any of ``keywords``."""
    for section in sections:
        lowered = section.heading.lower()
        if any(word.lower() in lowered for word in keywords):
            return section
    return None


def parse_table(lines: list[str]) -> list[dict[str, str]]:
    """Parse the first pipe table found. Returns rows keyed by normalised header."""
    rows: list[list[str]] = []
    for raw in lines:
        stripped = raw.strip()
        if not stripped.startswith("|"):
            if rows:
                break          # the table ended
            continue
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        rows.append(cells)

    if len(rows) < 2:
        return []
    header, *body = rows
    if body and set(body[0][0].replace(":", "").replace("-", "")) <= {"", " "}:
        body = body[1:]        # drop the |---|---| separator

    keys = [normalise_key(h) for h in header]
    out: list[dict[str, str]] = []
    for cells in body:
        cells = cells + [""] * (len(keys) - len(cells))
        out.append(dict(zip(keys, cells[: len(keys)])))
    return out


def numbered_items(lines: list[str]) -> list[tuple[str, str]]:
    """Numbered list items as (title, body).

    The title is the item's leading bold run — the convention the state files use for
    "this is the thing", with the concrete first click in the body underneath.
    """
    items: list[tuple[str, list[str]]] = []
    for raw in lines:
        match = re.match(r"^\s*(\d+)[.)]\s+(.*)$", raw)
        if match:
            items.append((match.group(2).strip(), []))
        elif items and raw.strip() and raw.startswith((" ", "\t")):
            items[-1][1].append(raw.strip())
        elif items and not raw.strip():
            continue
        elif items:
            break              # back to column 0: the list is over
    out = []
    for head, body in items:
        title = first_bold(head) or strip_markup(head)
        rest = strip_markup(" ".join([_BOLD.sub("", head, count=1).strip()] + body))
        out.append((title.rstrip("."), rest.strip(" .")))
    return out


def bullet_items(lines: list[str]) -> list[str]:
    """Top-level ``- `` bullets, each joined with its continuation lines."""
    items: list[list[str]] = []
    for raw in lines:
        if re.match(r"^\s*[-*+]\s+", raw):
            items.append([re.sub(r"^\s*[-*+]\s+", "", raw).rstrip()])
        elif items and raw.strip() and raw.startswith((" ", "\t")):
            items[-1].append(raw.strip())
        elif items and not raw.strip():
            continue
        elif items:
            break
    return [" ".join(part) for part in items]


_RULE = re.compile(r"^\s*([-*_])\1{2,}\s*$")


def paragraphs(lines: list[str]) -> list[str]:
    """Blank-line separated paragraphs of running text.

    Excludes tables, quotes, headings, horizontal rules, list items **and the indented
    continuation lines that belong to a list item**. That last exclusion is the one that
    matters: without it the body of "1. **Do the thing.**\n   Open the file..." reads
    back as a paragraph of the section, and whatever consumes the first paragraph —
    the honest-count reason, the board's summary sentence — silently gets an item's
    body instead.
    """
    out, buf = [], []
    in_list_item = False
    for raw in lines:
        stripped = raw.strip()
        is_bullet = bool(re.match(r"^[-*+]\s", stripped) or re.match(r"^\d+[.)]\s", stripped))
        indented_continuation = in_list_item and raw[:1] in (" ", "\t")

        if is_bullet:
            in_list_item = True
        elif stripped and not indented_continuation:
            in_list_item = False

        # A bullet marker is "- " or "* " — marker then space. "**bold**" opens a
        # paragraph, not a list, and treating it as one silently drops it.
        is_structure = (
            stripped.startswith(("|", ">", "#"))
            or is_bullet
            or indented_continuation
            or _RULE.match(stripped)
        )
        if not stripped or is_structure:
            if buf:
                out.append(" ".join(buf))
                buf = []
            continue
        buf.append(stripped)
    if buf:
        out.append(" ".join(buf))
    return out
