/* The runner — runner/, the Python sidecar that builds the brief, runs the eleven
   assertions and renders it. Spawned by the app on 127.0.0.1 when the scoreboard wants a
   brief, and stopped when the app quits: it is never resident on its own (AGENTS.md,
   "the process model"). Its output goes to one log file, userData/logs/runner.log.
   Planning the day is a separate one-shot run (`python -m daybook plan`) that exits.

   Python: macOS no longer ships it by default, and /usr/bin/python3 without the
   developer tools only opens an "install the tools?" dialog — so that path is used only
   when the tools are really there. The packaged app carries its own (Resources/python,
   fetched by scripts/fetch-python.mjs) and uses it first; in development a missing one is
   reported plainly, never guessed around. No Python run by Daybook writes bytecode: a
   file written inside the app bundle would break its seal. */

const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const MIN_PYTHON = [3, 9];

function bundledPython() {
  return process.resourcesPath ? path.join(process.resourcesPath, "python", "bin", "python3") : "";
}

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
  const bundled = bundledPython() && fs.existsSync(bundledPython()) ? [bundledPython()] : [];
  return [...new Set([...bundled, ...onPath, ...known, ...(developerTools ? ["/usr/bin/python3"] : [])])];
}

function pythonVersion(binary) {
  return new Promise((resolve) => {
    const env = { ...process.env, PYTHONDONTWRITEBYTECODE: "1" };
    execFile(binary, ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"], { timeout: 5000, env }, (error, stdout) => {
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
  // Development: the repo's runner/. Packaged: Resources/runner (electron-builder's extraResources).
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
function ensureRunning(folder, logFile, stateDir) {
  if (current && current.folder === folder && current.child.exitCode === null) return Promise.resolve(current);
  if (starting && starting.folder === folder) return starting.promise;
  const promise = start(folder, logFile, stateDir).finally(() => {
    if (starting?.promise === promise) starting = null;
  });
  starting = { folder, promise };
  return promise;
}

async function requirePython() {
  const python = await findPython();
  if (python) return python;
  const error = new Error(
    "Python 3.9 or newer is needed to build the brief, and none was found on this Mac. " +
      "Install it (python.org, or Homebrew), then reopen Daybook. Packaged builds will include it.",
  );
  error.code = "PYTHON_MISSING";
  throw error;
}

async function start(folder, logFile, stateDir) {
  stop();
  const python = await requirePython();
  const port = await freePort();
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = fs.openSync(logFile, "a");
  fs.writeSync(log, `\n--- ${new Date().toISOString()} runner start · ${python.binary} (${python.version}) · port ${port}\n`);
  const args = ["-m", "daybook", "serve", "--folder", folder, "--port", String(port)];
  if (stateDir) args.push("--state-dir", stateDir); // so the brief can say if today's plan failed
  const child = spawn(python.binary, args, {
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
async function brief(folder, logFile, stateDir) {
  const { port } = await ensureRunning(folder, logFile, stateDir);
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

/* One run of the runner that exits, its outcome printed as JSON on its last line. The
   input goes in on stdin: a message and an API key never travel as arguments or in the
   environment, where other processes on the Mac could read them. */
function runOnce(python, args, input, logFile, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(python.binary, args, {
      cwd: runnerDir(),
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let outcome = null;
      try {
        outcome = JSON.parse(out.trim().split("\n").pop());
      } catch {
        /* reported below */
      }
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.appendFileSync(
        logFile,
        `\n--- ${new Date().toISOString()} ${args[2]} · ${outcome?.status ? `${outcome.status}: ${outcome.detail}` : outcome ? "read" : `exit ${code}`}\n${err}`,
      );
      if (outcome) resolve(outcome);
      else reject(new Error(`Planning stopped before it finished (exit ${code}). Its log is at ${logFile}.`));
    });
    child.stdin.end(input);
  });
}

const PLAN_TIMEOUT_MS = 8 * 60 * 1000; // two attempts at three minutes each, and the checks

/** The chosen model plans the day (runner/daybook/plan.py): it proposes, the runner
    writes after the eleven checks — or, with `propose`, writes nothing and returns it. */
async function plan(folder, { stateDir, logFile, message, secret, propose }) {
  const python = await requirePython();
  const args = ["-m", "daybook", "plan", "--folder", folder, "--state-dir", stateDir, "--stdin"];
  if (propose) args.push("--propose");
  return runOnce(python, args, JSON.stringify({ message: message ?? "", secret: secret ?? "" }), logFile, PLAN_TIMEOUT_MS);
}

/** Writes a plan returned by `plan` with `propose`, after checking it again. */
async function applyPlan(folder, proposal, { stateDir, logFile }) {
  const python = await requirePython();
  const args = ["-m", "daybook", "apply", "--folder", folder, "--state-dir", stateDir];
  return runOnce(python, args, JSON.stringify(proposal), logFile, 60 * 1000);
}

/** Reads a handover another AI wrote ({text}) into setup fields, or lines of fixed time
    ({fixed}) into config non-negotiables. It reads stdin and writes nothing; the document
    itself is never logged. */
async function handover(input, { logFile }) {
  const python = await requirePython();
  return runOnce(python, ["-m", "daybook", "handover"], JSON.stringify(input), logFile, 30 * 1000);
}

/** The sidecar right now, for Settings & status: its PID and port, or null. */
function info() {
  if (!current || current.child.exitCode !== null) return null;
  return { pid: current.child.pid, port: current.port, folder: current.folder };
}

module.exports = { brief, plan, applyPlan, handover, stop, findPython, runnerDir, info };
