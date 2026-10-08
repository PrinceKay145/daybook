/* Choose your secretary's model. The model is the choice; where it runs follows from it —
   Claude Code or Codex already signed in on this Mac (the user's own plan, through the
   CLI's own sign-in, which Daybook never sees), or an API key in the keychain.

   Claude Code's models are a catalog (models.ts); Codex lists its own through its
   app-server; API keys list theirs through the main process, so the key never enters
   this renderer. Switching later reopens this same step from the scoreboard. */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Plus, RefreshCw, X } from "lucide-react";
import {
  daybook,
  secretName,
  type CliStatus,
  type Connection,
  type ListableModelProvider,
  type ModelOption,
} from "@/lib/daybook";
import { CLAUDE_CODE_MODELS, isModelId } from "@/lib/models";
import { Button, ErrorNote, Field, SectionLabel, inputClass } from "@/components/ui/button";
import { OnboardingFrame, PageFrame } from "@/components/OnboardingFrame";
import { cn } from "@/lib/utils";

/* API keys are built but not offered in Beta 1 (S12): the beta runs on Claude Code and
   Codex, the users' own plans. Turning this on brings the section back unchanged. */
const API_KEYS_OFFERED = false;

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
  onboarding,
  folderName,
  onBack,
  onDone,
}: {
  userId: string;
  connections: Connection[];
  activeId?: string;
  /** Part of first-run setup (step 2 of 3), or a change of model later. */
  onboarding: boolean;
  folderName?: string;
  onBack?: () => void;
  onDone: (connections: Connection[], activeConnectionId: string) => void;
}) {
  const saved = connections.find((c) => c.id === activeId) ?? connections[0];
  const [choice, setChoice] = useState<Choice | null>(
    saved?.model ? { connectionId: saved.id, model: saved.model, modelLabel: saved.modelLabel ?? saved.model } : null,
  );
  const [clis, setClis] = useState<CliStatus[] | null>(null);
  const [codexModels, setCodexModels] = useState<ModelOption[] | null>(null);
  const [codexError, setCodexError] = useState<string | null>(null);
  const [keys, setKeys] = useState<Connection[]>(
    API_KEYS_OFFERED ? connections.filter((c) => c.authKind === "api_key") : [],
  );
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

  const intro = API_KEYS_OFFERED
    ? "Daybook runs on an AI you already have: your Claude or ChatGPT plan through Claude Code or Codex on this Mac, or an API key. You can switch any time."
    : "Daybook runs on an AI you already have: your Claude or ChatGPT plan, through Claude Code or Codex on this Mac. You can switch any time.";

  const body = (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <SectionLabel>On this Mac</SectionLabel>
        <Button variant="ghost" disabled={clis === null} onClick={() => void check()}>
          <RefreshCw />
          Check again
        </Button>
      </div>

      {clis === null ? (
        <p className="text-[13px] text-[var(--color-ink-faint)]">Looking for Claude Code and Codex…</p>
      ) : (
        clis.map((status) => {
          const info = CLI_INFO[status.name];
          const models = status.name === "claude" ? CLAUDE_CODE_MODELS : codexModels;
          return (
            <Source
              key={status.name}
              title={info.label}
              meta={status.version}
              ready={Boolean(status.found && status.signedIn)}
              status={
                !status.found ? (
                  <>
                    Not found on this Mac.{" "}
                    <button
                      type="button"
                      className="text-[var(--color-accent)] underline decoration-1 underline-offset-[3px]"
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
                    <code className="rounded bg-[var(--color-sunken)] px-1 py-0.5 font-mono text-[12px] text-[var(--color-ink)]">{info.signIn}</code>, then check again.
                  </>
                )
              }
            >
              {status.found && status.signedIn && (
                <ModelPicker
                  connectionId={info.id}
                  models={models}
                  loadingText={status.name === "codex" && !codexError ? "Asking Codex for its models…" : undefined}
                  listError={status.name === "codex" ? codexError : null}
                  choice={choice}
                  onChoose={setChoice}
                  placeholder={status.name === "codex" ? "e.g. a Codex model ID" : "e.g. claude-sonnet-5"}
                />
              )}
            </Source>
          );
        })
      )}

      {API_KEYS_OFFERED && (
        <div className="space-y-3">
          <SectionLabel>API keys</SectionLabel>
          {keys.map((connection) => {
            const live = API_PROVIDERS.some((p) => p.id === connection.id && p.live);
            return (
              <Source
                key={connection.id}
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
                  placeholder="e.g. a model ID this key can call"
                />
              </Source>
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
                  <input className={inputClass} value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="e.g. Mistral" />
                </Field>
              )}
              <Field label="API key" hint={API_PROVIDERS.find((p) => p.id === providerId)?.hint ?? "Stored in your keychain, never shown again."}>
                <input className={inputClass} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste your key" autoComplete="off" />
              </Field>
              <ErrorNote message={error} />
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => void addKey()}>Store key</Button>
                <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <Plus />
              Add an API key
            </Button>
          )}
        </div>
      )}
    </div>
  );

  const action = (
    <Button size="lg" disabled={!choice} onClick={finish}>
      {choice ? `Continue with ${choice.modelLabel}` : "Choose a model to continue"}
    </Button>
  );

  if (onboarding) {
    return (
      <OnboardingFrame
        step={2}
        chosen={{ folder: folderName }}
        title="Choose your secretary's model"
        intro={intro}
        footer={
          <>
            <span>Daybook never sees your Claude or ChatGPT sign-in.</span>
            {action}
          </>
        }
      >
        {body}
      </OnboardingFrame>
    );
  }
  return (
    <PageFrame
      title="Choose your secretary's model"
      intro={intro}
      back={
        onBack && (
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft />
            Back to today
          </Button>
        )
      }
    >
      {body}
      <div className="mt-8">{action}</div>
    </PageFrame>
  );
}

