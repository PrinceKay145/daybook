/* The scoreboard — home. Today's brief, built, verified and rendered by the runner, and
   shown only when all eleven assertions passed. A brief that fails a check is withheld
   and the failed checks are named; a brief that cannot be built says why. No sample data,
   and nothing that looks like a brief unless it is one.

   The brief is the page: a slim bar above it (the wordmark, the model, Plan again,
   Settings) and the "tell your secretary" box below it, with the plan's state as one quiet
   line over the box. The brief is the runner's own self-contained page in a sandboxed
   frame — exactly the page the eleven assertions checked, with no reach into the app — and
   it is fetched again whenever the window comes back to the front, so a hand edit to the
   folder shows without a rebuild button.

   "Plan again" asks the chosen model to plan the day (it also does so on its own before
   the brief time). The model proposes; the runner writes the day state only after the
   checks. "Tell your secretary" is one message box, not a chat: what the user types
   becomes the newest truth about their day, the model proposes the updated day, and
   nothing is written until the user applies it. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Loader2, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Button, inputClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Wordmark } from "@/components/Logo";
import { daybook, type BriefResult, type Connection, type PlanOutcome } from "@/lib/daybook";
import { describeChoice } from "@/lib/models";
import { cn } from "@/lib/utils";

const REFRESH_AFTER_MS = 60_000; // coming back to the window refetches the brief at most once a minute

/* A date as a person reads it ("Wed 7 Oct"), as the brief shows it; anything else as written. */
function readableDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso;
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const part = (options: Intl.DateTimeFormatOptions) => day.toLocaleDateString("en-GB", options);
  return `${part({ weekday: "short" })} ${day.getDate()} ${part({ month: "short" })}`;
}

export function ScoreboardScreen({
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
}: {
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
}) {
  const [brief, setBrief] = useState<BriefResult | null>(null);
  const loadedAt = useRef(0);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setBrief(null);
      const next = await daybook.brief(folder);
      loadedAt.current = Date.now();
      setBrief(next);
    },
    [folder],
  );

  const [planning, setPlanning] = useState<"day" | "message" | null>(null);
  const [plan, setPlan] = useState<PlanOutcome | null>(null);
  const [message, setMessage] = useState("");
  const [proposal, setProposal] = useState<PlanOutcome | null>(null);
  const [applying, setApplying] = useState(false);
  const busy = planning !== null || applying;

  const planToday = useCallback(async () => {
    setPlanning("day");
    setPlan(null);
    try {
      const outcome = await daybook.planDay(folder, userId);
      setPlan(outcome);
      if (outcome.status === "planned") await load(true);
    } catch (err) {
      setPlan({ status: "failed", detail: (err as Error).message, summary: "", flags: [], model: "" });
    } finally {
      setPlanning(null);
    }
  }, [folder, userId, load]);

  async function tellSecretary() {
    const text = message.trim();
    if (!text || busy) return;
    setPlanning("message");
    setPlan(null);
    try {
      const outcome = await daybook.proposeDay(folder, userId, text);
      if (outcome.status === "proposed" && outcome.proposalId) setProposal(outcome);
      else setPlan(outcome);
    } catch (err) {
      setPlan({ status: "failed", detail: (err as Error).message, summary: "", flags: [], model: "" });
    } finally {
      setPlanning(null);
    }
  }

  async function applyProposal() {
    if (!proposal?.proposalId) return;
    setApplying(true);
    try {
      const outcome = await daybook.applyPlan(proposal.proposalId);
      setProposal(null);
      setPlan(outcome);
      if (outcome.status === "planned") {
        setMessage("");
        await load(true);
      }
    } catch (err) {
      setPlan({ status: "failed", detail: (err as Error).message, summary: "", flags: [], model: "" });
    } finally {
      setApplying(false);
    }
  }

  function discardProposal() {
    if (proposal?.proposalId) void daybook.discardPlan(proposal.proposalId);
    setProposal(null);
  }

  useEffect(() => {
    void load();
  }, [load]);

  // Back to the window: the folder may have been edited by hand, so the brief is fetched
  // again (quietly, at most once a minute, never in the middle of planning).
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const onFocus = () => {
      if (!busyRef.current && Date.now() - loadedAt.current > REFRESH_AFTER_MS) void load(true);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // The first day is planned as soon as setup is done, rather than waiting for tomorrow.
  const arrivalPlanned = useRef(false);
  useEffect(() => {
    if (!planOnArrival || arrivalPlanned.current || !connection) return;
    arrivalPlanned.current = true;
    onPlannedOnArrival();
    void planToday();
  }, [planOnArrival, connection, onPlannedOnArrival, planToday]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-[var(--color-line)] pl-5 pr-3">
        <Wordmark className="mr-auto" />
        <button
          type="button"
          onClick={onChangeAI}
          title="Change the model"
          className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-control)] px-2 text-[13px] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
        >
          {connection ? describeChoice(connection) : "Choose a model"}
          <ChevronDown className="size-3.5" />
        </button>
        <Button
          variant="secondary"
          onClick={() => void planToday()}
          disabled={busy || proposal !== null || !connection}
          title="Your secretary reads your folder and plans today. It also does this on its own before your brief."
        >
          <RefreshCw />
          Plan again
        </Button>
        <Button variant="ghost" onClick={onOpenSettings}>
          <SlidersHorizontal />
          Settings
        </Button>
      </header>

      <main className="relative min-h-0 flex-1">
        <BriefView brief={brief} />
        {/* The proposal floats over today's brief, which steps back behind a wash of the
            page's own colour: the brief is what is true now, the card is what would be. */}
        {proposal?.proposal && (
          <div className="fade-in absolute inset-0 flex flex-col justify-end bg-[color-mix(in_srgb,var(--color-canvas)_72%,transparent)] px-5 pb-3 pt-6">
            <ProposalCard outcome={proposal} applying={applying} onApply={() => void applyProposal()} onDiscard={discardProposal} />
          </div>
        )}
      </main>

      <footer className="shrink-0 border-t border-[var(--color-line)] px-5 pb-3 pt-2">
        <StatusLine
          planning={planning}
          plan={plan}
          connection={connection}
          briefTime={briefTime}
          backgroundJobs={backgroundJobs}
          jobsProblem={jobsProblem}
          onOpenSettings={onOpenSettings}
        />
        <form
          className="mt-2 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void tellSecretary();
          }}
        >
          <textarea
            id="tell-secretary"
            rows={1}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void tellSecretary();
              }
            }}
            disabled={busy || proposal !== null || !connection}
            placeholder="Tell your secretary what changed — e.g. finished the proposal, waiting on Sam until Friday"
            aria-label="Tell your secretary"
            className={cn(inputClass, "field-sizing-content max-h-32 min-h-10 resize-none py-2.5")}
          />
          <Button type="submit" size="lg" disabled={!message.trim() || busy || proposal !== null || !connection}>
            Send
          </Button>
        </form>
      </footer>
    </div>
  );
}

