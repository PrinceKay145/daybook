/* Connect your AI — one or more connections, one active, and the model the secretary
   uses through it. API-key connections fetch their live model list through the main
   process (the key never enters the renderer); CLI connections offer their documented
   aliases plus any model ID, because CLIs expose no model-list API. Switching later
   lives one click away on the scoreboard. */

import { useEffect, useState } from "react";
import { Check, KeyRound, Plus, TerminalSquare, X } from "lucide-react";
import {
  daybook,
  secretName,
  type Connection,
  type ListableModelProvider,
} from "@/lib/daybook";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui/button";

const API_PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)", live: true, hint: "Starts with sk-ant-" },
  { id: "openai", label: "OpenAI", live: true, hint: "Starts with sk-" },
  { id: "google-ai", label: "Google AI", live: false, hint: "Starts with AIza" },
] as const;

/** Documented aliases/IDs per CLI. CLIs have no model-list API; these are the
    stable entry points, and the free-text field covers everything else. */
const CLI_MODELS: Record<string, string[]> = {
  claude: ["opus", "sonnet", "haiku"],
  codex: ["gpt-5-codex", "gpt-5", "gpt-5-mini"],
};

export function ConnectProviderScreen({
  userId,
  connections,
  activeId,
  onDone,
}: {
  userId: string;
  connections: Connection[];
  activeId?: string;
  onDone: (connections: Connection[], activeConnectionId: string) => void;
}) {
  const [draft, setDraft] = useState<Connection[]>(connections);
  const [active, setActive] = useState<string | undefined>(activeId ?? connections[0]?.id);
  const [panel, setPanel] = useState<"manage" | "add">(connections.length === 0 ? "add" : "manage");
  const [addTab, setAddTab] = useState<"api" | "cli">("api");
  const [providerId, setProviderId] = useState<string>(API_PROVIDERS[0].id);
  const [customLabel, setCustomLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clis, setClis] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [fetchingModels, setFetchingModels] = useState(false);
  const [customModel, setCustomModel] = useState("");

  useEffect(() => {
    daybook
      .detectCli()
      .then((found) => {
        setClis(found);
        if (found.length === 0) setAddTab("api");
      })
      .catch(() => setClis([]));
  }, []);

  const activeConnection = draft.find((c) => c.id === active) ?? draft[0] ?? null;

  useEffect(() => {
    setCustomModel(activeConnection?.model ?? "");
  }, [activeConnection?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function patchConnection(id: string, patch: Partial<Connection>) {
    setDraft((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function pickActive(id: string) {
    setActive(id);
    setPanel("manage");
  }

  async function removeConnection(connection: Connection) {
    setError(null);
    const remaining = draft.filter((c) => c.id !== connection.id);
    setDraft(remaining);
    if (active === connection.id) setActive(remaining[0]?.id);
    if (remaining.length === 0) setPanel("add");
    if (connection.authKind === "api_key") {
      try {
        await daybook.deleteSecret(secretName(userId, connection.id));
      } catch {
        /* the key may already be gone; the connection is removed either way */
      }
    }
  }

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
      await daybook.storeSecret(secretName(userId, id), apiKey.trim());
      const connection: Connection = { id, label, authKind: "api_key" };
      setDraft((list) => [...list.filter((c) => c.id !== id), connection]);
      setActive(id);
      setApiKey("");
      setPanel("manage");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function connectCli(binary: string) {
    const label = binary === "claude" ? "Claude Code" : `${binary}`;
    const connection: Connection = {
      id: `${binary}-cli`,
      label,
      authKind: "local_cli",
      cliBinary: binary,
    };
    setDraft((list) => [...list.filter((c) => c.id !== connection.id), connection]);
    setActive(connection.id);
    setPanel("manage");
  }

  async function fetchModels(connection: Connection) {
    setError(null);
    setFetchingModels(true);
    try {
      const ids = await daybook.listModels(
        connection.id as ListableModelProvider,
        secretName(userId, connection.id),
      );
      setModels((m) => ({ ...m, [connection.id]: ids }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFetchingModels(false);
    }
  }

  const modelOptions = activeConnection
    ? activeConnection.authKind === "local_cli"
      ? (CLI_MODELS[activeConnection.cliBinary ?? ""] ?? [])
      : (models[activeConnection.id] ?? [])
    : [];

  const liveListing =
    activeConnection?.authKind === "api_key" &&
    API_PROVIDERS.some((p) => p.id === activeConnection.id && p.live);

  return (
    <div className="mx-auto w-full max-w-md py-10">
      <div className="mb-6">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-faint)]">
          Step 2 of 3
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Connect your AI</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Connect one or more — Claude Code, Codex, or an API key — then choose the model
          your secretary uses. You can switch between them anytime from the scoreboard.
          Credentials stay on this Mac.
        </p>
      </div>

      <div className="space-y-4">
        {draft.length > 0 && (
          <div className="space-y-2 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-faint)]">
              Your connections
            </p>
            {draft.map((connection) => {
              const isActive = connection.id === activeConnection?.id;
              return (
                <div
                  key={connection.id}
                  className={`flex items-center gap-2 rounded-[var(--radius-card)] border px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "border-[var(--color-accent)]"
                      : "border-[var(--color-line)]"
                  }`}
                >
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-2 text-left"
                    onClick={() => pickActive(connection.id)}
                  >
                    <Check
                      className={`size-4 shrink-0 ${isActive ? "text-[var(--color-accent)]" : "text-transparent"}`}
                    />
                    <span className="font-medium">{connection.label}</span>
                    <span className="text-xs text-[var(--color-ink-faint)]">
                      {connection.authKind === "local_cli" ? "local CLI" : "API key"}
                      {connection.model ? ` · ${connection.model}` : " · no model chosen"}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${connection.label}`}
                    className="text-[var(--color-ink-faint)] hover:text-[var(--color-warn)]"
                    onClick={() => void removeConnection(connection)}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {panel === "add" ? (
          <div className="space-y-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
            <div className="flex gap-2">
              <Button
                variant={addTab === "api" ? "primary" : "secondary"}
                className="flex-1"
                onClick={() => setAddTab("api")}
              >
                <KeyRound className="size-4" />
                API key
              </Button>
              <Button
                variant={addTab === "cli" ? "primary" : "secondary"}
                className="flex-1"
                onClick={() => setAddTab("cli")}
              >
                <TerminalSquare className="size-4" />
                Local CLI
              </Button>
            </div>

            {addTab === "api" ? (
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
                  hint={
                    API_PROVIDERS.find((p) => p.id === providerId)?.hint ??
                    "Stored in your keychain, never shown again."
                  }
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

                <Button className="w-full" disabled={busy} onClick={() => void connectApiKey()}>
                  Store key and connect
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[var(--color-ink-soft)]">
                  A CLI you installed and signed into yourself. Daybook runs it as a
                  subprocess and never touches the credential. This only checks what is on
                  your PATH — nothing is executed.
                </p>
                {clis.length === 0 ? (
                  <p className="rounded-[var(--radius-card)] border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-ink-faint)]">
                    No supported CLI found on this Mac. Install one, or use an API key
                    instead.
                  </p>
                ) : (
                  clis.map((binary) => (
                    <button
                      key={binary}
                      type="button"
                      disabled={busy}
                      onClick={() => connectCli(binary)}
                      className="flex w-full items-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-line)] px-3 py-2.5 text-sm transition-colors hover:border-[var(--color-accent)] disabled:opacity-50"
                    >
                      <Check className="size-4 text-[var(--color-accent)]" />
                      <code>{binary}</code>
                      <span className="ml-auto text-xs text-[var(--color-ink-faint)]">
                        detected
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}

            {draft.length > 0 && (
              <Button variant="ghost" className="w-full" onClick={() => setPanel("manage")}>
                Back to my connections
              </Button>
            )}
          </div>
        ) : (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setError(null);
              setPanel("add");
            }}
          >
            <Plus className="size-4" />
            Add another connection
          </Button>
        )}

        {activeConnection && panel === "manage" && (
          <div className="space-y-3 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-faint)]">
              Model for {activeConnection.label}
            </p>
            {modelOptions.length > 0 && (
              <Field label="Pick a model">
                <select
                  className={inputClass}
                  value={
                    modelOptions.includes(activeConnection.model ?? "")
                      ? activeConnection.model
                      : ""
                  }
                  onChange={(event) =>
                    patchConnection(activeConnection.id, { model: event.target.value })
                  }
                >
                  <option value="">Choose…</option>
                  {modelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {liveListing && modelOptions.length === 0 && (
              <Button
                variant="secondary"
                className="w-full"
                disabled={fetchingModels}
                onClick={() => void fetchModels(activeConnection)}
              >
                {fetchingModels ? "Asking the provider…" : "Fetch the model list"}
              </Button>
            )}
            <Field
              label="Or type a model ID"
              hint={
                activeConnection.authKind === "local_cli"
                  ? "Aliases like opus resolve to the CLI's current default; full IDs pass through as-is."
                  : "Any model ID your key can call."
              }
            >
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  value={customModel}
                  onChange={(event) => setCustomModel(event.target.value)}
                  placeholder={
                    activeConnection.cliBinary === "codex" ? "gpt-5-codex" : "claude-sonnet-4-5"
                  }
                />
                <Button
                  variant="secondary"
                  disabled={!customModel.trim()}
                  onClick={() =>
                    patchConnection(activeConnection.id, { model: customModel.trim() })
                  }
                >
                  Use
                </Button>
              </div>
            </Field>
            <ErrorNote message={error} />
            <Button
              className="w-full"
              disabled={draft.length === 0 || busy}
              onClick={() => active && onDone(draft, active)}
            >
              Continue
            </Button>
            <p className="text-xs text-[var(--color-ink-faint)]">
              A model is recommended but not required to continue — the secretary will ask
              the connection's own default when none is chosen.
            </p>
          </div>
        )}

        {panel === "add" && <ErrorNote message={error} />}
      </div>
    </div>
  );
}