/* One way of running the secretary — a CLI on this Mac, or a key: its name and state, then
   its models. A section, not a card. */
function Source({
  title,
  meta,
  status,
  ready,
  action,
  children,
}: {
  title: string;
  meta?: string;
  status: ReactNode;
  ready: boolean;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3">
        <span className={cn("mt-[7px] size-2 shrink-0 rounded-full", ready ? "bg-[var(--color-accent)]" : "bg-[var(--color-line)]")} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">
            {title}
            {meta && <span className="ml-2 font-mono text-[11.5px] font-normal text-[var(--color-ink-faint)]">{meta}</span>}
          </h2>
          <p className="text-[13px] text-[var(--color-ink-soft)]">{status}</p>
        </div>
        {action}
      </div>
      {children && <div className="pl-5">{children}</div>}
    </section>
  );
}

/* The models as one list of radio rows. The model id stays out of the way (it is the
   row's tooltip); another id can still be typed, behind "Use another model". */
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
  models: (ModelOption & { note?: string; recommended?: boolean })[] | null;
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
  const [showCustom, setShowCustom] = useState(chosenIsCustom);

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
    <div className="space-y-2">
      {models === null && loadingText && <p className="text-[12.5px] text-[var(--color-ink-faint)]">{loadingText}</p>}
      {listError && <p className="text-[12.5px] text-[var(--color-warn)]">{listError} You can still type a model ID below.</p>}
      {(models ?? []).length > 0 && (
        <div role="radiogroup" aria-label="Models" className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          {(models ?? []).map((model) => {
            const selected = chosenHere === model.id;
            return (
              <button
                key={model.id}
                type="button"
                role="radio"
                aria-checked={selected}
                title={model.id}
                onClick={() => onChoose({ connectionId, model: model.id, modelLabel: model.label })}
                className={cn("flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                  selected ? "bg-[var(--color-sunken)]" : "hover:bg-[var(--color-sunken)]/60")}
              >
                <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border",
                  selected ? "border-[var(--color-accent)]" : "border-[var(--color-ink-faint)]")}>
                  {selected && <span className="size-2 rounded-full bg-[var(--color-accent)]" />}
                </span>
                <span className="text-[14px] font-medium">{model.label}</span>
                {model.note && <span className="text-[12.5px] text-[var(--color-ink-faint)]">{model.note}</span>}
                {model.isDefault && <span className="text-[12.5px] text-[var(--color-ink-faint)]">Codex's default</span>}
                {model.recommended && <span className="ml-auto text-[12px] font-medium text-[var(--color-accent)]">Recommended</span>}
              </button>
            );
          })}
        </div>
      )}
      {showCustom ? (
        <div className="flex gap-2 pt-1">
          <input
            className={cn(inputClass, "h-8 py-1 text-[13px]")}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder={placeholder}
            aria-label="Another model ID"
          />
          <Button variant="secondary" disabled={!custom.trim()} onClick={chooseCustom}>
            Use
          </Button>
        </div>
      ) : (
        <button type="button" className="text-[12.5px] text-[var(--color-ink-soft)] underline decoration-1 underline-offset-[3px] hover:text-[var(--color-ink)]"
          onClick={() => setShowCustom(true)}>
          Use another model
        </button>
      )}
      {chosenIsCustom && (
        <p className="text-[12.5px] text-[var(--color-ink-soft)]">
          Using <code className="font-mono">{chosenHere}</code>.
        </p>
      )}
      {customError && <p className="text-[12.5px] text-[var(--color-warn)]">{customError}</p>}
    </div>
  );
}
