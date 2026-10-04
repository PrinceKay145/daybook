/* Secretary setup questions. The answers become plain files in the user's folder —
   readable with no app installed — and the schedule (their own brief time) lives in
   config.json where the scheduler reads it. Nothing here is sent anywhere.

   A folder an earlier setup already filled gets a choice first, and the choice is the
   user's: keep that setup (the default — nothing in the folder changes but the AI
   choice), or start over (the questions again; the previous setup files are archived,
   never deleted). */

import { useEffect, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { daybook, LIST_MAX, type Connection, type ExistingSetup } from "@/lib/daybook";
import { describeChoice } from "@/lib/models";
import {
  completeDay,
  dayShapeProblem,
  describeMinutes,
  plannedMinutes,
  UNPLANNED,
  type DayBlock,
} from "@/lib/dayShape";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui/button";
import { LIST_MAX_HINT, ListMaxSelect } from "@/components/ListMaxSelect";
import { cn } from "@/lib/utils";

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/* Every time zone the system knows, labelled with its offset right now ("Europe/Lisbon —
   GMT+1"). The Mac's own zone is the default and is always present, even on a system
   whose list leaves it out. No location is asked for: the Mac already knows its zone. */
function timeZoneOptions(own: string): { id: string; label: string }[] {
  const offset = (zone: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value ?? "";
  const zones = Intl.supportedValuesOf("timeZone");
  return (zones.includes(own) ? zones : [own, ...zones]).map((zone) => ({
    id: zone,
    label: `${zone.replace(/_/g, " ")} — ${offset(zone)}${zone === own ? " (this Mac)" : ""}`,
  }));
}

export function SetupQuestionsScreen({
  folder,
  connection,
  onDone,
}: {
  folder: string;
  connection: Connection | null;
  onDone: (briefTime: string) => void;
}) {
  const folderName = folder.split("/").filter(Boolean).pop() ?? folder;
  const macTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [zones] = useState(() => timeZoneOptions(macTimeZone));
  const [timezone, setTimezone] = useState(macTimeZone);
  const [ownerName, setOwnerName] = useState("");
  const [addressAs, setAddressAs] = useState("");
  const [goals, setGoals] = useState("");
  const [nonNegotiables, setNonNegotiables] = useState("");
  const [inFlight, setInFlight] = useState("");
  const [answerMode, setAnswerMode] = useState<"questions" | "words">("questions");
  const [ownWords, setOwnWords] = useState("");
  const [briefTime, setBriefTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("23:00");
  const [listMax, setListMax] = useState<number>(LIST_MAX.default);
  const [blocks, setBlocks] = useState<DayBlock[]>([]);
  const [busy, setBusy] = useState(false);
  const [written, setWritten] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // undefined while the folder is being checked; null when it holds no earlier setup.
  const [existing, setExisting] = useState<ExistingSetup | null | undefined>(undefined);
  const [startOver, setStartOver] = useState(false);

  useEffect(() => {
    let cancelled = false;
    daybook
      .inspectFolder(folder)
      .then((found) => !cancelled && setExisting(found))
      .catch(() => !cancelled && setExisting(null));
    return () => {
      cancelled = true;
    };
  }, [folder]);

  async function keepExisting(setup: ExistingSetup) {
    setError(null);
    setBusy(true);
    try {
      await daybook.adoptSetup(folder, connection);
      onDone(setup.briefTime);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function beginStartOver(setup: ExistingSetup) {
    setOwnerName(setup.ownerName);
    setAddressAs(setup.addressAs);
    setBriefTime(setup.briefTime);
    setCloseTime(setup.closeTime);
    setListMax(setup.listMax);
    if (setup.timezone) setTimezone(setup.timezone);
    setBlocks(setup.dayShape ?? []);
    setStartOver(true);
  }

  async function save() {
    setError(null);
    if (!ownerName.trim()) {
      setError("A name is needed — the secretary writes to you, and it needs to know whom.");
      return;
    }
    const shapeProblem = dayShapeProblem(blocks);
    if (shapeProblem) {
      setError(`The shape of your day: ${shapeProblem}`);
      return;
    }
    setBusy(true);
    try {
      const files = await daybook.writeSetup({
        folder,
        ownerName: ownerName.trim(),
        addressAs: addressAs.trim() || ownerName.trim().split(/\s+/)[0],
        timezone,
        briefTime,
        closeTime,
        listMax,
        goals: answerMode === "questions" ? lines(goals) : [],
        nonNegotiables: answerMode === "questions" ? lines(nonNegotiables) : [],
        inFlight: answerMode === "questions" ? lines(inFlight) : [],
        ...(answerMode === "words" && ownWords.trim() ? { ownWords: ownWords.trim() } : {}),
        connection,
        startOver,
        dayShape: completeDay(blocks),
      });
      setWritten(files);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (written) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center">
        <h1 className="text-xl font-semibold tracking-tight">Written to your folder</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Open <code className="text-xs">{folder}</code> in Finder — every answer is a plain
          file you own, readable with no app installed.
        </p>
        <ul className="mt-4 space-y-1.5">
          {written.map((file) => (
            <li key={file} className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm">
              <code>{file}</code>
            </li>
          ))}
        </ul>
        <Button className="mt-5" onClick={() => onDone(briefTime)}>
          Open my scoreboard
        </Button>
      </div>
    );
  }

  if (existing === undefined) {
    return <p className="mx-auto max-w-md py-16 text-sm text-[var(--color-ink-faint)]">Checking the folder…</p>;
  }

  if (existing && !startOver) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-faint)]">
          Step 3 of 3
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">This folder already has a setup</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          It was set up for {existing.ownerName} — brief at {existing.briefTime}, nightly close
          at {existing.closeTime}. Keep it, or answer the questions again.
        </p>
        <div className="mt-5 space-y-3 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <Button className="w-full" disabled={busy} onClick={() => void keepExisting(existing)}>
            Use this setup
          </Button>
          <p className="text-xs text-[var(--color-ink-faint)]">
            Every file stays as it is. Your AI choice is recorded in config.json.
          </p>
          <Button
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() => beginStartOver(existing)}
          >
            Start over
          </Button>
          <p className="text-xs text-[var(--color-ink-faint)]">
            The questions again. The current SETUP-CONTEXT.md and MASTER-PLAN.md move to
            archive/setup/ first — nothing is deleted. Your log, day state and corrections stay
            as they are.
          </p>
          <ErrorNote message={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md py-10">
      <div className="mb-6">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-faint)]">
          Step 3 of 3
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {startOver ? "Starting over" : "A few questions"}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          The secretary's starting picture of your week. Answers are written to your folder,
          locally — never sent anywhere.
        </p>
      </div>

      <form
        className="space-y-6 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Section title="About you">
          <Field label="Your name">
            <input
              className={inputClass}
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
              autoComplete="name"
              placeholder="e.g. Alex Rivera"
            />
          </Field>
          <Field label="What should it call you?" hint="Leave empty to use your first name." optional>
            <input
              className={inputClass}
              value={addressAs}
              onChange={(event) => setAddressAs(event.target.value)}
              autoComplete="nickname"
              placeholder="e.g. Alex"
            />
          </Field>
        </Section>

        <Section title="What you're working with">
          <div className="flex gap-1 rounded-[var(--radius-card)] border border-[var(--color-line)] p-1 text-xs" role="radiogroup" aria-label="How to answer">
            {(
              [
                ["questions", "Answer three questions"],
                ["words", "In your own words"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={answerMode === value}
                onClick={() => setAnswerMode(value)}
                className={cn(
                  "flex-1 rounded-[calc(var(--radius-card)-4px)] px-3 py-1.5",
                  answerMode === value
                    ? "bg-[var(--color-surface)] font-medium text-[var(--color-ink)]"
                    : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
                )}
              >
                {text}
              </button>
            ))}
          </div>
          {answerMode === "words" ? (
            <Field
              label="Tell your secretary about your life"
              hint="What you're working toward, what's fixed in your week, who you're waiting on — however it comes out. Saved as you wrote it; your secretary reads it when it plans. You can dictate: press the dictation key, or Fn twice."
            >
              <textarea
                className={`${inputClass} min-h-40 resize-y`}
                value={ownWords}
                onChange={(event) => setOwnWords(event.target.value)}
                placeholder={"e.g. I'm trying to land a product role by summer and keep the newsletter going weekly. School run is 08:20 on weekdays, gym Tuesday and Thursday mornings. Still waiting to hear back on the contract renewal I sent on 4 March."}
              />
            </Field>
          ) : (
            <>
              <Field label="What are you working toward?" hint="One goal per line — they seed your master plan.">
                <textarea
                  className={`${inputClass} min-h-20 resize-y`}
                  value={goals}
                  onChange={(event) => setGoals(event.target.value)}
                  placeholder={"Land a product role by summer\nShip the newsletter weekly"}
                />
              </Field>
              <Field label="What's non-negotiable in your week?" hint="One per line — the fixed points it plans around.">
                <textarea
                  className={`${inputClass} min-h-16 resize-y`}
                  value={nonNegotiables}
                  onChange={(event) => setNonNegotiables(event.target.value)}
                  placeholder={"School run 08:20 on weekdays\nGym Tue/Thu 07:00"}
                />
              </Field>
              <Field label="Who are you waiting on?" hint="One per line — replies, decisions, invoices." optional>
                <textarea
                  className={`${inputClass} min-h-16 resize-y`}
                  value={inFlight}
                  onChange={(event) => setInFlight(event.target.value)}
                  placeholder={"Contract renewal — sent 4 March\nReference from a former manager"}
                />
              </Field>
            </>
          )}
        </Section>

        <Section title="Your day">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Morning brief at" hint="Changeable later.">
              <input
                className={inputClass}
                type="time"
                value={briefTime}
                onChange={(event) => setBriefTime(event.target.value)}
              />
            </Field>
            <Field label="Nightly close at" hint="When the day is written down.">
              <input
                className={inputClass}
                type="time"
                value={closeTime}
                onChange={(event) => setCloseTime(event.target.value)}
              />
            </Field>
          </div>
          <Field label="How many things on today's list, at most?" hint={LIST_MAX_HINT}>
            <ListMaxSelect value={listMax} onChange={setListMax} />
          </Field>
          <DayShapeEditor blocks={blocks} onChange={setBlocks} />
          <Field
            label="Time zone"
            hint="Set from this Mac's clock. Change it if you live by a different zone."
          >
            <select className={inputClass} value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.label}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <p className="text-xs text-[var(--color-ink-soft)]" title={folder}>
          {startOver
            ? `Your new answers replace the old setup in “${folderName}” — the previous files move to archive/setup/ first, and your log, day state and corrections are kept.`
            : `Your answers are saved in “${folderName}” as plain files you can open and edit — nothing already there is overwritten.`}
          {connection ? ` Your model, ${describeChoice(connection)}, is recorded too.` : ""}
        </p>

        <ErrorNote message={error} />
        <Button type="submit" className="w-full" disabled={busy || !connection}>
          Write my folder
        </Button>
      </form>
    </div>
  );
}

