/* The shape of the user's day: the blocks they name in setup, with every minute they left
   out filled as "Unplanned". The result always covers 00:00–24:00 exactly once, which is
   what the brief's dial asserts (V2) — so the dial is complete and says nothing untrue.
   Matches runner/daybook/dial.py: a block whose end is at or before its start runs past
   midnight. */

export interface DayBlock {
  block: string;
  start: string;
  end: string;
}

/** Same label as the runner's UNPLANNED (runner/daybook/folder.py). */
export const UNPLANNED = "Unplanned";

const DAY = 1440;

export function toMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map(Number);
  return hour * 60 + minute;
}

function toHhmm(minutes: number): string {
  const m = ((minutes % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function spans(block: DayBlock): [number, number][] {
  const start = toMinutes(block.start);
  const end = toMinutes(block.end);
  return end > start ? [[start, end]] : [[start, DAY], [0, end]];
}

/** What stops these blocks becoming a day shape, in words, or null when they are fine. */
export function dayShapeProblem(blocks: DayBlock[]): string | null {
  for (const block of blocks) {
    if (!block.block.trim()) return "Every block needs a name.";
    if (!block.start || !block.end) return `“${block.block}” needs a start and an end.`;
    if (block.start === block.end) return `“${block.block}” starts and ends at the same time.`;
    if (block.block.trim().toLowerCase() === UNPLANNED.toLowerCase()) {
      return `“${UNPLANNED}” is what Daybook calls the time you leave out — name the block something else.`;
    }
  }
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const overlap = spans(blocks[i]).some(([a, b]) => spans(blocks[j]).some(([c, d]) => a < d && c < b));
      if (overlap) return `“${blocks[i].block}” and “${blocks[j].block}” overlap.`;
    }
  }
  return null;
}

/** Minutes the named blocks cover. */
export function plannedMinutes(blocks: DayBlock[]): number {
  return blocks.reduce((sum, block) => sum + spans(block).reduce((s, [a, b]) => s + b - a, 0), 0);
}

/** The named blocks plus an Unplanned block for every gap, ordered by start time. Call it
    only when dayShapeProblem() is null. With no blocks, the whole day is Unplanned. */
export function completeDay(blocks: DayBlock[]): DayBlock[] {
  const named = blocks.map((b) => ({ ...b, block: b.block.trim() }));
  const covered = new Array<boolean>(DAY).fill(false);
  for (const block of named) for (const [a, b] of spans(block)) for (let m = a; m < b; m++) covered[m] = true;

  if (covered.every((c) => !c)) return [{ block: UNPLANNED, start: "00:00", end: "00:00" }];

  // Walk the day from the first covered minute, so a gap across midnight is one block.
  const origin = covered.indexOf(true);
  const gaps: DayBlock[] = [];
  let gapStart: number | null = null;
  for (let step = 0; step <= DAY; step++) {
    const minute = (origin + step) % DAY;
    const free = step < DAY && !covered[minute];
    if (free && gapStart === null) gapStart = origin + step;
    if (!free && gapStart !== null) {
      gaps.push({ block: UNPLANNED, start: toHhmm(gapStart), end: toHhmm(origin + step) });
      gapStart = null;
    }
  }
  return [...named, ...gaps].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

export function describeMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}
