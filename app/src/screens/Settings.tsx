/* Settings & status. The process model's promise, in words a person uses: what runs on
   this Mac is said plainly, and one switch really stops it — it removes the background
   jobs, so nothing returns at the next login (AGENTS.md). The machinery itself (each job by
   its macOS label, every PID, the log directory) is shown in development builds only;
   everyone gets a way to open the logs to send them to us. The brief time and the size of
   today's list edit config.json, where the tick reads them within a minute. (The close
   time stays in config.json but isn't asked for until the nightly close exists.)
   Appearance and signing out live here too. */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, FolderOpen, LogOut, RefreshCw } from "lucide-react";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui/button";
import { Segmented, Switch } from "@/components/ui/segmented";
import { PageFrame } from "@/components/OnboardingFrame";
import { cn } from "@/lib/utils";
import { daybook, LIST_MAX, type Appearance, type Connection, type SystemStatus } from "@/lib/daybook";
import { LIST_MAX_HINT, ListMaxSelect, things } from "@/components/ListMaxSelect";
import { describeChoice } from "@/lib/models";

function clockTime(iso?: string): string {
  if (!iso) return "never";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

/* "2026-10-06" → "Tue 6 Oct"; anything else as written. */
function readableDay(text: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return text;
  const day = new Date(+match[1], +match[2] - 1, +match[3]);
  return `${day.toLocaleDateString("en-GB", { weekday: "short" })} ${day.getDate()} ${day.toLocaleDateString("en-GB", { month: "short" })}`;
}

const APPEARANCE_OPTIONS = [
  ["system", "Same as this Mac"],
  ["light", "Light"],
  ["dark", "Dark"],
] as const;

export function SettingsScreen({
  folder,
  connection,
  backgroundJobs,
  accountEmail,
  onBack,
  onChangeAI,
  onSignOut,
  onSaved,
}: {
  folder: string;
  connection: Connection | null;
  backgroundJobs: "on" | "off";
  accountEmail: string;
  onBack: () => void;
  onChangeAI: () => void;
  onSignOut: () => void;
  onSaved: (patch: { briefTime?: string; backgroundJobs?: "on" | "off" }) => void;
}) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [briefTime, setBriefTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [listMax, setListMax] = useState<number>(LIST_MAX.default);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appearance, setAppearance] = useState<Appearance>("system");

  const refresh = useCallback(async () => {
    try {
      setStatus(await daybook.scheduleStatus());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    daybook.getAppearance().then(setAppearance).catch(() => {});
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

  async function chooseAppearance(value: Appearance) {
    setError(null);
    setAppearance(value);
    try {
      setAppearance(await daybook.setAppearance(value));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveSchedule() {
    setError(null);
    setSavedNote(null);
    try {
      const saved = await daybook.setSchedule(folder, { briefTime, closeTime, listMax });
      onSaved({ briefTime: saved.briefTime });
      setSavedNote(`Saved. Your next brief arrives at ${saved.briefTime}, with at most ${things(saved.listMax)} on today's list.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const state = status?.state ?? {};

  const folderName = folder.split("/").filter(Boolean).pop() ?? folder;
  const link = "underline decoration-1 underline-offset-[3px] hover:text-[var(--color-ink)]";

  return (
    <PageFrame
      title="Settings"
      intro="Your day, how Daybook looks, your folder and model, and your account."
      back={
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft />
          Back to today
        </Button>
      }
    >
      <Section title="Your day" description="When the brief arrives, and how long today's list can be.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Morning brief at">
            <input id="settings-brief-time" className={cn(inputClass, "tnum")} type="time" value={briefTime} onChange={(e) => setBriefTime(e.target.value)} />
          </Field>
          <Field label="Today's list holds at most" hint={LIST_MAX_HINT}>
            <ListMaxSelect value={listMax} onChange={setListMax} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void saveSchedule()} disabled={!briefTime || !closeTime}>
            Save
          </Button>
          {savedNote && <span className="text-[12.5px] text-[var(--color-ink-soft)]">{savedNote}</span>}
        </div>
      </Section>

      <Section title="Your brief, on its own" description="Written at its time, even when this window is closed.">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p id="settings-jobs-label" className="text-[14px] font-semibold">Write my brief even when Daybook is closed</p>
            <p className="mt-0.5 text-[13px] text-[var(--color-ink-soft)]">
              {backgroundJobs === "on"
                ? <>Your brief is written at <span className="tnum">{briefTime || "its time"}</span> each morning. Nothing stays running in between.</>
                : "Off: your brief is only written when you open Daybook."}
            </p>
          </div>
          <Switch
            id="settings-jobs"
            labelledBy="settings-jobs-label"
            checked={backgroundJobs === "on"}
            disabled={busy}
            onChange={() => void toggleJobs()}
          />
        </div>
        <p className="text-[12.5px] text-[var(--color-ink-faint)]">
          Last brief written: {state.last_brief ? readableDay(state.last_brief) : "none yet"}
        </p>
        {state.last_error && (
          <p className="text-[12.5px] text-[var(--color-warn)]">The last try didn't work: {state.last_error}</p>
        )}
      </Section>

      <Section title="Appearance" description="Light, dark, or the same as your Mac.">
        <Segmented label="Appearance" value={appearance} options={APPEARANCE_OPTIONS} onChange={(value) => void chooseAppearance(value)} />
      </Section>

      <Section title="Folder and model" description="Where your secretary works, and the AI it uses.">
        <div className="flex flex-wrap items-baseline gap-x-3 text-[14px]">
          <p className="font-semibold" title={folder}>{folderName}</p>
          <button type="button" className={cn(link, "inline-flex items-center gap-1 text-[13px] text-[var(--color-ink-soft)]")} onClick={() => void daybook.revealFolder(folder)}>
            <FolderOpen className="size-3.5" />
            Show in Finder
          </button>
        </div>
        <p className="text-[14px]">
          {connection ? describeChoice(connection) : "No model chosen"}{" "}
          <button type="button" className={cn(link, "ml-1 text-[13px] text-[var(--color-ink-soft)]")} onClick={onChangeAI}>
            Change
          </button>
        </p>
      </Section>

      <Section title="Account" description="Who you are signed in as. It never sees your files.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px]">{accountEmail}</p>
          <Button variant="secondary" onClick={onSignOut}>
            <LogOut />
            Sign out
          </Button>
        </div>
      </Section>

      <p className="border-t border-[var(--color-line)] pt-5 text-[12.5px] text-[var(--color-ink-faint)]">
        Something not working?{" "}
        {status ? (
          <button type="button" className={link} onClick={() => void daybook.revealLog(`${status.logDir}/tick.log`)}>
            Show Daybook's logs in Finder
          </button>
        ) : (
          "Daybook's logs"
        )}{" "}
        — sending them to us helps find the problem.
      </p>

      {import.meta.env.DEV && (
        <section className="mt-6 border-t border-[var(--color-line)] py-6">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[14px] font-semibold">
              <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
              For developers — everything Daybook runs
            </summary>
            <div className="mt-4 space-y-4 pl-6 text-[13px] text-[var(--color-ink-soft)]">
              <div className="flex items-center justify-between gap-3">
                <p>Each process, as macOS knows it. Shown in development builds only.</p>
                <Button variant="ghost" onClick={() => void refresh()}>
                  <RefreshCw />
                  Refresh
                </Button>
              </div>
              <ul className="divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
                {(status?.jobs ?? []).map((job) => (
                  <li key={job.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                    <code className="font-mono text-[12px] text-[var(--color-ink)]">{job.label}</code>
                    <span>{job.every} — {job.purpose}</span>
                    <span className={cn("ml-auto", job.loaded ? "text-[var(--color-accent)]" : "text-[var(--color-ink-faint)]")}>
                      {job.loaded ? "on schedule" : job.installed ? "installed, not loaded" : "stopped"}
                      {job.lastExit && job.lastExit !== "0" && job.lastExit !== "(never exited)" ? ` · last exit ${job.lastExit}` : ""}
                    </span>
                  </li>
                ))}
                <li className="py-2">
                  <span className="text-[var(--color-ink)]">Daybook</span> (this window) · <span className="tnum">PID {status?.app.pid ?? "—"}</span>
                </li>
                <li className="py-2">
                  <span className="text-[var(--color-ink)]">The runner</span> —{" "}
                  {status?.runner
                    ? <>builds the brief for this window · <span className="tnum">PID {status.runner.pid}</span> on 127.0.0.1:{status.runner.port} · stops when Daybook quits</>
                    : "not running (it starts with today's brief, and stops when Daybook quits)"}
                </li>
              </ul>
              <p className="text-[12.5px] text-[var(--color-ink-faint)]">
                Last check {clockTime(state.last_tick)}{status && <> · logs in <code className="font-mono">{status.logDir}</code></>}
              </p>
            </div>
          </details>
        </section>
      )}

      <ErrorNote message={error} />
    </PageFrame>
  );
}

/* A group of settings: its name and purpose on the left, its controls on the right. */
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-x-8 gap-y-3 border-t border-[var(--color-line)] py-6 md:grid-cols-[190px_1fr]">
      <div>
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <p className="mt-0.5 text-[12.5px] text-[var(--color-ink-faint)]">{description}</p>
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}
