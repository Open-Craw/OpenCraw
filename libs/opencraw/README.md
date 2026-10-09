# opencraw (Python)

Build [OpenCraw](../../README.md) recipes in Python, and drive the real CLI. Standard library only; it
needs Python 3.12+ and, to validate or run, the `opencraw` CLI (`npm i -g @opencraw/cli`, or
`OPENCRAW_CLI` set to the command that starts it; with neither, `npx @opencraw/cli` is used).

A recipe stays a plain dict in the engine's own shape, so the recipe guide
(`docs/recipes/authoring.md`) is the reference for every key. The constructors only save typing, and
the engine, not this package, says what is valid.

```python
from opencraw import input_recipe, output_recipe, run, step, validate

product = output_recipe(
    "product",
    {
        "url": {"type": "url", "required": True, "key": True},
        "title": {"type": "string", "required": True},
    },
)

shops = [
    input_recipe(
        f"shop-{name}",
        "product",
        "web",
        [url],
        [
            step("goto", url="{{start.url}}"),
            step("extract", id="title", selector=selector, kind="css", take="text"),
            step("emit"),
        ],
        {"url": {"from": "start.url"}, "title": {"from": "title"}},
    )
    for name, url, selector in [
        ("a", "https://a.example", "h1"),
        ("b", "https://b.example", ".name"),
    ]
]

result = validate(
    [product, *shops]
)  # Validation(ok, output): problems are data, not exceptions
records = run(
    [product, *shops], "--only", "shop-a"
)  # records as dicts; OpenCrawError if the crawl fails
```

Reserved words: pass a step's `as` or `from` through `**{"as": "json"}`.

`write_recipes(folder, recipes)` writes `<id>.input.json` and `<id>.output.json` for the CLI, the Studio
and the MCP server.

## A hook written in Python

A recipe's hook (`{ "op": "hook", "name": "slug" }`) can be a Python script. The hooks module registers it
with `commandHook` (`@opencraw/core`), and the script is a few lines:

```python
# hooks/slug.py
import re
from opencraw import serve_hook

serve_hook(
    lambda value, args, request: re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip(
        "-"
    )
)
```

`serve_hook(handler)` reads the request from stdin, calls `handler(input, args, request)` (`input` is `None`
for a `hook` step; `request` carries `context` and `idempotencyKey`) and writes the answer to stdout. What the
handler returns is the output; an exception becomes an error answer with its message, so the step fails with
that reason. A handler whose work takes longer raises `HookPending(retry_after_ms)`: OpenCraw runs the script
again after that wait, with the same `idempotencyKey`, until it returns or the hook's `maxWaitMs` passes, so the
script starts the work once and looks it up by that key on later runs. The request and answer shapes are in
`packages/core/schemas/callout-*.schema.json`.

Not in this package: a Python engine, generated typed models, publishing to PyPI. It is an internal
library of the workspace: `mnci ci release` publishes what sits under `python-packages/`, and this lives
in `libs/`.

## Development

`nx test opencraw` (pytest; the CLI integration tests use this repository's built CLI and skip without it),
`nx lint opencraw` (Ruff), `nx typecheck opencraw` (mypy strict).
