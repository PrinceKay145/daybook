/* Secretary setup questions. The answers become plain files in the user's folder —
   readable with no app installed — and the schedule (their own brief time) lives in
   config.json where the scheduler reads it. Nothing here is sent anywhere.

   A folder an earlier setup already filled gets a choice first, and the choice is the
   user's: keep that setup (the default — nothing in the folder changes but the AI
   choice), or start over (the questions again; the previous setup files are archived,
   never deleted). */

import { useEffect, useState } from "react";
import { daybook, type Connection, type ExistingSetup } from "@/lib/daybook";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui/button";

const EXPECTED_FILES = [
  "config.json (merged — your edits to it survive)",
  "SETUP-CONTEXT.md · MASTER-PLAN.md · DAY-STATE.md · LOG.md · CORRECTIONS.md (created only if absent)",
];

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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
  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [ownerName, setOwnerName] = useState("");
  const [addressAs, setAddressAs] = useState("");
  const [goals, setGoals] = useState("");
  const [nonNegotiables, setNonNegotiables] = useState("");
  const [inFlight, setInFlight] = useState("");
  const [briefTime, setBriefTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("23:00");
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
    setStartOver(true);
  }

  async function save() {
    setError(null);
    if (!ownerName.trim()) {
      setError("A name is needed — the secretary writes to you, and it needs to know whom.");
      return;
    }
    setBusy(true);
    try {
      const files = await daybook.writeSetup({
        folder,
        ownerName: ownerName.trim(),
        addressAs: addressAs.trim() || ownerName.trim().split(/\s+/)[0],
        timezone: detectedTz,
        briefTime,
        closeTime,
        goals: lines(goals),
        nonNegotiables: lines(nonNegotiables),
        inFlight: lines(inFlight),
        connection,
        startOver,
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
        className="space-y-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Your name">
            <input
              className={inputClass}
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
              placeholder="Alex Rivera"
            />
          </Field>
          <Field label="Address you as">
            <input
              className={inputClass}
              value={addressAs}
              onChange={(event) => setAddressAs(event.target.value)}
              placeholder="Alex"
            />
          </Field>
        </div>

        <Field label="What are you working toward?" hint="One per line. These seed the master plan.">
          <textarea
            className={`${inputClass} min-h-20 resize-y`}
            value={goals}
            onChange={(event) => setGoals(event.target.value)}
            placeholder={"Land a product role by summer\nShip the newsletter weekly"}
          />
        </Field>

        <Field label="Non-negotiables" hint="One per line — the school runs, the training, the standing dates.">
          <textarea
            className={`${inputClass} min-h-16 resize-y`}
            value={nonNegotiables}
            onChange={(event) => setNonNegotiables(event.target.value)}
            placeholder={"School run 08:20 weekdays\nGym Tue/Thu 07:00"}
          />
        </Field>

        <Field label="In flight — who are you waiting on?" hint="Optional, one per line.">
          <textarea
            className={`${inputClass} min-h-16 resize-y`}
            value={inFlight}
            onChange={(event) => setInFlight(event.target.value)}
            placeholder={"Aldridge — contract renewal, sent 4 March"}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Brief arrives at" hint="Your day, your time. Changeable later.">
            <input
              className={inputClass}
              type="time"
              value={briefTime}
              onChange={(event) => setBriefTime(event.target.value)}
            />
          </Field>
          <Field label="Nightly close at" hint="When the day gets written down.">
            <input
              className={inputClass}
              type="time"
              value={closeTime}
              onChange={(event) => setCloseTime(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Timezone">
          <input className={inputClass} value={detectedTz} disabled />
        </Field>

        <p className="text-xs text-[var(--color-ink-faint)]">
          {startOver
            ? `This will write in ${folder}: ${EXPECTED_FILES[0]}, a new SETUP-CONTEXT.md and MASTER-PLAN.md (the current ones move to archive/setup/ first). DAY-STATE.md, LOG.md and CORRECTIONS.md are kept.`
            : `This will create in ${folder}: ${EXPECTED_FILES[0]}. ${EXPECTED_FILES[1]}`}{" "}
          Your AI connection
          {connection?.model ? ` (${connection.label} · ${connection.model})` : ""} is recorded
          in config.json too.
        </p>

        <ErrorNote message={error} />
        <Button type="submit" className="w-full" disabled={busy || !connection}>
          Write my folder
        </Button>
      </form>
    </div>
  );
}
