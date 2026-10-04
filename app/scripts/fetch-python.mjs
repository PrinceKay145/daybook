// The Python bundled inside Daybook.app — most Macs no longer have one, and the runner
// (runner/, standard library only) needs 3.9 or newer.
//
//   node scripts/fetch-python.mjs [arm64|x64]     (default: this Mac's architecture)
//
// Downloads one pinned build of python-build-standalone (Astral), checks it against the
// SHA-256 recorded here, and unpacks it into build/python-<arch>/python — git-ignored,
// picked up by electron-builder's extraResources. Nothing is run from the download until
// its checksum matches. To move to a newer Python, change RELEASE and both digests
// together (gh api repos/astral-sh/python-build-standalone/releases/latest).

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE = "20261003";
const VERSION = "3.12.15";
const BUILDS = {
  arm64: {
    triple: "aarch64-apple-darwin",
    sha256: "ad8d0c637c0a36b967b310e2c07254f4d2ca8cabaa7699e55ed6290aceb481a2",
  },
  x64: {
    triple: "x86_64-apple-darwin",
    sha256: "562c30864ece2cb1d3e0ad66a1acd498611a47e5a10ce81b99158bef1ccbd355",
  },
};

const arch = process.argv[2] ?? (process.arch === "arm64" ? "arm64" : "x64");
const build = BUILDS[arch];
if (!build) {
  console.error(`Unknown architecture "${arch}" — use arm64 or x64.`);
  process.exit(1);
}

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(appDir, "build", `python-${arch}`);
const marker = path.join(target, "VERSION");
const stamp = `${VERSION}+${RELEASE} ${build.triple}`;

if (existsSync(marker) && readFileSync(marker, "utf8").trim() === stamp) {
  console.log(`Python ${stamp} is already in ${path.relative(appDir, target)}.`);
  process.exit(0);
}

const file = `cpython-${VERSION}+${RELEASE}-${build.triple}-install_only_stripped.tar.gz`;
const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE}/${encodeURIComponent(file)}`;
console.log(`Downloading ${file}…`);
const response = await fetch(url);
if (!response.ok) {
  console.error(`Download failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}
const archive = Buffer.from(await response.arrayBuffer());
const digest = createHash("sha256").update(archive).digest("hex");
if (digest !== build.sha256) {
  console.error(`Checksum mismatch — expected ${build.sha256}, got ${digest}. Nothing was unpacked.`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
const tarball = path.join(target, file);
writeFileSync(tarball, archive);
execFileSync("tar", ["-xzf", tarball, "-C", target]); // unpacks to <target>/python
rmSync(tarball);

// The runner uses the standard library and nothing with a window or an installer: the
// IDLE editor, Tk and pip are left out of the app (about 15 MB).
const root = path.join(target, "python");
const unused = [
  "lib/python3.12/idlelib", "lib/python3.12/tkinter", "lib/python3.12/turtledemo",
  "lib/python3.12/ensurepip", "lib/python3.12/site-packages",
  "lib/tcl9", "lib/tcl9.0", "lib/tk9.0", "lib/itcl4.3.8", "lib/thread3.0.6",
];
for (const relative of unused) rmSync(path.join(root, relative), { recursive: true, force: true });
mkdirSync(path.join(root, "lib/python3.12/site-packages"), { recursive: true });
execFileSync("/bin/sh", ["-c", 'rm -f bin/idle* bin/pip* lib/libtcl* lib/libtk* lib/python3.12/lib-dynload/_tkinter*'], { cwd: root });

const python = path.join(target, "python", "bin", "python3");
const reported = execFileSync(python, ["-c", "import sys; print('%d.%d.%d' % sys.version_info[:3])"]).toString().trim();
writeFileSync(marker, `${stamp}\n`);
console.log(`Python ${reported} (${arch}) is ready in ${path.relative(appDir, target)}/python.`);
