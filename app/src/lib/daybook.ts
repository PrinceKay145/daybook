/* Typed access to the Electron bridge, with plain-browser fallbacks so the same
   renderer runs in a browser tab during development. The fallbacks keep what the
   browser can honestly do (settings in localStorage) and refuse what it cannot
   (folder access, keychain, outbound links) instead of pretending. */

import type { DayBlock } from "@/lib/dayShape";
import { fetchBriefFromRunner } from "@/lib/api";

export interface Connection {
  id: string;
  label: string;
  authKind: "local_cli" | "api_key";
  cliBinary?: string;
  /** Where the CLI was found on this Mac — the path invocation uses. */
  binaryPath?: string;
  /** The model the secretary uses through this connection (a full model ID). */
  model?: string;
  /** The model's display name, e.g. "Sonnet 5". */
  modelLabel?: string;
}

/** What the connect step learned about one local CLI. */
export interface CliStatus {
  name: "claude" | "codex";
  found: boolean;
  path?: string;
  version?: string;
  signedIn?: boolean;
  /** How the CLI is signed in: the user's plan, or an API key. */
  method?: "subscription" | "api_key";
  /** Claude Code reports the plan (e.g. "max", "pro"). */
  plan?: string;
  error?: string;
}

export interface CheckResult {
  id: string;
  name: string;
  ok: boolean;
  detail: string;
}

/** Today's brief from the runner. `html` is present only when all eleven passed. */
export type BriefResult =
  | { ok: true; passed: boolean; results: CheckResult[]; warnings: string[]; html: string | null; logFile?: string }
  | { ok: false; code: string; message: string; logFile?: string };

/** One run of the chosen model planning the day (runner/daybook/plan.py). "planned": the
    day state was written after the eleven checks; "failed": the model couldn't be asked;
    "refused": its answer broke a rule twice; "skipped": no model is chosen. */
export interface PlanOutcome {
  status: "planned" | "proposed" | "refused" | "failed" | "skipped";
  detail: string;
  summary: string;
  /** Text in the folder that read like instructions, which the model ignored and named. */
  flags: string[];
  model: string;
  /** What the model proposed, to show before the user applies it. */
  proposal?: ProposedDay;
  /** Set on a proposal waiting in the main process for the user's answer. */
  proposalId?: string;
  from_message?: boolean;
}

export interface ProposedDay {
  today_list: { title: string; first_click: string }[];
  list_reason: string;
  board: { who: string; what: string; status: "WAIT" | "CHASE"; next_move: string; date: string }[];
  newly_finished: { label: string; detail: string }[];
  questions: string[];
}

/** One of Daybook's launchd jobs, as Settings & status shows it. */
export interface JobStatus {
  label: string;
  purpose: string;
  every: string;
  installed: boolean;
  loaded: boolean;
  lastExit: string | null;
  log: string;
  plist: string;
}

/** Everything Daybook runs, for Settings & status. */
export interface SystemStatus {
  jobs: JobStatus[];
  /** The tick's own record: last run, last brief, last error. */
  state: { last_tick?: string; last_brief?: string; last_error?: string; withheld_notified?: string };
  app: { pid: number; name: string };
  runner: { pid: number; port: number; folder: string; log: string } | null;
  logDir: string;
}

export type ScheduleResult = { ok: true } | { ok: false; code: string; message: string };

export interface ModelOption {
  id: string;
  label: string;
  isDefault?: boolean;
}

/** One account's state on this Mac, stored under its user id — a different account,
    or the same email re-created as a new account, starts from nothing. */
export interface UserSettings {
  /** Display only; the user id is the key. */
  email?: string;
  folderPath?: string;
  connections?: Connection[];
  activeConnectionId?: string;
  /** When this account finished the setup questions (ISO time). */
  setupCompletedAt?: string;
  /** Display copy of the user's chosen brief time; config.json in the folder is authoritative. */
  briefTime?: string;
  /** "off" once the user stopped the background jobs in Settings — the app never restarts
      them on its own after that. Absent or "on": they are kept installed. */
  backgroundJobs?: "on" | "off";
}

