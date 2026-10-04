/* Settings & status. The process model's promise made visible: a user can find, inspect
   and stop everything Daybook runs, without guessing and without knowing how it was built
   (AGENTS.md). Every job is named as macOS knows it, with what it does, when it last ran
   and where it logs; Stop really stops — it removes the jobs, so nothing returns at the
   next login. The schedule and the size of today's list edit config.json, where the tick
   reads them within a minute. */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, FolderOpen, RefreshCw } from "lucide-react";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui/button";
import { daybook, LIST_MAX, type Connection, type SystemStatus } from "@/lib/daybook";
import { LIST_MAX_HINT, ListMaxSelect, things } from "@/components/ListMaxSelect";
import { describeChoice } from "@/lib/models";

function clockTime(iso?: string): string {
  if (!iso) return "never";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export function SettingsScreen({
  folder,
  connection,
  backgroundJobs,
  onBack,
  onChangeAI,
  onSaved,
}: {
  folder: string;
  connection: Connection | null;
  backgroundJobs: "on" | "off";
  onBack: () => void;
  onChangeAI: () => void;
  onSaved: (patch: { briefTime?: string; backgroundJobs?: "on" | "off" }) => void;
}) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [briefTime, setBriefTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [listMax, setListMax] = useState<number>(LIST_MAX.default);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await daybook.scheduleStatus());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    daybook
      .readSchedule(folder)
      .then((s) => {
        setBriefTime(s.briefTime);
        setCloseTime(s.closeTime);
        setListMax(s.listMax);
      })
      .catch((err: unknown) => setError((err as Error).message));
  }, [folder, refresh]);

  async function toggleJobs() {
    setError(null);
    setBusy(true);
    try {
      if (backgroundJobs === "off") {
        const started = await daybook.scheduleStart(folder);
        if (!started.ok) throw new Error(started.message);
        onSaved({ backgroundJobs: "on" });
      } else {
        await daybook.scheduleStop();
        onSaved({ backgroundJobs: "off" });
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule() {
    setError(null);
    setSavedNote(null);
    try {
      const saved = await daybook.setSchedule(folder, { briefTime, closeTime, listMax });
      onSaved({ briefTime: saved.briefTime });
      setSavedNote(
        `Saved to config.json — the next brief arrives at ${saved.briefTime}, with at most ${things(saved.listMax)} on today's list.`,
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const running = status?.jobs.every((j) => j.loaded) ?? false;
  const state = status?.state ?? {};

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-3.5" />
        Back to the scoreboard
      </button>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings & status</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Everything Daybook runs on this Mac, and how to stop it.
          </p>
        </div>
        <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => void refresh()}>
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>

      <div className="space-y-4">
        <Panel title="Your brief, on its own">
          <p className="text-sm text-[var(--color-ink-soft)]">
            {running
              ? `Your brief is written at ${briefTime || "its time"} every day — Daybook checks once a minute, even when this window is closed. Each check runs for a moment and exits; nothing stays running.`
              : "The background jobs are stopped. Your brief is only built when you open Daybook."}
          </p>
          <div className="mt-3 divide-y divide-[var(--color-line)] rounded-[var(--radius-card)] border border-[var(--color-line)]">
            {(status?.jobs ?? []).map((job) => (
              <div key={job.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5 text-xs">
                <code className="text-[var(--color-ink)]">{job.label}</code>
                <span className="text-[var(--color-ink-soft)]">
                  {job.every} — {job.purpose}
                </span>
                <span className={`ml-auto ${job.loaded ? "text-[var(--color-accent)]" : "text-[var(--color-ink-faint)]"}`}>
                  {job.loaded ? "on schedule" : job.installed ? "installed, not loaded" : "stopped"}
                  {job.lastExit && job.lastExit !== "0" && job.lastExit !== "(never exited)" ? ` · last exit ${job.lastExit}` : ""}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
            Last check: {clockTime(state.last_tick)} · last brief written: {state.last_brief ?? "none yet"}
            {state.last_error ? ` · last error: ${state.last_error}` : ""}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Button variant={backgroundJobs === "off" ? "primary" : "secondary"} className="shrink-0 whitespace-nowrap" disabled={busy} onClick={() => void toggleJobs()}>
              {backgroundJobs === "off" ? "Start the background jobs" : "Stop the background jobs"}
            </Button>
            <span className="text-xs text-[var(--color-ink-faint)]">
              {backgroundJobs === "off"
                ? "Writes them to ~/Library/LaunchAgents and loads them."
                : "Unloads them and removes them from ~/Library/LaunchAgents — nothing comes back at the next login."}
            </span>
          </div>
        </Panel>

        <Panel title="Your day">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Morning brief at">
              <input className={inputClass} type="time" value={briefTime} onChange={(e) => setBriefTime(e.target.value)} />
            </Field>
            <Field label="Nightly close at">
              <input className={inputClass} type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Today's list holds at most" hint={LIST_MAX_HINT}>
              <ListMaxSelect value={listMax} onChange={setListMax} />
            </Field>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button variant="secondary" onClick={() => void saveSchedule()} disabled={!briefTime || !closeTime}>
              Save
            </Button>
            {savedNote && <span className="text-xs text-[var(--color-ink-soft)]">{savedNote}</span>}
          </div>
        </Panel>

        <Panel title="What Daybook runs">
          <ul className="space-y-1.5 text-xs text-[var(--color-ink-soft)]">
            <li>
              <span className="text-[var(--color-ink)]">Daybook</span> (this window) · PID {status?.app.pid ?? "—"}
            </li>
            <li>
              <span className="text-[var(--color-ink)]">The runner</span> —{" "}
              {status?.runner
                ? `builds the brief for the scoreboard · PID ${status.runner.pid} on 127.0.0.1:${status.runner.port} · stops when Daybook quits`
                : "not running (it starts when the scoreboard opens, and stops when Daybook quits)"}
            </li>
            <li>
              <span className="text-[var(--color-ink)]">The two jobs above</span> — run for a moment on their
              schedule, then exit
            </li>
          </ul>
          {status && (
            <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
              All logs: <code>{status.logDir}</code>{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-[var(--color-ink)]"
                onClick={() => void daybook.revealLog(`${status.logDir}/tick.log`)}
              >
                Show in Finder
              </button>
            </p>
          )}
        </Panel>

        <Panel title="Your folder and model">
          <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-soft)]">
            <code className="break-all text-[var(--color-ink)]">{folder}</code>
            <button
              type="button"
              className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-[var(--color-ink)]"
              onClick={() => void daybook.revealFolder(folder)}
            >
              <FolderOpen className="size-3" />
              Open in Finder
            </button>
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-soft)]">
            Model: <span className="text-[var(--color-ink)]">{connection ? describeChoice(connection) : "none chosen"}</span>
            <button type="button" className="underline underline-offset-2 hover:text-[var(--color-ink)]" onClick={onChangeAI}>
              Change
            </button>
          </p>
          <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
            Folder access — read-only folders you grant and how changes are approved — arrives with
            the secretary's file tools.
          </p>
        </Panel>

        <ErrorNote message={error} />
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-faint)]">{title}</h2>
      {children}
    </section>
  );
}
