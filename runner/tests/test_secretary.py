"""How the model is asked: fixed arguments, no shell, no tools, the folder on stdin.

subprocess.run is replaced, so no CLI runs and nothing is billed; each test reads the
exact argument list Daybook would have run.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from daybook import secretary
from daybook.secretary import AskError, Provider


def fake_binary(directory: Path, name: str) -> str:
    path = directory / name
    path.write_text("#!/bin/sh\n", encoding="utf-8")
    path.chmod(0o755)
    return str(path)


class Asking(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="daybook-secretary-"))
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))
        self.calls: list[dict] = []

    def run_with(self, provider: Provider, stdout: str = "", returncode: int = 0,
                 write_reply: str | None = None) -> str:
        def fake_run(args, **kwargs):
            self.calls.append({"args": args, **kwargs})
            if write_reply is not None:
                out = args[args.index("--output-last-message") + 1]
                Path(out).write_text(write_reply, encoding="utf-8")
            return subprocess.CompletedProcess(args, returncode, stdout=stdout, stderr="")
        with mock.patch.object(secretary.subprocess, "run", side_effect=fake_run):
            return secretary.ask(provider, "SYSTEM TEXT", "FOLDER CONTENT")

    def claude(self, model: str = "claude-sonnet-5") -> Provider:
        return Provider(id="claude-cli", label="Claude Code", auth_kind="local_cli", binary="claude",
                        binary_path=fake_binary(self.tmp, "claude"), model=model, model_label="Sonnet 5")

    def codex(self) -> Provider:
        return Provider(id="codex-cli", label="Codex", auth_kind="local_cli", binary="codex",
                        binary_path=fake_binary(self.tmp, "codex"), model="gpt-5.5")


class ClaudeCode(Asking):
    def envelope(self, result: str, is_error: bool = False) -> str:
        return json.dumps({"type": "result", "is_error": is_error, "result": result})

    def test_it_runs_with_no_tools_and_none_of_the_users_customisations(self):
        reply = self.run_with(self.claude(), stdout=self.envelope('{"today_list": []}'))
        self.assertEqual('{"today_list": []}', reply)
        call = self.calls[0]
        args = call["args"]
        self.assertIsInstance(args, list)
        self.assertNotIn("shell", call)
        self.assertEqual("", args[args.index("--tools") + 1])
        for flag in ("-p", "--safe-mode", "--strict-mcp-config", "--no-session-persistence"):
            self.assertIn(flag, args)
        self.assertEqual("claude-sonnet-5", args[args.index("--model") + 1])

    def test_the_folder_goes_in_on_stdin_never_as_an_argument(self):
        self.run_with(self.claude(), stdout=self.envelope("{}"))
        call = self.calls[0]
        self.assertEqual("FOLDER CONTENT", call["input"])
        self.assertFalse(any("FOLDER CONTENT" in a for a in call["args"]))

    def test_it_runs_in_an_empty_directory_with_a_small_environment(self):
        self.run_with(self.claude(), stdout=self.envelope("{}"))
        call = self.calls[0]
        self.assertTrue(Path(call["cwd"]).name.startswith("daybook-ask-"))
        self.assertEqual({"HOME", "USER", "LOGNAME", "PATH", "LANG", "TMPDIR"}, set(call["env"]))
        self.assertTrue(call["env"]["PATH"].startswith(str(self.tmp)))

    def test_signed_out_says_what_to_run(self):
        with self.assertRaises(AskError) as caught:
            self.run_with(self.claude(), stdout=self.envelope("Invalid API key · Please run /login", True), returncode=1)
        self.assertIn("claude auth login", str(caught.exception))

    def test_a_dropped_connection_is_said_plainly_with_nothing_changed(self):
        # Seen live: Claude Code's own words describe its terminal, not Daybook.
        dropped = "API Error: Connection closed mid-response. The response above may be incomplete."
        with self.assertRaises(AskError) as caught:
            self.run_with(self.claude(), stdout=self.envelope(dropped, True), returncode=1)
        said = str(caught.exception)
        self.assertIn("lost its connection", said)
        self.assertIn("nothing was changed", said)
        self.assertNotIn("response above", said)

    def test_busy_servers_and_usage_limits_are_told_apart(self):
        for raw, expected in (("API Error: 529 Overloaded", "busy right now"),
                              ("Claude AI usage limit reached", "usage limit")):
            with self.subTest(raw), self.assertRaises(AskError) as caught:
                self.run_with(self.claude(), stdout=self.envelope(raw, True), returncode=1)
            self.assertIn(expected, str(caught.exception))

    def test_an_unknown_error_is_still_shown(self):
        with self.assertRaises(AskError) as caught:
            self.run_with(self.claude(), stdout=self.envelope("Something odd happened", True), returncode=1)
        self.assertIn("Something odd happened", str(caught.exception))

    def test_a_model_id_outside_the_plain_shape_never_reaches_an_argument(self):
        with self.assertRaises(AskError):
            self.run_with(self.claude(model="sonnet; rm -rf ~"))
        self.assertEqual([], self.calls)

    def test_a_missing_binary_is_named(self):
        provider = self.claude()
        provider.binary_path = str(self.tmp / "gone")
        with self.assertRaises(AskError) as caught:
            self.run_with(provider)
        self.assertIn("wasn't found", str(caught.exception))


class Codex(Asking):
    def test_its_tools_are_switched_off_by_name_under_a_read_only_sandbox(self):
        reply = self.run_with(self.codex(), write_reply='{"today_list": []}')
        self.assertEqual('{"today_list": []}', reply)
        args = self.calls[0]["args"]
        self.assertEqual("read-only", args[args.index("--sandbox") + 1])
        for flag in ("--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check"):
            self.assertIn(flag, args)
        disabled = {args[i + 1] for i, a in enumerate(args) if a == "--disable"}
        self.assertTrue({"shell_tool", "unified_exec", "apps", "plugins", "browser_use"} <= disabled)
        self.assertNotIn("--add-dir", args)  # it would grant write access (architecture.md)
        self.assertEqual("-", args[-1])

    def test_the_instructions_and_folder_go_in_on_stdin(self):
        self.run_with(self.codex(), write_reply="{}")
        call = self.calls[0]
        self.assertTrue(call["input"].startswith("SYSTEM TEXT"))
        self.assertIn("FOLDER CONTENT", call["input"])
        self.assertFalse(any("FOLDER CONTENT" in a for a in call["args"]))


class ApiKeys(Asking):
    def test_without_the_key_it_says_daybook_must_be_open(self):
        provider = Provider(id="anthropic", label="Anthropic (Claude)", auth_kind="api_key", model="claude-sonnet-5")
        with self.assertRaises(AskError) as caught:
            secretary.ask(provider, "s", "p")
        self.assertIn("only while Daybook is open", str(caught.exception))

    def test_no_model_chosen(self):
        with self.assertRaises(AskError):
            secretary.ask(Provider(id="", label="", auth_kind=""), "s", "p")


if __name__ == "__main__":
    unittest.main()
