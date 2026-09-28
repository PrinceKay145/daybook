/* Model choices the connect step offers. Data, not logic: when Anthropic ships a model,
   this list changes and nothing else does.

   Claude Code has no model-listing command, so its choices are this catalog of full
   model IDs (passed to `claude --model`); anything else goes through the free-text
   field. Which models a plan can use is Anthropic's call — a model outside the plan is
   refused by Claude Code itself, at the first run. Codex and API keys list their own. */

import type { ModelOption } from "@/lib/daybook";

export const CLAUDE_CODE_MODELS: (ModelOption & { note?: string })[] = [
  { id: "claude-fable-5-1", label: "Fable 5.1", note: "Anthropic's most capable" },
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "claude-opus-5", label: "Opus 5" },
  { id: "claude-sonnet-5", label: "Sonnet 5", note: "fast and capable" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", note: "fastest" },
];

/** A model id reaches a CLI as an argument, so it must stay a plain name (mirrors the
    check in electron/main.cjs, which is the one that enforces it). */
export function isModelId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value);
}

/** "Sonnet 5 · Claude Code", or the connection alone when no model is chosen. */
export function describeChoice(connection: { label: string; model?: string; modelLabel?: string }): string {
  const model = connection.modelLabel ?? connection.model;
  return model ? `${model} · ${connection.label}` : connection.label;
}
