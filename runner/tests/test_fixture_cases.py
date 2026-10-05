"""The cases fixtures/README.md plants, each asserted where week 1 can reach it.

The firing side of the daemon is week 4 and is not reimplemented here (CLAUDE.md rule 2),
so the scheduling cases are asserted against the *schedule reader* — which is what the
brief's "Next up" line and the config validator read — not against a ported daemon.
"""

from __future__ import annotations

import calendar
import datetime as dt
import re
import unittest

from support import FolderCase

from daybook import dial


class Case4_AtMostTheCapNeverManufacture(FolderCase):
    def test_exactly_two_with_a_stated_reason(self):
        _, data, _, _ = self.produce()
        self.assertEqual(2, len(data.today_list))
        self.assertIn("no third", data.today_list_reason.lower())

    def test_the_system_did_work_is_not_counted_as_a_task(self):
        # "Anything the system did for the user goes in a separate note underneath,
        # explicitly marked as not on their list." Mixing them inflates the count.
        _, data, html, _ = self.produce()
        self.assertIn("not on your list", data.done_for_you.lower())
        self.assertIn("not on your list", html)
        self.assertNotIn("invoice drafts", " ".join(a.title for a in data.today_list).lower())


class Case6_TwoDatesThenAQuestion(FolderCase):
    def test_the_portfolio_rewrite_became_a_question(self):
        _, data, _, _ = self.produce()
        joined = " ".join(data.questions).lower()
        self.assertIn("portfolio", joined)
        self.assertNotIn("portfolio", " ".join(a.title for a in data.today_list).lower())

    def test_marcus_has_a_second_and_final_prompt_not_a_third(self):
        _, folder_data, _, _ = self.produce()
        folder, *_ = self.produce()
        prompts = [
            r for r in folder.schedule.reminders if "marcus" in r.id.lower()
        ]
        self.assertEqual(1, len(prompts))
        self.assertIn("final", prompts[0].message.lower())


class Case9_AMuteNeedsADatedUnmute(FolderCase):
    def test_the_invalid_mute_is_flagged_and_the_valid_one_is_not(self):
        folder, *_ = self.produce()
        invalid = [r.id for r in folder.schedule.invalid_mutes()]
        self.assertIn("deep-work-block", invalid)
        self.assertNotIn("gym-evening", invalid)

    def test_the_valid_mute_has_a_companion_that_actually_exists(self):
        folder, *_ = self.produce()
        gym = next(r for r in folder.schedule.reminders if r.id == "gym-evening")
        companion = gym.unmute["reminder_id"]
        ids = {r.id for r in folder.schedule.reminders}
        self.assertIn(companion, ids)
        self.assertTrue(
            next(r for r in folder.schedule.reminders if r.id == companion).enabled
        )


class Case10_MonthlyLastDay(FolderCase):
    def test_day_minus_one_lands_on_the_real_last_day(self):
        folder, *_ = self.produce()
        invoice = next(r for r in folder.schedule.reminders if r.id == "invoice-clients")
        for year, month, expected in ((2026, 2, 28), (2028, 2, 29), (2026, 3, 31), (2026, 4, 30)):
            days = calendar.monthrange(year, month)[1]
            fires = [d for d in range(1, days + 1) if invoice.due_on(dt.date(year, month, d))]
            self.assertEqual([expected], fires, f"{year}-{month:02d}")

    def test_a_fixed_day_monthly_is_unaffected(self):
        folder, *_ = self.produce()
        pension = next(r for r in folder.schedule.reminders if r.id == "pension-check")
        fires = [d for d in range(1, 32) if pension.due_on(dt.date(2026, 3, d))]
        self.assertEqual([15], fires)


class Case11_NextUpAndTheCatchupBoundary(FolderCase):
    def test_next_up_is_the_08_12_item_not_the_08_20_one(self):
        _, data, _, _ = self.produce()
        self.assertIn("standup", data.next_up.title.lower())
        self.assertEqual("08:12", data.next_up.at)
        self.assertEqual(12, data.next_up.in_minutes)

    def test_the_catchup_window_is_read_from_the_file_not_hardcoded(self):
        folder, *_ = self.produce()
        self.assertEqual(dt.timedelta(minutes=20), folder.schedule.catchup_window)


class Case12_ContiguousDayBlocks(FolderCase):
    def test_the_fixture_covers_the_whole_day(self):
        _, data, _, _ = self.produce()
        self.assertTrue(data.dial.coverage.is_contiguous)
        self.assertEqual(1440, sum(b.length for b in data.dial.blocks))

    def test_the_wrapping_sleep_block_is_handled(self):
        _, data, _, _ = self.produce()
        sleep = next(b for b in data.dial.blocks if b.label == "Sleep")
        self.assertTrue(sleep.wraps)
        self.assertIs(sleep, dial.current_block(data.dial.blocks, 30))
        self.assertIs(sleep, dial.current_block(data.dial.blocks, 1400))


