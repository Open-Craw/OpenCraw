import io
import json
import subprocess
import sys
import unittest
from pathlib import Path
from typing import Any

from opencraw import HookRequest, serve_hook

CORE = (
    Path(__file__).resolve().parents[3] / "packages" / "core" / "dist" / "index.esm.js"
)


def answer_to(request: dict[str, Any], handler: Any) -> dict[str, Any]:
    out = io.StringIO()
    serve_hook(handler, io.StringIO(json.dumps(request)), out)
    answer: dict[str, Any] = json.loads(out.getvalue())
    return answer


REQUEST = {
    "kind": "hook",
    "name": "slug",
    "input": "Hello World",
    "args": {"max": 5},
    "context": {"recipeId": "books", "scope": {}},
    "idempotencyKey": "abc",
}


class ServeHookTest(unittest.TestCase):
    def test_the_return_value_is_the_output(self) -> None:
        answer = answer_to(
            REQUEST, lambda value, args, _request: f"{value}:{args['max']}"
        )

        self.assertEqual(answer, {"status": "ok", "output": "Hello World:5"})

    def test_the_handler_sees_the_whole_request(self) -> None:
        seen: list[HookRequest] = []

        def handler(_value: Any, _args: dict[str, Any], request: HookRequest) -> None:
            seen.append(request)

        answer_to(REQUEST, handler)

        self.assertEqual(seen[0]["context"]["recipeId"], "books")
        self.assertEqual(seen[0]["idempotencyKey"], "abc")

    def test_a_hook_step_has_no_input(self) -> None:
        request = {key: value for key, value in REQUEST.items() if key != "input"}

        answer = answer_to(request, lambda value, _args, _request: value is None)

        self.assertEqual(answer["output"], True)

    def test_an_exception_becomes_an_error_answer(self) -> None:
        def handler(_value: Any, _args: dict[str, Any], _request: HookRequest) -> None:
            raise ValueError("no such price")

        self.assertEqual(
            answer_to(REQUEST, handler), {"status": "error", "error": "no such price"}
        )

    def test_an_exception_without_a_message_names_its_type(self) -> None:
        def handler(_value: Any, _args: dict[str, Any], _request: HookRequest) -> None:
            raise KeyError

        self.assertEqual(answer_to(REQUEST, handler)["error"], "KeyError")


@unittest.skipUnless(CORE.exists(), "the repository's core is not built")
class CommandHookIntegrationTest(unittest.TestCase):
    """The real ``commandHook`` from the built core runs a script that uses ``serve_hook``."""

    def test_a_python_script_is_a_hook(self) -> None:
        package_root = Path(__file__).resolve().parents[1]
        script = (
            "from opencraw import serve_hook\n"
            "serve_hook(lambda value, args, request: str(value).strip().upper() + '!' * args['bangs'])\n"
        )
        node = f"""
        import {{ commandHook }} from {json.dumps(CORE.as_uri())}
        const hook = commandHook('shout', [{json.dumps(sys.executable)}, '-c', {json.dumps(script)}], {{ cwd: {json.dumps(str(package_root))} }})
        process.stdout.write(JSON.stringify(await hook('  hi ', {{ bangs: 2 }}, {{ recipeId: 'r', scope: {{}}, log: () => undefined }})))
        """

        result = subprocess.run(
            ["node", "--input-type=module", "-e", node],
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), "HI!!")
