/* Connect your AI provider. The user brings their own credential — an API key into the
   OS keychain, or a local CLI they authenticated themselves. Daybook never sees a
   subscription and never proxies one: authKind is data on the provider record. */

import { useEffect, useState } from "react";
import { Check, KeyRound, TerminalSquare } from "lucide-react";
import { daybook, type ProviderRecord } from "@/lib/daybook";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui/button";

const API_PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)", hint: "Starts with sk-ant-" },
  { id: "openai", label: "OpenAI", hint: "Starts with sk-" },
  { id: "google-ai", label: "Google AI", hint: "Starts with AIza" },
] as const;

export function ConnectProviderScreen({
  onConnected,
}: {
  onConnected: (provider: ProviderRecord) => void;
}) {
  const [clis, setClis] = useState<string[]>([]);
  const [tab, setTab] = useState<"api" | "cli">("api");
  const [providerId, setProviderId] = useState<string>(API_PROVIDERS[0].id);
  const [customLabel, setCustomLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    daybook
      .detectCli()
      .then((found) => {
        setClis(found);
        if (found.length === 0) setTab("api");
      })
      .catch(() => setClis([]));
  }, []);

  async function connectApiKey() {
    setError(null);
    if (apiKey.trim().length < 8) {
      setError("That key looks too short to be real.");
      return;
    }
    setBusy(true);
    try {
      const preset = API_PROVIDERS.find((p) => p.id === providerId);
      const label = preset ? preset.label : customLabel.trim() || "Custom provider";
      const id = preset ? preset.id : `custom-${Date.now()}`;
      await daybook.storeSecret(`provider/${id}`, apiKey.trim());
      onConnected({ id, label, authKind: "api_key" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function connectCli(binary: string) {
    setError(null);
    setBusy(true);
    try {
      const label = binary === "claude" ? "Claude Code (local CLI)" : `${binary} (local CLI)`;
      onConnected({ id: `${binary}-cli`, label, authKind: "local_cli", cliBinary: binary });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center">
      <div className="mb-6">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-faint)]">
          Step 2 of 3
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Connect your AI provider</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          You bring your own credential. It stays on this Mac — API keys go into your
          keychain, and a local CLI is invoked as a subprocess Daybook never authenticates.
          Daybook never routes your work through its own subscription.
        </p>
      </div>

      <div className="space-y-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
        <div className="flex gap-2">
          <Button
            variant={tab === "api" ? "primary" : "secondary"}
            className="flex-1"
            onClick={() => setTab("api")}
          >
            <KeyRound className="size-4" />
            API key
          </Button>
          <Button
            variant={tab === "cli" ? "primary" : "secondary"}
            className="flex-1"
            onClick={() => setTab("cli")}
          >
            <TerminalSquare className="size-4" />
            Local CLI
          </Button>
        </div>

        {tab === "api" ? (
          <div className="space-y-3">
            <Field label="Provider">
              <select
                className={inputClass}
                value={providerId}
                onChange={(event) => setProviderId(event.target.value)}
              >
                {API_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Other…</option>
              </select>
            </Field>

            {providerId === "custom" && (
              <Field label="What do you call it?">
                <input
                  className={inputClass}
                  value={customLabel}
                  onChange={(event) => setCustomLabel(event.target.value)}
                  placeholder="e.g. Mistral"
                />
              </Field>
            )}

            <Field
              label="API key"
              hint={API_PROVIDERS.find((p) => p.id === providerId)?.hint ?? "Stored in your keychain, never shown again."}
            >
              <input
                className={inputClass}
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Paste your key"
                autoComplete="off"
              />
            </Field>

            <ErrorNote message={error} />
            <Button className="w-full" disabled={busy} onClick={() => void connectApiKey()}>
              Store key and continue
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-ink-soft)]">
              A CLI you installed and signed into yourself. Daybook runs it as a subprocess
              and never touches the credential. Nothing is executed yet — this only checks
              what is on your PATH.
            </p>
            {clis.length === 0 ? (
              <p className="rounded-[var(--radius-card)] border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-ink-faint)]">
                No supported CLI found on this Mac. Install one, or use an API key instead.
              </p>
            ) : (
              clis.map((binary) => (
                <button
                  key={binary}
                  type="button"
                  disabled={busy}
                  onClick={() => void connectCli(binary)}
                  className="flex w-full items-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-line)] px-3 py-2.5 text-sm transition-colors hover:border-[var(--color-accent)] disabled:opacity-50"
                >
                  <Check className="size-4 text-[var(--color-accent)]" />
                  <code>{binary}</code>
                  <span className="ml-auto text-xs text-[var(--color-ink-faint)]">detected</span>
                </button>
              ))
            )}
            <ErrorNote message={error} />
          </div>
        )}
      </div>
    </div>
  );
}
