import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { fetchBrief, runnerOrigin } from "@/lib/api";
import type { Payload } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BriefScreen } from "@/screens/Brief";
import { BoardScreen } from "@/screens/Board";
import { SettingsScreen } from "@/screens/Settings";

/* Three screens — Brief · Board · Settings. Nothing else. A thin UI was settled by
   convergence and the brief holds the home position: the product answers "what is true
   today?", not "what can AI chat about?" */

const SCREENS = ["brief", "board", "settings"] as const;
type Screen = (typeof SCREENS)[number];

function screenFromHash(): Screen {
  const hash = window.location.hash.replace("#", "");
  return (SCREENS as readonly string[]).includes(hash) ? (hash as Screen) : "brief";
}

export default function App() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>(screenFromHash);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      setPayload(await fetchBrief(signal));
      setError(null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // The screen lives in the URL so a link can open one, and so the window comes back to
  // where it was. No storage — the folder is the only state.
  useEffect(() => {
    const sync = () => setScreen(screenFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {payload?.brief.true_for ?? "daybook"}
          </h1>
          <p className="text-xs text-[var(--color-ink-faint)]">
            {payload
              ? `${payload.brief.owner_name} · ${payload.folder}`
              : `waiting for the runner on ${runnerOrigin}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
          Re-read the folder
        </button>
      </header>

      {error && (
        <div className="mb-5 flex gap-3 rounded-[var(--radius-card)] border border-[var(--color-warn)]/40 bg-[var(--color-surface)] p-5">
          <AlertTriangle className="size-5 shrink-0 text-[var(--color-warn)]" />
          <div className="text-sm">
            <p className="font-medium text-[var(--color-warn)]">The runner did not answer.</p>
            <p className="mt-1 text-[var(--color-ink-soft)]">{error}</p>
            <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
              Start it with{" "}
              <code className="rounded bg-[var(--color-canvas)] px-1 py-0.5">
                cd runner && python3 -m daybook serve --folder ../fixtures/sample-folder
              </code>
            </p>
          </div>
        </div>
      )}

      {!payload && !error && (
        <p className="text-sm text-[var(--color-ink-faint)]">Reading the folder…</p>
      )}

      {payload && (
        <Tabs
          value={screen}
          onValueChange={(value) => {
            setScreen(value as Screen);
            window.location.hash = value;
          }}
        >
          <TabsList>
            <TabsTrigger value="brief">Brief</TabsTrigger>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="brief">
            <BriefScreen payload={payload} />
          </TabsContent>
          <TabsContent value="board">
            <BoardScreen payload={payload} />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsScreen payload={payload} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