/** The keychain entry for one account's API-key connection. */
export function secretName(userId: string, connectionId: string): string {
  return `user/${userId}/provider/${connectionId}`;
}

/** How many things today's list may hold — law 8's number, the user's to set
    (`daily_list.max_items` in config.json). Its rule is not: the list is never padded. */
export const LIST_MAX = { default: 3, lowest: 1, highest: 10 } as const;

/** The day's settings that live in the folder's config.json. */
export interface DaySettings {
  briefTime: string;
  closeTime: string;
  listMax: number;
}

export interface SetupPayload {
  folder: string;
  ownerName: string;
  addressAs: string;
  timezone: string;
  briefTime: string;
  closeTime: string;
  listMax: number;
  goals: string[];
  nonNegotiables: string[];
  inFlight: string[];
  /** Setup answered in the user's own words instead of the three questions: kept
      verbatim in SETUP-CONTEXT.md, where the model reads it when it plans. */
  ownWords?: string;
  /** The active connection, written into the folder's config.json providers block.
      Null-tolerant: the flow guarantees it, the writer tolerates its absence. */
  connection: Connection | null;
  /** Replacing an earlier setup: its SETUP-CONTEXT.md and MASTER-PLAN.md move to
      archive/setup/ first. */
  startOver?: boolean;
  /** The whole day, 00:00–24:00 exactly once: the user's blocks plus Unplanned gaps. */
  dayShape: DayBlock[];
}

/** What an earlier setup interview left in a folder. */
export interface ExistingSetup {
  ownerName: string;
  addressAs: string;
  briefTime: string;
  closeTime: string;
  listMax: number;
  timezone?: string;
  /** The blocks the user named (Unplanned gaps left out). */
  dayShape?: DayBlock[];
}

/** Providers whose model list can be fetched live with the stored key. */
export type ListableModelProvider = "anthropic" | "openai";

interface DaybookBridge {
  pickFolder(): Promise<string | null>;
  loadSettings(userId: string): Promise<UserSettings>;
  saveSettings(userId: string, patch: Partial<UserSettings>): Promise<UserSettings>;
  writeSetup(payload: SetupPayload): Promise<string[]>;
  /** The earlier setup this folder holds, or null. */
  inspectFolder(folder: string): Promise<ExistingSetup | null>;
  /** Keeps the folder's setup as it is; records the AI choice in its config.json. */
  adoptSetup(folder: string, connection: Connection | null): Promise<string[]>;
  /** Records a switched model in the folder's config.json. */
  recordConnection(folder: string, connection: Connection): Promise<string[]>;
  storeSecret(name: string, value: string): Promise<boolean>;
  loadSecret(name: string): Promise<string | null>;
  deleteSecret(name: string): Promise<boolean>;
  /** Today's brief for this folder — built, verified and rendered by the runner. */
  brief(folder: string): Promise<BriefResult>;
  /** Asks the chosen model to plan today; the runner writes DAY-STATE.md after the checks. */
  planDay(folder: string, userId: string): Promise<PlanOutcome>;
  /** The same from something the user told Daybook — proposed, written only on applyPlan. */
  proposeDay(folder: string, userId: string, message: string): Promise<PlanOutcome>;
  applyPlan(proposalId: string): Promise<PlanOutcome>;
  discardPlan(proposalId: string): Promise<boolean>;
  /** Installs and loads the tick and watchdog launchd jobs for this folder. */
  scheduleStart(folder: string): Promise<ScheduleResult>;
  /** Unloads and removes them, so nothing comes back at the next login. */
  scheduleStop(): Promise<{ ok: true }>;
  scheduleStatus(): Promise<SystemStatus>;
  readSchedule(folder: string): Promise<DaySettings>;
  setSchedule(folder: string, day: DaySettings): Promise<DaySettings>;
  revealFolder(folder: string): Promise<boolean>;
  revealLog(file: string): Promise<boolean>;
  /** Claude Code and Codex: found or not, and whether each is signed in. */
  detectCli(): Promise<CliStatus[]>;
  /** The models Codex's sign-in can use (Claude Code's are a catalog: models.ts). */
  listCliModels(name: "codex"): Promise<ModelOption[]>;
  openExternal(url: string): Promise<boolean>;
  /** Listens on 127.0.0.1 for one Google sign-in; returns the redirect URL for Supabase. */
  startAuthLoopback(): Promise<string>;
  /** Models the stored key can call. Only for listable providers. */
  listModels(provider: ListableModelProvider, secret: string): Promise<ModelOption[]>;
  /** Name/path the OS reports as the daybook:// handler; empty when none. */
  protocolHandler(): Promise<string>;
  /** Light, dark, or following the Mac — for the whole app, the brief included. */
  getAppearance(): Promise<Appearance>;
  setAppearance(value: Appearance): Promise<Appearance>;
  /** Returns the unsubscribe. */
  onAuthCallback(callback: (url: string) => void): () => void;
}

