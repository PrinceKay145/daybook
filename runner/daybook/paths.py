"""Path resolution, and the scope boundary.

Two jobs, and they are the same job:

1. **Resolve a recorded path.** Paths are written down all over the folder — action targets
   in ``reminders.json``, source_precedence entries in ``config.json``, references in the
   markdown — and they are written two ways: ``~/Secretary/documents/x.md`` and
   ``documents/x.md``. Both name the same file. The folder is portable by design, so a
   stored absolute path would be wrong the moment it was copied, synced or restored under
   another name. ``scope.root`` is therefore an *alias* for whatever folder the runner was
   actually pointed at, not a location.

2. **Refuse anything outside it.** ARCHITECTURE §2: the runner is scoped to the chosen
   folder and nothing else, enforced by path prefix. A secretary that can read the whole
   disk is a very different security proposition from one that can read one folder.

A path that escapes the root is refused, never clamped. Clamping turns an attempt to read
``../../.ssh/id_rsa`` into a successful read of something else, which hides the attempt.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path, PurePosixPath


class ScopeViolation(Exception):
    """A recorded path resolved to somewhere outside the folder."""

    def __init__(self, recorded: str, resolved: Path, root: Path):
        self.recorded = recorded
        self.resolved = resolved
        self.root = root
        super().__init__(
            f"{recorded!r} resolves to {resolved} which is outside the folder {root}"
        )


@dataclass(frozen=True)
class FolderScope:
    """The chosen folder, and the alias its files use to refer to themselves."""

    root: Path
    alias: str = "~/Secretary"

    @classmethod
    def open(cls, folder: str | os.PathLike, alias: str | None = None) -> "FolderScope":
        root = Path(folder).expanduser().resolve(strict=True)
        if not root.is_dir():
            raise NotADirectoryError(f"{root} is not a directory")
        return cls(root=root, alias=(alias or "~/Secretary").rstrip("/"))

    # -- resolution ---------------------------------------------------------

    def _strip_alias(self, recorded: str) -> tuple[str, bool]:
        """Remove a leading ``scope.root`` prefix, however it was written.

        Returns (remainder, matched). ``matched`` matters: a path that is absolute and
        does *not* start with the alias points outside the folder, and must be refused
        rather than quietly reinterpreted as folder-relative.
        """
        text = recorded.strip()
        candidates = {self.alias, self.alias.rstrip("/")}
        if self.alias.startswith("~/"):
            candidates.add(self.alias[2:])          # "Secretary/..."
        for prefix in sorted(candidates, key=len, reverse=True):
            if not prefix:
                continue
            if text == prefix:
                return "", True
            if text.startswith(prefix + "/"):
                return text[len(prefix) + 1 :], True
        return text, False

    def resolve(self, recorded: str) -> Path:
        """Resolve a recorded path against the folder. Raises on escape."""
        remainder, matched = self._strip_alias(recorded)
        if not matched and (remainder.startswith("/") or remainder.startswith("~")):
            # An absolute path that is not the folder's own alias names somewhere else.
            # Stripping the leading slash here would turn "/etc/passwd" into a successful
            # read of "<folder>/etc/passwd" — clamping, which hides the attempt.
            raise ScopeViolation(recorded, Path(remainder).expanduser(), self.root)
        remainder = remainder.lstrip("/")
        # Normalise ".." and "." textually *before* touching the filesystem, so that a
        # traversal is caught whether or not the target happens to exist.
        flat = PurePosixPath(os.path.normpath(remainder or "."))
        if flat.is_absolute() or ".." in flat.parts:
            raise ScopeViolation(recorded, self.root / flat, self.root)

        candidate = self.root / flat
        # resolve(strict=False) also collapses symlinks, so a symlink pointing out of the
        # folder is caught here rather than being followed.
        resolved = candidate.resolve()
        root = self.root.resolve()
        if resolved != root and root not in resolved.parents:
            raise ScopeViolation(recorded, resolved, root)
        return resolved

    def exists(self, recorded: str) -> bool:
        try:
            return self.resolve(recorded).exists()
        except ScopeViolation:
            return False

    def read_text(self, recorded: str) -> str:
        return self.resolve(recorded).read_text(encoding="utf-8")

    def relative(self, path: Path) -> str:
        """The folder-relative form, for display."""
        try:
            return str(path.resolve().relative_to(self.root.resolve()))
        except ValueError:
            return str(path)

    def display(self, recorded: str) -> str:
        """How a path should be shown to the user: alias form, always."""
        try:
            return f"{self.alias}/{self.relative(self.resolve(recorded))}"
        except ScopeViolation:
            return recorded
