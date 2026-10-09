# Building recipes in code

A recipe is JSON, and a crawl never runs code you wrote into a recipe. That does not mean you have to
type every recipe by hand. When you have fifty similar sites, a list of regions or a shared login, build
the recipe objects in JavaScript or TypeScript, and let the engine see only the final JSON shape.

The loader accepts a plain object as a recipe source, so there is no file round trip:

```js
import { createCrawler, loadRecipes, memorySink } from '@opencraw/core'

const output = {
  kind: 'output',
  id: 'product',
  version: 1,
  fields: {
    url:   { type: 'url', required: true, key: true },
    title: { type: 'string', required: true },
  },
}

// One input recipe per shop: same steps, different start URL and selector.
const shops = [
  { id: 'shop-a', url: 'https://a.example/catalog', title: 'h1.name' },
  { id: 'shop-b', url: 'https://b.example/products', title: '.product-title' },
]

const inputs = shops.map(shop => ({
  kind:   'input',
  id:     shop.id,
  output: 'product',
  mode:   'web',
  start:  [{ url: shop.url }],
  steps: [
    { type: 'goto', url: '{{start.url}}' },
    { type: 'extract', id: 'title', selector: shop.title, kind: 'css', take: 'text' },
    { type: 'emit' },
  ],
  mapping: { url: { from: 'start.url' }, title: { from: 'title' } },
}))

const recipes = await loadRecipes([output, ...inputs])
const report = await createCrawler({ sink: memorySink() }).run(recipes)
```

`loadRecipes` takes the output recipe and the inputs from one array and tells them apart by `kind`. If
you keep them apart, `loadRecipeSet({ output, inputs })` takes each part separately. Both accept any
mix of objects, JSON text, JSON Lines text, file paths and directories, so you can build some recipes in
code and keep the rest as files.

## Type checking in TypeScript

`@opencraw/core` exports the recipe types, so no builder function is needed: `satisfies` checks an object
literal against the type and keeps its own narrow type.

```ts
import type { InputRecipe } from '@opencraw/core'

const recipe = {
  kind:   'input',
  id:     'shop-a',
  output: 'product',
  mode:   'web',
  start:  [{ url: 'https://a.example/catalog' }],
  steps:  [{ type: 'goto', url: '{{start.url}}' }, { type: 'emit' }],
  mapping: {},
} satisfies InputRecipe
```

A misspelt step type (`'gotoo'`) is a compile error that suggests `'goto'`, and the editor completes step
types and keys. `OutputRecipe` does the same for an output recipe. Template expressions and bindings are
still checked at load time, as above.

## From Python

`python-packages/opencraw` is a small standard-library package for building the same recipe dicts in Python
and driving the real CLI: `input_recipe`, `output_recipe` and `step` save typing, `write_recipes` writes the
files, `validate` and `run` call `opencraw validate` and `opencraw run` and hand back the records as dicts.
It restates no schema, so the engine stays the one place that says what is valid. See its
[README](../../python-packages/opencraw/README.md). It is published to PyPI as `opencraw`.

## What is checked, and when

Objects get exactly the validation a file gets: the schema, the template expressions, the binding of each
input to its output. A mistake in a generated recipe throws a `RecipeValidationError` or
`RecipeBindingError` that names the recipe by its `id` (and by its position, such as `recipes[2]`, where
there is no id yet).
Nothing is checked while you build the objects, only when you load them.

To keep the generated recipes, write them out with `JSON.stringify(recipe, null, 2)`, which is what the CLI,
the MCP server and the Studio read.

## Boundaries

- The objects are authoring-time only. Functions, class instances and anything that does not survive
  `JSON.stringify` are not recipe content.
- The template language stays sandboxed (no calls, no `new`). Real logic during a crawl belongs in a
  [`hook` step](./authoring.md), the one sanctioned place for it.
- Other languages (Python, Go, a shell script) can generate recipes the same way: write JSON, then hand
  the files to the CLI or the MCP server. `packages/core/schemas/` has the JSON Schemas to generate
  against. There is no Python package, because Python cannot hand a live object to the engine.
