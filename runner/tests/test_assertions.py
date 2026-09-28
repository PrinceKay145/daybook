"""The eleven, each proved to fail when the thing it exists to catch is planted.

An assertion that cannot fail is decoration. Every test here breaks the fixture in the
specific way BRIEF-SPEC says the assertion catches, and requires a FAIL.
"""

from __future__ import annotations

import unittest

from support import FolderCase


class AllElevenPassOnTheUntouchedFixture(FolderCase):
    def test_clean_fixture_passes_everything(self):
        self.assertAllPass()

    def test_there_are_exactly_eleven(self):
        self.assertEqual(11, len(self.results()))


class V1_BlankPage(FolderCase):
    """The brief's script is extracted from the rendered HTML and checked before
    delivery, so these corrupt the HTML rather than the folder."""

    def _verify_html(self, mutate):
        from daybook.assertions import verify

        _, data, html, _ = self.produce()
        results = {r.id: r for r in verify(data, mutate(html))}
        return results["V1"]

    def test_an_unclosed_brace_is_caught(self):
        result = self._verify_html(lambda h: h.replace("function tick() {", "function tick() { {"))
        self.assertFalse(result.ok, result.detail)

    def test_an_unterminated_string_is_caught(self):
        result = self._verify_html(lambda h: h.replace('return (n < 10 ? "0" : "")', 'return (n < 10 ? "0 : "")'))
        self.assertFalse(result.ok, result.detail)

    def test_a_script_block_that_vanished_is_caught(self):
        import re as _re

        result = self._verify_html(lambda h: _re.sub(r"<script\b.*?</script>", "", h, flags=_re.S))
        self.assertFalse(result.ok, result.detail)

    def test_the_real_brief_passes_both_checkers(self):
        _, _, _, results = self.produce()
        v1 = {r.id: r for r in results}["V1"]
        self.assertTrue(v1.ok, v1.detail)
        self.assertIn("structural scan", v1.detail)


class V2_CurrentBlockOfNothing(FolderCase):
    def test_removing_a_day_shape_block_fails_the_build(self):
        # fixtures/README.md case 12: "removing a block must fail the build".
        self.edit_json(
            "config.json",
            lambda c: c.__setitem__(
                "day_shape", [b for b in c["day_shape"] if b["block"] != "Lunch and walk"]
            ),
        )
        self.assertAssertionFails("V2")

    def test_overlapping_blocks_are_caught_too(self):
        def widen(config):
            for block in config["day_shape"]:
                if block["block"] == "Deep work":
                    block["end"] = "13:00"       # now overlaps Lunch and walk
        self.edit_json("config.json", widen)
        self.assertAssertionFails("V2")


class V3_WrongGeometry(FolderCase):
    def test_an_anticlockwise_dial_is_caught(self):
        from daybook import dial

        original = dial.polar_point
        dial.polar_point = lambda m, r, cx, cy: original(-m, r, cx, cy)
        self.addCleanup(setattr, dial, "polar_point", original)
        self.assertAssertionFails("V3")


class V4_BoundaryOffByOne(FolderCase):
    def test_inclusive_end_boundaries_are_caught(self):
        from daybook import dial

        original = dial.current_block

        def inclusive(blocks, minute):
            for block in blocks:
                for start, end in block.spans():
                    if start <= minute <= end:      # the off-by-one
                        return block
            return None

        dial.current_block = inclusive
        self.addCleanup(setattr, dial, "current_block", original)
        self.assertAssertionFails("V4")


class V5_ButtonThatOpensNothing(FolderCase):
    def test_a_missing_action_target_is_caught(self):
        (self.folder / "documents" / "aldridge-notes.md").unlink()
        self.assertAssertionFails("V5")

    def test_a_missing_almanac_is_caught(self):
        (self.folder / "almanac-2026-03.json").unlink()
        self.assertAssertionFails("V5")

    def test_an_action_target_outside_the_folder_is_caught(self):
        def escape(config):
            for reminder in config["reminders"]:
                if reminder["id"] == "standup-prep":
                    reminder["actions"][0]["path"] = "~/../../etc/passwd"
        self.edit_json("reminders.json", escape)
        self.assertAssertionFails("V5")


class V6_Padding(FolderCase):
    def test_a_fourth_item_is_caught(self):
        self.replace_in(
            "DAY-STATE.md",
            "**Done for you overnight",
            "3. **Filler one.**\n   Padding.\n\n4. **Filler two.**\n   More padding.\n\n"
            "**Done for you overnight",
        )
        self.assertAssertionFails("V6")

    def test_fewer_than_three_without_a_reason_is_caught(self):
        # Law 8 allows one item. It does not allow one item with no explanation.
        text = self.read("DAY-STATE.md")
        start = text.index("Honest count today")
        end = text.index("1. **Send")
        self.write("DAY-STATE.md", text[:start] + text[end:])
        self.assertAssertionFails("V6")


class V7_TheTrustDestroyingFailure(FolderCase):
    def test_a_done_item_reappearing_in_todays_three_is_caught(self):
        # fixtures/README.md case 1: DAY-STATE marks the Hartley invoice DONE, and LOG
        # and reminders.json still mention it. It must never come back.
        self.replace_in(
            "DAY-STATE.md",
            "2. **Apply to the Tessellate PM role.**",
            "2. **Chase the Hartley invoice.**\n   Open the thread and follow up.\n\n"
            "3. **Apply to the Tessellate PM role.**",
        )
        self.assertAssertionFails("V7")

    def test_the_untouched_fixture_does_not_resurface_it(self):
        _, data, _, _ = self.produce()
        self.assertIn("Hartley invoice", data.finished_labels)
        joined = " ".join(f"{a.title} {a.detail}" for a in data.three).lower()
        self.assertNotIn("hartley", joined)


