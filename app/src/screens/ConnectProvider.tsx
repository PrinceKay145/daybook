/* Choose your secretary's model. The model is the choice; where it runs follows from it —
   Claude Code or Codex already signed in on this Mac (the user's own plan, through the
   CLI's own sign-in, which Daybook never sees), or an API key in the keychain.

   Claude Code's models are a catalog (models.ts); Codex lists its own through its
   app-server; API keys list theirs through the main process, so the key never enters
   this renderer. Switching later reopens this same step from the scoreboard. */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, KeyRound, Plus, RefreshCw, TerminalSquare, X } from "lucide-react";
import {
  daybook,
  secretName,
  type CliStatus,
  type Connection,
  type ListableModelProvider,
  type ModelOption,
} from "@/lib/daybook";
import { CLAUDE_CODE_MODELS, isModelId } from "@/lib/models";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui/button";

const API_PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)", live: true, hint: "Starts with sk-ant-" },
  { id: "openai", label: "OpenAI", live: true, hint: "Starts with sk-" },
  { id: "google-ai", label: "Google AI", live: false, hint: "Starts with AIza" },
] as const;

const CLI_INFO = {
  claude: {
    id: "claude-cli",
    label: "Claude Code",
    signIn: "claude auth login",
    install: "https://code.claude.com/docs/en/setup",
  },
  codex: {
    id: "codex-cli",
    label: "Codex",
    signIn: "codex login",
    install: "https://github.com/openai/codex",
  },
} as const;

type Choice = { connectionId: string; model: string; modelLabel: string };

