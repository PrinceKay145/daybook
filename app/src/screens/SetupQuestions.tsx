/* Secretary setup questions. The answers become plain files in the user's folder —
   readable with no app installed — and the schedule (their own brief time) lives in
   config.json where the scheduler reads it. Nothing here is sent anywhere.

   A folder an earlier setup already filled gets a choice first, and the choice is the
   user's: keep that setup (the default — nothing in the folder changes but the AI
   choice), or start over (the questions again; the previous setup files are archived,
   never deleted).

   Someone whose life already lives in another AI can bring it instead of typing it: copy
   Daybook's prompt there, paste back what it writes, and the form fills itself on this Mac
   (runner/daybook/importer.py) for them to check — nothing is written until they do, and
   the whole document is kept in HANDOVER.md for the secretary to read. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, FileText, Plus, X } from "lucide-react";
import { daybook, LIST_MAX, type Connection, type ExistingSetup, type HandoverDraft } from "@/lib/daybook";
import { HANDOVER_PROMPT } from "@/lib/handover";
import { Segmented } from "@/components/ui/segmented";
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
  const [metricsText, setMetricsText] = useState("");
  const [habitsText, setHabitsText] = useState("");
  // Where the answers come from: typed here, or a handover from another AI. `read` is what
  // the handover filled in, once it has been read; until then the form waits behind it.
  const [source, setSource] = useState<"here" | "import">("here");
  const [handover, setHandover] = useState("");
  const [read, setRead] = useState<HandoverDraft | null>(null);
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

  async function readHandover() {
    setError(null);
    if (!handover.trim()) {
      setError("Paste the document your other AI wrote, or open the file it gave you.");
      return;
    }
    setBusy(true);
    try {
      const draft = await daybook.readHandover(handover);
      if (draft.name) setOwnerName(draft.name);
      if (draft.address_as) setAddressAs(draft.address_as);
      setGoals(draft.goals.join("\n"));
      setNonNegotiables(draft.fixed.join("\n"));
      setInFlight(draft.waiting.join("\n"));
      if (draft.day_shape.length) setBlocks(draft.day_shape);
      setMetricsText(draft.metrics.map((m) => m.label).join("\n"));
      setHabitsText(draft.habits.map((h) => h.label).join("\n"));
      setAnswerMode("questions");
      setRead(draft);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
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
        metrics: lines(metricsText),
        habits: lines(habitsText),
        ...(source === "import" && read ? { handover } : {}),
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

  const importing = source === "import" && !read;
  return (
    <OnboardingFrame
      step={3}
      chosen={chosen}
      title={startOver ? "Starting over" : "About you and your days"}
      intro="Your secretary's starting picture. Everything is written into your folder as plain files on this Mac and sent nowhere."
      footer={
        <>
          <span className="min-w-0" title={folder}>
            {importing
              ? "Read on this Mac. Nothing is written until you've checked it."
              : startOver
                ? `Replaces the old setup in “${folderName}”; the previous files move to archive/setup/ first.`
                : `Saved in “${folderName}” as plain files you can open and edit.`}
          </span>
          <Button type="submit" form={importing ? "handover-form" : "setup-form"} size="lg" disabled={busy || !connection}>
            {importing ? "Read it" : "Write my folder"}
          </Button>
        </>
      }
    >
      <div className="mb-6">
        <Segmented
          label="Where your answers come from"
          value={source}
          onChange={(value) => {
            setSource(value);
            setError(null);
          }}
          options={[
            ["here", "Answer here"],
            ["import", "Bring it from another AI"],
          ]}
        />
      </div>

      {importing ? (
        <HandoverSteps
          text={handover}
          onText={setHandover}
          onRead={() => void readHandover()}
          error={error}
        />
      ) : (
      <form
        id="setup-form"
        className="max-w-3xl"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {source === "import" && read && (
          <HandoverRead
            draft={read}
            onAgain={() => {
              setRead(null);
              setError(null);
            }}
          />
        )}
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
          <Segmented
            label="How to answer"
            value={answerMode}
            onChange={setAnswerMode}
            options={[
              ["questions", "Three questions"],
              ["words", "In your own words"],
            ]}
          />
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
                  className={`${inputClass} min-h-20 resize-y field-sizing-content max-h-60`}
                  value={goals}
                  onChange={(event) => setGoals(event.target.value)}
                  placeholder={"Land a product role by summer\nShip the newsletter weekly"}
                />
              </Field>
              <Field label="What's fixed in your week?" hint="One per line; it plans around these.">
                <textarea
                  id="setup-fixed"
                  className={`${inputClass} min-h-16 resize-y field-sizing-content max-h-60`}
                  value={nonNegotiables}
                  onChange={(event) => setNonNegotiables(event.target.value)}
                  placeholder={"School run 08:20 on weekdays\nGym Tue/Thu 07:00"}
                />
              </Field>
              <Field label="Who are you waiting on?" hint="One per line: replies, decisions, invoices." optional>
                <textarea
                  id="setup-waiting"
                  className={`${inputClass} min-h-16 resize-y field-sizing-content max-h-60`}
                  value={inFlight}
                  onChange={(event) => setInFlight(event.target.value)}
                  placeholder={"Contract renewal — sent 4 March\nReference from a former manager"}
                />
              </Field>
            </>
          )}
        </Section>

        <Section title="What you track" description="Numbers for your scoreboard, and habits to tick. Both optional.">
          <Field
            label="Numbers to keep"
            hint="One per line. Tell your secretary a number any time — “sent 3 applications today” — and it goes on your scoreboard."
            optional
          >
            <textarea
              id="setup-metrics"
              className={`${inputClass} min-h-16 resize-y field-sizing-content max-h-60`}
              value={metricsText}
              onChange={(event) => setMetricsText(event.target.value)}
              placeholder={"Applications sent\nDeep-work hours"}
            />
          </Field>
          <Field
            label="Habits to tick"
            hint="One per line. Say “did my walk” and it's ticked; the brief shows how many of the last seven days."
            optional
          >
            <textarea
              id="setup-habits"
              className={`${inputClass} min-h-16 resize-y field-sizing-content max-h-60`}
              value={habitsText}
              onChange={(event) => setHabitsText(event.target.value)}
              placeholder={"Morning walk\nRead 20 pages"}
            />
          </Field>
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
      )}
    </OnboardingFrame>
  );
}

/* Bringing what another AI knows: copy the prompt, paste it there, bring back what it
   writes. Three steps, numbered, because they happen in two apps. */