class V8_SilentBlank(FolderCase):
    def test_an_empty_metric_with_no_reason_is_caught(self):
        # fixtures/README.md case 2: newsletter_subscribers has no reading this week.
        self.replace_in(
            "DAY-STATE.md",
            "| `newsletter_subscribers` | — | No reading taken this week. The figure is not "
            "in the file, so it is not being guessed. |",
            "| `newsletter_subscribers` | — |  |",
        )
        self.assertAssertionFails("V8")

    def test_the_dropped_metric_keeps_its_reason(self):
        # fixtures/README.md case 3: words_shipped is tracking:false and must say so.
        _, data, _, _ = self.produce()
        dropped = next(m for m in data.scoreboard if m.key == "words_shipped")
        self.assertTrue(dropped.is_empty)
        self.assertIn("stopped tracking", dropped.note.lower())


class V9_UntrackedButLooksTracked(FolderCase):
    def test_a_row_with_no_status_is_caught(self):
        self.replace_in(
            "DAY-STATE.md",
            "| Marcus Ellery | Asked for a coffee/PM conversation on 2 March, no reply yet "
            "| **WAIT** | One follow-up, then drop | 2026-03-13 |",
            "| Marcus Ellery | Asked for a coffee/PM conversation on 2 March, no reply yet "
            "|  | One follow-up, then drop | 2026-03-13 |",
        )
        self.assertAssertionFails("V9")

    def test_a_row_with_a_status_but_no_date_is_caught(self):
        self.replace_in(
            "DAY-STATE.md",
            "| **WAIT** | Chase if silent | 2026-03-12 |",
            "| **WAIT** | Chase if silent |  |",
        )
        self.assertAssertionFails("V9")

    def test_an_explicitly_closed_row_is_not_a_violation(self):
        # Northgate is closed in every cell. That is a record, not a leak.
        _, data, _, _ = self.produce()
        self.assertEqual(["Northgate Digital"], [r.who for r in data.board_closed])
        self.assertEqual(4, len(data.board_live))


class V10_Grading(FolderCase):
    def test_a_streak_is_caught(self):
        # fixtures/README.md case 8: habits have gaps, and must render as counts only.
        self.replace_in("DAY-STATE.md", "| Morning walk | 4 of 7 |",
                        "| Morning walk | 4 of 7 — 3 day streak |")
        self.assertAssertionFails("V10")

    def test_a_percentage_is_caught(self):
        self.replace_in("DAY-STATE.md", "| Read 20 pages | 2 of 7 |",
                        "| Read 20 pages | 29% |")
        self.assertAssertionFails("V10")


class V11_JudgingAnUndeliveredDay(FolderCase):
    def test_a_missing_heartbeat_is_stated_and_nothing_is_judged(self):
        # No heartbeat is a real state (a folder set up today; a Mac without the reminder
        # agent yet). The brief may ship only by saying so, as its closing line.
        (self.folder / ".agent-heartbeat.json").unlink()
        _, data, html, results = self.produce()
        v11 = {r.id: r for r in results}["V11"]
        self.assertTrue(v11.ok, v11.detail)
        self.assertEqual(data.delivery.sentence(), data.closing.text)
        self.assertIn("cannot tell whether", html)

    def test_a_missing_heartbeat_the_page_leaves_out_is_caught(self):
        from daybook.assertions import verify

        (self.folder / ".agent-heartbeat.json").unlink()
        _, data, html, _ = self.produce()
        stripped = html.replace("There is no heartbeat file", "All is well")
        self.assertFalse({r.id: r for r in verify(data, stripped)}["V11"].ok)

    def test_a_missing_heartbeat_with_a_judging_closing_line_is_caught(self):
        from dataclasses import replace

        from daybook.assertions import verify

        (self.folder / ".agent-heartbeat.json").unlink()
        _, data, html, _ = self.produce()
        judged = replace(data, closing=replace(data.closing, text="You skipped the gym again."))
        self.assertFalse({r.id: r for r in verify(judged, html)}["V11"].ok)

    def test_a_present_heartbeat_the_page_leaves_out_is_caught(self):
        # "Reflected" is checked on the rendered page, not assumed from the data.
        import html as html_mod

        from daybook.assertions import verify

        _, data, html, _ = self.produce()
        sentence = html_mod.escape(data.delivery.sentence(), quote=True)
        self.assertIn(sentence, html)
        self.assertFalse({r.id: r for r in verify(data, html.replace(sentence, ""))}["V11"].ok)

    def test_the_outage_is_stated_not_swallowed(self):
        # fixtures/README.md case 7: LOG 2026-03-06 records a daemon outage. It must read
        # as a system failure, and nothing on it may count against the user.
        _, data, html, _ = self.produce()
        import datetime as dt

        self.assertIn(dt.date(2026, 3, 6), data.delivery.undelivered_days)
        self.assertIn("system failure", data.delivery.sentence().lower())
        self.assertIn("6 March", html)

    def test_unreachable_buttons_count_as_undelivered(self):
        # ARCHITECTURE §9.1: under 'banners', 0 of 3 action buttons are usable. A brief
        # whose buttons were never reachable is an undelivered instruction under law 14.
        self.edit_json(".agent-heartbeat.json",
                       lambda h: h.__setitem__("alert_style", "banners"))
        _, data, _, _ = self.produce()
        self.assertFalse(data.delivery.buttons_reachable)
        self.assertTrue(data.delivery.currently_broken)
        self.assertIn("not reachable", data.delivery.sentence())


if __name__ == "__main__":
    unittest.main()
