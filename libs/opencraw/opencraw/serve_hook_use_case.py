import json
import sys
from collections.abc import Callable
from typing import Any, TextIO

from .hook_pending_error import HookPending
from .opencraw_contract import HookRequest


def serve_hook(
    handler: Callable[[Any, dict[str, Any], HookRequest], Any],
    stdin: TextIO | None = None,
    stdout: TextIO | None = None,
) -> None:
    """Answer one OpenCraw hook call: read the request, run ``handler``, write the answer.

    ``handler(input, args, request)`` gets the value a hook transform is working on (``None`` for a
    ``hook`` step), the recipe's arguments, and the whole request (``context``, ``idempotencyKey``).
    What it returns is the output, and an exception becomes an ``error`` answer with its message, so
    the step fails with that reason instead of a stack trace. Raising ``HookPending`` answers
    ``pending`` instead, and OpenCraw asks again later. Use it as the whole of a hook script,
    the program ``commandHook`` runs::

        from opencraw import serve_hook

        serve_hook(lambda value, args, request: str(value).strip().lower())
    """
    request: HookRequest = json.load(stdin or sys.stdin)
    try:
        answer: dict[str, Any] = {
            "status": "ok",
            "output": handler(request.get("input"), request.get("args", {}), request),
        }
    except HookPending as pending:
        answer = {"status": "pending"}
        if pending.retry_after_ms is not None:
            answer["retryAfterMs"] = pending.retry_after_ms
    except Exception as error:  # noqa: BLE001 - whatever the handler raises is the hook's answer
        answer = {"status": "error", "error": str(error) or type(error).__name__}
    json.dump(answer, stdout or sys.stdout)