function HandoverSteps({
  text,
  onText,
  onRead,
  error,
}: {
  text: string;
  onText: (text: string) => void;
  onRead: () => void;
  error: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(HANDOVER_PROMPT);
    } catch {
      // Without clipboard access, select the prompt so ⌘C copies it.
      promptRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  function open(file: File | undefined) {
    if (!file) return;
    if (file.size > 300_000) {
      onText("");
      return;
    }
    void file.text().then(onText);
  }

  const step = "grid grid-cols-[26px_1fr] gap-x-3";
  const number = "font-display text-[19px] leading-[1.2] text-[var(--color-accent)]";
  return (
    <form
      id="handover-form"
      className="max-w-2xl space-y-7"
      onSubmit={(event) => {
        event.preventDefault();
        onRead();
      }}
    >
      <p className="text-[14px] text-[var(--color-ink-soft)]">
        If ChatGPT, Claude or another AI already knows your goals, your week and who you're
        waiting on, bring that here instead of typing it again. You'll check everything it
        fills in before anything is written.
      </p>

      <div className={step}>
        <span className={number}>1</span>
        <div className="space-y-2.5">
          <h2 className="text-[14px] font-semibold">Copy this prompt</h2>
          <Button variant="secondary" onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy the prompt"}
          </Button>
          <textarea
            ref={promptRef}
            readOnly
            value={HANDOVER_PROMPT}
            aria-label="The prompt to copy"
            className="h-28 w-full resize-y rounded-[var(--radius-control)] bg-[var(--color-sunken)] px-3 py-2 font-mono text-[11.5px] leading-[1.5] text-[var(--color-ink-soft)]"
          />
        </div>
      </div>

      <div className={step}>
        <span className={number}>2</span>
        <div>
          <h2 className="text-[14px] font-semibold">Paste it into the AI that knows you</h2>
          <p className="mt-0.5 text-[13px] text-[var(--color-ink-soft)]">
            In the same app and account you've been using, so it can draw on your past
            conversations. It writes a document back — copy all of it.
          </p>
        </div>
      </div>

      <div className={step}>
        <span className={number}>3</span>
        <div className="space-y-2.5">
          <h2 className="text-[14px] font-semibold">Bring its answer here</h2>
          <textarea
            id="setup-handover"
            className={`${inputClass} min-h-40 resize-y font-mono text-[12px]`}
            value={text}
            onChange={(event) => onText(event.target.value)}
            placeholder={"Paste the whole document here — it starts with “# Daybook handover”"}
            aria-label="The document your other AI wrote"
          />
          <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-[var(--color-ink-faint)]">
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>
              <FileText />
              Open a file instead
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              className="hidden"
              onChange={(event) => open(event.target.files?.[0])}
            />
            Read on this Mac, with no AI. The whole document is kept in your folder as HANDOVER.md.
          </div>
          <ErrorNote message={error} />
        </div>
      </div>
    </form>
  );
}

const FOUND: Record<string, string> = {
  name: "your name",
  goals: "what you're working toward",
  day: "the shape of your day",
  fixed: "what's fixed in your week",
  waiting: "who you're waiting on",
  metrics: "the numbers you track",
  habits: "your habits",
};

/* What the handover filled, said once above the form it filled. */
function HandoverRead({ draft, onAgain }: { draft: HandoverDraft; onAgain: () => void }) {
  const found = draft.found.map((key) => FOUND[key]).filter(Boolean);
  const list = found.length > 1 ? `${found.slice(0, -1).join(", ")} and ${found[found.length - 1]}` : found[0];
  return (
    <div className="pb-6">
      <p className="flex items-start gap-2 text-[14px]">
        <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
        <span>
          {found.length
            ? <>Filled in from your other AI's document: {list}. Check each part below and change anything that's wrong — then write your folder.</>
            : <>Nothing in that document matched what the prompt asks for, so nothing was filled in. It's still kept for your secretary — or try another.</>}
        </span>
      </p>
      {draft.notes.length > 0 && (
        <ul className="mt-2 ml-3.5 space-y-0.5 text-[12.5px] text-[var(--color-ink-faint)]">
          {draft.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onAgain}
        className="mt-2 ml-3.5 text-[12.5px] text-[var(--color-ink-soft)] underline decoration-1 underline-offset-[3px] hover:text-[var(--color-ink)]">
        Paste a different document
      </button>
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