/* The blocks of the user's day, for the brief's 24-hour dial. Optional: whatever they leave
   out shows as Unplanned, so the dial is always complete and never claims a plan they did
   not make. A block may run past midnight (Sleep 23:00–07:00). */
function DayShapeEditor({ blocks, onChange }: { blocks: DayBlock[]; onChange: (blocks: DayBlock[]) => void }) {
  const problem = blocks.length ? dayShapeProblem(blocks) : null;
  const planned = problem ? 0 : plannedMinutes(blocks);
  const update = (index: number, patch: Partial<DayBlock>) =>
    onChange(blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)));

  return (
    <div>
      <p className="text-sm font-medium text-[var(--color-ink)]">
        The shape of your day
        <span className="ml-1.5 font-normal text-[var(--color-ink-faint)]">(optional)</span>
      </p>
      <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
        Add the blocks you know — the school run, deep work, the gym. Anything you leave out
        shows as {UNPLANNED}. A block can run past midnight, like Sleep 23:00–07:00.
      </p>
      <div className="mt-2 space-y-2">
        {blocks.length > 0 && (
          <div className="flex gap-2 text-xs text-[var(--color-ink-faint)]" aria-hidden>
            <span className="min-w-0 flex-1">Block</span>
            <span className="w-28">From</span>
            <span className="w-28">To</span>
            <span className="w-4" />
          </div>
        )}
        {blocks.map((block, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              className={cn(inputClass, "min-w-0 flex-1")}
              value={block.block}
              onChange={(event) => update(index, { block: event.target.value })}
              aria-label="Block name"
              placeholder="e.g. Deep work"
            />
            <input
              className={cn(inputClass, "w-28 shrink-0")}
              type="time"
              value={block.start}
              onChange={(event) => update(index, { start: event.target.value })}
              aria-label={`${block.block || "Block"} starts`}
            />
            <input
              className={cn(inputClass, "w-28 shrink-0")}
              type="time"
              value={block.end}
              onChange={(event) => update(index, { end: event.target.value })}
              aria-label={`${block.block || "Block"} ends`}
            />
            <button
              type="button"
              aria-label={`Remove ${block.block || "this block"}`}
              className="text-[var(--color-ink-faint)] hover:text-[var(--color-warn)]"
              onClick={() => onChange(blocks.filter((_, i) => i !== index))}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        <Button
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          onClick={() => onChange([...blocks, { block: "", start: "09:00", end: "10:00" }])}
        >
          <Plus className="size-3.5" />
          Add a block
        </Button>
        <p className={`text-xs ${problem ? "text-[var(--color-warn)]" : "text-[var(--color-ink-faint)]"}`}>
          {problem ??
            (blocks.length
              ? `Planned: ${describeMinutes(planned)} · ${UNPLANNED}: ${describeMinutes(1440 - planned)}`
              : `No blocks yet — the whole day shows as ${UNPLANNED}.`)}
        </p>
      </div>
    </div>
  );
}

/* Questions come in groups so the page reads as three short steps, not eight fields. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t border-[var(--color-line)] pt-5 first:border-t-0 first:pt-0">
      <h2 className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-faint)]">
        {title}
      </h2>
      {children}
    </section>
  );
}
