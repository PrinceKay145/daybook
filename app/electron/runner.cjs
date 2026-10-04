/* The runner — runner/, the Python sidecar that builds the brief, runs the eleven
   assertions and renders it. Spawned by the app on 127.0.0.1 when the scoreboard wants a
   brief, and stopped when the app quits: it is never resident on its own (AGENTS.md,
   "the process model"). Its output goes to one log file, userData/logs/runner.log.

   Python: macOS no longer ships it by default, and /usr/bin/python3 without the
   developer tools only opens an "install the tools?" dialog — so that path is used only
   when the tools are really there. Packaging will bundle a Python; until then a missing
   one is reported plainly, never guessed around. */

const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const MIN_PYTHON = [3, 9];

function pythonCandidates() {
  const home = os.homedir();
  const onPath = (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter((dir) => dir && dir !== "/usr/bin")
    .map((dir) => path.join(dir, "python3"));
  const known = [
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
    path.join(home, ".pyenv", "shims", "python3"),
    path.join(home, "miniconda3", "bin", "python3"),
    path.join(home, "anaconda3", "bin", "python3"),
    "/Library/Frameworks/Python.framework/Versions/Current/bin/python3",
  ];
  const developerTools =
    fs.existsSync("/Library/Developer/CommandLineTools/usr/bin/python3") ||
    fs.existsSync("/Applications/Xcode.app");
  return [...new Set([...onPath, ...known, ...(developerTools ? ["/usr/bin/python3"] : [])])];
}

function pythonVersion(binary) {
  return new Promise((resolve) => {
    execFile(binary, ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"], { timeout: 5000 }, (error, stdout) => {
      if (error) return resolve(null);
      const [major, minor] = String(stdout).trim().split(".").map(Number);
      resolve(Number.isFinite(major) ? [major, minor] : null);
    });
  });
}

let pythonFound; // cached: { binary, version } | null
async function findPython() {
  if (pythonFound !== undefined) return pythonFound;
  for (const candidate of pythonCandidates()) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
    } catch {
      continue;
    }
    const version = await pythonVersion(candidate);
    if (version && (version[0] > MIN_PYTHON[0] || (version[0] === MIN_PYTHON[0] && version[1] >= MIN_PYTHON[1]))) {
      pythonFound = { binary: candidate, version: version.join(".") };
      return pythonFound;
    }
  }
  pythonFound = null;
  return null;
}

function runnerDir() {
  // Development: the repo's runner/. Packaged: copied beside the app (packaging milestone).
  const dev = path.resolve(__dirname, "..", "..", "runner");
  const packaged = process.resourcesPath ? path.join(process.resourcesPath, "runner") : "";
  return fs.existsSync(path.join(dev, "daybook")) ? dev : packaged;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let current = null; // { folder, port, child }
let starting = null; // { folder, promise } while a start is in flight

function stop() {
  if (current?.child && current.child.exitCode === null) current.child.kill();
  current = null;
}

/* Single-flight: two requests arriving together (the scoreboard mounting twice, a rebuild
   during a start) share one start instead of each spawning a runner — a second one would
   be orphaned and outlive the app. */
function ensureRunning(folder, logFile) {
  if (current && current.folder === folder && current.child.exitCode === null) return Promise.resolve(current);
  if (starting && starting.folder === folder) return starting.promise;
  const promise = start(folder, logFile).finally(() => {
    if (starting?.promise === promise) starting = null;
  });
  starting = { folder, promise };
  return promise;
}

async function start(folder, logFile) {
  stop();
  const python = await findPython();
  if (!python) {
    const error = new Error(
      "Python 3.9 or newer is needed to build the brief, and none was found on this Mac. " +
        "Install it (python.org, or Homebrew), then reopen Daybook. Packaged builds will include it.",
    );
    error.code = "PYTHON_MISSING";
    throw error;
  }
  const port = await freePort();
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = fs.openSync(logFile, "a");
  fs.writeSync(log, `\n--- ${new Date().toISOString()} runner start · ${python.binary} (${python.version}) · port ${port}\n`);
  const child = spawn(python.binary, ["-m", "daybook", "serve", "--folder", folder, "--port", String(port)], {
    cwd: runnerDir(),
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", PYTHONUNBUFFERED: "1" },
    stdio: ["ignore", log, log],
  });
  fs.closeSync(log);
  current = { folder, port, child };

  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return current;
    } catch {
      /* not listening yet */
    }
    await wait(100);
  }
  stop();
  throw new Error(`The runner did not start. Its log is at ${logFile}.`);
}

/** The brief for this folder: its data with the eleven results, and the rendered page
    only when every assertion passed — an unverified brief is never handed over. */
async function brief(folder, logFile) {
  const { port } = await ensureRunning(folder, logFile);
  const response = await fetch(`http://127.0.0.1:${port}/api/brief`);
  const payload = await response.json();
  if (!response.ok) throw new Error(`The runner could not build the brief: ${payload.error ?? response.status}`);
  const passed = Boolean(payload.verification?.passed);
  const html = passed ? await (await fetch(`http://127.0.0.1:${port}/brief.html`)).text() : null;
  return {
    passed,
    results: (payload.verification?.results ?? []).map((r) => ({ id: r.id, name: r.name, ok: r.ok, detail: r.detail })),
    warnings: payload.diagnostics?.warnings ?? [],
    html,
  };
}

module.exports = { brief, stop, findPython };
