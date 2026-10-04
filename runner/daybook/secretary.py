"""Asking the user's own model — through their CLI's own sign-in, or their API key.

The model is handed text and hands back text. It gets no tools, no files and no network
of its own, and nothing it says is ever run: plan.py reads the reply as data and Daybook
writes the folder itself. Every CLI runs with arguments fixed here, as a list, with no
shell; the model id is pattern-checked; the folder's content goes in on stdin, never as
an argument (AGENTS.md hard constraints, D4). A CLI's own credentials are never read —
it signs in the way it always does, and usage bills to the user's own plan.

An API key is never stored by the runner: the app hands it over on stdin for one call.
"""

from __future__ import annotations

import json
import os
import pwd
import re
import shutil
import ssl
import subprocess
import tempfile
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

# Letters, digits and . _ : / - only — the same shape the app holds a model id to when it
# enters config.json, checked again here because this is where it becomes an argument.
MODEL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")

TIMEOUT_SECONDS = 180  # per attempt; a long folder and a large model take a minute or two
MAX_REPLY_TOKENS = 8000

# Codex has no single "no tools" switch, so each feature that can reach outside the
# conversation is turned off by name, under a read-only sandbox, in an empty directory.
CODEX_FEATURES_OFF = (
    "shell_tool", "unified_exec", "apps", "plugins", "hooks", "browser_use",
    "in_app_browser", "computer_use", "image_generation", "view_image", "multi_agent",
    "memories", "skill_search", "tool_suggest",
)


class AskError(Exception):
    """The model could not be asked, or did not answer. The message is for the user."""


@dataclass
class Provider:
    """The active connection, as config.json records it (providers[0] — the app keeps the
    chosen one first)."""

    id: str
    label: str
    auth_kind: str
    binary: str = ""
    binary_path: str = ""
    model: str = ""
    model_label: str = ""

    @classmethod
    def from_config(cls, config: dict) -> "Provider | None":
        providers = config.get("providers") or []
        if not providers or not isinstance(providers[0], dict):
            return None
        p = providers[0]
        return cls(
            id=str(p.get("id", "")),
            label=str(p.get("label", "")),
            auth_kind=str(p.get("authKind", "")),
            binary=str(p.get("binary", "")),
            binary_path=str(p.get("binary_path", "")),
            model=str(p.get("model", "")),
            model_label=str(p.get("model_label", "")),
        )

    def describe(self) -> str:
        name = self.model_label or self.model or "the default model"
        return f"{name} · {self.label}" if self.label else name

    @property
    def needs_secret(self) -> bool:
        return self.auth_kind == "api_key"


def ask(provider: Provider, system: str, prompt: str, *, secret: str | None = None,
        schema: dict | None = None, timeout: int = TIMEOUT_SECONDS) -> str:
    """The model's reply to ``prompt``, as text."""
    if provider.model and not MODEL_ID.match(provider.model):
        raise AskError(f'"{provider.model}" is not a model id Daybook can pass on.')
    if provider.auth_kind == "local_cli":
        if provider.binary == "claude" or provider.id == "claude-cli":
            return _ask_claude(provider, system, prompt, timeout)
        if provider.binary == "codex" or provider.id == "codex-cli":
            return _ask_codex(provider, system, prompt, schema, timeout)
        raise AskError(f"Daybook doesn't know how to ask {provider.label or provider.id}.")
    if provider.auth_kind == "api_key":
        if not secret:
            raise AskError(
                "Your API key is unlocked only while Daybook is open, so it couldn't be "
                "used here. Open Daybook to plan the day."
            )
        if provider.id == "anthropic":
            return _ask_anthropic(provider, system, prompt, secret, timeout)
        if provider.id == "openai":
            return _ask_openai(provider, system, prompt, secret, timeout)
        raise AskError(f"Planning with a {provider.label or provider.id} key isn't supported yet.")
    raise AskError("No model is chosen for this folder — choose one in Daybook.")


# -- local CLIs ---------------------------------------------------------------------

def _binary(provider: Provider) -> str:
    path = provider.binary_path or shutil.which(provider.binary or "") or ""
    if not path or not os.access(path, os.X_OK):
        raise AskError(
            f"{provider.label or provider.binary} wasn't found"
            + (f" at {provider.binary_path}" if provider.binary_path else "")
            + " — choose your model again in Daybook."
        )
    return path


