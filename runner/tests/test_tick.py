"""The brief, arriving on its own: the minute tick and the hourly watchdog.

Run against the day-one fixture (brief time 08:30) with a frozen clock and a notifier that
only records what it would have said.
"""

from __future__ import annotations

import json
import unittest

from support import FRESH_FIXTURE, FolderCase

import os
import threading
import time

from daybook import plan, planlock
from daybook.clock import Clock
from daybook.tick import apply_for_app, plan_for_app, run_tick, run_watchdog

DAY = "2026-03-10"


class Notes:
    """Stands in for macOS notifications."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    def __call__(self, title: str, message: str) -> bool:
        self.sent.append((title, message))
        return True


class Planner:
    """Stands in for the model planning the day; records each call."""

    def __init__(self, outcome: "plan.PlanOutcome | None" = None) -> None:
        self.calls: list[str] = []
        self.outcome = outcome or plan.PlanOutcome("planned", "2 on the list, 0 on the board",
                                                   model="Sonnet 5 · Claude Code")

    def __call__(self, folder_path: str, clock: str | None = None) -> "plan.PlanOutcome":
        self.calls.append(clock or "")
        return self.outcome


class ScheduledCase(FolderCase):
    fixture = FRESH_FIXTURE

    def setUp(self) -> None:
        super().setUp()
        self.state = self.tmp / "state"
        self.notes = Notes()
        self.planner = Planner()

    def tick(self, at: str):
        return run_tick(str(self.folder), str(self.state), clock=f"{DAY}T{at}:00",
                        notify=self.notes, plan_day=self.planner)

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
        self.assertIn("is ready", message)
        self.assertNotIn("checks", message)  # the owner removed check counts from what people read

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


class TickPlansTheDay(ScheduledCase):
    """The model plans in the ten minutes before the brief time, once a day; a plan that
    fails is said in the brief, which is still built from the day state as it stood."""

    def test_nothing_is_planned_before_the_window(self):
        self.tick("08:19")
        self.assertEqual([], self.planner.calls)

    def test_the_day_is_planned_once_in_the_window_and_the_brief_waits_for_its_time(self):
        outcome = self.tick("08:20")
        self.assertEqual("waiting", outcome.status)
        self.assertIn("planned", outcome.detail)
        self.assertFalse(self.brief().exists())
        self.tick("08:25")
        self.assertEqual(1, len(self.planner.calls))
        self.assertEqual("delivered", self.tick("08:30").status)
        self.assertEqual(1, len(self.planner.calls))

    def test_a_mac_asleep_through_the_window_plans_then_briefs_on_waking(self):
        self.assertEqual("delivered", self.tick("10:05").status)
        self.assertEqual(1, len(self.planner.calls))

    def test_a_failed_plan_is_said_in_the_brief(self):
        self.planner.outcome = plan.PlanOutcome(
            "failed", "Claude Code isn't signed in on this Mac.", model="Sonnet 5 · Claude Code")
        self.tick("08:31")
        html = self.brief().read_text(encoding="utf-8")
        self.assertIn("Today&#x27;s plan wasn&#x27;t refreshed by Sonnet 5 · Claude Code", html)
        self.assertEqual(1, len(self.planner.calls))

    def test_a_real_plan_lands_in_the_brief(self):
        reply = json.dumps({
            "today_list": [{"title": "Draft the Lumen proposal outline",
                            "first_click": "Open a new document and write the three section headings."}],
            "list_reason": "One thing today; the rest waits on replies.",
            "board": [], "board_note": "", "newly_finished": [], "questions": [],
            "summary": "", "flags": []})
        self.planner = lambda path, clock=None: plan.run(path, clock=clock, ask=lambda *a, **k: reply)
        self.assertEqual("delivered", self.tick("08:31").status)
        self.assertIn("Draft the Lumen proposal outline", self.brief().read_text(encoding="utf-8"))

    def test_a_failed_retry_does_not_unsay_a_plan_that_was_written(self):
        from daybook.tick import record_plan

        record_plan(str(self.state), DAY, plan.PlanOutcome("planned", "1 on the list", model="Sonnet 5"))
        record_plan(str(self.state), DAY, plan.PlanOutcome("failed", "not signed in", model="Sonnet 5"))
        self.assertEqual("planned", self.saved_state()["plan"]["status"])
        self.tick("08:31")
        self.assertNotIn("wasn&#x27;t refreshed", self.brief().read_text(encoding="utf-8"))
        self.assertEqual([], self.planner.calls)



class OnePlanAtATime(ScheduledCase):
    """The app and the launchd tick are separate processes; the plan lock in app data keeps
    them from planning the same day at once (found end to end: setup finished after the
    brief time, both planned in the same second, and the app's plan was refused)."""

    def hold_lock_as_another_run(self) -> None:
        self.state.mkdir(parents=True, exist_ok=True)
        (self.state / planlock.NAME).write_text(json.dumps(
            {"pid": os.getppid(), "by": "the other run", "at": time.time()}), encoding="utf-8")

    def test_the_tick_waits_while_daybook_plans_and_writes_no_brief_without_the_plan(self):
        self.hold_lock_as_another_run()
        outcome = self.tick("08:31")
        self.assertEqual("waiting", outcome.status)
        self.assertEqual([], self.planner.calls)
        self.assertFalse(self.brief().exists())

    def test_the_tick_does_not_plan_again_once_daybook_has(self):
        self.state.mkdir(parents=True, exist_ok=True)
        (self.state / "tick-state.json").write_text(json.dumps(
            {"plan": {"day": DAY, "status": "planned", "detail": "1 on the list"}}), encoding="utf-8")
        self.assertEqual("delivered", self.tick("08:31").status)
        self.assertEqual([], self.planner.calls)

    def test_the_app_uses_the_plan_the_tick_just_made_instead_of_a_second(self):
        self.hold_lock_as_another_run()

        def tick_finishes() -> None:
            time.sleep(0.2)
            (self.state / "tick-state.json").write_text(json.dumps({"plan": {
                "day": DAY, "status": "planned", "detail": "2 on the list, 1 on the board",
                "model": "Sonnet 5 · Claude Code"}}), encoding="utf-8")
            (self.state / planlock.NAME).unlink()

        threading.Thread(target=tick_finishes).start()
        outcome = plan_for_app(str(self.folder), str(self.state), clock=f"{DAY}T08:31:00",
                               wait=10, planner=self.planner)
        self.assertEqual(("planned", "2 on the list, 1 on the board"), (outcome.status, outcome.detail))
        self.assertEqual([], self.planner.calls)
        self.assertFalse((self.state / planlock.NAME).exists())

    def test_a_message_waits_for_the_tick_then_is_still_proposed(self):
        self.hold_lock_as_another_run()
        threading.Timer(0.2, lambda: (self.state / planlock.NAME).unlink()).start()
        asked = []

        def proposer(folder_path, clock=None, message=None, secret=None):
            asked.append(message)
            return plan.PlanOutcome("proposed", "1 on the list")

        outcome = plan_for_app(str(self.folder), str(self.state), message="Sent it.", propose=True,
                               wait=10, proposer=proposer)
        self.assertEqual("proposed", outcome.status)
        self.assertEqual(["Sent it."], asked)

    def test_a_tick_that_never_finishes_is_said_plainly(self):
        self.hold_lock_as_another_run()
        outcome = plan_for_app(str(self.folder), str(self.state), wait=0, planner=self.planner)
        self.assertEqual("failed", outcome.status)
        self.assertIn("already planning", outcome.detail)
        refused = apply_for_app(str(self.folder), str(self.state), plan.PlanOutcome("proposed", ""), wait=0)
        self.assertEqual("refused", refused.status)


class TheLock(unittest.TestCase):
    def setUp(self) -> None:
        import tempfile
        self.dir = tempfile.mkdtemp(prefix="daybook-lock-")

    def test_a_second_holder_that_will_not_wait_is_told_who_has_it(self):
        with planlock.holding(self.dir, "Daybook"):
            with self.assertRaisesRegex(planlock.Busy, "Daybook"):
                with planlock.holding(self.dir, "the morning tick"):
                    pass

    def test_a_lock_left_by_a_process_that_died_is_taken_over(self):
        with open(os.path.join(self.dir, planlock.NAME), "w") as handle:
            handle.write(json.dumps({"pid": 999999, "by": "a crashed run", "at": time.time()}))
        with planlock.holding(self.dir, "Daybook") as waited:
            self.assertFalse(waited)

    def test_a_lock_older_than_any_run_is_taken_over(self):
        with open(os.path.join(self.dir, planlock.NAME), "w") as handle:
            handle.write(json.dumps({"pid": os.getppid(), "by": "old", "at": time.time() - planlock.STALE_AFTER - 1}))
        with planlock.holding(self.dir, "Daybook"):
            self.assertEqual("Daybook", planlock.holder(self.dir)["by"])

    def test_the_lock_is_gone_after_the_run_even_when_it_fails(self):
        with self.assertRaises(RuntimeError):
            with planlock.holding(self.dir, "Daybook"):
                raise RuntimeError("the model could not be asked")
        self.assertIsNone(planlock.holder(self.dir))
