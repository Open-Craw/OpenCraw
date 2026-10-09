import json
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any


def write_recipes(
    folder: str | Path, recipes: Iterable[Mapping[str, Any]]
) -> list[Path]:
    """Writes each recipe as ``<id>.input.json`` or ``<id>.output.json``, the layout the CLI, the Studio
    and the MCP server read. The folder is created when missing. Returns the files written."""
    target = Path(folder)
    target.mkdir(parents=True, exist_ok=True)
    written = []
    for recipe in recipes:
        kind = recipe.get("kind")
        if kind not in ("input", "output") or not isinstance(recipe.get("id"), str):
            raise ValueError(
                f"a recipe needs a kind of 'input' or 'output' and a string id, got {dict(recipe)!r}"
            )
        path = target / f"{recipe['id']}.{kind}.json"
        path.write_text(json.dumps(recipe, indent=2) + "\n", encoding="utf-8")
        written.append(path)
    return written