function signedInAs(status: CliStatus): string {
  if (status.method === "api_key") return "Signed in with an API key";
  if (status.name === "codex") return "Signed in with ChatGPT";
  return status.plan
    ? `Signed in · ${status.plan.charAt(0).toUpperCase()}${status.plan.slice(1)} plan`
    : "Signed in";
}

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
  const saved = connections.find((c) => c.id === activeId) ?? connections[0];
  const [choice, setChoice] = useState<Choice | null>(
    saved?.model ? { connectionId: saved.id, model: saved.model, modelLabel: saved.modelLabel ?? saved.model } : null,
  );
  const [clis, setClis] = useState<CliStatus[] | null>(null);
  const [codexModels, setCodexModels] = useState<ModelOption[] | null>(null);
  const [codexError, setCodexError] = useState<string | null>(null);
  const [keys, setKeys] = useState<Connection[]>(connections.filter((c) => c.authKind === "api_key"));
  const [keyModels, setKeyModels] = useState<Record<string, ModelOption[]>>({});
  const [keyErrors, setKeyErrors] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [providerId, setProviderId] = useState<string>(API_PROVIDERS[0].id);
  const [customLabel, setCustomLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setClis(null);
    setCodexModels(null);
    setCodexError(null);
    const found = await daybook.detectCli().catch(() => [] as CliStatus[]);
    const statuses = (["claude", "codex"] as const).map(
      (name) => found.find((s) => s.name === name) ?? { name, found: false },
    );
    setClis(statuses);
    // A choice through a CLI that is no longer signed in (or installed) cannot run.
    const usable = new Set<string>(
      statuses.filter((s) => s.found && s.signedIn).map((s) => CLI_INFO[s.name].id),
    );
    const cliIds: string[] = Object.values(CLI_INFO).map((info) => info.id);
    setChoice((current) =>
      current && cliIds.includes(current.connectionId) && !usable.has(current.connectionId) ? null : current,
    );
    if (statuses.find((s) => s.name === "codex")?.signedIn) {
      daybook
        .listCliModels("codex")
        .then(setCodexModels)
        .catch((err: unknown) => setCodexError((err as Error).message));
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const fetchKeyModels = useCallback(
    async (connection: Connection) => {
      if (!API_PROVIDERS.some((p) => p.id === connection.id && p.live)) return;
      try {
        const list = await daybook.listModels(connection.id as ListableModelProvider, secretName(userId, connection.id));
        setKeyModels((m) => ({ ...m, [connection.id]: list }));
        setKeyErrors(({ [connection.id]: _cleared, ...rest }) => rest);
      } catch (err) {
        setKeyErrors((e) => ({ ...e, [connection.id]: (err as Error).message }));
      }
    },
    [userId],
  );

  useEffect(() => {
    keys.forEach((k) => void fetchKeyModels(k));
    // Only the keys present when the step opens; a key added later fetches on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addKey() {
    setError(null);
    if (apiKey.trim().length < 8) {
      setError("That key looks too short to be real.");
      return;
    }
    setBusy(true);
    try {
      const preset = API_PROVIDERS.find((p) => p.id === providerId);
      const id = preset ? preset.id : `custom-${Date.now()}`;
      const connection: Connection = {
        id,
        label: preset ? `${preset.label} API key` : `${customLabel.trim() || "Custom"} API key`,
        authKind: "api_key",
      };
      await daybook.storeSecret(secretName(userId, id), apiKey.trim());
      setKeys((list) => [...list.filter((c) => c.id !== id), connection]);
      setApiKey("");
      setAdding(false);
      void fetchKeyModels(connection);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeKey(connection: Connection) {
    setKeys((list) => list.filter((c) => c.id !== connection.id));
    if (choice?.connectionId === connection.id) setChoice(null);
    await daybook.deleteSecret(secretName(userId, connection.id)).catch(() => undefined);
  }

  function finish() {
    if (!choice) return;
    const withChoice = (c: Connection): Connection =>
      c.id === choice.connectionId ? { ...c, model: choice.model, modelLabel: choice.modelLabel } : c;
    const previous = (id: string) => connections.find((c) => c.id === id);
    const cliConnections: Connection[] = (clis ?? [])
      .filter((s) => s.found && s.signedIn)
      .map((s) => {
        const info = CLI_INFO[s.name];
        const before = previous(info.id);
        return {
          id: info.id,
          label: info.label,
          authKind: "local_cli",
          cliBinary: s.name,
          binaryPath: s.path,
          model: before?.model,
          modelLabel: before?.modelLabel,
        };
      });
    const keyConnections = keys.map((k) => ({ ...previous(k.id), ...k }));
    onDone([...cliConnections, ...keyConnections].map(withChoice), choice.connectionId);
  }

  return (
    <div className="mx-auto w-full max-w-xl py-10">
      <div className="mb-6">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-faint)]">
          Step 2 of 3
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Choose your secretary's model</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Daybook runs on an AI you already have: your Claude or ChatGPT plan through Claude
          Code or Codex on this Mac, or an API key. Pick a model — you can switch any time from
          the scoreboard. Daybook never sees your Claude or ChatGPT sign-in; API keys stay in
          this Mac's keychain.
        </p>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-faint)]">
          On this Mac
        </p>
        <Button variant="ghost" className="px-2 py-1 text-xs" disabled={clis === null} onClick={() => void check()}>
          <RefreshCw className="size-3.5" />
          Check again
        </Button>
      </div>

      <div className="space-y-3">
        {clis === null ? (
          <p className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-ink-faint)]">
            Looking for Claude Code and Codex…
          </p>
        ) : (
          clis.map((status) => {
            const info = CLI_INFO[status.name];
            const models = status.name === "claude" ? CLAUDE_CODE_MODELS : codexModels;
            return (
              <SourceCard
                key={status.name}
                icon={<TerminalSquare className="size-4" />}
                title={info.label}
                meta={status.version}
                status={
                  !status.found ? (
                    <>
                      Not found on this Mac.{" "}
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-[var(--color-ink)]"
                        onClick={() => void daybook.openExternal(info.install)}
                      >
                        How to install it
                      </button>
                      , then check again.
                    </>
                  ) : status.signedIn ? (
                    signedInAs(status)
                  ) : (
                    <>
                      {status.error ?? "Not signed in."} Open Terminal, run{" "}
                      <code className="text-[0.75rem]">{info.signIn}</code>, then check again.
                    </>
                  )
                }
                ready={Boolean(status.found && status.signedIn)}
              >
                {status.found && status.signedIn && (
                  <ModelPicker
                    connectionId={info.id}
                    models={models}
                    loadingText={status.name === "codex" && !codexError ? "Asking Codex for its models…" : undefined}
                    listError={status.name === "codex" ? codexError : null}
                    choice={choice}
                    onChoose={setChoice}
                    placeholder={status.name === "codex" ? "a Codex model ID" : "claude-sonnet-5"}
                  />
                )}
              </SourceCard>
            );
          })
        )}
      </div>

      <p className="mb-2 mt-6 text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-[var(--color-ink-faint)]">
        API keys
      </p>
      <div className="space-y-3">
        {keys.map((connection) => {
          const live = API_PROVIDERS.some((p) => p.id === connection.id && p.live);
          return (
            <SourceCard
              key={connection.id}
              icon={<KeyRound className="size-4" />}
              title={connection.label}
              status="Stored in this Mac's keychain."
              ready
              action={
                <button
                  type="button"
                  aria-label={`Remove ${connection.label}`}
                  className="text-[var(--color-ink-faint)] hover:text-[var(--color-warn)]"
                  onClick={() => void removeKey(connection)}
                >
                  <X className="size-4" />
                </button>
              }
            >
              <ModelPicker
                connectionId={connection.id}
                models={live ? (keyModels[connection.id] ?? null) : []}
                loadingText={live && !keyErrors[connection.id] ? "Asking the provider for its models…" : undefined}
                listError={keyErrors[connection.id] ?? null}
                choice={choice}
                onChoose={setChoice}
                placeholder="a model ID this key can call"
              />
            </SourceCard>
          );
        })}

        {adding ? (
          <div className="space-y-3 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <Field label="Provider">
              <select className={inputClass} value={providerId} onChange={(event) => setProviderId(event.target.value)}>
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
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy} onClick={() => void addKey()}>
                Store key
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Add an API key
          </Button>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <Button className="w-full" disabled={!choice} onClick={finish}>
          {choice ? `Continue with ${choice.modelLabel}` : "Choose a model to continue"}
        </Button>
      </div>
    </div>
  );
}

