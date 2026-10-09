import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from opencraw import (
    OpenCrawError,
    cli_command,
    input_recipe,
    output_recipe,
    run,
    step,
    validate,
)

REPO_CLI = (
    Path(__file__).resolve().parents[3] / "packages" / "cli" / "bin" / "opencraw.mjs"
)
CLI_BUILT = (REPO_CLI.parent.parent / "dist" / "index.esm.js").exists()


class CliCommandTest(unittest.TestCase):
    def test_the_environment_wins(self) -> None:
        with mock.patch.dict(os.environ, {"OPENCRAW_CLI": "node /x/cli.mjs"}):
            self.assertEqual(cli_command(), ["node", "/x/cli.mjs"])


@unittest.skipUnless(CLI_BUILT, "the repository's CLI is not built")
class CliIntegrationTest(unittest.TestCase):
    """Against the repository's own CLI, through the files this package writes."""

    def setUp(self) -> None:
        patcher = mock.patch.dict(os.environ, {"OPENCRAW_CLI": f'node "{REPO_CLI}"'})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        data = Path(self.folder.name) / "data.json"
        data.write_text(
            json.dumps({"items": [{"name": "Widget"}, {"name": "Gadget"}]}),
            encoding="utf-8",
        )
        self.output = output_recipe(
            "thing", {"name": {"type": "string", "required": True, "key": True}}
        )
        self.input = input_recipe(
            "things",
            "thing",
            "api",
            [data.as_uri()],
            [
                step("request", id="response", url="{{start.url}}", **{"as": "json"}),
                step(
                    "extract",
                    id="items",
                    **{"from": "response"},
                    selector="$.items[*]",
                    kind="jsonpath",
                    take="json",
                    many=True,
                ),
                step("forEach", over="items", **{"as": "item"}, emit=True, steps=[]),
            ],
            {"name": {"from": "item.name"}},
        )

    def test_validate_accepts_good_recipes(self) -> None:
        result = validate([self.output, self.input])
        self.assertTrue(result.ok, result.output)

    def test_validate_reports_a_bad_step_without_raising(self) -> None:
        bad = {**self.input, "steps": [step("gotoo", url="x")]}
        result = validate([self.output, bad])
        self.assertFalse(result.ok)
        self.assertIn("things", result.output)

    def test_run_returns_the_records_as_dicts(self) -> None:
        records = run([self.output, self.input])
        self.assertEqual(
            sorted(record["name"] for record in records), ["Gadget", "Widget"]
        )

    def test_run_raises_with_the_cli_message_on_failure(self) -> None:
        bad = {**self.input, "steps": [step("gotoo", url="x")]}
        with self.assertRaises(OpenCrawError):
            run([self.output, bad])


if __name__ == "__main__":
    unittest.main()
