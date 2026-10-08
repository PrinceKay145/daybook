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


class AWholeDayUnplanned(FolderCase):
    """A folder with no day shape is one Unplanned block from midnight to midnight. It must
    still draw a ring, say "all day", and never take the accent — it is not a plan."""

    fixture = FRESH_FIXTURE

    def test_the_ring_is_drawn_and_reads_all_day(self):
        self.edit_json("config.json", lambda c: c.pop("day_shape", None))
        _, _, html, results = self.produce()
        self.assertIn('class="dial-ring', html)
        self.assertIn("<time>all day</time>", html)
        self.assertNotIn("stroke:var(--accent)", html)
        self.assertEqual([], [r.line() for r in results if not r.ok])

