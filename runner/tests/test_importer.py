"""Reading a handover from another AI into the setup form — leniently, and never guessing.

The documents here are written the way chat assistants actually answer: a fence around
the whole thing, bold lines for headings, "unknown" where they know nothing, and times in
whatever shape the person used.
"""

from __future__ import annotations

import unittest

import support  # noqa: F401 — puts the runner on the path

from daybook import importer

HANDOVER = """Here is your handover document:

```markdown
# Daybook handover

## Name
Full name: Amara Okafor
Call me: Amara

## Working toward
- Land a data analyst role — by March 2027
- unknown

## Typical day
- 23:00–07:00 Sleep
- 7–9am Breakfast and school run
- Deep work 9-12:30
- 12:00–13:00 Lunch
- Evenings free

## Fixed commitments
- 08:20 School run (Mon–Fri)
- Jumu'ah 13:00 (Fri)
- Sunday off

## Waiting on others
- Tunde — reference letter — since 2026-09-28

## Numbers I track
- Applications sent
- Deep-work hours

## Habits
- Morning walk
- (none yet)

## Projects and context
- Prefers short, direct messages.
```
"""


class AHandover(unittest.TestCase):
    def setUp(self) -> None:
        self.draft = importer.read_handover(HANDOVER)

    def test_fills_the_name_and_what_to_call_them(self):
        self.assertEqual(("Amara Okafor", "Amara"), (self.draft["name"], self.draft["address_as"]))

    def test_unknown_means_unknown_not_a_goal(self):
        self.assertEqual(["Land a data analyst role — by March 2027"], self.draft["goals"])

    def test_reads_the_day_in_the_shapes_people_write_it(self):
        self.assertEqual([
            {"block": "Sleep", "start": "23:00", "end": "07:00"},
            {"block": "Breakfast and school run", "start": "07:00", "end": "09:00"},
            {"block": "Deep work", "start": "09:00", "end": "12:30"},
        ], self.draft["day_shape"])

    def test_says_what_it_left_out_rather_than_guessing(self):
        notes = " ".join(self.draft["notes"])
        self.assertIn('"Lunch" overlaps an earlier block', notes)
        self.assertIn("Evenings free", notes)
        self.assertIn("Sunday off", notes)

    def test_keeps_fixed_things_and_waiting_as_the_person_wrote_them(self):
        self.assertEqual(["08:20 School run (Mon–Fri)", "Jumu'ah 13:00 (Fri)", "Sunday off"], self.draft["fixed"])
        self.assertEqual(["Tunde — reference letter — since 2026-09-28"], self.draft["waiting"])

    def test_gives_what_they_track_stable_ids(self):
        self.assertEqual([{"id": "applications_sent", "label": "Applications sent"},
                          {"id": "deep_work_hours", "label": "Deep-work hours"}], self.draft["metrics"])
        self.assertEqual([{"id": "morning_walk", "label": "Morning walk"}], self.draft["habits"])

    def test_lists_what_it_found(self):
        self.assertEqual(["name", "goals", "day", "fixed", "waiting", "metrics", "habits"], self.draft["found"])


class OtherShapes(unittest.TestCase):
    def test_bold_lines_work_as_headings(self):
        draft = importer.read_handover("**Name**\nName: Sam\n\n**Habits**\n• Walk\n")
        self.assertEqual("Sam", draft["name"])
        self.assertEqual(["Walk"], [h["label"] for h in draft["habits"]])

    def test_a_document_with_none_of_the_headings_says_so(self):
        draft = importer.read_handover("I'm sorry, I don't have any memory of our past chats.")
        self.assertEqual([], draft["found"])
        self.assertIn("None of the handover's headings were found", draft["notes"][0])

    def test_two_things_with_one_name_get_two_ids(self):
        draft = importer.read_handover("## Habits\n- Walk\n- Walk!\n")
        self.assertEqual(["walk", "walk_2"], [h["id"] for h in draft["habits"]])


class OneLineOfFixedTime(unittest.TestCase):
    CASES = {
        "08:20 School run (Mon–Fri)": {"label": "School run", "time": "08:20", "days": ["mon", "tue", "wed", "thu", "fri"]},
        "School run 08:20 on weekdays": {"label": "School run", "time": "08:20", "days": ["mon", "tue", "wed", "thu", "fri"]},
        "Gym Tue/Thu 07:00": {"label": "Gym", "time": "07:00", "days": ["tue", "thu"]},
        "Swimming 18:00-19:30 (Thu)": {"label": "Swimming", "start": "18:00", "end": "19:30", "days": ["thu"]},
        "Pick up from school 15:30 weekdays": {"label": "Pick up from school", "time": "15:30", "days": ["mon", "tue", "wed", "thu", "fri"]},
        "Call mum every Sunday 7pm": {"label": "Call mum", "time": "19:00", "days": ["sun"]},
        "Fajr 04:34 (all)": {"label": "Fajr", "time": "04:34", "days": ["all"]},
        "Standup 9:15am Mon-Fri": {"label": "Standup", "time": "09:15", "days": ["mon", "tue", "wed", "thu", "fri"]},
    }

    def test_reads_the_time_the_days_and_the_name(self):
        for line, expected in self.CASES.items():
            with self.subTest(line):
                self.assertEqual(expected, importer.read_fixed(line))

    def test_a_line_with_no_time_stays_words(self):
        for line in ("Sunday off", "Gym three times a week", "unknown"):
            with self.subTest(line):
                self.assertIsNone(importer.read_fixed(line))

    def test_a_bare_number_is_not_a_time(self):
        self.assertIsNone(importer.read_fixed("Read 20 pages"))


if __name__ == "__main__":
    unittest.main()
