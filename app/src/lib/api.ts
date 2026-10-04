/* The runner over 127.0.0.1, for a plain browser tab. In the desktop app the main process
   starts the runner and hands the brief over (window.daybook.brief); a browser tab cannot
   start processes, so it reads a runner a developer started by hand:

       cd runner && python3 -m daybook serve --folder ../fixtures/sample-folder --port 8787 */

import type { BriefResult, CheckResult } from "@/lib/daybook";

const RUNNER = import.meta.env.VITE_RUNNER_URL ?? "http://127.0.0.1:8787";

export async function fetchBriefFromRunner(): Promise<BriefResult> {
  try {
    const response = await fetch(`${RUNNER}/api/brief`);
    const payload = (await response.json()) as {
      verification?: { passed?: boolean; results?: CheckResult[] };
      diagnostics?: { warnings?: string[] };
      error?: string;
    };
    if (!response.ok) {
      return { ok: false, code: "RUNNER_FAILED", message: payload.error ?? `The runner answered ${response.status}.` };
    }
    const passed = Boolean(payload.verification?.passed);
    return {
      ok: true,
      passed,
      results: (payload.verification?.results ?? []).map(({ id, name, ok, detail }) => ({ id, name, ok, detail })),
      warnings: payload.diagnostics?.warnings ?? [],
      html: passed ? await (await fetch(`${RUNNER}/brief.html`)).text() : null,
    };
  } catch {
    return {
      ok: false,
      code: "NEEDS_APP",
      message: `No runner at ${RUNNER}. In a browser tab, start one by hand (runner/README.md); the Daybook app starts it itself.`,
    };
  }
}
