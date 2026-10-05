"""Numbers and ticks from a message: the model reports them, Daybook writes them.

"Sent 3 applications today" puts 3 on the scoreboard with where it came from; "did my
walk" ticks the walk in TICKS.md, and the brief's "n of 7" is counted from that file.
Law 7 holds throughout: no number the person did not state, and never one for a metric
they stopped tracking.
"""

from __future__ import annotations

import json
import unittest
from datetime import date

from support import FRESH_FIXTURE, FolderCase
from test_plan import Model, PlanCase, answer

from daybook import plan, ticks


def number(metric: str, value: str, note: str = "from your message") -> dict:
    return {"id": metric, "value": value, "note": note}


class AStatedNumber(PlanCase):
    def test_lands_on_the_scoreboard_with_its_source_and_the_date(self):
        outcome = self.plan(answer(scoreboard=[number("applications_sent", "3")]),
                            message="Sent 3 applications this week.")
        self.assertEqual("planned", outcome.status, outcome.detail)
        text = self.day_state()
        self.assertIn("| `applications_sent` | 3 | from your message (Tue 10 Mar) |", text)
        self.assertIn("| `invoices_outstanding` | £2,400 | Aldridge £2,400, due 2026-03-20 |", text)
        self.assertIn("| Metric | This week | Note |", text)
        self.assertAllPass()

    def test_the_brief_shows_it(self):
        self.plan(answer(scoreboard=[number("applications_sent", "3")]), message="Sent 3.")
        _, data, _, _ = self.produce()
        sent = next(m for m in data.scoreboard if m.key == "applications_sent")
        self.assertEqual("3", sent.value)

    def test_a_metric_they_stopped_tracking_is_refused(self):
        outcome = self.plan(answer(scoreboard=[number("words_shipped", "1200")]), answer(),
                            message="Wrote 1200 words.")
        self.assertEqual("planned", outcome.status, outcome.detail)
        self.assertIn("words_shipped", self.model.prompts[1])
        self.assertNotIn("1200", self.day_state())

    def test_a_metric_they_do_not_track_is_refused(self):
        self.plan(answer(scoreboard=[number("steps_walked", "9000")]), answer(), message="9000 steps.")
        self.assertIn("not a metric this person tracks", self.model.prompts[1])
        self.assertNotIn("9000", self.day_state())

    def test_a_number_without_its_source_is_refused(self):
        self.plan(answer(scoreboard=[number("applications_sent", "3", note="")]), answer())
        self.assertIn("scoreboard[1].note", self.model.prompts[1])
        self.assertNotIn("| `applications_sent` | 3 |", self.day_state())

    def test_the_proposal_shows_it_by_its_name(self):
        proposed = plan.propose(str(self.folder), message="Sent 3.",
                                ask=Model(answer(scoreboard=[number("applications_sent", "3")])))
        self.assertEqual([{"id": "applications_sent", "value": "3", "note": "from your message",
                           "label": "Applications sent"}], proposed.proposal["scoreboard"])


class ANewlyTrackedMetric(PlanCase):
    """A metric set up today has no row yet: it shows as a dash with a reason, never a 0."""

    fixture = FRESH_FIXTURE

    def test_gets_a_dash_and_a_reason_until_a_number_is_told(self):
        self.edit_json("config.json", lambda c: c.__setitem__(
            "metrics", [{"id": "applications_sent", "label": "Applications sent", "tracking": True}]))
        outcome = self.plan(answer(board=[], questions=[]))
        self.assertEqual("planned", outcome.status, outcome.detail)
        self.assertIn(f"| `applications_sent` | — | {plan.NO_NUMBER_YET} |", self.day_state())
        _, data, _, results = self.produce()
        self.assertEqual([], [r.line() for r in results if not r.ok])
        self.assertEqual("Applications sent", data.metric_labels["applications_sent"])


class TicksFromAMessage(PlanCase):
    def setUp(self) -> None:
        super().setUp()
        # Habits Daybook set up carry the day they began; the fixture's clock is 10 March.
        self.edit_json("config.json", lambda c: c.__setitem__("habits", [
            {"id": "morning_walk", "label": "Morning walk", "since": "2026-03-08"},
            {"id": "read_pages", "label": "Read 20 pages", "since": "2026-03-01"}]))
        self.write("TICKS.md", ticks.HEADER + "\n- 2026-03-09 · morning_walk · Morning walk\n")

    def test_a_tick_is_counted_in_the_habits_first_days(self):
        outcome = self.plan(answer(ticked=["morning_walk"]), message="Did my walk.")
        self.assertEqual("planned", outcome.status, outcome.detail)
        self.assertIn("| Morning walk | 2 of 3 |", self.day_state())
        self.assertIn("| Read 20 pages | 0 of 7 |", self.day_state())
        self.assertAllPass()

    def test_applying_writes_the_tick_once_a_day(self):
        for _ in range(2):
            proposed = plan.propose(str(self.folder), message="Walked.", ask=Model(answer(ticked=["morning_walk"])))
            plan.apply(str(self.folder), plan.PlanOutcome(**json.loads(proposed.to_json())))
        self.assertEqual(1, self.read("TICKS.md").count("2026-03-10 · morning_walk"))

    def test_a_proposal_that_is_not_applied_ticks_nothing(self):
        plan.propose(str(self.folder), message="Walked.", ask=Model(answer(ticked=["morning_walk"])))
        self.assertNotIn("2026-03-10", self.read("TICKS.md"))

    def test_an_unknown_habit_is_refused(self):
        self.plan(answer(ticked=["meditation"]), answer(), message="Meditated.")
        self.assertIn("not one of this person's habits", self.model.prompts[1])
        self.assertNotIn("meditation", self.read("TICKS.md"))

    def test_hand_kept_ticks_are_left_alone(self):
        self.edit_json("config.json", lambda c: c.__setitem__(
            "habits", [{k: v for k, v in h.items() if k != "since"} for h in c["habits"]]))
        self.plan(answer())
        self.assertIn("| Morning walk | 4 of 7 |", self.day_state())


class Counting(unittest.TestCase):
    TODAY = date(2026, 3, 10)

    def test_the_window_is_the_last_seven_days_today_included(self):
        seen = {(date(2026, 3, d), "walk") for d in (3, 4, 9, 10)}
        self.assertEqual("3 of 7", ticks.count({"id": "walk"}, seen, self.TODAY))

    def test_a_new_habit_counts_only_its_own_days(self):
        seen = {(date(2026, 3, 10), "walk")}
        self.assertEqual("1 of 1", ticks.count({"id": "walk", "since": "2026-03-10"}, seen, self.TODAY))

    def test_lines_that_are_not_ticks_are_ignored(self):
        text = ticks.HEADER + "\n- 2026-03-09 · walk · Walk\nA note.\n- not a date · walk\n"
        self.assertEqual({(date(2026, 3, 9), "walk")}, ticks.read(text))

    def test_appending_starts_the_file_and_skips_unknown_habits(self):
        text = ticks.appended("", [{"id": "walk", "label": "Walk"}], ["walk", "swim"], self.TODAY)
        self.assertTrue(text.startswith("# Ticks"))
        self.assertIn("- 2026-03-10 · walk · Walk", text)
        self.assertNotIn("swim", text)


if __name__ == "__main__":
    unittest.main()