/* One quiet line above the box: what the secretary is doing, what it just did, or — when
   nothing is happening — when the brief arrives and whether the background jobs run. */
function StatusLine({
  planning,
  plan,
  connection,
  briefTime,
  backgroundJobs,
  jobsProblem,
  onOpenSettings,
}: {
  planning: "day" | "message" | null;
  plan: PlanOutcome | null;
  connection: Connection | null;
  briefTime: string;
  backgroundJobs: "on" | "off";
  jobsProblem: string | null;
  onOpenSettings: () => void;
}) {
  const who = connection ? describeChoice(connection) : "Your model";
  const line = (tone: "quiet" | "busy" | "warn", children: ReactNode) => (
    <p className={cn("flex items-start gap-2 text-[12.5px]", tone === "warn" ? "text-[var(--color-warn)]" : "text-[var(--color-ink-faint)]")}>
      {tone === "busy" ? (
        <Loader2 className="mt-[2px] size-3.5 shrink-0 animate-spin" />
      ) : (
        <span className={cn("mt-[6px] size-1.5 shrink-0 rounded-full", tone === "warn" ? "bg-[var(--color-warn)]" : "bg-[var(--color-accent)]")} />
      )}
      <span className="min-w-0">{children}</span>
    </p>
  );

  if (planning === "message") return line("busy", `${who} is reading your message and your folder. This takes a minute or two.`);
  if (planning === "day") return line("busy", `${who} is reading your folder and planning today. This takes a minute or two.`);
  if (plan) {
    const flags = plan.flags.length > 0 && (
      <> Text in your folder read like instructions to the AI, and was ignored: {plan.flags.join(" · ")}</>
    );
    if (plan.status === "planned") {
      const what = plan.from_message ? "Updated from your message" : "Today is planned";
      return line("quiet", <>{what}: {plan.detail}.{plan.summary ? ` ${plan.summary}` : ""}{flags}</>);
    }
    if (plan.status === "skipped") return line("quiet", plan.detail);
    return line("warn", <>Today's plan wasn't written: {plan.detail} Your day is unchanged.{flags}</>);
  }
  const settingsLink = (
    <button type="button" className="underline decoration-1 underline-offset-[3px] hover:text-[var(--color-ink)]" onClick={onOpenSettings}>
      Settings
    </button>
  );
  if (jobsProblem) return line("warn", <>Your brief can't arrive on its own: {jobsProblem} {settingsLink}</>);
  if (backgroundJobs === "off") return line("quiet", <>The background jobs are stopped, so your brief only appears when you open Daybook. {settingsLink}</>);
  return line("quiet", <>Your brief arrives at <span className="tnum">{briefTime}</span> each day, even when Daybook is closed.</>);
}

/* The proposed day, shown before anything is written. It floats above the box: the one
   place on this screen that is a card. The proposal scrolls; the buttons never do. */
function ProposalCard({
  outcome,
  applying,
  onApply,
  onDiscard,
}: {
  outcome: PlanOutcome;
  applying: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const day = outcome.proposal!;
  const label = "label mt-4 first:mt-0";
  return (
    <section aria-labelledby="proposal-title" className="mx-auto flex max-h-full w-full max-w-3xl min-h-0">
      <Card className="flex min-h-0 w-full flex-col p-5 shadow-[0_18px_40px_-22px_rgb(0_0_0/0.45)]">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="proposal-title" className="label text-[var(--color-accent)]">Proposed for today</h2>
          <span className="truncate text-[12px] text-[var(--color-ink-faint)]">by {outcome.model || "your secretary"}</span>
        </div>
        {outcome.summary && <p className="mt-1.5 font-display text-[18px] leading-[1.35] font-medium text-pretty">{outcome.summary}</p>}

        <div className="mt-4 min-h-0 overflow-y-auto border-t border-[var(--color-line)] pt-3 text-[13.5px]">
          <p className={label}>Today</p>
          {day.today_list.length === 0 ? (
            <p className="mt-1 text-[var(--color-ink-soft)]">— {day.list_reason}</p>
          ) : (
            <>
              {day.list_reason && <p className="mt-1 text-[13px] text-[var(--color-ink-soft)]">{day.list_reason}</p>}
              <ol className="mt-2 space-y-2">
                {day.today_list.map((item, i) => (
                  <li key={i} className="grid grid-cols-[18px_1fr] gap-x-2">
                    <span className="font-display text-[var(--color-accent)]">{i + 1}</span>
                    <span>
                      <span className="font-display text-[15.5px] font-medium">{item.title}</span>
                      <span className="block text-[var(--color-ink-soft)]">{item.first_click}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {day.newly_finished.length > 0 && (
            <>
              <p className={label}>Marked done</p>
              <ul className="mt-1 space-y-0.5">
                {day.newly_finished.map((item, i) => (
                  <li key={i}>
                    <span className="line-through decoration-[var(--color-ink-faint)]">{item.label}</span>
                    {item.detail && <span className="text-[var(--color-ink-soft)]"> — {item.detail}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}

          {day.board.length > 0 && (
            <>
              <p className={label}>Waiting on others</p>
              <ul className="mt-1 space-y-1">
                {day.board.map((row, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{row.who}</span>
                    <span className="text-[var(--color-ink-soft)]">{row.what}</span>
                    <span className={cn("text-[11px] font-semibold tracking-[0.08em]", row.status === "WAIT" ? "text-[var(--color-wait)]" : "text-[var(--color-chase)]")}>
                      {row.status}
                    </span>
                    <span className="tnum text-[12px] text-[var(--color-ink-faint)]">{readableDay(row.date)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {day.questions.length > 0 && (
            <>
              <p className={label}>Questions for you</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {day.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </>
          )}

          {outcome.flags.length > 0 && (
            <p className="mt-3 text-[12.5px] text-[var(--color-warn)]">
              Text in your folder read like instructions to the AI, and was ignored: {outcome.flags.join(" · ")}
            </p>
          )}
        </div>

        <div className="mt-3 flex shrink-0 items-center gap-2 border-t border-[var(--color-line)] pt-3">
          <Button onClick={onApply} disabled={applying}>
            {applying ? "Applying…" : "Apply"}
          </Button>
          <Button variant="ghost" onClick={onDiscard} disabled={applying}>
            Discard
          </Button>
          <span className="ml-auto text-[12.5px] text-[var(--color-ink-faint)]">Nothing is written until you apply.</span>
        </div>
      </Card>
    </section>
  );
}

function BriefView({ brief }: { brief: BriefResult | null }) {
  if (brief === null) {
    return <p className="px-11 py-10 text-[13px] text-[var(--color-ink-faint)]">Building today's brief and checking it…</p>;
  }

  if (!brief.ok) {
    return (
      <Notice title={brief.code === "PYTHON_MISSING" ? "The brief can't be built on this Mac yet" : "The brief couldn't be built"}>
        <p>{brief.message}</p>
        {brief.logFile && brief.code !== "PYTHON_MISSING" && (
          <p className="mt-2 text-[12.5px] text-[var(--color-ink-faint)]">
            The runner's log: <code className="font-mono">{brief.logFile}</code>
          </p>
        )}
      </Notice>
    );
  }

  if (!brief.passed || !brief.html) {
    const failed = brief.results.filter((r) => !r.ok);
    return (
      <Notice title="Today's brief is held back">
        <p>
          It failed {failed.length === 1 ? "one of its checks" : `${failed.length} of its checks`}, so it isn't
          shown. A brief that's wrong gets read quickly, trusted and acted on, so no brief is better.
        </p>
        <ul className="mt-3 space-y-1.5 border-t border-[var(--color-line)] pt-3">
          {failed.map((r) => (
            <li key={r.id} className="text-[13px]">
              {r.name}: <span className="text-[var(--color-ink-soft)]">{r.detail}</span>
            </li>
          ))}
        </ul>
      </Notice>
    );
  }

  // The checks run before every brief; a brief that passes them is simply shown.
  return <iframe title="Today's brief" srcDoc={brief.html} sandbox="allow-scripts" className="absolute inset-0 size-full border-0" />;
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="max-w-2xl px-11 py-10 text-[14px] text-[var(--color-ink-soft)]">
      <h2 className="mb-2 font-display text-[24px] font-medium text-[var(--color-ink)]">{title}</h2>
      {children}
    </div>
  );
}
