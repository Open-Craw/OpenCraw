import json
import os
import shlex
import shutil
import subprocess
import tempfile
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from .opencraw_contract import RecipeSource, Validation
from .opencraw_error import OpenCrawError
from .write_recipes_use_case import write_recipes


def cli_command() -> list[str]:
    """How to start the CLI: ``OPENCRAW_CLI`` if set, else ``opencraw`` on the PATH, else ``npx``."""
    configured = os.environ.get("OPENCRAW_CLI")
    if configured:
        return shlex.split(configured)
    installed = shutil.which("opencraw")
    if installed:
        return [installed]
    npx = shutil.which("npx")
    if npx is None:
        raise OpenCrawError(
            "opencraw is not installed: run `npm i -g @opencraw/cli` or set OPENCRAW_CLI"
        )
    return [npx, "--yes", "@opencraw/cli"]


def validate(recipes: Sequence[RecipeSource]) -> Validation:
    """Runs ``opencraw validate``. The result is not an exception when the recipes are wrong: ``ok`` says so
    and ``output`` lists every problem with its path."""
    with _RecipePaths(recipes) as paths:
        done = _call("validate", *paths)
    return Validation(
        ok=done.returncode == 0, output=(done.stdout + done.stderr).strip()
    )


def run(recipes: Sequence[RecipeSource], *options: str) -> list[dict[str, Any]]:
    """Runs ``opencraw run`` and returns the records it printed as dicts. ``options`` are CLI flags, such as
    ``'--only', 'shop-a'``. Raises ``OpenCrawError`` with the CLI's message when the crawl fails."""
    with _RecipePaths(recipes) as paths:
        done = _call("run", *paths, *options)
    if done.returncode != 0:
        raise OpenCrawError((done.stderr or done.stdout).strip())
    return [
        json.loads(line)
        for line in done.stdout.splitlines()
        if line.strip().startswith("{")
    ]


class _RecipePaths:
    """Recipe paths for the CLI: dicts are written to a temporary folder that goes away afterwards."""

    def __init__(self, recipes: Sequence[RecipeSource]) -> None:
        self._recipes = recipes
        self._folder = tempfile.TemporaryDirectory(prefix="opencraw-")

    def __enter__(self) -> list[str]:
        paths = [str(item) for item in self._recipes if not isinstance(item, Mapping)]
        objects = [item for item in self._recipes if isinstance(item, Mapping)]
        if objects:
            paths.append(str(Path(self._folder.name)))
            write_recipes(self._folder.name, objects)
        return paths

    def __exit__(self, *_: object) -> None:
        self._folder.cleanup()


def _call(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [*cli_command(), *arguments],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
