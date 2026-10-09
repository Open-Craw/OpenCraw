from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# A recipe as a plain dict, in the engine's own shape.
Recipe = dict[str, Any]

# A recipe given to validate() or run(): a file or folder path, or the recipe as a dict.
RecipeSource = str | Path | Mapping[str, Any]


@dataclass(frozen=True)
class Validation:
    """What ``opencraw validate`` said: ``ok``, and ``output`` listing every problem with its path."""

    ok: bool
    output: str