def _child_env(binary: str) -> dict:
    """A small, known environment. A CLI installed with npm is a Node script, so the
    folder it lives in (where nvm keeps node) goes first on PATH. USER and LOGNAME are
    set because a CLI reads its own keychain sign-in by user name, and launchd jobs run
    without them."""
    user = pwd.getpwuid(os.getuid()).pw_name
    path = [str(Path(binary).parent), "/opt/homebrew/bin", "/usr/local/bin",
            "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
    return {
        "HOME": os.path.expanduser("~"),
        "USER": user,
        "LOGNAME": user,
        "PATH": ":".join(dict.fromkeys(path)),
        "LANG": os.environ.get("LANG", "en_US.UTF-8"),
        "TMPDIR": tempfile.gettempdir(),
    }


def _run(args: list[str], prompt: str, cwd: str, binary: str, timeout: int,
         who: str) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            args, input=prompt, capture_output=True, text=True, cwd=cwd,
            env=_child_env(binary), timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise AskError(f"{who} didn't answer within {timeout // 60} minutes.") from exc
    except OSError as exc:
        raise AskError(f"{who} couldn't be started: {exc.strerror or exc}.") from exc


def _tail(text: str, limit: int = 300) -> str:
    text = " ".join((text or "").split())
    return text[-limit:]


def _ask_claude(provider: Provider, system: str, prompt: str, timeout: int) -> str:
    binary = _binary(provider)
    args = [
        binary, "-p",
        "--output-format", "json",
        "--tools", "",                 # no tools at all — it can read nothing, run nothing
        "--safe-mode",                 # none of the user's CLAUDE.md, hooks, plugins, MCP
        "--strict-mcp-config",
        "--no-session-persistence",    # the day is not kept in Claude Code's history
        "--system-prompt", system,
    ]
    if provider.model:
        args += ["--model", provider.model]
    with tempfile.TemporaryDirectory(prefix="daybook-ask-") as empty:
        done = _run(args, prompt, empty, binary, timeout, "Claude Code")
    try:
        envelope = json.loads(done.stdout)
    except json.JSONDecodeError:
        raise AskError(_cli_failure("Claude Code", done)) from None
    result = str(envelope.get("result", ""))
    if envelope.get("is_error") or done.returncode != 0:
        lowered = result.lower()
        if "login" in lowered or "api key" in lowered or "auth" in lowered:
            raise AskError("Claude Code isn't signed in on this Mac — run `claude auth login` in Terminal.")
        raise AskError(f"Claude Code answered with an error: {_tail(result) or _tail(done.stderr)}")
    return result


def _ask_codex(provider: Provider, system: str, prompt: str, schema: dict | None,
               timeout: int) -> str:
    binary = _binary(provider)
    with tempfile.TemporaryDirectory(prefix="daybook-ask-") as work:
        empty = Path(work, "empty")
        empty.mkdir()
        out = Path(work, "reply.txt")
        args = [
            binary, "exec",
            "--sandbox", "read-only",
            "--skip-git-repo-check",
            "--ephemeral",
            "--ignore-user-config",
            "--ignore-rules",
            "--color", "never",
            "--cd", str(empty),
            "--output-last-message", str(out),
        ]
        for feature in CODEX_FEATURES_OFF:
            args += ["--disable", feature]
        args += ["-c", 'web_search="disabled"']
        if schema is not None:
            schema_file = Path(work, "schema.json")
            schema_file.write_text(json.dumps(schema), encoding="utf-8")
            args += ["--output-schema", str(schema_file)]
        if provider.model:
            args += ["--model", provider.model]
        args.append("-")  # the prompt, on stdin
        # Codex takes no separate system prompt here; the instructions lead the input.
        done = _run(args, f"{system}\n\n---\n\n{prompt}", str(empty), binary, timeout, "Codex")
        reply = out.read_text(encoding="utf-8") if out.exists() else ""
    if done.returncode != 0 or not reply.strip():
        lowered = (done.stderr or "").lower()
        if "login" in lowered or "not logged in" in lowered or "unauthorized" in lowered:
            raise AskError("Codex isn't signed in on this Mac — run `codex login` in Terminal.")
        raise AskError(_cli_failure("Codex", done))
    return reply


def _cli_failure(who: str, done: subprocess.CompletedProcess) -> str:
    detail = _tail(done.stderr) or _tail(done.stdout) or f"exit code {done.returncode}"
    return f"{who} didn't give an answer Daybook could read ({detail})."


# -- API keys -----------------------------------------------------------------------

def _post(url: str, headers: dict, body: dict, timeout: int, who: str) -> dict:
    request = urllib.request.Request(
        url, data=json.dumps(body).encode("utf-8"),
        headers={"content-type": "application/json", **headers}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            message = json.loads(exc.read().decode("utf-8")).get("error", {}).get("message", "")
        except (ValueError, AttributeError):
            message = ""
        if exc.code in (401, 403):
            raise AskError(f"{who} refused the API key — check it in Daybook.") from None
        raise AskError(f"{who} answered {exc.code}: {_tail(message) or exc.reason}") from None
    except ssl.SSLError as exc:
        raise AskError(f"A secure connection to {who} couldn't be made ({exc.reason}).") from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        raise AskError(f"{who} couldn't be reached ({reason}).") from None
    except ValueError:
        raise AskError(f"{who} sent a reply Daybook couldn't read.") from None


def _ask_anthropic(provider: Provider, system: str, prompt: str, secret: str,
                   timeout: int) -> str:
    reply = _post(
        "https://api.anthropic.com/v1/messages",
        {"x-api-key": secret, "anthropic-version": "2023-06-01"},
        {"model": provider.model, "max_tokens": MAX_REPLY_TOKENS, "system": system,
         "messages": [{"role": "user", "content": prompt}]},
        timeout, "Anthropic",
    )
    parts = [b.get("text", "") for b in reply.get("content", []) if b.get("type") == "text"]
    return "".join(parts)


def _ask_openai(provider: Provider, system: str, prompt: str, secret: str,
                timeout: int) -> str:
    reply = _post(
        "https://api.openai.com/v1/responses",
        {"authorization": f"Bearer {secret}"},
        {"model": provider.model, "instructions": system, "input": prompt,
         "max_output_tokens": MAX_REPLY_TOKENS},
        timeout, "OpenAI",
    )
    parts = []
    for item in reply.get("output", []):
        for content in item.get("content", []) or []:
            if content.get("type") == "output_text":
                parts.append(content.get("text", ""))
    return "".join(parts)
