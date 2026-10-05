/* Daybook — Electron main process.
   The only place Node and Electron APIs exist. The renderer speaks HTTP to 127.0.0.1
   and to this IPC bridge, never to the filesystem directly, so it stays runnable in a
   plain browser and wrappable in another shell. */

const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, nativeTheme } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const crypto = require("node:crypto");
const cli = require("./cli.cjs");
const runner = require("./runner.cjs");
const authLoopback = require("./authLoopback.cjs");
const schedule = require("./schedule.cjs");

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? "";
const PROTOCOL = "daybook";

/* Renderer console output lands in the terminal that launched the app. The init and
   auth breadcrumbs are how a stalled step gets found without opening DevTools. */
app.commandLine.appendSwitch("enable-logging");

/* DAYBOOK_USER_DATA points the app at a different app-data directory — a first run
   on a clean machine, without touching the real one. Must precede everything that
   reads userData, including the single-instance lock. */
if (process.env.DAYBOOK_USER_DATA) {
  app.setPath("userData", path.resolve(process.env.DAYBOOK_USER_DATA));
} else if (app.isPackaged) {
  /* The installed app keeps its own app data, ~/Library/Application Support/Daybook —
     Electron would otherwise name it after package.json's "daybook-app" and share it
     with a development copy on the same Mac. */
  app.setName("Daybook");
  app.setPath("userData", path.join(app.getPath("appData"), "Daybook"));
}

/* ---------- app-data JSON files (atomic temp+rename, never in the user's folder) ---------- */

const settingsPath = () => path.join(app.getPath("userData"), "settings.json");
const secretsPath = () => path.join(app.getPath("userData"), "secrets.json");

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fsp.rename(tmp, file);
}

async function writeTextAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, text, "utf8");
  await fsp.rename(tmp, file);
}

/* ---------- appearance: light, dark, or the Mac's own setting ----------
   One switch for the whole app. Electron's themeSource sets prefers-color-scheme for every
   page it shows, the brief's frame included, and for the native controls, so nothing
   else needs telling. Kept beside the accounts in settings.json: it belongs to the Mac,
   not to an account. */

const APPEARANCES = ["system", "light", "dark"];

function canvasColour() {
  return nativeTheme.shouldUseDarkColors ? "#121416" : "#f2f3ef";
}

function applyAppearance(value) {
  nativeTheme.themeSource = APPEARANCES.includes(value) ? value : "system";
  if (win && !win.isDestroyed()) win.setBackgroundColor(canvasColour());
  return nativeTheme.themeSource;
}

ipcMain.handle("appearance:get", () => nativeTheme.themeSource);

ipcMain.handle("appearance:set", (_event, value) =>
  serially(async () => {
    if (!APPEARANCES.includes(value)) throw new Error("Appearance is system, light or dark.");
    const store = await readStore();
    await writeJsonAtomic(settingsPath(), { ...store, appearance: value });
    return applyAppearance(value);
  }),
);