class Case14_DailyShiftingSchedule(FolderCase):
    def test_todays_times_come_from_the_named_rank_one_source(self):
        _, data, _, _ = self.produce()
        self.assertIn("first light 06:14", data.light_schedule_line)
        self.assertIn("sunset 18:02", data.light_schedule_line)
        self.assertIn("rank 1", data.light_schedule_source)

    def test_never_yesterdays_times(self):
        # Remove today's row. The module must go quiet and say so, not reach for the
        # nearest row — a wrong time is worse than no time.
        self.edit_json(
            "almanac-2026-03.json",
            lambda a: a.__setitem__(
                "days", [d for d in a["days"] if d["date"] != "2026-03-10"]
            ),
        )
        folder, data, _, _ = self.produce()
        self.assertEqual("", data.light_schedule_line)
        self.assertTrue(any("no row for 2026-03-10" in w for w in data.warnings))


class Case15_UnicodeAndAwkwardStrings(FolderCase):
    def test_umlauts_survive_into_the_rendered_brief(self):
        _, data, html, _ = self.produce()
        self.assertTrue(any("Bäcker & Söhne" in a.title for a in data.today_list))
        self.assertIn("B&auml;cker &amp; S&ouml;hne", html.replace("ä", "&auml;").replace("ö", "&ouml;"))

    def test_the_ampersand_is_escaped_not_dropped(self):
        _, _, html, _ = self.produce()
        self.assertIn("&amp;", html)
        self.assertNotIn("Bäcker & Söhne</span>", html)

    def test_an_em_dash_in_a_reminder_title_survives(self):
        folder, *_ = self.produce()
        titles = [r.title for r in folder.schedule.reminders]
        self.assertTrue(any("—" in t for t in titles))


class TheClockIsNamed(FolderCase):
    """Law 5 — verify before asserting, and say which source."""

    def test_the_frozen_clock_is_declared_in_the_brief(self):
        _, data, html, _ = self.produce()
        self.assertTrue(data.clock_frozen)
        self.assertIn("fixture_now in config.json", data.clock_description)
        self.assertIn("frozen clock", html)

    def test_the_hand_does_not_drift_when_the_clock_is_frozen(self):
        _, _, html, _ = self.produce()
        self.assertIn("var FROZEN = true;", html)
        self.assertNotIn("setInterval(tick, 30000);\n  }\n  window.setInterval", html)


class SelfContained(FolderCase):
    """No external requests at render time, and no browser storage."""

    def test_no_external_references(self):
        _, _, html, _ = self.produce()
        for forbidden in ("http://", "https://", "//cdn", "<link", "@import", "src="):
            self.assertNotIn(forbidden, html, f"brief reaches outside itself: {forbidden}")

    def test_no_browser_storage(self):
        _, _, html, _ = self.produce()
        for forbidden in ("localStorage", "sessionStorage", "indexedDB", "document.cookie"):
            self.assertNotIn(forbidden, html)

    def test_renders_in_both_themes(self):
        _, _, html, _ = self.produce()
        self.assertIn("prefers-color-scheme: dark", html)
        self.assertIn("color-scheme: light dark", html)

    def test_is_readable_at_phone_width(self):
        _, _, html, _ = self.produce()
        self.assertIn('name="viewport"', html)
        self.assertIn("@media (max-width: 520px)", html)



class TheDial(FolderCase):
    """What is fixed in time is marked and named outside the ring, and the page's script
    keeps the words around the dial true while it stays open."""

    def test_fixed_times_and_the_light_schedule_are_named_outside_the_ring(self):
        _, _, html, _ = self.produce()
        self.assertRegex(html, r'class="dial-mark-label fixed"[^>]*>School run<')
        self.assertRegex(html, r'class="dial-mark-label light"[^>]*>Sunset<')
        self.assertIn("<title>School run · 08:20 · non-negotiable</title>", html)

    def test_two_marks_at_one_time_are_both_named_without_overlapping(self):
        self.edit_json("config.json", lambda c: c["non_negotiables"].append(
            {"label": "Call the bank", "time": "08:20", "days": ["all"]}))
        _, _, html, _ = self.produce()
        ys = {label: y for y, label in re.findall(
            r'class="dial-mark-label fixed" x="[\d.]+" y="([\d.]+)"[^>]*>([^<]+)<', html)}
        self.assertIn("School run", ys)
        self.assertIn("Call the bank", ys)
        self.assertGreaterEqual(abs(float(ys["School run"]) - float(ys["Call the bank"])), 12)

    def test_no_block_name_can_close_the_script(self):
        self.edit_json("config.json", lambda c: c["day_shape"][2].__setitem__("block", "Deep </script> work"))
        _, _, html, results = self.produce()
        self.assertEqual(1, html.count("</script>"))
        self.assertIn("Deep \\u003c/script> work", html)
        self.assertTrue(all(r.ok for r in results), [r.line() for r in results if not r.ok])

    def test_the_reminders_ahead_travel_with_the_page_for_next_up(self):
        _, data, html, _ = self.produce()
        self.assertTrue(data.ahead)
        self.assertEqual(data.next_up.title, data.ahead[0][0])
        self.assertEqual(sorted(m for _, m in data.ahead), [m for _, m in data.ahead])
        self.assertIn("var AHEAD = [", html)
        self.assertIn('id="next-line"', html)


if __name__ == "__main__":
    unittest.main()
