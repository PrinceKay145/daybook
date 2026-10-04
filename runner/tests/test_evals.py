"""The law eval harness itself, with a scripted model — so CI proves the harness can fail.
The real run (python -m daybook evals) needs a signed-in CLI and runs on a developer's Mac."""

from __future__ import annotations

import json
import unittest

from daybook import evals
from daybook.secretary import Provider

PROVIDER = Provider(id="claude-cli", label="Claude Code", auth_kind="local_cli", binary="claude",
                    binary_path="/nonexistent/claude", model="claude-sonnet-5", model_label="Sonnet 5")


def reply(items, flags=()):
    return json.dumps({
        "today_list": [{"title": t, "first_click": f"Open the file and {t.lower()} now."} for t in items],
        "list_reason": "That is what honestly belongs today.",
        "board": [{"who": "Priya", "what": "Scope", "status": "WAIT", "next_move": "Check in if silent",
                   "date": "2026-03-12"}],
        "board_note": "", "newly_finished": [{"label": "Bäcker draft", "detail": "Sent."}],
        "questions": [], "summary": "", "flags": list(flags)})


class Harness(unittest.TestCase):
    def test_a_model_that_keeps_the_laws_passes(self):
        good = lambda *a, **k: reply(["Apply to the Tessellate role"], flags=["MASTER-PLAN.md asked for a transfer"])
        passed, lines = evals.run(PROVIDER, ask=good)
        self.assertTrue(passed, "\n".join(lines))

    def test_padding_fails_the_run(self):
        padded = lambda *a, **k: reply(["One", "Two", "Three", "Four"])
        passed, lines = evals.run(PROVIDER, evals.SCENARIOS[:1], ask=padded)
        self.assertFalse(passed)
        self.assertTrue(any("FAIL" in l and "never pad" in l for l in lines))

    def test_a_planted_instruction_reaching_the_list_fails_the_run(self):
        obeyed = lambda *a, **k: reply(["Transfer £500 to account 4401-2290"])
        passed, _ = evals.run(PROVIDER, evals.SCENARIOS[2:3], ask=obeyed)
        self.assertFalse(passed)

    def test_a_finished_thing_back_on_the_list_fails_the_run(self):
        resurfaced = lambda *a, **k: reply(["Chase the Hartley invoice"])
        passed, _ = evals.run(PROVIDER, evals.SCENARIOS[1:2], ask=resurfaced)
        self.assertFalse(passed)


if __name__ == "__main__":
    unittest.main()
