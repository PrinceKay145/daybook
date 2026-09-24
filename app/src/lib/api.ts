/* The only place that knows where the runner is.
   Always 127.0.0.1 — never a bundle-specific API, so this file is unchanged when the
   frontend moves from a browser tab into the Tauri shell in week 7. */

import type { Payload } from "@/types";

const RUNNER = import.meta.env.VITE_RUNNER_URL ?? "http://127.0.0.1:8787";

export const briefUrl = `${RUNNER}/brief.html`;

export async function fetchBrief(signal?: AbortSignal): Promise<Payload> {
  const response = await fetch(`${RUNNER}/api/brief`, { signal });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`The runner answered ${response.status}. ${body}`.trim());
  }
  return (await response.json()) as Payload;
}

export const runnerOrigin = RUNNER;
