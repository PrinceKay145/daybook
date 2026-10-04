/* The brief, arriving on its own: Daybook's two launchd jobs.

   app.daybook.mac.tick      every 60 s — writes today's brief once its time has passed
   app.daybook.mac.watchdog  hourly     — notices a stopped tick or a missing brief

   Both run `python -m daybook <tick|watchdog>` from runner/ and exit; nothing stays
   resident (AGENTS.md, "the process model"). They are user-level LaunchAgents only —
   ~/Library/LaunchAgents, never LaunchDaemons, never sudo — named after the bundle id so
   `launchctl list | grep daybook` finds them, logging to one documented place.

   Stopping removes them, not just unloads them: a job left in ~/Library/LaunchAgents
   comes back at the next login, and `pkill` alone lets launchd restart the tick within a
   minute. Starting writes them again. A test copy of the app (DAYBOOK_USER_DATA set) uses
   …test… labels, so testing never touches the real jobs. */

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PREFIX = process.env.DAYBOOK_USER_DATA ? "app.daybook.mac.test" : "app.daybook.mac";
const JOBS = [
  { name: "tick", interval: 60, purpose: "writes today's brief once its time has passed" },
  { name: "watchdog", interval: 3600, purpose: "notices a stopped tick or a missing brief" },
];

const label = (job) => `${PREFIX}.${job.name}`;
const plistPath = (job) => path.join(os.homedir(), "Library", "LaunchAgents", `${label(job)}.plist`);
const domain = () => `gui/${process.getuid()}`;

function launchctl(args) {
  return new Promise((resolve) => {
    execFile("/bin/launchctl", args, { timeout: 15000 }, (error, stdout, stderr) =>
      resolve({ code: error ? (typeof error.code === "number" ? error.code : -1) : 0, out: String(stdout), err: String(stderr) }),
    );
  });
}

function xml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function plist(job, { python, runnerDir, folder, stateDir, logDir }) {
  const args = [python, "-m", "daybook", job.name, "--folder", folder, "--state-dir", stateDir];
  const log = path.join(logDir, `${job.name}.log`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(label(job))}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${xml(a)}</string>`).join("\n")}
  </array>
  <key>WorkingDirectory</key><string>${xml(runnerDir)}</string>
  <key>StartInterval</key><integer>${job.interval}</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PYTHONDONTWRITEBYTECODE</key><string>1</string>
    <key>PYTHONUNBUFFERED</key><string>1</string>
  </dict>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict>
</plist>
`;
}

async function isLoaded(job) {
  return (await launchctl(["print", `${domain()}/${label(job)}`])).code === 0;
}

/** Writes and loads both jobs for this folder. Idempotent: a job whose file is unchanged and
    already loaded is left alone; a changed one (new folder, new Python) is reloaded. */
async function start(options) {
  fs.mkdirSync(options.logDir, { recursive: true });
  fs.mkdirSync(options.stateDir, { recursive: true });
  fs.mkdirSync(path.dirname(plistPath(JOBS[0])), { recursive: true });
  for (const job of JOBS) {
    const file = plistPath(job);
    const wanted = plist(job, options);
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (current === wanted && (await isLoaded(job))) continue;
    await launchctl(["bootout", `${domain()}/${label(job)}`]); // not loaded is fine
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, wanted, "utf8");
    fs.renameSync(tmp, file);
    const loaded = await launchctl(["bootstrap", domain(), file]);
    if (loaded.code !== 0) {
      throw new Error(`macOS refused to load ${label(job)}: ${loaded.err.trim() || `exit ${loaded.code}`}`);
    }
  }
}

/** Unloads both jobs and removes their files, so nothing comes back at the next login. */
async function stop() {
  for (const job of JOBS) {
    await launchctl(["bootout", `${domain()}/${label(job)}`]);
    fs.rmSync(plistPath(job), { force: true });
  }
}

function readState(stateDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(stateDir, "tick-state.json"), "utf8"));
  } catch {
    return {};
  }
}

/** Every job: whether it is installed and loaded, what macOS last saw it exit with, its log —
    plus the tick's own record of its last run, last brief and last error. */
async function status({ stateDir, logDir }) {
  const jobs = [];
  for (const job of JOBS) {
    const printed = await launchctl(["print", `${domain()}/${label(job)}`]);
    const exit = /last exit code = (\S+)/.exec(printed.out)?.[1];
    jobs.push({
      label: label(job),
      purpose: job.purpose,
      every: job.interval === 60 ? "every minute" : "every hour",
      installed: fs.existsSync(plistPath(job)),
      loaded: printed.code === 0,
      lastExit: exit ?? null,
      log: path.join(logDir, `${job.name}.log`),
      plist: plistPath(job),
    });
  }
  return { jobs, state: readState(stateDir) };
}

module.exports = { start, stop, status, PREFIX };
