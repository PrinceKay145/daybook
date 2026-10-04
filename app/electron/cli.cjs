/* Local AI CLIs — Claude Code and Codex, installed and signed in by the user.

   Finding them: an app opened from the Dock gets a minimal PATH, so the known install
   locations are searched too (native installers, Homebrew, npm prefixes, Node version
   managers). Checking them: each CLI is run only with commands fixed in this file — no
   shell, arguments as a list, nothing from model output or folder content — and its
   own credentials are never read (AGENTS.md, DECISIONS.md D4). The renderer names which
   CLI it wants; the path that runs is always the one found here. */

const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CLIS = ["claude", "codex"];

/** Where each install method puts the binary, after whatever PATH the app inherited. */
function candidateDirs() {
  const home = os.homedir();
  const nvmRoot = path.join(home, ".nvm", "versions", "node");
  let nvmBins = [];
  try {
    nvmBins = fs
      .readdirSync(nvmRoot)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((version) => path.join(nvmRoot, version, "bin"));
  } catch {
    nvmBins = [];
  }
  const dirs = [
    ...(process.env.PATH ?? "").split(path.delimiter),
    path.join(home, ".local", "bin"), // native installers (Claude Code, Codex)
    "/opt/homebrew/bin", // Homebrew, Apple Silicon
    "/usr/local/bin", // Homebrew, Intel; some npm prefixes
    path.join(home, ".claude", "local"), // older Claude Code local installs
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".volta", "bin"),
    path.join(home, ".bun", "bin"),
    ...nvmBins,
  ];
  return [...new Set(dirs.filter(Boolean))];
}

function findBinary(name) {
  for (const dir of candidateDirs()) {
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* not here */
    }
  }
  return null;
}

/* An npm-installed CLI starts with `#!/usr/bin/env node`; from the Dock, `node` is only
   found if the binary's own directory (where its Node lives) leads the child's PATH.
   USER must be set too: without it Claude Code cannot reach its keychain entry and
   reports itself signed out. */
function childEnv(binary) {
  const extra = [path.dirname(binary), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];
  const user = process.env.USER ?? os.userInfo().username;
  return {
    ...process.env,
    USER: user,
    LOGNAME: process.env.LOGNAME ?? user,
    PATH: [...extra, process.env.PATH ?? ""].join(path.delimiter),
  };
}

function run(binary, args, timeoutMs = 10000) {
  return new Promise((resolve) => {
    execFile(
      binary,
      args,
      { env: childEnv(binary), timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          code: error ? (typeof error.code === "number" ? error.code : -1) : 0,
          timedOut: Boolean(error?.killed),
          stdout: String(stdout),
          stderr: String(stderr),
        });
      },
    );
  });
}

/** "2.1.197 (Claude Code)" or "codex-cli 0.157.1" → "v2.1.197" / "v0.157.1". */
function versionOf(text) {
  const match = text.match(/\d+\.\d+\.\d+/);
  return match ? `v${match[0]}` : undefined;
}

/* `claude auth status` prints JSON and exits 0 when signed in, 1 when not. Only the
   sign-in state, its method and the plan are kept — not the email or organisation. */
async function claudeStatus(binary) {
  const [version, status] = await Promise.all([run(binary, ["--version"]), run(binary, ["auth", "status"])]);
  if (status.timedOut) return { version: versionOf(version.stdout), signedIn: false, error: "Claude Code did not answer in time." };
  let parsed = null;
  try {
    parsed = JSON.parse(status.stdout);
  } catch {
    parsed = null;
  }
  const signedIn = status.code === 0 && parsed?.loggedIn !== false;
  const how = String(parsed?.authMethod ?? "");
  return {
    version: versionOf(version.stdout),
    signedIn,
    method: !signedIn ? undefined : how === "claude.ai" ? "subscription" : /api|key|console/i.test(how) ? "api_key" : undefined,
    plan: signedIn && typeof parsed?.subscriptionType === "string" ? parsed.subscriptionType : undefined,
  };
}

/* `codex login status` exits 0 when signed in and says how on stderr: "Logged in using
   ChatGPT", "Logged in using an API key - …", or "Not logged in". */
async function codexStatus(binary) {
  const [version, status] = await Promise.all([run(binary, ["--version"]), run(binary, ["login", "status"])]);
  if (status.timedOut) return { version: versionOf(version.stdout), signedIn: false, error: "Codex did not answer in time." };
  const said = `${status.stdout}\n${status.stderr}`;
  return {
    version: versionOf(version.stdout),
    signedIn: status.code === 0,
    method: /chatgpt/i.test(said) ? "subscription" : /api key/i.test(said) ? "api_key" : undefined,
  };
}

async function detect() {
  return Promise.all(
    CLIS.map(async (name) => {
      const binary = findBinary(name);
      if (!binary) return { name, found: false };
      try {
        const status = name === "claude" ? await claudeStatus(binary) : await codexStatus(binary);
        return { name, found: true, path: binary, ...status };
      } catch (err) {
        return { name, found: true, path: binary, signedIn: false, error: String(err?.message ?? err) };
      }
    }),
  );
}

/* Codex lists the models its sign-in can use through its app-server: newline-delimited
   JSON-RPC over stdio (the "jsonrpc" field omitted) — initialize, initialized, then
   model/list. Claude Code has no such listing; its models are a catalog in the renderer. */
function codexModels(timeoutMs = 15000) {
  const binary = findBinary("codex");
  if (!binary) return Promise.reject(new Error("Codex is not installed on this Mac."));
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["app-server"], { env: childEnv(binary), stdio: ["pipe", "pipe", "ignore"] });
    let buffer = "";
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error("Codex did not list its models in time.")), timeoutMs);
    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);

    child.on("error", (err) => finish(reject, err));
    child.on("exit", () => finish(reject, new Error("Codex stopped before listing its models.")));
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id === 0) {
          if (message.error) return finish(reject, new Error(message.error.message ?? "Codex refused to start."));
          send({ method: "initialized", params: {} });
          send({ method: "model/list", id: 1, params: { limit: 100, includeHidden: false } });
        } else if (message.id === 1) {
          if (message.error) return finish(reject, new Error(message.error.message ?? "Codex could not list models."));
          const models = (message.result?.data ?? [])
            .filter((m) => m && typeof (m.model ?? m.id) === "string" && !m.hidden)
            .map((m) => ({ id: m.model ?? m.id, label: m.displayName ?? m.model ?? m.id, isDefault: Boolean(m.isDefault) }));
          finish(resolve, models);
        }
      }
    });

    send({ method: "initialize", id: 0, params: { clientInfo: { name: "daybook", title: "Daybook", version: "0.1.0" } } });
  });
}

module.exports = { detect, codexModels, findBinary };
