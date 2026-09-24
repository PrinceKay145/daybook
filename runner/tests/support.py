"""Shared test helpers.

Every test works on a *copy* of the fixture folder. The fixtures are read-only in the
repo (fixtures/README.md), and several of the cases planted in them are only visible in
what a run *changed*.
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

RUNNER = Path(__file__).resolve().parents[1]
REPO = RUNNER.parent
FIXTURE = REPO / "fixtures" / "sample-folder"

if str(RUNNER) not in sys.path:
    sys.path.insert(0, str(RUNNER))

from daybook.assertions import verify                      # noqa: E402
from daybook.brief import build                            # noqa: E402
from daybook.folder import open_folder                     # noqa: E402
from daybook.render import render                          # noqa: E402

PENDING = ["briefs/2026-03-10.html", "briefs/latest.html"]


class FolderCase(unittest.TestCase):
    """A test that gets its own disposable copy of the fixture folder."""

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="daybook-test-"))
        self.folder = self.tmp / "folder"
        shutil.copytree(FIXTURE, self.folder)
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    # -- editing the copy ---------------------------------------------------

    def read(self, name: str) -> str:
        return (self.folder / name).read_text(encoding="utf-8")

    def write(self, name: str, text: str) -> None:
        (self.folder / name).write_text(text, encoding="utf-8")

    def edit_json(self, name: str, mutate) -> None:
        data = json.loads(self.read(name))
        mutate(data)
        self.write(name, json.dumps(data, indent=2, ensure_ascii=False))

    def replace_in(self, name: str, old: str, new: str) -> None:
        text = self.read(name)
        self.assertIn(old, text, f"anchor not found in {name}")
        self.write(name, text.replace(old, new, 1))

    # -- running ------------------------------------------------------------

    def produce(self):
        folder = open_folder(str(self.folder))
        data = build(folder, pending_outputs=PENDING)
        html = render(data)
        return folder, data, html, verify(data, html)

    def results(self) -> dict:
        _, _, _, results = self.produce()
        return {r.id: r for r in results}

    def assertAssertionFails(self, aid: str) -> None:
        results = self.results()
        self.assertFalse(
            results[aid].ok,
            f"{aid} passed, but the case it exists to catch was planted: "
            f"{results[aid].catches}",
        )

    def assertAllPass(self) -> None:
        results = self.results()
        failed = [r.line() for r in results.values() if not r.ok]
        self.assertEqual([], failed)
