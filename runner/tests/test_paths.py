"""The scope boundary. ARCHITECTURE §2: the runner is scoped to the chosen folder and
nothing else, enforced by path prefix."""

from __future__ import annotations

import unittest

from support import FIXTURE, FolderCase          # noqa: F401

from daybook.paths import FolderScope, ScopeViolation


class ResolvesRecordedPaths(unittest.TestCase):
    def setUp(self) -> None:
        self.scope = FolderScope.open(FIXTURE, alias="~/Secretary")

    def test_alias_form_and_relative_form_name_the_same_file(self):
        self.assertEqual(
            self.scope.resolve("~/Secretary/documents/aldridge-notes.md"),
            self.scope.resolve("documents/aldridge-notes.md"),
        )

    def test_dot_slash_form_too(self):
        self.assertEqual(
            self.scope.resolve("./LOG.md"), self.scope.resolve("LOG.md")
        )

    def test_the_alias_itself_is_the_root(self):
        self.assertEqual(self.scope.resolve("~/Secretary"), self.scope.root)

    def test_an_apostrophe_in_a_path_is_not_special(self):
        # fixtures/README.md case 15. Quoting bugs show up as a path that silently
        # resolves somewhere else, so this is checked rather than assumed.
        resolved = self.scope.resolve("documents/ada's-swimming-times.md")
        self.assertEqual(resolved.name, "ada's-swimming-times.md")
        self.assertTrue(str(resolved).startswith(str(self.scope.root)))

    def test_unicode_in_a_path_survives(self):
        resolved = self.scope.resolve("documents/bäcker-söhne.md")
        self.assertIn("bäcker-söhne.md", str(resolved))

    def test_display_uses_the_alias_form(self):
        self.assertEqual(
            self.scope.display("documents/aldridge-notes.md"),
            "~/Secretary/documents/aldridge-notes.md",
        )


class RefusesEscapes(unittest.TestCase):
    def setUp(self) -> None:
        self.scope = FolderScope.open(FIXTURE, alias="~/Secretary")

    def test_parent_traversal_is_refused(self):
        with self.assertRaises(ScopeViolation):
            self.scope.resolve("../../../etc/passwd")

    def test_traversal_hidden_mid_path_is_refused(self):
        with self.assertRaises(ScopeViolation):
            self.scope.resolve("documents/../../secrets.txt")

    def test_absolute_path_is_refused(self):
        with self.assertRaises(ScopeViolation):
            self.scope.resolve("/etc/passwd")

    def test_alias_prefixed_traversal_is_refused(self):
        with self.assertRaises(ScopeViolation):
            self.scope.resolve("~/Secretary/../../etc/passwd")

    def test_escape_is_refused_not_clamped(self):
        # Clamping would turn an attempt to read something outside into a successful
        # read of something else, which hides the attempt.
        self.assertFalse(self.scope.exists("../../../etc/passwd"))

    def test_traversal_that_lands_back_inside_is_allowed(self):
        self.assertEqual(
            self.scope.resolve("documents/../LOG.md"), self.scope.resolve("LOG.md")
        )


if __name__ == "__main__":
    unittest.main()
