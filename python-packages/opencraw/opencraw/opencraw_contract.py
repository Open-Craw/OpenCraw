from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, NotRequired, TypedDict

# A recipe as a plain dict, in the engine's own shape.
Recipe = dict[str, Any]

# A recipe given to validate() or run(): a file or folder path, or the recipe as a dict.
RecipeSource = str | Path | Mapping[str, Any]


class HookContext(TypedDict):
    """Where a hook runs: the recipe, and the extracted values visible at the call site."""

    recipeId: str
    scope: dict[str, Any]


class HookRequest(TypedDict):
    """The request OpenCraw sends a hook (``schemas/callout-request.schema.json``)."""

    kind: str
    name: str
    input: NotRequired[Any]
    args: dict[str, Any]
    context: HookContext
    idempotencyKey: str


@dataclass(frozen=True)
class Validation:
    """What ``opencraw validate`` said: ``ok``, and ``output`` listing every problem with its path."""

    ok: bool
    output: str
