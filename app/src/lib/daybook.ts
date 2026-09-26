/* Typed access to the Electron bridge, with plain-browser fallbacks so the same
   renderer runs in a browser tab during development. The fallbacks keep what the
   browser can honestly do (settings in localStorage) and refuse what it cannot
   (folder access, keychain, outbound links) instead of pretending. */

export interface ProviderRecord {
  id: string;
  label: string;
  authKind: "api_key" | "local_cli";
  cliBinary?: string;
}

export interface AppSettings {
  folderPath?: string;
  provider?: ProviderRecord | null;
  setupCompleted?: boolean;
  accountEmail?: string;
  /** Display copy of the user's chosen brief time; config.json in the folder is authoritative. */
  briefTime?: string;
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
}

interface DaybookBridge {
  pickFolder(): Promise<string | null>;
  loadSettings(): Promise<AppSettings>;
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  writeSetup(payload: SetupPayload): Promise<string[]>;
  storeSecret(name: string, value: string): Promise<boolean>;
  loadSecret(name: string): Promise<string | null>;
  deleteSecret(name: string): Promise<boolean>;
  detectCli(): Promise<string[]>;
  openExternal(url: string): Promise<boolean>;
  /** Name/path the OS reports as the daybook:// handler; empty when none. */
  protocolHandler(): Promise<string>;
  onAuthCallback(callback: (url: string) => void): void;
}

const bridge = (window as { daybook?: DaybookBridge }).daybook ?? null;

/** True when running inside the Electron shell; false in a plain browser tab. */
export const isDesktop = bridge !== null;

const LS_KEY = "daybook.settings";

function browserSettings(): AppSettings {
  try {
    return (JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as AppSettings) ?? {};
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
  loadSettings: async () => browserSettings(),
  saveSettings: async (patch) => {
    const next = { ...browserSettings(), ...patch };
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    return next;
  },
  writeSetup: () => refuse("Writing the setup files"),
  storeSecret: () => refuse("Storing a key in the keychain"),
  loadSecret: async () => null,
  deleteSecret: async () => true,
  detectCli: async () => [],
  openExternal: (url) => {
    window.open(url, "_blank", "noopener");
    return Promise.resolve(true);
  },
  protocolHandler: async () => "",
  onAuthCallback: () => {
    /* In a browser, Supabase handles the redirect itself. */
  },
};
