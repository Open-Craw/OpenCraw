# One engine, a driver, and real packages in every language: plan

- **Status:** Plan for review and execution. Revised on 2026-10-17 for the move to MonoSmith, the ten languages
  it builds, and the plugins the user chose; tracked in issue [#313](https://github.com/Open-Craw/OpenCraw/issues/313).
- **Basis:** a reading of the code (`python-packages/opencraw`, `packages/cli`, `packages/mcp`, the callout
  protocol, the OCR and PDF contracts, the VSIX packaging), of how Playwright ships its own Python, Java and
  .NET packages, of MonoSmith's docs (`converting.md`, `plugins.md`, `stacks.md`, `conventions.md`, `ci.md`),
  and of a `smith convert --dry-run` of this repository with a smith built from MonoSmith's `main`. Nothing in
  the speed section was measured yet; phase 0 measures it.
- **Languages:** every one MonoSmith has a language plugin for: TypeScript (as now), Python, Go, Dart, C#,
  C++, Rust, PHP, Java and Ruby. Section 5 says what each registry allows today.
- **Tooling:** the repository moves from mnci (Nx) to [MonoSmith](https://github.com/monosmith-app/monosmith)
  first (phase M), and MonoSmith is improved as the migration and the packages find gaps (section 10).

## Recommendation

**Keep the engine in TypeScript. Put a driver in front of it. Give every language a real package that talks
to that driver.** Then move the two measured hot spots (OCR, PDF rendering) to Rust behind the contracts that
already exist for them. Do not rewrite the core in Go or Rust: the rewrite costs months, gives the user no
wall-clock back (Chromium, the network and politeness delays are the time), and still ends with a process
boundary for Studio and the extension, which is exactly what the driver is.

This is the Playwright model. `playwright-python`, `playwright-java` and `Microsoft.Playwright` are not
wrappers around a CLI: each ships a Node driver inside the wheel, jar or nupkg, starts it once, and speaks a
typed JSON protocol over its pipes. The user installs one package and never sees Node. OpenCraw already
depends on Playwright, so this path reuses the packaging trick we already carry.

## 1. Where we are

| Today | What it costs the user |
|---|---|
| `python-packages/opencraw` starts `opencraw` (or `npx @opencraw/cli`) **once per call** with `subprocess.run`, waits for it to exit, and parses JSON lines off stdout. | Node must be installed. A second of startup per call. No events, no progress, no cancel, no worker mode. `OpenCrawError` carries a flattened stderr. |
| Hooks in Python are **command callouts**: a script that reads one `CalloutRequest` on stdin and answers (`serve_hook`). | A process per hook call, and the hook cannot share state with the program that started the crawl. |
| The MCP `run` tool and the CLI both build a `createCrawler` in process and return after the crawl. | Nothing streams. |
| The in-process API is `createCrawler({ hooks, sink, onEvent, access, accessPlugins, captchaSolvers, … })` with functions on both sides. | It cannot cross a language boundary as it is. |
| The workspace is an Nx monorepo under mnci 4.x, which builds npm, Python, Go and Flutter projects. | Six of the ten languages have no place to live; CI, release and lint for them would be hand-written. |

What is already right, and the plan builds on:

- **Recipes are JSON** (`input-recipe.schema.json` is generated from the zod schemas).
- **Records and events are JSON**: `CrawlEvent` is a flat, structural union; the sinks write JSON lines.
- **The callout protocol** (`packages/core/src/callout-protocol`) is a language-neutral contract for hooks,
  captcha solvers and access plugins, with an idempotency key and a `pending` answer. It is the reverse half
  of the driver protocol, already designed.
- **Worker mode** has a `WorkSource` seam (`next / done / failed`) that is three JSON messages.
- **The VSIX build** already stages a Node bundle of every package per platform
  (`apps/vscode-extension/packaging/package-vsix.mjs`). The driver bundle is that, without the extension.
- **MonoSmith** has a language plugin for all ten languages, a `vertical-slices` convention that checks the
  slice rules in nine of them (Node through the ESLint config), generated GitHub Actions, and `smith convert`
  for a workspace made by mnci.

## 2. What a real package feels like

The test for each package: no Node install, one persistent process per session, native types, hooks as
functions, records as a stream, errors as the language's errors, cancel. In Python:

```python
from opencraw import Crawler, HookPending

with Crawler() as crawler:                      # starts the bundled driver once
    @crawler.hook("normalise")                  # a hook is a function in this process
    def normalise(value, args, ctx):
        return str(value).strip().lower()

    run = crawler.run(["recipes/"], only=["shop-a"])
    for record in run.records():                # streamed as they are emitted
        print(record["title"])
    print(run.report().records)
```

In Go:

```go
crawler, _ := opencraw.Start(ctx)
defer crawler.Close()
crawler.Hook("normalise", func(ctx context.Context, in any, args map[string]any) (any, error) {
    return strings.ToLower(strings.TrimSpace(in.(string))), nil
})
run, _ := crawler.Run(ctx, opencraw.Recipes("recipes/"), opencraw.Only("shop-a"))
for record := range run.Records() { fmt.Println(record["title"]) }
```

The same shape in every other language: `Stream` in Dart, `IAsyncEnumerable` in C#, an iterator and
callbacks in Rust, Ruby, PHP, Java and C++. TypeScript keeps `@opencraw/core` in process, untouched.

## 3. The driver protocol

One package, `@opencraw/driver`, started as `opencraw driver` from the bundled runtime. **JSON-RPC 2.0 over
stdio**, one message per line (`\n`-delimited; a record is never pretty-printed). The driver owns no state
beyond its runs and exits when stdin closes, so a client that dies never leaves a zombie.

Client to driver:

| Method | Does |
|---|---|
| `initialize { clientName, clientVersion, protocolVersion }` | Answers the driver's version and capabilities; refuses a protocol major it does not speak. |
| `validate { paths?, recipes? }` | The `validate` tool's result, structured. |
| `probe { … }` | The `probe` tool, as is. |
| `run { paths?, recipes?, only?, out?, append?, resume?, dryRun?, parallel?, access?, browser?, hooks: string[], captchaSolvers: string[], accessPlugins: string[] }` | Starts a run and answers `{ runId }` at once. `hooks` and the two plugin lists are **names the client serves**; the driver registers a proxy for each that calls back over the protocol. |
| `work { runId, … }` | Worker mode: the client is the `WorkSource`. |
| `cancel { runId }` | Stops the run; the run still finishes with a report. |
| `diff`, `export` | As the CLI commands, structured. |
| `shutdown` | Closes every run, then the process. |

Driver to client:

| Message | Does |
|---|---|
| notification `event { runId, event: CrawlEvent }` | Every `CrawlEvent`, verbatim. |
| notification `record { runId, record: StoredRecord }` | Each record, when no `out` was given (otherwise the driver's sink writes it). |
| notification `finished { runId, report: CrawlReport }` | The run is over. |
| request `callout { runId, request: CalloutRequest }` → `CalloutResponse` | A hook, captcha solve or access lease served by the client: **the existing `calloutRequestSchema`**, unchanged. `pending` works as it does for HTTP callouts. |
| request `work.next { runId }`, notifications `work.done`, `work.failed` | Worker mode. |

Rules that keep ten clients honest:

1. **One schema, generated.** Every message is a zod schema in `packages/driver/src/protocol`; a build step
   writes `driver-protocol.schema.json` next to `input-recipe.schema.json`. Each client's models are
   generated from it (Python `datamodel-code-generator`, Go `go-jsonschema`, Dart `json_serializable`, C#
   `NJsonSchema`, Rust `typify`, Java `jsonschema2pojo`, PHP, Ruby and C++ through quicktype), never typed
   by hand.
2. **A conformance suite as fixtures**: JSON transcripts (request, expected answer, expected notifications)
   under `packages/driver/conformance/`. The driver's own tests replay them; every client's tests replay
   them against the real driver. A client that passes the suite is done.
3. **Protocol version is semver**, separate from the package versions. A client pins a major.
4. Nothing in `@opencraw/core` changes. The driver reuses `loadForRun`, `resolveAccess` and `createCrawler`
   as the MCP server does today.

Slices of `packages/driver`: `protocol/` (contracts, zod, the JSON Schema mapper), `transport/` (line
framing, request ids, cancellation), `session/` (one `createCrawler` per run, event fan-out),
`callout-bridge/` (hook, solver and plugin proxies that await the client), `work-bridge/` (the `WorkSource`
over the wire), `main.ts`. New TypeScript projects use the `node-vitest` stack (Vitest), with
`@monosmith/eslint-config`.

## 4. The bundled runtime

A client must not depend on a Node on the PATH. The driver ships as a **per-platform archive**: a pinned Node
binary, the esbuild bundle of `@opencraw/driver` and its production dependencies (what `package-vsix.mjs`
stages today), the `@napi-rs/canvas` prebuilt for the platform, pdf.js, the OCR engine and its English
model. Platforms: `win32-x64`, `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`.

- Built per OS by MonoSmith's native job (the driver is a Node app tagged native: MonoSmith issue
  [#254](https://github.com/monosmith-app/monosmith/issues/254)), attached to a GitHub release
  `driver-v<protocol>.<build>` with a SHA-256 per archive.
- A client **downloads on first use** into a per-user cache (`~/.cache/opencraw/driver/<version>/`), checks
  the hash, and reuses it. `OPENCRAW_DRIVER=<folder>` points at a local build; `OPENCRAW_DRIVER_OFFLINE=1`
  refuses to download (CI, air-gapped). This is what Playwright does with browsers, and what the current
  `OPENCRAW_CLI` variable becomes.
- Browsers are installed the Playwright way, through the driver: `python -m opencraw install`,
  `go run github.com/open-craw/opencraw-go/cmd/install`, `dart run opencraw:install`, and the equivalent in
  each language.
- Why not Node's single-executable (SEA) build: the driver needs native addons and WebAssembly workers,
  which SEA does not carry cleanly; a Node binary beside a bundle does, and it is what Playwright ships.
  Revisit when SEA supports addons.

Size: 60 to 90 MB per platform before browsers. Acceptable for a server-side tool; the plan does not target
mobile (see Dart below).

## 5. The ten languages and their registries

MonoSmith builds, tests, lints and versions all ten; what each can publish today differs. The user decided
the two hard cases.

| Language | MonoSmith plugin | Publishes to | Decision |
|---|---|---|---|
| TypeScript | `node` + `typescript`, `eslint`, `vitest` | npm | As now. |
| Python | `python` | PyPI (`twine`) | As now. |
| Go | `go` | a `<dir>/vX.Y.Z` module tag | As now. |
| Dart | `dart` | pub.dev | Desktop and server only; refuses to start on iOS or Android, which have no Node. |
| C# | `dotnet` | NuGet | |
| Rust | `rust` | crates.io | |
| Ruby | `ruby` | RubyGems | |
| Java | `jvm` (Maven) | your own Maven repository; Maven Central is not supported | **GitHub Packages** Maven repository (`MAVEN_REPOSITORY_URL`, `GITHUB_TOKEN`). Users add one repository line to their pom. |
| PHP | `php` | Packagist reads `composer.json` at a repository root, so a monorepo package cannot be listed | **Split-repo mirror**: the release subtree-splits the package into a read-only `opencraw-php` repository that Packagist follows. A MonoSmith feature (section 10). |
| C++ | `cpp` | none; a tag | A CMake package consumed by tag (`FetchContent`) and later a vcpkg port. |

## 6. Phases

Phases run in this order; each is one or more PRs with its own done criterion, and the engine is never
touched before phase 6.

### Phase M: move to MonoSmith (1 to 2 weeks, mostly waiting on MonoSmith fixes)

`smith convert --dry-run` on this repository today: 23 projects map (10 npm packages, 4 apps, 8 examples as
apps, the Python package), 111 targets convert, 39 Nx-only targets drop, 18 findings need a hand, one
project is reported unsupported. Each finding that MonoSmith should handle itself is a MonoSmith issue
(section 10); the rest are hand edits in the conversion PR.

Steps:

1. Wait for MonoSmith to fix the three findings that would otherwise break a release:
   `nx run <project>:<target>` root scripts ([#248](https://github.com/monosmith-app/monosmith/issues/248)),
   the dropped `package` targets the VSIX workflows run
   ([#250](https://github.com/monosmith-app/monosmith/issues/250)), and `apps/azure-host` reported as
   unsupported although it is a Node app with a Dockerfile
   ([#251](https://github.com/monosmith-app/monosmith/issues/251)).
2. On a branch: `npm ci`, `smith convert`, then hand edits: `studio-ui`'s `serve-static` task in
   `smith.toml`, the asset copies in the two esbuild builds (until
   [#252](https://github.com/monosmith-app/monosmith/issues/252)), `studio-ui`'s Jest config (until
   [#253](https://github.com/monosmith-app/monosmith/issues/253)), the compound root scripts (until
   [#249](https://github.com/monosmith-app/monosmith/issues/249)).
3. `smith.toml`: `[conventions.vertical-slices]`, `[conventions.docker]` (azure-host's image), the `vscode`
   stack on the extension, `[ci] providers = ["github"]`, `devcontainer = true`, `[default_stacks] node =
   "node-vitest"` for new projects (existing ones keep Jest). The ESLint config moves to
   `@monosmith/eslint-config` when 1.0.0 is on npm (MonoSmith PR #244).
4. `smith ci generate` replaces `ci.yml`; `e2e.yml` comes from `smith pipeline e2e`; `vscode-publish.yml`,
   `vscode-package.yml`, `desktop-package.yml` and `examples-live.yml` stay hand-written until MonoSmith's
   native job covers Node apps ([#254](https://github.com/monosmith-app/monosmith/issues/254)).
5. `smith ci setup && smith run lint typecheck test build`, the e2e workflows green, one release dry run
   showing the same tags as before (`@opencraw/<name>@<version>`, the Python package, the extension).

**Done:** `main` has no `nx.json`, every project builds and releases through smith, CI is generated, and the
extension's publish still produces three platform VSIXes.

### Phase 0: measure (1 to 2 days)

A timing harness in `studio-field-tests/` (not shipped) that runs three workloads with per-phase timing:
a 200-page web crawl against a local fixture server, a 50-page digital PDF, a 20-page scanned PDF.
Phases: start-up, navigation and fetch, parse, step flow and transforms, mapping and sink, OCR, PDF
rendering. The numbers go into section 9 of this document. **Done:** the table in section 9 is filled.

### Phase 1: the driver (2 weeks)

`packages/driver` with the protocol of section 3, the generated schema, and the conformance suite. A
TypeScript client (`packages/driver-client`, thin) exists for the suite and for parity testing; it is not a
replacement for `@opencraw/core` in process. **Done:** the suite passes against `opencraw driver` on the
three CI platforms; the MCP `run` tool is re-pointed to stream through the driver's session slice (no
behaviour change for MCP users).

### Phase 2: the bundled runtime (1 to 2 weeks)

The driver app tagged native, the per-OS archives on a release, the download-and-cache logic specified once
(section 4) and a checked-in fixture of the manifest format. **Done:** on a clean machine with no Node, a
client can start the driver from the cache after one download, offline mode refuses correctly, and the hash
check rejects a tampered archive.

### Phase 3: Python (2 weeks)

`python-packages/opencraw` becomes the client of section 2: `Crawler` (sync, with `asyncio` twin),
`Run.records()` / `Run.events()` / `Run.report()`, `@crawler.hook`, `@crawler.captcha_solver`,
`@crawler.access_plugin`, `WorkSource` protocol for worker mode, generated models, exceptions mirroring
`RecipeValidationError` / `RecipeBindingError` / `CalloutError`. `serve_hook` stays (command callouts
remain valid for out-of-process hooks). It is the reference client: its slice layout and names are what the
other nine follow, each in its language's spelling under the `vertical-slices` convention.
**Done:** conformance suite green; the README's examples run on a clean virtualenv.

### Phase 4: the other eight clients (1 week each, in this order)

Go, Dart, C#, Rust, Ruby, Java, PHP, C++. Each is `smith add package opencraw-<lang> --lang <lang>`, the
generated models, the runtime of section 2 (spawn, framing, callbacks, iterator), and the conformance suite
in CI on the three platforms. The order puts the languages whose registry works today first; Java (GitHub
Packages) and PHP (split repo) wait on their release setup, C++ last since it has no registry.

**Done:** each passes the conformance suite in CI on the three platforms and releases through `smith
release` to the registry in section 5.

### Phase 5: hooks, captcha and access from every language (folded into 3 and 4)

Nothing new to design: the `callout` request carries the existing `CalloutRequest`, so a Python captcha
solver or a Go access plugin is one function registered by name. The CLI's `--plugins <module>` keeps
loading TypeScript modules in process for TypeScript users.

### Phase 6: the measured hot spots in Rust (2 to 4 weeks each, only where phase 0 says so)

Rust, not Go: `napi-rs` turns a crate into a Node addon with prebuilt binaries per platform (so the
TypeScript engine, the driver and the extension all use it), there is no second runtime inside Node's
process, panics are caught at the boundary, and the libraries are the mature ones (`pdfium-render`,
`tesseract` / `leptess`, `image`). Go's `c-shared` puts a Go runtime with its own signal handling inside
every host process and has no equivalent of pdfium or Tesseract without cgo. The crates live in the
monorepo under MonoSmith's `rust` plugin, next to the Rust client.

Each is a **package behind an existing contract**; the core does not change, and the WebAssembly engine
stays as the fallback where no prebuilt matches:

- **`@opencraw/ocr-native`**, an `OcrEngine` (`packages/core/src/pdf-ocr/ocr-engine.contract.ts`)
  over native Tesseract with the same bundled `eng` model and the same multi-pass cleanup, the page cleanup
  algorithms ported from `packages/ocr-tesseract/src/page-cleanup` (they are pure, ~800 lines, with tests
  that port as they are). Expected 3 to 10× on a scanned page.
- **`@opencraw/pdf-native`**, pdfium behind `renderPagePng` (the rasteriser the OCR path uses) and, once
  parity with pdf.js on the fixtures under `packages/core/src/pdf-document` is proven, behind the positioned
  text extraction. Expected 2 to 5× on rendering; text extraction is not expected to be the bottleneck.

**Done:** the fixture tests of the replaced slice pass unchanged against the native package; the phase 0
harness shows the gain; a platform with no prebuilt falls back and says so once.

## 7. What does not change

Recipes and their schema. `@opencraw/core`'s API. Studio, the VS Code extension, the MCP server's tools
(the server gains streaming, nothing is removed). The CLI. `docs/recipes/*`. Project directories and
release tags across the move to MonoSmith.

## 8. Risks and how each is held

| Risk | Held by |
|---|---|
| Ten clients drift from the driver | One generated schema, one conformance suite, a protocol semver the clients pin. |
| Driver processes leak | The driver exits on stdin close; the client owns the process and kills it on dispose. |
| Download at first use surprises a CI job | `OPENCRAW_DRIVER_OFFLINE=1` and `OPENCRAW_DRIVER=<folder>`; a clear error that names both. |
| Archive size | Browsers are separate (as Playwright); the driver bundle excludes Studio's UI. |
| Native prebuilds missing for a platform | WebAssembly fallback, one notice; the CI matrix is the one the VSIX already uses. |
| Windows quoting and paths in a stdio protocol | No shell between client and driver (`execFile`, `subprocess.Popen(list)`); the conformance suite runs on `windows-latest`. |
| Dart on mobile | Out of scope and refused at start-up with a message. |
| Phase 6 built before it is justified | Phase 0 first; a hot spot under 10% of wall-clock is not ported. |
| The MonoSmith move breaks a release | Phase M waits for #248, #250 and #251; the conversion is one reviewable PR; a release dry run before merge must list the same tags. |
| MonoSmith gaps block OpenCraw | Section 10: each gap is a MonoSmith issue fixed there, never worked around here for long; the two agents split the work. |
| Java and PHP registries | Decided (GitHub Packages; split repo); both clients are built before their release path exists. |

## 9. Measurements (phase 0 fills this)

| Workload | Start-up | Fetch / navigate | Parse | Steps and transforms | Mapping and sink | OCR | PDF render | Total |
|---|---|---|---|---|---|---|---|---|
| 200 web pages | | | | | | n/a | n/a | |
| 50-page digital PDF | | | | | | n/a | | |
| 20-page scanned PDF | | | | | | | | |

## 10. Working with MonoSmith

OpenCraw is MonoSmith's first real multi-language workspace, so the two improve together. The split, agreed
between the OpenCraw and MonoSmith agents:

- OpenCraw runs the migration and builds the packages. Every gap becomes a MonoSmith issue with the repro,
  the expected and the actual output and the smith version, filed from here; MonoSmith fixes it, releases,
  and names the version to bump to. Nothing is worked around in OpenCraw that MonoSmith should own.
- Filed from the dry run: [#248](https://github.com/monosmith-app/monosmith/issues/248) (`nx run` root
  scripts), [#249](https://github.com/monosmith-app/monosmith/issues/249) (compound scripts),
  [#250](https://github.com/monosmith-app/monosmith/issues/250) (`package` targets dropped),
  [#251](https://github.com/monosmith-app/monosmith/issues/251) (a Dockerfile app reported unsupported),
  [#252](https://github.com/monosmith-app/monosmith/issues/252) (esbuild asset copies),
  [#253](https://github.com/monosmith-app/monosmith/issues/253) (`@nx/react` Jest config),
  [#254](https://github.com/monosmith-app/monosmith/issues/254) (native per-OS packaging for Node apps and
  per-platform VSIX publishing).
- Two features OpenCraw needs that MonoSmith does not have, to be specified from OpenCraw's needs and built
  there: a **Playwright e2e toolchain plugin** (owns the `e2e` task, pins browsers in CI, one shape for
  every e2e project) and a **split-repo release** for PHP packages (`[projects.<name>.release] split_repo`).
- Plugins and conventions OpenCraw takes: the ten language plugins, `vertical-slices`, `docker`, the
  `vscode` stack, `eslint` with `@monosmith/eslint-config`, `vitest` for new projects, generated GitHub
  Actions and the devcontainer. Release, conventional commits, dependency commands and audit are MonoSmith's
  core and need no plugin; husky and commitlint stay as devDependencies.

## 11. Estimate

| Phase | Effort | Depends on |
|---|---|---|
| M move to MonoSmith | 1 to 2 weeks | MonoSmith #248, #250, #251 |
| 0 measure | 1 to 2 days | |
| 1 driver | 2 weeks | M |
| 2 runtime | 1 to 2 weeks | 1, MonoSmith #254 |
| 3 Python | 2 weeks | 1, 2 |
| 4 eight more clients | 1 week each | 3; Java and PHP also on their release setup |
| 6 OCR in Rust | 2 to 4 weeks | 0 |
| 6 PDF in Rust | 2 to 4 weeks | 0 |

About four to five months to real packages in ten languages on MonoSmith, with the two native engines, no
change to the engine and no risk to what is shipped today.
