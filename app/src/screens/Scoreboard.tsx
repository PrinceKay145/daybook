/* The scoreboard — home. Today's brief, built, verified and rendered by the runner, and
   shown only when all eleven assertions passed. A brief that fails a check is withheld
   and the failed checks are named; a brief that cannot be built says why. No sample data,
   and nothing that looks like a brief unless it is one.

   The brief is the runner's own self-contained page, shown in a sandboxed frame: exactly
   the page the eleven assertions checked, with its live dial, and no reach into the app.

   "Plan today" asks the chosen model to plan the day (it also does so on its own before
   the brief time). The model proposes; the runner writes the day state only after the
   checks, and the result is said in one line — what changed, or why nothing did. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { KeyRound, Loader2, LogOut, RefreshCw, Settings, Sparkles, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { daybook, type BriefResult, type Connection, type PlanOutcome } from "@/lib/daybook";
import { describeChoice } from "@/lib/models";

export function ScoreboardScreen({
  accountEmail,
  userId,
  planOnArrival,
  onPlannedOnArrival,
  folder,
  connection,
  briefTime,
  backgroundJobs,
  jobsProblem,
  onChangeAI,
  onOpenSettings,
  onSignOut,
}: {
  accountEmail: string;
  userId: string;
  planOnArrival: boolean;
  onPlannedOnArrival: () => void;
  folder: string;
  connection: Connection | null;
  briefTime: string;
  backgroundJobs: "on" | "off";
  jobsProblem: string | null;
  onChangeAI: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}) {
  const [brief, setBrief] = useState<BriefResult | null>(null);

  const load = useCallback(async () => {
    setBrief(null);
    setBrief(await daybook.brief(folder));
  }, [folder]);

  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<PlanOutcome | null>(null);

  const planToday = useCallback(async () => {
    setPlanning(true);
    setPlan(null);
    try {
      const outcome = await daybook.planDay(folder, userId);
      setPlan(outcome);
      if (outcome.status === "planned") await load();
    } catch (err) {
      setPlan({ status: "failed", detail: (err as Error).message, summary: "", flags: [], model: "" });
    } finally {
      setPlanning(false);
    }
  }, [folder, userId, load]);

  useEffect(() => {
    void load();
  }, [load]);

  // The first day is planned as soon as setup is done, rather than waiting for tomorrow.
  const arrivalPlanned = useRef(false);
  useEffect(() => {
    if (!planOnArrival || arrivalPlanned.current || !connection) return;
    arrivalPlanned.current = true;
    onPlannedOnArrival();
    void planToday();
  }, [planOnArrival, connection, onPlannedOnArrival, planToday]);

  const folderName = folder.split("/").filter(Boolean).pop() ?? folder;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] px-5 py-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight">Daybook</h1>
          <p className="truncate text-xs text-[var(--color-ink-faint)]" title={folder}>
            {accountEmail} · brief at {briefTime} · {folderName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onChangeAI}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-ink-faint)]"
          >
            {connection?.authKind === "api_key" ? <KeyRound className="size-3" /> : <TerminalSquare className="size-3" />}
            {connection ? `${describeChoice(connection)} — change` : "No model chosen — choose"}
          </button>
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => void planToday()}
            disabled={planning || !connection}
            title="Your secretary reads your folder and writes today's list. It also does this on its own before your brief."
          >
            <Sparkles className="size-3.5" />
            Plan today
          </Button>
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => void load()} disabled={brief === null || planning}>
            <RefreshCw className="size-3.5" />
            Rebuild
          </Button>
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={onOpenSettings}>
            <Settings className="size-3.5" />
            Settings
          </Button>
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={onSignOut}>
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      <PlanLine planning={planning} plan={plan} connection={connection} />

      <main className="min-h-0 flex-1">
        <BriefView brief={brief} />
      </main>

      {/* Nothing mysterious runs: the scoreboard says what runs in the background, and where to stop it. */}
      <footer className="border-t border-[var(--color-line)] px-5 py-2 text-center text-[0.7rem] text-[var(--color-ink-faint)]">
        {jobsProblem ? (
          <span className="text-[var(--color-warn)]">The brief can't arrive on its own: {jobsProblem}</span>
        ) : backgroundJobs === "off" ? (
          "The background jobs are stopped, so your brief only appears when you open Daybook."
        ) : (
          `Your brief is written at ${briefTime} on its own, even when Daybook is closed.`
        )}{" "}
        <button type="button" className="underline underline-offset-2 hover:text-[var(--color-ink)]" onClick={onOpenSettings}>
          Settings & status
        </button>
      </footer>
    </div>
  );
}