const bridge = (window as { daybook?: DaybookBridge }).daybook ?? null;

/** True when running inside the Electron shell; false in a plain browser tab. */
export const isDesktop = bridge !== null;

if (!bridge) {
  const saved = localStorage.getItem("daybook.appearance");
  if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
}

const LS_KEY = "daybook.users";

export type Appearance = "system" | "light" | "dark";

/* In a browser tab there is no Electron to set the colour scheme, so the page's own
   data-theme attribute stands in (the brief's frame keeps following the system). */
function browserAppearance(): Appearance {
  const saved = localStorage.getItem("daybook.appearance");
  return saved === "light" || saved === "dark" ? saved : "system";
}

function browserUsers(): Record<string, UserSettings> {
  try {
    return (JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as Record<string, UserSettings>) ?? {};
  } catch {
    return {};
  }
}

async function refuse(what: string): Promise<never> {
  throw new Error(
    `${what} needs the Daybook app (the browser preview cannot touch your machine).`,
  );
}

export const daybook: DaybookBridge = bridge ?? {
  pickFolder: () => refuse("Choosing a folder"),
  loadSettings: async (userId) => browserUsers()[userId] ?? {},
  saveSettings: async (userId, patch) => {
    const users = browserUsers();
    const next = { ...(users[userId] ?? {}), ...patch };
    localStorage.setItem(LS_KEY, JSON.stringify({ ...users, [userId]: next }));
    return next;
  },
  writeSetup: () => refuse("Writing the setup files"),
  inspectFolder: async () => null,
  adoptSetup: () => refuse("Writing the setup files"),
  recordConnection: () => refuse("Writing config.json"),
  storeSecret: () => refuse("Storing a key in the keychain"),
  loadSecret: async () => null,
  deleteSecret: async () => true,
  // A browser tab cannot start the runner; it reads one started by hand (runner/README.md).
  brief: () => fetchBriefFromRunner(),
  planDay: () => refuse("Planning the day"),
  proposeDay: () => refuse("Planning the day"),
  applyPlan: () => refuse("Writing the day state"),
  discardPlan: async () => true,
  scheduleStart: async () => ({ ok: false, code: "NEEDS_APP", message: "The background jobs need the Daybook app." }),
  scheduleStop: async () => ({ ok: true }),
  scheduleStatus: () => refuse("Reading what Daybook runs"),
  readSchedule: () => refuse("Reading config.json"),
  setSchedule: () => refuse("Writing config.json"),
  revealFolder: () => refuse("Opening the folder"),
  revealLog: () => refuse("Opening the logs"),
  detectCli: async () => [],
  listCliModels: () => refuse("Asking Codex for its models"),
  openExternal: (url) => {
    window.open(url, "_blank", "noopener");
    return Promise.resolve(true);
  },
  listModels: () => refuse("Listing a provider's models"),
  startAuthLoopback: () => refuse("Listening for the sign-in"),
  protocolHandler: async () => "",
  getAppearance: async () => browserAppearance(),
  setAppearance: async (value) => {
    localStorage.setItem("daybook.appearance", value);
    if (value === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = value;
    return value;
  },
  /* In a browser, Supabase handles the redirect itself. */
  onAuthCallback: () => () => {},
};
