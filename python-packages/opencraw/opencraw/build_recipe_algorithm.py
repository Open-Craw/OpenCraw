"""Plain-dict constructors for recipes. They save typing and nothing more: the step and field shapes are
the engine's, so a key goes in exactly as the recipe guide spells it (``forEach``, ``inStock``) and the
engine, not this module, says whether it is valid."""

from collections.abc import Mapping, Sequence
from typing import Any

from .opencraw_contract import Recipe

StartPoint = str | Mapping[str, Any]


def step(step_type: str, **fields: Any) -> Recipe:
    """One step: ``step('goto', url='{{start.url}}')`` is ``{'type': 'goto', 'url': '{{start.url}}'}``."""
    return {"type": step_type, **fields}


def output_recipe(
    recipe_id: str, fields: Mapping[str, Any], version: int = 1, **extra: Any
) -> Recipe:
    """An output recipe: the records' schema."""
    return {
        "kind": "output",
        "id": recipe_id,
        "version": version,
        "fields": dict(fields),
        **extra,
    }


def input_recipe(
    recipe_id: str,
    output: str,
    mode: str,
    start: Sequence[StartPoint],
    steps: Sequence[Mapping[str, Any]],
    mapping: Mapping[str, Any] | None = None,
    **extra: Any,
) -> Recipe:
    """An input recipe. A start given as a string is a URL: ``'https://a.example'`` is ``{'url': ...}``."""
    return {
        "kind": "input",
        "id": recipe_id,
        "output": output,
        "mode": mode,
        "start": [
            {"url": point} if isinstance(point, str) else dict(point) for point in start
        ],
        "steps": [dict(each) for each in steps],
        "mapping": dict(mapping or {}),
        **extra,
    }
