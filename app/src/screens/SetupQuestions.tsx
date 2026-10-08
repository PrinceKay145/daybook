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
import { Button, ErrorNote, Field, SectionLabel, inputClass } from "@/components/ui/button";
import { OnboardingFrame } from "@/components/OnboardingFrame";
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

  const chosen = { folder: folderName, model: connection ? describeChoice(connection) : undefined };

  if (written) {
    return (
      <OnboardingFrame
        step={3}
        chosen={chosen}
        title="Your folder is ready"
        intro={<>Every answer is a plain file in “{folderName}” that you own and can read with no app installed.</>}
        footer={
          <>
            <button type="button" className="underline decoration-1 underline-offset-[3px] hover:text-[var(--color-ink)]"
              onClick={() => void daybook.revealFolder(folder)}>
              Show the folder in Finder
            </button>
            <Button size="lg" onClick={() => onDone(briefTime)}>
              Open Daybook
            </Button>
          </>
        }
      >
        <SectionLabel>Written</SectionLabel>
        <ul className="mt-3 max-w-md divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
          {written.map((file) => (
            <li key={file} className="py-2 font-mono text-[12.5px] text-[var(--color-ink-soft)]">
              {file}
            </li>
          ))}
        </ul>
      </OnboardingFrame>
    );
  }

  if (existing === undefined) {
    return <OnboardingFrame step={3} chosen={chosen} title="Checking the folder…">{null}</OnboardingFrame>;
  }

  if (existing && !startOver) {
    return (
      <OnboardingFrame
        step={3}
        chosen={chosen}
        title="This folder already has a setup"
        intro={<>It was set up for {existing.ownerName}, with the brief at <span className="tnum">{existing.briefTime}</span>. Keep it, or answer the questions again.</>}
      >
        <div className="max-w-xl divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
          <div className="flex items-start justify-between gap-6 py-4">
            <div>
              <h2 className="text-[15px] font-semibold">Use this setup</h2>
              <p className="mt-0.5 text-[13px] text-[var(--color-ink-soft)]">Every file stays as it is. Only your choice of model is recorded.</p>
            </div>
            <Button size="lg" disabled={busy} onClick={() => void keepExisting(existing)}>Use this setup</Button>
          </div>
          <div className="flex items-start justify-between gap-6 py-4">
            <div>
              <h2 className="text-[15px] font-semibold">Start over</h2>
              <p className="mt-0.5 text-[13px] text-[var(--color-ink-soft)]">
                The questions again. The current SETUP-CONTEXT.md and MASTER-PLAN.md move to
                archive/setup/ first, and nothing is deleted. Your log, day state and corrections stay.
              </p>
            </div>
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => beginStartOver(existing)}>Start over</Button>
          </div>
        </div>
        <div className="mt-4"><ErrorNote message={error} /></div>
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame
      step={3}
      chosen={chosen}
      title={startOver ? "Starting over" : "About you and your days"}
      intro="Your secretary's starting picture. Everything is written into your folder as plain files on this Mac and sent nowhere."
      footer={
        <>
          <span className="min-w-0" title={folder}>
            {startOver
              ? `Replaces the old setup in “${folderName}”; the previous files move to archive/setup/ first.`
              : `Saved in “${folderName}” as plain files you can open and edit.`}
          </span>
          <Button type="submit" form="setup-form" size="lg" disabled={busy || !connection}>
            Write my folder
          </Button>
        </>
      }
    >
      <form
        id="setup-form"
        className="max-w-3xl"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Section title="You" description="How it should address you.">
          <Field label="Your name">
            <input
              id="setup-name"
              className={inputClass}
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
              autoComplete="name"
              placeholder="e.g. Alex Rivera"
            />
          </Field>
          <Field label="What should it call you?" hint="Leave empty to use your first name." optional>
            <input
              id="setup-address-as"
              className={inputClass}
              value={addressAs}
              onChange={(event) => setAddressAs(event.target.value)}
              autoComplete="nickname"
              placeholder="e.g. Alex"
            />
          </Field>
        </Section>

        <Section title="What you're working with" description="Answer three questions, or tell it in your own words.">
          <div className="inline-flex gap-0.5 rounded-[7px] bg-[var(--color-sunken)] p-[3px]" role="radiogroup" aria-label="How to answer">
            {(
              [
                ["questions", "Three questions"],
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
                  "rounded-[5px] px-3 py-1.5 text-[13px] transition-colors",
                  answerMode === value
                    ? "bg-[var(--color-surface)] font-semibold text-[var(--color-ink)] shadow-[0_0_0_1px_var(--color-line)]"
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
              hint="What you're working toward, what's fixed in your week, who you're waiting on — however it comes out. Saved as you wrote it. You can dictate: press the dictation key, or Fn twice."
            >
              <textarea
                id="setup-own-words"
                className={`${inputClass} min-h-44 resize-y`}
                value={ownWords}
                onChange={(event) => setOwnWords(event.target.value)}
                placeholder={"e.g. I'm trying to land a product role by summer and keep the newsletter going weekly. School run is 08:20 on weekdays, gym Tuesday and Thursday mornings. Still waiting to hear back on the contract renewal I sent on 4 March."}
              />
            </Field>
          ) : (
            <>
              <Field label="What are you working toward?" hint="One goal per line; they start your master plan.">
                <textarea
                  id="setup-goals"
                  className={`${inputClass} min-h-20 resize-y`}
                  value={goals}
                  onChange={(event) => setGoals(event.target.value)}
                  placeholder={"Land a product role by summer\nShip the newsletter weekly"}
                />
              </Field>
              <Field label="What's fixed in your week?" hint="One per line; it plans around these.">
                <textarea
                  id="setup-fixed"
                  className={`${inputClass} min-h-16 resize-y`}
                  value={nonNegotiables}
                  onChange={(event) => setNonNegotiables(event.target.value)}
                  placeholder={"School run 08:20 on weekdays\nGym Tue/Thu 07:00"}
                />
              </Field>
              <Field label="Who are you waiting on?" hint="One per line: replies, decisions, invoices." optional>
                <textarea
                  id="setup-waiting"
                  className={`${inputClass} min-h-16 resize-y`}
                  value={inFlight}
                  onChange={(event) => setInFlight(event.target.value)}
                  placeholder={"Contract renewal — sent 4 March\nReference from a former manager"}
                />
              </Field>
            </>
          )}
        </Section>

        <Section title="Your day" description="When the brief arrives, and what fills the day.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Morning brief at" hint="You can change it later.">
              <input
                id="setup-brief-time"
                className={cn(inputClass, "tnum")}
                type="time"
                value={briefTime}
                onChange={(event) => setBriefTime(event.target.value)}
              />
            </Field>
            <Field label="Today's list holds at most" hint={LIST_MAX_HINT}>
              <ListMaxSelect value={listMax} onChange={setListMax} />
            </Field>
          </div>
          <DayShapeEditor blocks={blocks} onChange={setBlocks} />
          <Field label="Time zone" hint="Set from this Mac's clock. Change it if you live by a different zone.">
            <select id="setup-timezone" className={inputClass} value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.label}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <ErrorNote message={error} />
      </form>
    </OnboardingFrame>
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
      <p className="text-[13.5px] font-semibold text-[var(--color-ink)]">
        The shape of your day
        <span className="ml-1.5 font-normal text-[var(--color-ink-faint)]">(optional)</span>
      </p>
      <p className="mt-0.5 text-[12.5px] text-[var(--color-ink-soft)]">
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
              className={cn(inputClass, "tnum w-28 shrink-0")}
              type="time"
              value={block.start}
              onChange={(event) => update(index, { start: event.target.value })}
              aria-label={`${block.block || "Block"} starts`}
            />
            <input
              className={cn(inputClass, "tnum w-28 shrink-0")}
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
          onClick={() => onChange([...blocks, { block: "", start: "09:00", end: "10:00" }])}
        >
          <Plus />
          Add a block
        </Button>
        <p className={`text-[12.5px] ${problem ? "text-[var(--color-warn)]" : "text-[var(--color-ink-faint)]"}`}>
          {problem ??
            (blocks.length
              ? `Planned: ${describeMinutes(planned)} · ${UNPLANNED}: ${describeMinutes(1440 - planned)}`
              : `No blocks yet — the whole day shows as ${UNPLANNED}.`)}
        </p>
      </div>
    </div>
  );
}

/* Questions come in groups, the group's name and purpose on the left and its fields on the
   right, so the page reads as three short steps rather than one long column. */
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-x-8 gap-y-3 border-t border-[var(--color-line)] py-6 md:grid-cols-[190px_1fr]">
      <div>
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <p className="mt-0.5 text-[12.5px] text-[var(--color-ink-faint)]">{description}</p>
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}
