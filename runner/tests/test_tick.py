"""The brief, arriving on its own: the minute tick and the hourly watchdog.

Run against the day-one fixture (brief time 08:30) with a frozen clock and a notifier that
only records what it would have said.
"""

from __future__ import annotations

import json
import unittest

from support import FRESH_FIXTURE, FolderCase

from daybook.clock import Clock
from daybook.tick import run_tick, run_watchdog

DAY = "2026-03-10"


class Notes:
    """Stands in for macOS notifications."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    def __call__(self, title: str, message: str) -> bool:
        self.sent.append((title, message))
        return True


class ScheduledCase(FolderCase):
    fixture = FRESH_FIXTURE

    def setUp(self) -> None:
        super().setUp()
        self.state = self.tmp / "state"
        self.notes = Notes()

    def tick(self, at: str):
        return run_tick(str(self.folder), str(self.state), clock=f"{DAY}T{at}:00", notify=self.notes)

    def watchdog(self, at: str):
        return run_watchdog(str(self.folder), str(self.state), clock=f"{DAY}T{at}:00", notify=self.notes)

    def brief(self):
        return self.folder / "briefs" / f"{DAY}.html"

    def saved_state(self) -> dict:
        return json.loads((self.state / "tick-state.json").read_text(encoding="utf-8"))


class Tick(ScheduledCase):
    def test_before_the_brief_time_nothing_is_written(self):
        outcome = self.tick("08:00")
        self.assertEqual("waiting", outcome.status)
        self.assertFalse(self.brief().exists())
        self.assertEqual([], self.notes.sent)
        self.assertEqual(f"{DAY}T08:00:00", self.saved_state()["last_tick"])

    def test_once_due_the_brief_is_written_and_announced(self):
        outcome = self.tick("08:31")
        self.assertEqual("delivered", outcome.status)
        self.assertTrue(self.brief().exists())
        self.assertTrue((self.folder / "briefs" / "latest.html").exists())
        self.assertEqual(1, len(self.notes.sent))
        title, message = self.notes.sent[0]
        self.assertEqual("Your brief is ready", title)
        self.assertIn("All 11 checks passed", message)

    def test_the_next_tick_does_not_write_or_announce_again(self):
        self.tick("08:31")
        outcome = self.tick("08:32")
        self.assertEqual("done", outcome.status)
        self.assertEqual(1, len(self.notes.sent))

    def test_a_late_brief_says_it_was_late_without_guessing_why(self):
        outcome = self.tick("10:05")
        self.assertIn("late", outcome.detail)
        message = self.notes.sent[0][1]
        self.assertIn("written at 10:05, after its 08:30 time", message)
        self.assertNotIn("asleep", message)

    def test_the_brief_time_is_read_from_config_at_every_tick(self):
        self.edit_json("config.json", lambda c: c["schedule"].__setitem__("brief_time", "09:00"))
        self.assertEqual("waiting", self.tick("08:45").status)
        self.assertEqual("delivered", self.tick("09:00").status)

    def test_a_brief_that_fails_a_check_is_withheld_and_said_once(self):
        self.edit_json(
            "config.json",
            lambda c: c["day_shape"].append({"block": "Gym", "start": "08:00", "end": "10:00"}),
        )
        first = self.tick("08:31")
        second = self.tick("08:32")
        self.assertEqual("withheld", first.status)
        self.assertIn("V2", first.detail)
        self.assertEqual("withheld", second.status)
        self.assertFalse(self.brief().exists())
        self.assertEqual(1, len(self.notes.sent))
        self.assertEqual("Today's brief is withheld", self.notes.sent[0][0])

    def test_an_unreadable_folder_is_logged_not_raised(self):
        (self.folder / "config.json").unlink()
        outcome = self.tick("08:31")
        self.assertEqual("error", outcome.status)
        state = self.saved_state()
        self.assertIn("last_tick", state)
        self.assertIn("FileNotFoundError", state["last_error"])
        self.assertEqual([], self.notes.sent)


class Watchdog(ScheduledCase):
    def test_quiet_until_half_an_hour_after_the_brief_time(self):
        self.assertEqual("ok", self.watchdog("08:55").status)
        self.assertEqual([], self.notes.sent)

    def test_quiet_when_the_brief_arrived(self):
        self.tick("08:31")
        self.notes.sent.clear()
        self.assertEqual("ok", self.watchdog("10:00").status)
        self.assertEqual([], self.notes.sent)

    def test_a_stopped_tick_is_named_as_the_problem(self):
        self.tick("08:00")  # the last tick anyone saw
        outcome = self.watchdog("10:00")
        self.assertEqual("alerted", outcome.status)
        title, message = self.notes.sent[0]
        self.assertEqual("Daybook's brief check has stopped", title)
        self.assertIn("since 08:00", message)

    def test_a_missing_brief_with_a_running_tick_is_said_once(self):
        state = self.tmp / "state"
        state.mkdir(parents=True, exist_ok=True)
        (state / "tick-state.json").write_text(json.dumps({"last_tick": f"{DAY}T09:58:00"}), encoding="utf-8")
        first = self.watchdog("10:00")
        second = self.watchdog("11:00")
        self.assertEqual("alerted", first.status)
        self.assertEqual("quiet", second.status)
        self.assertEqual(1, len(self.notes.sent))
        self.assertEqual("Today's brief hasn't arrived", self.notes.sent[0][0])

    def test_a_withheld_brief_is_not_announced_twice(self):
        self.edit_json(
            "config.json",
            lambda c: c["day_shape"].append({"block": "Gym", "start": "08:00", "end": "10:00"}),
        )
        self.tick("08:31")
        self.tick("09:59")
        self.assertEqual("ok", self.watchdog("10:00").status)
        self.assertEqual(1, len(self.notes.sent))


class LiveClockTimezone(unittest.TestCase):
    def test_the_live_clock_names_the_configured_zone(self):
        clock = Clock.system("Europe/London")
        self.assertIn("Europe/London", clock.source)
        self.assertFalse(clock.frozen)

    def test_an_unknown_zone_falls_back_and_says_so(self):
        clock = Clock.system("Mars/Olympus_Mons")
        self.assertIn("not one this machine knows", clock.source)


if __name__ == "__main__":
    unittest.main()