/* ---------- window ---------- */

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1020,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    title: "Daybook",
    backgroundColor: canvasColour(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.on("closed", () => {
    win = null;
  });
  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

/* Google's browser flow has to come back into the app. The OS browser opens the
   Supabase authorize page; Supabase redirects to daybook://auth with the tokens, and
   macOS delivers that here via open-url. Only the https scheme is ever opened outbound. */

let pendingAuthUrl = null;

/* The callback's fragment carries the session tokens; logs get everything else. */
function loggable(rawUrl) {
  return rawUrl.includes("#") ? `${rawUrl.split("#")[0]}#(tokens withheld)` : rawUrl;
}

function forwardAuthUrl(rawUrl) {
  if (win && !win.isDestroyed()) {
    win.webContents.send("daybook:auth-callback", rawUrl);
  } else {
    // Arrived before the window existed (cold start) — deliver once it has loaded.
    pendingAuthUrl = rawUrl;
  }
}

/* An unsigned app opened from Downloads or the disk image is run by macOS from a
   temporary, read-only copy that changes every launch — and the brief's launchd jobs
   would point at a path that is gone tomorrow. So the packaged app offers to move itself
   into Applications first, and installs no jobs until it lives there. */
function outsideApplications() {
  return app.isPackaged && !process.env.DAYBOOK_USER_DATA && !app.isInApplicationsFolder();
}

async function offerMoveToApplications() {
  if (!outsideApplications()) return;
  const { response } = await dialog.showMessageBox({
    type: "question",
    buttons: ["Move to Applications", "Not now"],
    defaultId: 0,
    cancelId: 1,
    message: "Move Daybook to your Applications folder?",
    detail:
      "Your morning brief is written by Daybook even when it's closed, from wherever the app lives. " +
      "Opened from Downloads or the disk image, it can't find its way back tomorrow.",
  });
  if (response !== 0) return;
  try {
    app.moveToApplicationsFolder(); // relaunches from Applications when it succeeds
  } catch (err) {
    dialog.showErrorBox("Daybook couldn't move itself", `${err.message ?? err}\n\nDrag Daybook into Applications, then open it from there.`);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (url) {
      console.log(`[daybook] auth callback via second-instance: ${loggable(url)}`);
      forwardAuthUrl(url);
    }
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    console.log(`[daybook] auth callback via open-url: ${loggable(url)}`);
    forwardAuthUrl(url);
  });

  app.whenReady().then(async () => {
    // The packaged app's icon comes from its bundle; in development the dock shows the
    // same mark instead of Electron's.
    if (!app.isPackaged && process.platform === "darwin") {
      const icon = path.join(__dirname, "..", "resources", "icon.png");
      if (fs.existsSync(icon)) app.dock.setIcon(icon);
    }
    applyAppearance((await readJson(settingsPath()))?.appearance);
    await offerMoveToApplications();
    // Register in dev too, so the Google round-trip can be tested before packaging.
    const registered = process.defaultApp
      ? app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
          path.resolve(process.argv[1] ?? "."),
        ])
      : app.setAsDefaultProtocolClient(PROTOCOL);
    console.log(
      `[daybook] ${PROTOCOL}:// handler ${registered ? "registered" : "NOT registered"} — dev binary: ${process.execPath}`,
    );
    createWindow();
    if (pendingAuthUrl && win) {
      win.webContents.once("did-finish-load", () => {
        win.webContents.send("daybook:auth-callback", pendingAuthUrl);
        pendingAuthUrl = null;
      });
    }
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  app.quit();
});

// The runner dies with the app — nothing of ours stays resident after a quit.
app.on("will-quit", () => runner.stop());

/* ---------- IPC: settings (the app's own state, one record per account) ----------
   Keyed by the account's user id, never its email: an account deleted and re-created
   with the same address is a new account and walks onboarding from the start. The
   pre-account file (one record for the whole Mac) belongs to nobody, so it is set
   aside on first read — every account onboards once. */

const USER_ID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|dev-[^\s/]+@[^\s/]+)$/i;

function requireUserId(userId) {
  if (typeof userId !== "string" || !USER_ID.test(userId)) {
    throw new Error("Settings need the signed-in account's id.");
  }
  return userId;
}

async function readStore() {
  const raw = await readJson(settingsPath());
  if (raw && raw.version === 2 && raw.users && typeof raw.users === "object") return raw;
  if (raw) {
    console.log(
      `[daybook] settings: setting aside the pre-account record (${Object.keys(raw).join(", ")}) — each account onboards once`,
    );
  }
  return { version: 2, users: {} };
}

/* Saves are read-modify-write on one file; run them one at a time so two saves
   landing together cannot drop each other's changes. */
let settingsQueue = Promise.resolve();
function serially(task) {
  const run = settingsQueue.then(task, task);
  settingsQueue = run.catch(() => {});
  return run;
}

