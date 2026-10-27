/* The prompt someone copies into the AI that already knows them (ChatGPT, Claude, Gemini…)
   to bring that knowledge into Daybook. Its headings and line formats are what
   runner/daybook/importer.py reads — change one, change the other. The lines in brackets
   are instructions: an AI that echoes them back changes nothing, because the reader skips
   bracketed lines, and an AI that knows nothing writes "unknown", which the reader treats
   as unknown, never as an answer. */

export const HANDOVER_PROMPT = `I'm moving my day-to-day planning to an app called Daybook. Please write a handover document about me from everything you know from our conversations, so my new assistant can pick up where you left off.

Rules:
- Only write what you actually know about me from our conversations. Where you don't know, write "unknown". Don't guess and don't fill gaps.
- Leave out passwords, card and account numbers, ID numbers, and anything I've asked you to keep private.
- Use exactly these headings, in this order. Replace each line in brackets with the real content, one item per line, starting with "- ".
- Put the whole document in one Markdown code block, so I can copy it.

# Daybook handover

## Name
Full name:
Call me:

## Working toward
(one goal per line, with its deadline if there is one — e.g. "- Land a data analyst role — by March 2027")

## Typical day
(one block per line on the 24-hour clock — e.g. "- 23:00–07:00 Sleep")

## Fixed commitments
(things at a set time that don't move, with their days — e.g. "- 08:20 School run (Mon–Fri)"; write "(all)" for every day)

## Waiting on others
(who — what — since when — e.g. "- Tunde — reference letter — since 2026-09-28")

## Numbers I track
(one per line — e.g. "- Applications sent")

## Habits
(one per line — e.g. "- Morning walk")

## Projects and context
(anything else my new assistant should know: projects in progress, how my weeks go, how I like to be helped)`;
