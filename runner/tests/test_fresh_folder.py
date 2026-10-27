"""Day one: the folder exactly as the app's setup interview leaves it.

No reminders, no heartbeat, no day recorded, a day shape with Unplanned gaps. The brief
must still be built, pass all eleven, and say plainly what it does not know — never crash,
never fill a gap with something plausible.
"""

from __future__ import annotations

import unittest

from support import FRESH_FIXTURE, FolderCase

from daybook.folder import UNPLANNED


class FreshFolder(FolderCase):
    fixture = FRESH_FIXTURE

    def test_all_eleven_pass_on_day_one(self):
        self.assertAllPass()

    def test_missing_reminders_are_stated_not_a_crash(self):
        folder, data, _, _ = self.produce()
        self.assertEqual([], folder.schedule.reminders)
        self.assertIsNone(data.next_up)
        self.assertTrue(any("reminders.json" in w for w in data.warnings))

    def test_an_empty_list_for_today_has_its_reason(self):
        _, data, _, _ = self.produce()
        self.assertEqual([], data.today_list)
        self.assertIn("nothing is invented", data.today_list_reason.lower())

    def test_no_heartbeat_means_the_closing_line_judges_nothing(self):
        _, data, _, _ = self.produce()
        self.assertFalse(data.delivery.heartbeat_present)
        self.assertEqual(data.delivery.sentence(), data.closing.text)

    def test_the_day_shape_gaps_are_unplanned(self):
        _, data, _, _ = self.produce()
        labels = [b.label for b in data.dial.blocks]
        self.assertIn(UNPLANNED, labels)
        self.assertIn("Deep work", labels)
        self.assertTrue(data.dial.coverage.is_contiguous)

    def test_no_day_shape_is_one_unplanned_day_and_says_so(self):
        # A folder set up before the interview asked for a day shape, or kept via "use
        # this setup": the dial is complete, and the brief says why it is empty.
        self.edit_json("config.json", lambda c: c.pop("day_shape"))
        _, data, _, results = self.produce()
        self.assertEqual([UNPLANNED], [b.label for b in data.dial.blocks])
        self.assertEqual(1440, data.dial.blocks[0].length)
        self.assertTrue(any("day shape" in w.lower() for w in data.warnings))
        self.assertTrue(all(r.ok for r in results), [r.line() for r in results if not r.ok])

    def test_missing_day_state_and_log_are_stated_not_a_crash(self):
        (self.folder / "DAY-STATE.md").unlink()
        (self.folder / "LOG.md").unlink()
        _, data, _, results = self.produce()
        self.assertTrue(any("DAY-STATE.md" in w for w in data.warnings))
        self.assertTrue(any("LOG.md" in w for w in data.warnings))
        self.assertTrue(all(r.ok for r in results), [r.line() for r in results if not r.ok])


if __name__ == "__main__":
    unittest.main()


MOMENT = ("# Day state — 2026-03-10\n\n**True for:** Tuesday 10 March 2026\n\n"
          "## Today's times\n\n| Time | What |\n|---|---|\n| 08:40 | Meeting with Sam |\n")


class AWholeDayUnplanned(FolderCase):
    """A folder with no day shape is one Unplanned block from midnight to midnight. The
    disc is still drawn, bare — unplanned time takes no arc and never the accent, because
    it is not a plan — and the legend does not spend a row saying so."""

    fixture = FRESH_FIXTURE

    def test_the_disc_is_drawn_bare_and_the_legend_has_no_all_day_row(self):
        self.edit_json("config.json", lambda c: c.pop("day_shape", None))
        _, _, html, results = self.produce()
        self.assertIn('class="dial-disc"', html)
        self.assertNotIn('class="dial-arc"', html)
        self.assertNotIn("<time>all day</time>", html)
        self.assertNotIn("<span>Unplanned</span>", html)
        self.assertNotIn("stroke:var(--accent)", html)
        self.assertEqual([], [r.line() for r in results if not r.ok])

    def test_unplanned_gaps_between_blocks_keep_their_rows(self):
        _, _, html, _ = self.produce()
        self.assertIn("<span>Unplanned</span><time>07:00–09:00</time>", html)


class TheCentreInUnplannedTime(FolderCase):
    """Unplanned is not a place to be, so the centre says what is coming instead of
    "Unplanned · until 00:00": the next thing at a set time today, or a quiet
    "Nothing scheduled". The fresh folder's clock (08:00) is in Unplanned 07:00–09:00."""

    fixture = FRESH_FIXTURE

    def test_it_shows_the_next_timed_thing_today(self):
        self.write("DAY-STATE.md", MOMENT)
        _, _, html, results = self.produce()
        self.assertIn('class="dial-block" x="160.0" y="181.0">Meeting with Sam</text>', html)
        self.assertIn(">at 08:40 · in 40 minutes</text>", html)
        self.assertNotIn(">until ", html)
        self.assertEqual([], [r.line() for r in results if not r.ok])

    def test_nothing_ahead_today_is_a_quiet_line_not_unplanned_until(self):
        _, _, html, _ = self.produce()
        self.assertIn('class="dial-block quiet" x="160.0" y="181.0">Nothing scheduled</text>', html)
        self.assertIn('id="dial-until" class="dial-until" x="160.0" y="197.0"></text>', html)

    def test_the_page_script_follows_the_same_rule(self):
        _, _, html, _ = self.produce()
        self.assertIn('var UNPLANNED = "Unplanned";', html)
        self.assertIn('var name = "Nothing scheduled"', html)
        self.assertIn("next[1] < 1440", html)

