"""Writing into the folder.

Every folder write is atomic: temp file in the same directory, then rename. Never in
place. A half-written DAY-STATE or a half-written brief is worse than an old one, and
rename is the only operation the filesystem gives us that a reader cannot observe midway.

⚠️ The rest of the write path — the advisory lock, the read-modify-write diff, the file
watcher and the git auto-commit after every write — is week 2 and is deliberately not
here. Week 1 writes exactly one kind of file, the generated brief, and only when asked.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path


def atomic_write_text(target: Path, text: str) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(
        dir=str(target.parent), prefix=f".{target.name}.", suffix=".tmp"
    )
    temp = Path(temp_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        # mkstemp creates 0600. These are the user's own files, sitting next to files
        # they made in a text editor, and they open them from Finder and from synced
        # copies — so give them the mode an ordinary write would have produced.
        umask = os.umask(0)
        os.umask(umask)
        os.chmod(temp, 0o666 & ~umask)
        os.replace(temp, target)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise
    return target
