"""daybook — command line entry point.

    python -m daybook brief  --folder <path> [--clock ISO] [--write]
    python -m daybook check  --folder <path> [--clock ISO]
    python -m daybook serve  --folder <path> [--clock ISO] [--port 8787]
    python -m daybook tick     --folder <path> --state-dir <dir> [--clock ISO] [--no-notify]
    python -m daybook watchdog --folder <path> --state-dir <dir> [--clock ISO] [--no-notify]

``tick`` (launchd, every minute) writes today's brief once its time has passed; ``watchdog``
(launchd, hourly) notices a stopped tick or a missing brief. ``brief`` and ``serve`` both
build, verify and render. Nothing is written or served
unless all eleven assertions pass — a brief that renders wrong is worse than no brief.
"""

from __future__ import annotations

import argparse
import sys

from .assertions import all_passed, verify
from .brief import build
from .folder import open_folder
from .render import render
from .write import atomic_write_text

PENDING = ["briefs/{date}.html", "briefs/latest.html"]


def _produce(folder_path: str, clock: str | None):
    """Open, build, render, verify. Returns (folder, data, html, results)."""
    folder = open_folder(folder_path, clock_override=clock)
    pending = [p.format(date=folder.today.isoformat()) for p in PENDING]
    data = build(folder, pending_outputs=pending)
    html = render(data)
    return folder, data, html, verify(data, html)


def _report(results, verbose: bool) -> None:
    for result in results:
        if verbose or not result.ok:
            print("  " + result.line(), file=sys.stderr)
            if not result.ok:
                print(f"        catches: {result.catches}", file=sys.stderr)


def cmd_check(args) -> int:
    _, _, _, results = _produce(args.folder, args.clock)
    print(f"Verification — {sum(r.ok for r in results)}/{len(results)} passed", file=sys.stderr)
    _report(results, verbose=True)
    return 0 if all_passed(results) else 1


def cmd_brief(args) -> int:
    folder, data, html, results = _produce(args.folder, args.clock)
    if not all_passed(results):
        print("Brief NOT delivered — verification failed:", file=sys.stderr)
        _report(results, verbose=args.verbose)
        return 1

    _report(results, verbose=args.verbose)
    if not args.write:
        sys.stdout.write(html)
        print(
            "\n[not written — pass --write to write into the folder]", file=sys.stderr
        )
        return 0

    dated = folder.scope.resolve(f"briefs/{folder.today.isoformat()}.html")
    atomic_write_text(dated, html)
    # A copy, not a symlink: symlinks break when the folder is synced or zipped.
    atomic_write_text(folder.scope.resolve("briefs/latest.html"), html)
    print(f"Wrote {folder.scope.display(str(dated))} and briefs/latest.html", file=sys.stderr)
    return 0


def _scheduled(run, args) -> int:
    """tick and watchdog: one line per run in the launchd log, exit 1 only on an error."""
    from datetime import datetime

    from .tick import notify_macos

    notify = notify_macos if not args.no_notify else (lambda _title, _message: True)
    outcome = run(args.folder, args.state_dir, clock=args.clock, notify=notify)
    print(f"{datetime.now().isoformat(timespec='seconds')} {outcome.line()}", flush=True)
    return 1 if outcome.status == "error" else 0


def cmd_tick(args) -> int:
    from .tick import run_tick

    return _scheduled(run_tick, args)


def cmd_watchdog(args) -> int:
    from .tick import run_watchdog

    return _scheduled(run_watchdog, args)


def cmd_serve(args) -> int:
    from .server import serve

    serve(args.folder, args.clock, host="127.0.0.1", port=args.port)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="daybook", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    def common(p):
        p.add_argument("--folder", required=True, help="the state folder to read")
        p.add_argument("--clock", help="ISO timestamp to use instead of the system clock")
        p.add_argument("-v", "--verbose", action="store_true")
        return p

    common(sub.add_parser("check", help="run the eleven assertions and exit")).set_defaults(
        func=cmd_check
    )
    brief = common(sub.add_parser("brief", help="build, verify and render the brief"))
    brief.add_argument("--write", action="store_true", help="write into the folder")
    brief.set_defaults(func=cmd_brief)
    serve = common(sub.add_parser("serve", help="serve the brief on 127.0.0.1"))
    serve.add_argument("--port", type=int, default=8787)
    serve.set_defaults(func=cmd_serve)

    def scheduled(p, func):
        p.add_argument("--state-dir", required=True, help="where the run keeps its bookkeeping (app data)")
        p.add_argument("--no-notify", action="store_true", help="log only; post no notification")
        p.set_defaults(func=func)

    scheduled(
        common(sub.add_parser("tick", help="launchd, every minute: write today's brief once it is due")),
        cmd_tick,
    )
    scheduled(
        common(sub.add_parser("watchdog", help="launchd, hourly: notice a stopped tick or a missing brief")),
        cmd_watchdog,
    )

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
