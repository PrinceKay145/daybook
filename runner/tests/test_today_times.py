"""Things at a set time today reach the dial and Next up.

Found testing live: "business call 17:00–19:00" went onto today's list, but the dial kept
showing the typical day ("Unplanned, all day") and Next up said nothing was scheduled. The
plan now carries today's times; spans are drawn as today's own blocks over the day shape,
moments ("before 15:30") are marked beside the ring, and Next up counts both. Only times
that were given — no end is ever made up.
"""

from __future__ import annotations

import unittest

from support import FRESH_FIXTURE
from test_plan import PlanCase, answer

from daybook import daystate, dial
from daybook.render import render

CALL = {"what": "Business call", "start": "17:00", "end": "19:00"}
DEADLINE = {"what": "Confirm the meeting with Sam", "start": "15:30", "end": ""}


class OnTheDial(PlanCase):
    fixture = FRESH_FIXTURE

    def plan_times(self, *times):
        return self.plan(answer(today_times=list(times), board=[], questions=[]), message="Call at 17:00 to 19:00.")

    def test_a_span_is_today_own_block_and_a_moment_is_marked(self):
        outcome = self.plan_times(CALL, DEADLINE)
        self.assertEqual("planned", outcome.status, outcome.detail)
        text = self.day_state()
        self.assertIn("| 15:30 | Confirm the meeting with Sam |", text)
        self.assertIn("| 17:00–19:00 | Business call |", text)
        _, data, html, results = self.produce()
        self.assertEqual([], [r.line() for r in results if not r.ok])
        call = next(b for b in data.dial.blocks if b.label == "Business call")
        self.assertEqual((17 * 60, 19 * 60), (call.start, call.end))
        self.assertTrue(data.dial.coverage.is_contiguous)
        self.assertIn("<title>Confirm the meeting with Sam · 15:30 · today</title>", html)
        self.assertIn('<li class="moment"><i></i><span>Confirm the meeting with Sam</span><time>15:30</time></li>', html)

    def test_next_up_counts_them(self):
        self.plan_times(CALL, DEADLINE)
        _, data, _, _ = self.produce()
        self.assertEqual(("Confirm the meeting with Sam", "15:30"), (data.next_up.title, data.next_up.at))
        self.assertIn(("Business call", 17 * 60), data.ahead)

    def test_a_later_plan_without_times_clears_them(self):
        self.plan_times(CALL)
        self.plan(answer(board=[], questions=[]))
        self.assertNotIn("Today's times", self.day_state())

    def test_yesterdays_times_are_not_on_todays_dial(self):
        self.plan_times(CALL)
        self.replace_in("DAY-STATE.md", "**True for:** Tuesday 10 March 2026", "**True for:** Monday 9 March 2026")
        _, data, _, _ = self.produce()
        self.assertFalse(any(b.label == "Business call" for b in data.dial.blocks))
        self.assertIsNone(data.next_up)


class NothingMadeUp(PlanCase):
    fixture = FRESH_FIXTURE

    def test_a_time_that_is_not_a_clock_time_is_refused(self):
        self.plan(answer(today_times=[{"what": "Call", "start": "5pm", "end": ""}], board=[], questions=[]),
                  answer(board=[], questions=[]))
        self.assertIn("24-hour clock", self.model.prompts[1])

    def test_spans_that_overlap_are_refused(self):
        clash = {"what": "Dentist", "start": "18:00", "end": "18:30"}
        self.plan(answer(today_times=[CALL, clash], board=[], questions=[]), answer(board=[], questions=[]))
        self.assertIn("overlap", self.model.prompts[1])

    def test_an_end_equal_to_its_start_is_refused(self):
        self.plan(answer(today_times=[{"what": "Call", "start": "17:00", "end": "17:00"}], board=[], questions=[]),
                  answer(board=[], questions=[]))
        self.assertIn("ends when it starts", self.model.prompts[1])


class Overlay(unittest.TestCase):
    def test_no_events_leaves_the_day_shape_as_it_was(self):
        shape = dial.blocks_from_config([{"block": "Sleep", "start": "23:00", "end": "07:00"},
                                         {"block": "Day", "start": "07:00", "end": "23:00"}])
        self.assertIs(shape, dial.overlay(shape, []))

    def test_a_span_takes_its_place_and_the_rest_stays_whole(self):
        shape = dial.blocks_from_config([{"block": "Sleep", "start": "23:00", "end": "07:00"},
                                         {"block": "Day", "start": "07:00", "end": "23:00"}])
        blocks = dial.overlay(shape, [("Call", 17 * 60, 19 * 60)])
        self.assertEqual([("Day", "07:00", "17:00"), ("Call", "17:00", "19:00"),
                          ("Day", "19:00", "23:00"), ("Sleep", "23:00", "07:00")],
                         [(b.label, dial.to_hhmm(b.start), dial.to_hhmm(b.end)) for b in blocks])
        self.assertTrue(dial.coverage(blocks).is_contiguous)

    def test_a_whole_unplanned_day_wraps_around_the_span(self):
        blocks = dial.overlay([dial.Block("Unplanned", 0, 0)], [("Call", 17 * 60, 19 * 60)])
        self.assertEqual([("Call", 1020, 1140), ("Unplanned", 1140, 1020)],
                         sorted((b.label, b.start, b.end) for b in blocks))
        self.assertTrue(dial.coverage(blocks).is_contiguous)


class Reading(unittest.TestCase):
    def test_spans_and_moments_are_read_from_the_day_state(self):
        state = daystate.parse("## Today's times\n\n| Time | What |\n|---|---|\n"
                               "| 17:00–19:00 | Business call |\n| 15:30 | Deadline |\n| soon | Vague |\n")
        self.assertEqual([("Deadline", 930, None), ("Business call", 1020, 1140)],
                         [(t.label, t.start, t.end) for t in state.times])


if __name__ == "__main__":
    unittest.main()