function SourceCard({
  icon,
  title,
  meta,
  status,
  ready,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  meta?: string;
  status: ReactNode;
  ready: boolean;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 ${ready ? "text-[var(--color-accent)]" : "text-[var(--color-ink-faint)]"}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {title}
            {meta && <span className="ml-2 text-xs font-normal text-[var(--color-ink-faint)]">{meta}</span>}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{status}</p>
        </div>
        {action}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function ModelPicker({
  connectionId,
  models,
  loadingText,
  listError,
  choice,
  onChoose,
  placeholder,
}: {
  connectionId: string;
  models: (ModelOption & { note?: string })[] | null;
  loadingText?: string;
  listError: string | null;
  choice: Choice | null;
  onChoose: (choice: Choice) => void;
  placeholder: string;
}) {
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const chosenHere = choice?.connectionId === connectionId ? choice.model : null;
  const chosenIsCustom = chosenHere !== null && !(models ?? []).some((m) => m.id === chosenHere);

  function chooseCustom() {
    const value = custom.trim();
    if (!isModelId(value)) {
      setCustomError("A model ID is letters, digits and . _ : / - only.");
      return;
    }
    setCustomError(null);
    onChoose({ connectionId, model: value, modelLabel: value });
  }

  return (
    <div className="space-y-1.5">
      {models === null && loadingText && <p className="text-xs text-[var(--color-ink-faint)]">{loadingText}</p>}
      {listError && (
        <p className="text-xs text-[var(--color-warn)]">
          {listError} You can still type a model ID below.
        </p>
      )}
      {(models ?? []).map((model) => {
        const selected = chosenHere === model.id;
        return (
          <button
            key={model.id}
            type="button"
            onClick={() => onChoose({ connectionId, model: model.id, modelLabel: model.label })}
            className={`flex w-full items-center gap-2 rounded-[var(--radius-card)] border px-3 py-2 text-left text-sm transition-colors ${
              selected
                ? "border-[var(--color-accent)]"
                : "border-[var(--color-line)] hover:border-[var(--color-ink-faint)]"
            }`}
          >
            <Check className={`size-4 shrink-0 ${selected ? "text-[var(--color-accent)]" : "text-transparent"}`} />
            <span className="font-medium">{model.label}</span>
            {model.note && <span className="text-xs text-[var(--color-ink-faint)]">{model.note}</span>}
            {model.isDefault && <span className="text-xs text-[var(--color-ink-faint)]">default</span>}
            <code className="ml-auto text-[0.7rem] text-[var(--color-ink-faint)]">{model.id}</code>
          </button>
        );
      })}
      <div className="flex gap-2 pt-1">
        <input
          className={`${inputClass} py-1.5 text-xs`}
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder={`Other: ${placeholder}`}
          aria-label="Other model ID"
        />
        <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={!custom.trim()} onClick={chooseCustom}>
          Use
        </Button>
      </div>
      {chosenIsCustom && (
        <p className="text-xs text-[var(--color-ink-soft)]">
          Using <code>{chosenHere}</code>.
        </p>
      )}
      {customError && <p className="text-xs text-[var(--color-warn)]">{customError}</p>}
    </div>
  );
}
