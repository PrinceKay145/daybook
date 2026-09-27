/* Daybook — Electron main process.
   The only place Node and Electron APIs exist. The renderer speaks HTTP to 127.0.0.1
   and to this IPC bridge, never to the filesystem directly, so it stays runnable in a
   plain browser and wrappable in another shell. */

const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? "";
const PROTOCOL = "daybook";

/* Renderer console output lands in the terminal that launched the app. The init and
   auth breadcrumbs are how a stalled step gets found without opening DevTools. */
app.commandLine.appendSwitch("enable-logging");

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

/* ---------- window ---------- */

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1020,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    title: "Daybook",
    backgroundColor: "#f6f5f3",
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

function forwardAuthUrl(rawUrl) {
  if (win && !win.isDestroyed()) {
    win.webContents.send("daybook:auth-callback", rawUrl);
  } else {
    // Arrived before the window existed (cold start) — deliver once it has loaded.
    pendingAuthUrl = rawUrl;
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (url) {
      console.log(`[daybook] auth callback via second-instance: ${url}`);
      forwardAuthUrl(url);
    }
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    console.log(`[daybook] auth callback via open-url: ${url}`);
    forwardAuthUrl(url);
  });

  app.whenReady().then(() => {
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

/* ---------- IPC: settings (the app's own state — folder choice, provider record) ---------- */

ipcMain.handle("settings:load", () => readJson(settingsPath()) ?? {});

ipcMain.handle("settings:save", async (_event, patch) => {
  const current = (await readJson(settingsPath())) ?? {};
  const next = { ...current, ...(patch ?? {}) };
  await writeJsonAtomic(settingsPath(), next);
  return next;
});

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
  next.scope = {
    ...(next.scope ?? {}),
    root: configAlias(payload.folder),
    allow_outside_root: false,
    shell_actions_enabled: false,
  };
  if (payload.connection) {
    // The active connection leads; other provider records the folder already had stay behind it.
    const c = payload.connection;
    const record = {
      id: c.id,
      label: c.label,
      authKind: c.authKind,
      ...(c.cliBinary ? { binary: c.cliBinary } : {}),
      ...(c.model ? { model: c.model } : {}),
      ...(c.authKind === "api_key" ? { keychain_ref: `provider/${c.id}` } : {}),
    };
    const existingProviders = Array.isArray(existing?.providers) ? existing.providers : [];
    next.providers = [record, ...existingProviders.filter((p) => p && p.id !== c.id)];
  }
  return next;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function seedsFor(payload) {
  const alias = configAlias(payload.folder);
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
      text: `# Setup context

Written by Daybook on ${today()} from the setup interview. The answers below are the
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

Started ${today()} from the Daybook setup interview. Strategy lives here; what is true
*now* lives in DAY-STATE.md.

## Goals

${list(payload.goals)}
`,
    },
    {
      file: "DAY-STATE.md",
      onlyIfAbsent: true,
      text: `# Day state — ${today()}

Nothing has been recorded about a day yet. The nightly close writes this file from what
actually happened; nothing here is invented to fill the page.
`,
    },
    {
      file: "LOG.md",
      onlyIfAbsent: true,
      text: `# Log

Append-only. What happened, in sequence — not what was intended.

- ${today()} — Daybook connected to this folder.
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

ipcMain.handle("folder:writeSetup", async (_event, payload) => {
  const written = [];
  for (const seed of seedsFor(payload)) {
    const target = path.join(payload.folder, seed.file);
    if (seed.file !== "config.json" && fs.existsSync(target) && seed.onlyIfAbsent) continue;
    if (seed.merge) {
      const existing = await readJson(target);
      await writeTextAtomic(target, seed.merge(existing));
    } else {
      await writeTextAtomic(target, seed.text);
    }
    written.push(seed.file);
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

ipcMain.handle("connections:listModels", async (_event, { provider, connectionId }) => {
  const endpoint = MODEL_ENDPOINTS[provider];
  if (!endpoint) {
    throw new Error(`Live model listing is not available for ${provider} — type a model ID instead.`);
  }
  const key = await secretValue(`provider/${connectionId}`);
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
  const ids = (body.data ?? body.models ?? [])
    .map((m) => m.id ?? m.name)
    .filter((id) => typeof id === "string");
  return ids.sort();
});

/* ---------- IPC: local CLI detection (never executed — presence only) ---------- */

ipcMain.handle("cli:detect", async () => {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const found = [];
  for (const name of ["claude", "codex"]) {
    const hit = dirs.find((dir) => {
      try {
        fs.accessSync(path.join(dir, name), fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
    if (hit) found.push(name);
  }
  return found;
});

/* ---------- IPC: outbound links (https only — the renderer never opens targets itself) ---------- */

ipcMain.handle("shell:openExternal", async (_event, url) => {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error(`Refused to open ${parsed.protocol} links.`);
  await shell.openExternal(url);
  return true;
});

/* ---------- IPC: diagnostics — what does the OS say handles daybook:// ? ---------- */

ipcMain.handle("protocol:handler", () => app.getApplicationNameForProtocol(`${PROTOCOL}://auth`));