ipcMain.handle("settings:load", async (_event, userId) => {
  const store = await readStore();
  return store.users[requireUserId(userId)] ?? {};
});

ipcMain.handle("settings:save", (_event, { userId, patch }) =>
  serially(async () => {
    const id = requireUserId(userId);
    const store = await readStore();
    const next = { ...(store.users[id] ?? {}), ...(patch ?? {}) };
    await writeJsonAtomic(settingsPath(), { ...store, version: 2, users: { ...store.users, [id]: next } });
    return next;
  }),
);

/* ---------- IPC: folder ---------- */

ipcMain.handle("folder:pick", async () => {
  const result = await dialog.showOpenDialog(win, {
    title: "Choose the folder for your secretary",
    buttonLabel: "Use this folder",
    properties: ["openDirectory", "createDirectory"],
    defaultPath: path.join(os.homedir(), "Secretary"),
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const folder = result.filePaths[0];
  await fsp.access(folder, fs.constants.W_OK);
  return folder;
});

/* The setup interview's answers become plain files in the folder — readable with no app
   installed. Existing files are never clobbered: markdown seeds are only written if
   absent, and config.json is merged key-by-key so hand edits survive. */

function configAlias(folder) {
  const home = os.homedir();
  return folder.startsWith(home) ? `~${folder.slice(home.length)}` : folder;
}

function seedConfig(existing, payload) {
  const next = { ...(existing ?? {}) };
  next.owner = {
    ...(next.owner ?? {}),
    name: payload.ownerName,
    address_as: payload.addressAs,
    timezone: payload.timezone,
  };
  next.schedule = {
    ...(next.schedule ?? {}),
    brief_time: payload.briefTime,
    close_time: payload.closeTime,
  };
  next.daily_list = { ...(next.daily_list ?? {}), max_items: requireListMax(payload.listMax) };
  next.scope = {
    ...(next.scope ?? {}),
    root: configAlias(payload.folder),
    allow_outside_root: false,
    shell_actions_enabled: false,
  };
  if (!coversDayOnce(payload.dayShape)) {
    throw new Error("The day shape must cover the whole day exactly once — nothing was written.");
  }
  next.day_shape = payload.dayShape.map((b) => ({ block: b.block, start: b.start, end: b.end }));
  return withProvider(next, payload.connection);
}

/* How many things today's list may hold — law 8's number, the user's to set. The runner
   holds the same range (folder.py) and falls back to 3 for anything outside it. */
const LIST_MAX_DEFAULT = 3;
function listMaxOf(value) {
  return Number.isInteger(value) && value >= 1 && value <= 10 ? value : null;
}
function requireListMax(value) {
  const max = listMaxOf(value);
  if (max === null) throw new Error("Today's list holds from 1 to 10 things — nothing was written.");
  return max;
}

/* The brief's dial asserts its day shape covers 00:00–24:00 contiguously (V2). The setup
   step fills the gaps as Unplanned; this refuses anything that would still fail, before
   it reaches the folder. A block ending at or before its start runs past midnight. */
function coversDayOnce(shape) {
  if (!Array.isArray(shape) || shape.length === 0) return false;
  const minutes = (hhmm) => {
    const match = /^(\d{2}):(\d{2})$/.exec(String(hhmm));
    return match && +match[1] < 24 && +match[2] < 60 ? +match[1] * 60 + +match[2] : NaN;
  };
  const count = new Array(1440).fill(0);
  for (const block of shape) {
    if (!block || typeof block.block !== "string" || !block.block.trim()) return false;
    const start = minutes(block.start);
    const end = minutes(block.end);
    if (Number.isNaN(start) || Number.isNaN(end)) return false;
    const ranges = end > start ? [[start, end]] : [[start, 1440], [0, end]];
    for (const [from, to] of ranges) for (let m = from; m < to; m++) count[m] += 1;
  }
  return count.every((c) => c === 1);
}

/* A model id reaches a CLI as an argument at invocation time, so it is held to a plain
   shape here, where it enters the folder: letters, digits and . _ : / - only. */
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

/* The active connection leads; other provider records the folder already had stay behind
   it. An API key stays in the app's keychain store and is handed over at invocation, so
   the folder records no pointer to it (and older records lose theirs). */
function withProvider(config, connection) {
  if (!connection) return config;
  const c = connection;
  if (c.model && !MODEL_ID.test(c.model)) {
    throw new Error(`"${c.model}" is not a model id Daybook can pass on.`);
  }
  const record = {
    id: c.id,
    label: c.label,
    authKind: c.authKind,
    ...(c.cliBinary ? { binary: c.cliBinary } : {}),
    ...(c.binaryPath ? { binary_path: c.binaryPath } : {}),
    ...(c.model ? { model: c.model } : {}),
    ...(c.modelLabel ? { model_label: c.modelLabel } : {}),
  };
  const existingProviders = (Array.isArray(config.providers) ? config.providers : [])
    .filter((p) => p && p.id !== c.id)
    .map(({ keychain_ref: _dropped, ...rest }) => rest);
  return { ...config, providers: [record, ...existingProviders] };
}

/* A folder the user picked, as the renderer reports it: absolute, and a directory. */
function requireFolder(folder) {
  let usable = false;
  try {
    usable = typeof folder === "string" && path.isAbsolute(folder) && fs.statSync(folder).isDirectory();
  } catch {
    usable = false;
  }
  if (!usable) throw new Error("That is not a folder Daybook can use.");
  return folder;
}

/* What an earlier setup left in this folder, or null. An owner name in config.json is the
   mark of a finished setup interview — the one field the interview always writes. */
async function existingSetup(folder) {
  const config = await readJson(path.join(folder, "config.json"));
  if (!config?.owner?.name) return null;
  return {
    ownerName: String(config.owner.name),
    addressAs: config.owner.address_as ? String(config.owner.address_as) : "",
    briefTime: config.schedule?.brief_time ? String(config.schedule.brief_time) : "09:00",
    closeTime: config.schedule?.close_time ? String(config.schedule.close_time) : "23:00",
    listMax: listMaxOf(config.daily_list?.max_items) ?? LIST_MAX_DEFAULT,
    ...(config.owner.timezone ? { timezone: String(config.owner.timezone) } : {}),
    // The blocks the user named; the Unplanned gaps are recomputed when they save again.
    dayShape: (Array.isArray(config.day_shape) ? config.day_shape : [])
      .filter((b) => b && b.block !== "Unplanned")
      .map((b) => ({ block: String(b.block), start: String(b.start), end: String(b.end) })),
  };
}

/* Today's date where the user lives — the zone chosen in setup — not in UTC, which is
   a day off for everyone east or west of it around midnight. */
function today(timeZone) {
  const options = { year: "numeric", month: "2-digit", day: "2-digit" };
  try {
    return new Intl.DateTimeFormat("en-CA", { ...options, timeZone: timeZone || undefined }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", options).format(new Date()); // an unknown zone: this Mac's
  }
}

function seedsFor(payload) {
  const alias = configAlias(payload.folder);
  const ownWords = typeof payload.ownWords === "string" ? payload.ownWords.trim().slice(0, 20000) : "";
  const list = (items) =>
    items.filter((line) => line.trim().length > 0).map((line) => `- ${line.trim()}`).join("\n") ||
    "- (nothing recorded yet)";

  return [
    {
      file: "config.json",
      merge: (existing) => JSON.stringify(seedConfig(existing, payload), null, 2) + "\n",
      onlyIfAbsent: false,
    },
    {
      file: "SETUP-CONTEXT.md",
      onlyIfAbsent: true,
      text: ownWords
        ? `# Setup context

Written by Daybook on ${today(payload.timezone)} from the setup interview, in the user's own
words, kept exactly as they wrote it. It is the secretary's starting picture of this life;
the files in this folder are the source of truth.

## In their own words

${ownWords}
`
        : `# Setup context

Written by Daybook on ${today(payload.timezone)} from the setup interview. The answers below are the
secretary's starting picture of this life; the files in this folder are the source of truth.

## Working toward

${list(payload.goals)}

## Non-negotiables

${list(payload.nonNegotiables)}

## In flight — waiting on other people

${list(payload.inFlight)}
`,
    },
    {
      file: "MASTER-PLAN.md",
      onlyIfAbsent: true,
      text: `# Master plan

Started ${today(payload.timezone)} from the Daybook setup interview. Strategy lives here; what is true
*now* lives in DAY-STATE.md.

## Goals

${ownWords ? "- (in SETUP-CONTEXT.md, in the user's own words — the secretary works from there)" : list(payload.goals)}
`,
    },
    {
      file: "DAY-STATE.md",
      onlyIfAbsent: true,
      text: `# Day state — ${today(payload.timezone)}

Nothing has been recorded about a day yet. The nightly close writes this file from what
actually happened; nothing here is invented to fill the page.
`,
    },
    {
      file: "LOG.md",
      onlyIfAbsent: true,
      text: `# Log

Append-only. What happened, in sequence — not what was intended.

- ${today(payload.timezone)} — Daybook connected to this folder.
`,
    },
    {
      file: "CORRECTIONS.md",
      onlyIfAbsent: true,
      text: `# Corrections

Append-only, never pruned. Every time the system got something wrong about this life, the
correction and the rule it produced are recorded here. A correction that is deleted is a
mistake waiting to be repeated.
`,
    },
  ];
}

/* Starting over replaces what the interview wrote, never what the days wrote: the previous
   SETUP-CONTEXT.md and MASTER-PLAN.md move to archive/setup/<stamp>/ first, and
   DAY-STATE.md, LOG.md and CORRECTIONS.md stay exactly as they are. */
const REDONE_BY_START_OVER = ["SETUP-CONTEXT.md", "MASTER-PLAN.md"];

async function archivePreviousSetup(folder) {
  const present = REDONE_BY_START_OVER.filter((file) => fs.existsSync(path.join(folder, file)));
  if (present.length === 0) return null;
  const relative = `archive/setup/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await fsp.mkdir(path.join(folder, relative), { recursive: true });
  for (const file of present) {
    await fsp.rename(path.join(folder, file), path.join(folder, relative, file));
  }
  return { relative, files: present };
}

async function appendLine(file, line) {
  const current = await fsp.readFile(file, "utf8");
  await writeTextAtomic(file, `${current.replace(/\n*$/, "\n")}${line}\n`);
}

ipcMain.handle("folder:inspect", async (_event, folder) => existingSetup(requireFolder(folder)));

/* "Use this setup": the folder's files stay exactly as they are; only the AI choice made in
   this onboarding is recorded in config.json, where the runner reads it. */
ipcMain.handle("folder:adoptSetup", async (_event, { folder, connection }) => {
  const target = path.join(requireFolder(folder), "config.json");
  const existing = await readJson(target);
  if (!existing?.owner?.name) {
    throw new Error("This folder has no setup to use — answer the questions instead.");
  }
  await writeTextAtomic(target, `${JSON.stringify(withProvider(existing, connection), null, 2)}\n`);
  return ["config.json"];
});

/* A model switched from the scoreboard: the folder's config.json follows, so the choice
   outlives the app. Everything else in the file is left as it is. */
ipcMain.handle("folder:recordConnection", async (_event, { folder, connection }) => {
  const target = path.join(requireFolder(folder), "config.json");
  const existing = (await readJson(target)) ?? {};
  await writeTextAtomic(target, `${JSON.stringify(withProvider(existing, connection), null, 2)}\n`);
  return ["config.json"];
});

ipcMain.handle("folder:writeSetup", async (_event, payload) => {
  const folder = requireFolder(payload?.folder);
  const archived = payload.startOver ? await archivePreviousSetup(folder) : null;
  const written = [];
  for (const seed of seedsFor(payload)) {
    const target = path.join(folder, seed.file);
    if (seed.file !== "config.json" && fs.existsSync(target) && seed.onlyIfAbsent) continue;
    if (seed.merge) {
      const existing = await readJson(target);
      await writeTextAtomic(target, seed.merge(existing));
    } else {
      await writeTextAtomic(target, seed.text);
    }
    written.push(seed.file);
  }
  if (archived) {
    const previous = archived.files.join(" and ");
    await appendLine(
      path.join(folder, "LOG.md"),
      `- ${today(payload.timezone)} — Setup redone; the previous ${previous} moved to ${archived.relative}/.`,
    );
    written.push(`${archived.relative}/ — the previous ${previous}`);
  }
  return written;
});

/* ---------- IPC: secrets (safeStorage → the OS keychain; the blob never leaves app data) ---------- */

async function readSecrets() {
  return (await readJson(secretsPath())) ?? {};
}

ipcMain.handle("secret:store", async (_event, { name, value }) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("The OS keychain is not available; refusing to store the key in a plain file.");
  }
  const secrets = await readSecrets();
  secrets[name] = safeStorage.encryptString(value).toString("base64");
  await writeJsonAtomic(secretsPath(), secrets);
  return true;
});

async function secretValue(name) {
  const secrets = await readSecrets();
  const blob = secrets[name];
  if (!blob || !safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.decryptString(Buffer.from(blob, "base64"));
}

ipcMain.handle("secret:load", async (_event, { name }) => secretValue(name));

ipcMain.handle("secret:delete", async (_event, { name }) => {
  const secrets = await readSecrets();
  delete secrets[name];
  await writeJsonAtomic(secretsPath(), secrets);
  return true;
});

/* ---------- IPC: model listing for API-key connections ----------
   The key never leaves the main process: this fetches the provider's own
   /v1/models with the stored key and returns plain model IDs. */

const MODEL_ENDPOINTS = {
  anthropic: {
    url: "https://api.anthropic.com/v1/models",
    headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
  },
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
};

ipcMain.handle("connections:listModels", async (_event, { provider, secret }) => {
  const endpoint = MODEL_ENDPOINTS[provider];
  if (!endpoint) {
    throw new Error(`Live model listing is not available for ${provider} — type a model ID instead.`);
  }
  const key = await secretValue(secret);
  if (!key) {
    throw new Error("This connection's key is no longer in the keychain — reconnect it first.");
  }
  const response = await fetch(endpoint.url, { headers: endpoint.headers(key) });
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "The provider rejected the stored key — reconnect with a fresh key."
        : `The provider answered ${response.status}. Try again later, or type a model ID.`,
    );
  }
  const body = await response.json();
  // OpenAI's list also carries embedding, audio and image models the secretary cannot use.
  const notChat = /embedding|whisper|tts|dall-e|moderation|audio|realtime|transcribe|image|search/i;
  return (body.data ?? body.models ?? [])
    .map((m) => ({ id: m.id ?? m.name, label: m.display_name ?? m.id ?? m.name }))
    .filter((m) => typeof m.id === "string" && !notChat.test(m.id))
    .sort((a, b) => a.label.localeCompare(b.label));
});

/* ---------- IPC: today's brief, from the runner ----------
   Built, verified and rendered by runner/; the rendered page comes back only when all
   eleven assertions passed. Failures come back as data the scoreboard states plainly. */

ipcMain.handle("brief:get", async (_event, folder) => {
  const logFile = path.join(app.getPath("userData"), "logs", "runner.log");
  try {
    return { ok: true, logFile, ...(await runner.brief(requireFolder(folder), logFile, stateDir())) };
  } catch (err) {
    return { ok: false, logFile, code: err.code ?? "RUNNER_FAILED", message: String(err.message ?? err) };
  }
});

/* ---------- IPC: the chosen model plans the day ----------
   runner/daybook/plan.py: the model proposes, the runner writes DAY-STATE.md only after
   the eleven checks pass. "Plan today" plans and writes; a message ("tell your
   secretary") proposes first, and the proposal waits here — the day state's text never
   round-trips through the renderer — until the user applies it, when it is checked
   again. One run at a time. */

let planning = false;
let pending = null; // { id, folder, outcome } — the proposal awaiting the user's answer

function shownToRenderer(outcome, proposalId) {
  const { candidate: _candidate, base: _base, checks: _checks, ...shown } = outcome;
  return proposalId ? { ...shown, proposalId } : shown;
}

ipcMain.handle("plan:run", async (_event, { folder, userId, message, propose }) => {
  if (planning) {
    return { status: "failed", detail: "Your secretary is already planning — try again in a moment.", summary: "", flags: [], model: "" };
  }
  const target = requireFolder(folder);
  planning = true;
  try {
    const config = (await readJson(path.join(target, "config.json"))) ?? {};
    const provider = Array.isArray(config.providers) ? config.providers[0] : null;
    const secret =
      provider?.authKind === "api_key" && typeof userId === "string"
        ? await secretValue(`user/${userId}/provider/${provider.id}`)
        : null;
    const outcome = await runner.plan(target, {
      stateDir: stateDir(),
      logFile: path.join(logDir(), "runner.log"),
      message: typeof message === "string" ? message.slice(0, 4000) : "",
      secret,
      propose: Boolean(propose),
    });
    if (outcome.status !== "proposed") return shownToRenderer(outcome);
    pending = { id: crypto.randomUUID(), folder: target, outcome };
    return shownToRenderer(outcome, pending.id);
  } catch (err) {
    return { status: "failed", detail: String(err.message ?? err), summary: "", flags: [], model: "" };
  } finally {
    planning = false;
  }
});

ipcMain.handle("plan:apply", async (_event, { proposalId }) => {
  if (!pending || pending.id !== proposalId) {
    return { status: "refused", detail: "That proposal is no longer waiting — send your message again.", summary: "", flags: [], model: "" };
  }
  const { folder, outcome } = pending;
  pending = null;
  try {
    const applied = await runner.applyPlan(folder, outcome, {
      stateDir: stateDir(),
      logFile: path.join(logDir(), "runner.log"),
    });
    return shownToRenderer(applied);
  } catch (err) {
    return { status: "failed", detail: String(err.message ?? err), summary: "", flags: [], model: "" };
  }
});

ipcMain.handle("plan:discard", async (_event, { proposalId }) => {
  if (pending?.id === proposalId) pending = null;
  return true;
});

/* ---------- IPC: the background jobs and Settings & status ----------
   One documented place for everything Daybook writes outside the user's folder:
   app data — logs/ (runner, tick, watchdog) and state/ (the tick's bookkeeping). */

const logDir = () => path.join(app.getPath("userData"), "logs");
const stateDir = () => path.join(app.getPath("userData"), "state");

ipcMain.handle("schedule:start", async (_event, folder) => {
  if (outsideApplications()) {
    return { ok: false, code: "NOT_IN_APPLICATIONS", message: "Daybook isn't in your Applications folder yet — move it there (and open it from there) so your brief can arrive on its own." };
  }
  const python = await runner.findPython();
  if (!python) {
    return { ok: false, code: "PYTHON_MISSING", message: "Python 3.9 or newer is needed for the brief to arrive on its own, and none was found on this Mac." };
  }
  try {
    await schedule.start({
      python: python.binary,
      runnerDir: runner.runnerDir(),
      folder: requireFolder(folder),
      stateDir: stateDir(),
      logDir: logDir(),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, code: "LAUNCHD_FAILED", message: String(err.message ?? err) };
  }
});

ipcMain.handle("schedule:stop", async () => {
  await schedule.stop();
  return { ok: true };
});

ipcMain.handle("schedule:status", async () => {
  const sidecar = runner.info();
  return {
    ...(await schedule.status({ stateDir: stateDir(), logDir: logDir() })),
    app: { pid: process.pid, name: app.getName() },
    runner: sidecar ? { ...sidecar, log: path.join(logDir(), "runner.log") } : null,
    logDir: logDir(),
  };
});

/* The brief and close times and the size of today's list, edited from Settings: merged
   into config.json, where the tick reads them at its next run. */
ipcMain.handle("folder:setSchedule", async (_event, { folder, briefTime, closeTime, listMax }) => {
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hhmm.test(String(briefTime)) || !hhmm.test(String(closeTime))) {
    throw new Error("Times must be HH:MM, 24-hour.");
  }
  const max = requireListMax(listMax);
  const target = path.join(requireFolder(folder), "config.json");
  const existing = (await readJson(target)) ?? {};
  const next = {
    ...existing,
    schedule: { ...(existing.schedule ?? {}), brief_time: briefTime, close_time: closeTime },
    daily_list: { ...(existing.daily_list ?? {}), max_items: max },
  };
  await writeTextAtomic(target, `${JSON.stringify(next, null, 2)}\n`);
  return { briefTime, closeTime, listMax: max };
});

ipcMain.handle("folder:schedule", async (_event, folder) => {
  const config = (await readJson(path.join(requireFolder(folder), "config.json"))) ?? {};
  return {
    briefTime: config.schedule?.brief_time ?? "09:00",
    closeTime: config.schedule?.close_time ?? "23:00",
    listMax: listMaxOf(config.daily_list?.max_items) ?? LIST_MAX_DEFAULT,
  };
});

ipcMain.handle("shell:revealFolder", async (_event, folder) => {
  const error = await shell.openPath(requireFolder(folder));
  if (error) throw new Error(error);
  return true;
});

// Only Daybook's own log directory can be revealed from here.
ipcMain.handle("shell:revealLog", async (_event, file) => {
  const resolved = path.resolve(String(file));
  if (!resolved.startsWith(logDir() + path.sep)) throw new Error("Not one of Daybook's logs.");
  fs.mkdirSync(logDir(), { recursive: true });
  if (fs.existsSync(resolved)) shell.showItemInFolder(resolved);
  else await shell.openPath(logDir());
  return true;
});

/* ---------- IPC: local CLIs — found, asked whether signed in, asked for models ----------
   Everything runs through cli.cjs with fixed commands; the renderer only names the CLI. */

ipcMain.handle("cli:detect", () => cli.detect());

ipcMain.handle("cli:models", (_event, name) => {
  if (name !== "codex") throw new Error("Only Codex can list its models; Claude Code's are a fixed catalog.");
  return cli.codexModels();
});

/* ---------- IPC: outbound links (https only — the renderer never opens targets itself) ---------- */

/* ---------- IPC: Google sign-in's return path (a one-sign-in loopback listener) ---------- */

ipcMain.handle("auth:loopback", () =>
  authLoopback.start((returnUrl) => {
    console.log(`[daybook] auth callback via loopback: ${loggable(returnUrl)}`);
    forwardAuthUrl(returnUrl);
    // The browser tab now says "you can close this"; the app is where the user continues.
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      app.focus({ steal: true });
    }
  }),
);

app.on("will-quit", () => authLoopback.stop());

ipcMain.handle("shell:openExternal", async (_event, url) => {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error(`Refused to open ${parsed.protocol} links.`);
  await shell.openExternal(url);
  return true;
});

/* ---------- IPC: diagnostics — what does the OS say handles daybook:// ? ---------- */

ipcMain.handle("protocol:handler", () => app.getApplicationNameForProtocol(`${PROTOCOL}://auth`));
