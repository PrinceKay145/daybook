"""HTTP on 127.0.0.1, for the frontend.

The frontend always talks to ``127.0.0.1`` and never to a bundle-specific API. That is
what keeps it runnable in a plain browser during development and wrappable in Tauri at
ship time, with the React code unchanged.

**Loopback only.** The socket is bound to 127.0.0.1, never 0.0.0.0. This process holds a
user's whole life and has no authentication in week 1; the interface it is reachable on is
the entire access control, so it must not be widened for convenience.

⚠️ This is not a resident daemon. It lives as long as the app that spawned it and dies
with it. ARCHITECTURE §4.1a: scheduled work is spawned by the launchd tick and does not
need this process, and making it resident costs crash resilience for nothing.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, is_dataclass
from datetime import date, datetime
from enum import Enum
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .assertions import all_passed, verify
from .brief import build
from .folder import open_folder
from .render import render

# Vite's dev server runs on another port, so the browser sends a cross-origin request.
# Only loopback origins are allowed, and only GET.
_LOOPBACK_ORIGIN = re.compile(r"^http://(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$")

PENDING = ["briefs/{date}.html", "briefs/latest.html"]


def _plain(value):
    """dataclasses -> dicts, dates -> ISO strings. No third-party serialiser."""
    if is_dataclass(value) and not isinstance(value, type):
        return {k: _plain(v) for k, v in asdict(value).items()}
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    return value


def _payload(folder_path: str, clock: str | None) -> tuple[dict, str, bool]:
    folder = open_folder(folder_path, clock_override=clock)
    pending = [p.format(date=folder.today.isoformat()) for p in PENDING]
    data = build(folder, pending_outputs=pending)
    html = render(data)
    results = verify(data, html)
    payload = {
        "folder": str(folder.scope.root),
        "scopeRoot": folder.scope.alias,
        "clock": {
            "value": folder.clock.now.isoformat(timespec="minutes"),
            "source": folder.clock.source,
            "frozen": folder.clock.frozen,
        },
        "brief": _plain(data),
        "verification": {
            "passed": all_passed(results),
            "results": [_plain(r) for r in results],
        },
        "diagnostics": {
            "heartbeat": _plain(folder.heartbeat),
            "invalidMutes": [
                {"id": r.id, "title": r.title, "pausedOn": r.paused}
                for r in folder.schedule.invalid_mutes()
            ],
            "providers": folder.config.get("providers", []),
            "scope": folder.config.get("scope", {}),
            "budget": folder.config.get("budget", {}),
            "warnings": data.warnings,
        },
    }
    return payload, html, all_passed(results)


def make_handler(folder_path: str, clock: str | None):
    class Handler(BaseHTTPRequestHandler):
        server_version = "daybook"
        sys_version = ""

        def _cors(self) -> None:
            origin = self.headers.get("Origin")
            if origin and _LOOPBACK_ORIGIN.match(origin):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")

        def _send(self, status: int, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self._cors()
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:          # noqa: N802
            self.send_response(204)
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self._cors()
            self.end_headers()

        def do_GET(self) -> None:              # noqa: N802
            path = self.path.split("?", 1)[0].rstrip("/") or "/"
            try:
                if path == "/health":
                    self._send(200, b'{"ok":true}', "application/json; charset=utf-8")
                    return

                payload, html, passed = _payload(folder_path, clock)

                if path in ("/", "/api/brief"):
                    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                    self._send(200, body, "application/json; charset=utf-8")
                elif path == "/brief.html":
                    if not passed:
                        # Never serve an unverified brief. A brief that renders wrong is
                        # read quickly, trusted and acted on.
                        failures = "".join(
                            f"<li><b>{r['id']}</b> {r['name']} — {r['detail']}</li>"
                            for r in payload["verification"]["results"]
                            if not r["ok"]
                        )
                        page = (
                            "<!doctype html><meta charset='utf-8'>"
                            "<title>Brief withheld</title>"
                            "<body style='font:16px/1.5 -apple-system,sans-serif;"
                            "max-width:640px;margin:48px auto;padding:0 16px'>"
                            "<h1>Brief withheld</h1><p>Verification failed, so nothing "
                            "was rendered. A brief that renders wrong is worse than no "
                            f"brief.</p><ul>{failures}</ul></body>"
                        )
                        self._send(409, page.encode("utf-8"), "text/html; charset=utf-8")
                    else:
                        self._send(200, html.encode("utf-8"), "text/html; charset=utf-8")
                else:
                    self._send(404, b'{"error":"not found"}', "application/json")
            except Exception as exc:                    # noqa: BLE001
                # The message goes to the local log the user can read and send. Not to a
                # third-party error service — stack traces carry real paths.
                body = json.dumps({"error": str(exc), "type": type(exc).__name__})
                self._send(500, body.encode("utf-8"), "application/json; charset=utf-8")

        def log_message(self, fmt: str, *args) -> None:
            print(f"daybook {self.address_string()} {fmt % args}", flush=True)

    return Handler


def serve(folder_path: str, clock: str | None, host: str = "127.0.0.1", port: int = 8787):
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError(
            f"refusing to bind to {host!r}: the runner is loopback-only"
        )
    httpd = ThreadingHTTPServer((host, port), make_handler(folder_path, clock))
    print(f"daybook runner on http://{host}:{port}  folder={folder_path}", flush=True)
    print("  GET /api/brief   the brief as data, with verification results", flush=True)
    print("  GET /brief.html  the self-contained brief", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return httpd
