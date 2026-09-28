<p align="center">
  <img src="../assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# ADR: Vertical feature slices and file naming

- **Status:** Accepted
- **Date:** 2026-09-24 (UI file-role naming for `apps/**` added 2026-09-28)
- **Scope:** every hand-authored TypeScript package under `packages/` (core, cli, mcp, office-reader, captcha-tesseract,
  azure-durable). `apps/` (React apps such as `apps/studio-ui`) is not covered by the slice/boundary rules below —
  no flat-folder limit, no barrel-only-import rule — but its `.tsx` files and hooks *do* follow the file-role
  naming convention in [UI file naming](#ui-file-naming-appstsx-and-hooks), so a file's role is legible from its
  name everywhere in the repo, not just under `packages/`.
- **Enforced by:** `@mnci/eslint-config`'s `verticalSlices` rules, switched on in the root `eslint.config.mjs`, for
  `packages/**`. The `apps/**` UI naming convention below is not yet lint-enforced — it's a PR-review convention.

## Decision

Each package is organised as **capability -> cohesive subfeature -> flat, role-suffixed files**.

- The **package is the capability** (`@opencraw/core` = "run a recipe-driven crawl").
- Every folder directly under `src/` is a **subfeature** ("slice"): one outcome, one `index.ts` that is its
  whole public API.
- A slice is **flat**. The only folder allowed inside one is `fixtures/`, which holds test data (HTML, JSON),
  never code.
- Every production file is `<kebab-name>.<role>.ts`; tests are `<basename>.test.ts` beside the file.
- Only `index.ts` (and a program's `main.ts`) lives at the root of `src/`.
- Code that is not part of the library (`e2e/`, `tools/`) sits **outside `src/`** and is not subject to the
  slice rules.

This combines Vertical Slice Architecture with the vocabulary of Clean/Hexagonal Architecture and
Domain-Driven Design. No framework, mediator or dependency-injection container is implied.

## Suffix glossary (the lint's role list)

| Suffix | Responsibility | Example |
|---|---|---|
| `.handler.ts` | Adapts a transport (HTTP, queue, timer, webhook, an MCP tool). Not used by `@opencraw/core`. | `start-crawl.handler.ts` |
| `.use-case.ts` | Coordinates one operation, including I/O. | `run-steps.use-case.ts` |
| `.algorithm.ts` | Computes something purely: no decision with business meaning, no I/O. | `template.algorithm.ts` |
| `.policy.ts` | Makes a reusable decision. | `retry.policy.ts` |
| `.model.ts` | Holds a concept with meaning, state or invariants. | `extraction-scope.model.ts` |
| `.contract.ts` | Data crossing a boundary: a recipe file, a port interface, an event payload. | `input-recipe.contract.ts` |
| `.mapper.ts` | Deterministic conversion between representations. | `coerce-field.mapper.ts` |
| `.validator.ts` | Accepts or rejects data and says why. | `recipe-binding.validator.ts` |
| `.repository.ts` | Persistence expressed in domain terms. | `json-lines-sink.repository.ts` |
| `.client.ts` | An external protocol or vendor SDK. | `browser.client.ts` |
| `.store.ts` | Runtime state for its module: a cache, a memo, a registry. | `hook-registry.store.ts` |
| `.error.ts` | An error type a slice throws and callers catch. | `step-failure.error.ts` |
| `.config.ts` | Configuration owned by one module. | `crawl-options.config.ts` |
| `.enum.ts` | A technical enumeration. | `recipe-kind.enum.ts` |

`.service.ts` and `.middleware.ts` are **not** in the lint's role list and are not used here.

## UI file naming (`apps/**` `.tsx` and hooks)

`apps/` doesn't organise into `packages/`'s slices — a React app's folders (`content-pane/`, `steps-outline/`,
`studio-client/`, `studio-store/`, ...) are feature areas grouped the same way for readability, but aren't held
to the flat-folder limit, the folder-of-12 threshold or the barrel-only import boundary above. What *does*
carry over is the core idea: a file's name says what kind of thing it is. Every `.tsx` file, and every custom
hook, takes a role suffix from this list — picked the same way as the glossary above, by what the file
actually is:

| Suffix | Responsibility | Example |
|---|---|---|
| `.component.tsx` | A reusable or composed piece of UI: presentational or with its own local state. | `toolbar.component.tsx` |
| `.view.tsx` | A top-level, composed screen — what a route or the app root renders. One per app today (`app.view.tsx`); reach for it again once routing exists. | `app.view.tsx` |
| `.route.tsx` | A routing entry (a router's route element/loader). Not used yet — no app here has a router — but reserved so a future one doesn't invent something else. | — |
| `.hook.ts` | A custom React hook (`use*`), whether it wraps TanStack Query, Zustand, or plain React state. `.hook.tsx` if the hook itself returns JSX (e.g. a hook that also renders a provider). | `use-save-outline.hook.ts` |

Naming stays `<kebab-name>.<role>.tsx`/`.ts`, same as `packages/**`: the `use-` prefix on a hook's kebab-name is
a React convention (marks it as a hook to React's own rules-of-hooks lint), the `.hook.ts` suffix is this
repo's role convention: both stay, neither replaces the other. Tests stay `<kebab-name>.<role>.test.tsx`/`.ts`
beside the file (`toolbar.component.tsx` -> `toolbar.component.test.tsx`).

An app's entry point (`main.tsx`, the equivalent of `packages/**`'s `main.ts`) is exempt, same as `index.ts`
barrels — there's nothing to suffix on a file whose whole job is bootstrapping. Everything else already in
`apps/studio-ui` besides `.tsx` and hooks (`.store.ts`, `.client.ts`, `.mapper.ts`, `.policy.ts`, `.factory.ts`,
`.catalog.ts` in `studio-store/`, `studio-client/`, `content-pane/`, `steps-outline/`) already used the
`packages/**` glossary's suffixes (or an ad hoc but clear one) before this section existed; this section doesn't
change those, only closes the gap that `.tsx` files and hooks were the one place in the repo without a role in
the name.

## Boundaries

- A sibling slice is imported only as `'../<slice>'` (its `index.ts`). Deep imports such as
  `'../billing/fee.policy'` fail lint. **Tests are held to this rule too.**
- A slice never imports its own `index.ts`.
- No two slices import each other, **type-only imports included**. A leaf slice that needs a type from a
  higher slice declares its own structural type instead (see `crawl-events` and `hooks`).
- Dependencies point one way: `index.ts -> crawl-execution -> feature slices -> leaf slices`. The graph is
  checked by `vertical-slices/no-slice-cycle` and `import-x/no-cycle`.

## Naming rules

- Verb phrases for operations (`run-input-recipe.use-case.ts`), nouns for concepts (`output-record.model.ts`).
- TypeScript symbols keep their language conventions (PascalCase types, camelCase functions).
- No `helper`, `util`, `manager`, `processor`, `data` roles. No local `shared`, `common`, `helpers`, `utils`
  folders: shared behaviour becomes a named slice.

## Folder threshold

A slice with **12 hand-authored production files** is a review trigger, not permission to nest folders. Tests
and fixtures do not count. When a slice grows past it, split it into two slices with a clear dependency
direction and record the split here.

## Placement decision tree

```text
Does it coordinate an operation or I/O?          yes -> *.use-case.ts
  no -> Is it a reusable decision?                yes -> *.policy.ts
  no -> Does it hold meaning, state, invariants?  yes -> *.model.ts
  no -> Does data cross a boundary?               yes -> *.contract.ts
  no -> Does it convert representations?          yes -> *.mapper.ts
  no -> Is it a pure computation?                 yes -> *.algorithm.ts
  no -> Does it validate focused input?           yes -> *.validator.ts
  no -> Is it persistence in domain terms?        yes -> *.repository.ts
  no -> Is it an external protocol adapter?       yes -> *.client.ts
  no -> Is it runtime state / a registry?         yes -> *.store.ts
  no -> revisit the responsibility; never create a generic bucket
```

Place the file in the slice whose outcome would fail if the file disappeared.

## Recorded exceptions

| Path | Rule waived | Why | Temporary? |
|---|---|---|---|
| `packages/*/src/**/fixtures/**/*.{html,json,txt}` | markup/JSON lint | Test data, not code. | No |
| `packages/*/e2e/`, `packages/*/tools/` | slice rules | Outside `src/`: e2e suites, fixture servers and build scripts are not library slices. | No |
| `packages/core/src/crawl-execution/` | folder threshold | 15 production files: crawler, runs, reports and worker mode. Split pending (worker mode is the candidate). | Yes |

## PR checklist

- [ ] Path is kebab-case; the role suffix matches what the file does.
- [ ] The file is in the slice whose outcome it serves.
- [ ] Sibling imports go through `index.ts`; the barrel exports only what other slices use.
- [ ] Models, policies, algorithms and mappers contain no I/O.
- [ ] External protocols stay behind `.client.ts` files.
- [ ] `npm run format && npm run affected` is green.