function PlanLine({ planning, plan, connection }: { planning: boolean; plan: PlanOutcome | null; connection: Connection | null }) {
  if (planning) {
    return (
      <p className="flex items-center justify-center gap-2 border-b border-[var(--color-line)] px-5 py-2 text-xs text-[var(--color-ink-soft)]">
        <Loader2 className="size-3.5 animate-spin" />
        {connection ? describeChoice(connection) : "Your model"} is reading your folder and planning today — this takes a minute or two.
      </p>
    );
  }
  if (!plan) return null;
  const written = plan.status === "planned";
  return (
    <div className="border-b border-[var(--color-line)] px-5 py-2 text-center text-xs">
      <p className={written ? "text-[var(--color-ink-soft)]" : "text-[var(--color-warn)]"}>
        {written
          ? `Today's plan is written — ${plan.detail}.${plan.summary ? ` ${plan.summary}` : ""} The previous day state is kept in archive/day-state/.`
          : plan.status === "skipped"
            ? plan.detail
            : `Today's plan wasn't written: ${plan.detail} Your day state is unchanged.`}
      </p>
      {plan.flags.length > 0 && (
        <p className="mt-1 text-[var(--color-warn)]">
          Text in your folder read like instructions to the AI, and was ignored: {plan.flags.join(" · ")}
        </p>
      )}
    </div>
  );
}

function BriefView({ brief }: { brief: BriefResult | null }) {
  if (brief === null) {
    return <p className="px-5 py-10 text-center text-sm text-[var(--color-ink-faint)]">Building today's brief and checking it…</p>;
  }

  if (!brief.ok) {
    return (
      <Notice title={brief.code === "PYTHON_MISSING" ? "The brief can't be built on this Mac yet" : "The brief could not be built"}>
        <p>{brief.message}</p>
        {brief.logFile && brief.code !== "PYTHON_MISSING" && (
          <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
            The runner's log: <code>{brief.logFile}</code>
          </p>
        )}
      </Notice>
    );
  }

  const passedCount = brief.results.filter((r) => r.ok).length;

  if (!brief.passed || !brief.html) {
    return (
      <Notice title="Today's brief is withheld">
        <p>
          It failed {brief.results.length - passedCount} of its {brief.results.length} checks, so it is
          not shown. A brief that renders wrong is read quickly, trusted and acted on — no brief is
          better.
        </p>
        <ul className="mt-3 space-y-1.5">
          {brief.results
            .filter((r) => !r.ok)
            .map((r) => (
              <li key={r.id} className="text-xs">
                <span className="font-medium text-[var(--color-warn)]">{r.id}</span> {r.name} —{" "}
                <span className="text-[var(--color-ink-soft)]">{r.detail}</span>
              </li>
            ))}
        </ul>
      </Notice>
    );
  }

  // The checks run before every brief; a brief that passes them is simply shown.
  return (
    <div className="flex h-full flex-col">
      <iframe
        title="Today's brief"
        srcDoc={brief.html}
        sandbox="allow-scripts"
        className="min-h-0 w-full flex-1 border-0"
      />
    </div>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-5 py-12">
      <div className="rounded-[var(--radius-card)] border border-[var(--color-warn)]/40 bg-[var(--color-surface)] p-5 text-sm text-[var(--color-ink-soft)]">
        <p className="mb-2 font-medium text-[var(--color-warn)]">{title}</p>
        {children}
      </div>
    </div>
  );
}
