/* Typed access to the Electron bridge, with plain-browser fallbacks so the same
   renderer runs in a browser tab during development. The fallbacks keep what the
   browser can honestly do (settings in localStorage) and refuse what it cannot
   (folder access, keychain, outbound links) instead of pretending. */

import type { DayBlock } from "@/lib/dayShape";

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
}

/** The keychain entry for one account's API-key connection. */
export function secretName(userId: string, connectionId: string): string {
  return `user/${userId}/provider/${connectionId}`;
}

export interface SetupPayload {
  folder: string;
  ownerName: string;
  addressAs: string;
  timezone: string;
  briefTime: string;
  closeTime: string;
  goals: string[];
  nonNegotiables: string[];
  inFlight: string[];
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
  /** Claude Code and Codex: found or not, and whether each is signed in. */
  detectCli(): Promise<CliStatus[]>;
  /** The models Codex's sign-in can use (Claude Code's are a catalog: models.ts). */
  listCliModels(name: "codex"): Promise<ModelOption[]>;
  openExternal(url: string): Promise<boolean>;
  /** Models the stored key can call. Only for listable providers. */
  listModels(provider: ListableModelProvider, secret: string): Promise<ModelOption[]>;
  /** Name/path the OS reports as the daybook:// handler; empty when none. */
  protocolHandler(): Promise<string>;
  /** Returns the unsubscribe. */
  onAuthCallback(callback: (url: string) => void): () => void;
}

const bridge = (window as { daybook?: DaybookBridge }).daybook ?? null;

/** True when running inside the Electron shell; false in a plain browser tab. */
export const isDesktop = bridge !== null;

const LS_KEY = "daybook.users";

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
  detectCli: async () => [],
  listCliModels: () => refuse("Asking Codex for its models"),
  openExternal: (url) => {
    window.open(url, "_blank", "noopener");
    return Promise.resolve(true);
  },
  listModels: () => refuse("Listing a provider's models"),
  protocolHandler: async () => "",
  /* In a browser, Supabase handles the redirect itself. */
  onAuthCallback: () => () => {},
};
