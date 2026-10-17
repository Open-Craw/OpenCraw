# One engine, a driver, and real packages in every language: plan

- **Status:** Plan for review and execution.
- **Basis:** a reading of the code (`python-packages/opencraw`, `packages/cli`, `packages/mcp`, the callout
  protocol, the OCR and PDF contracts, the VSIX packaging) and of how Playwright ships its own Python, Java
  and .NET packages. Nothing in the speed section was measured yet; phase 0 measures it.
- **Languages:** the ones the workspace tooling (mnci) can build and release today: TypeScript (as now),
  Python, Go and Dart. Any other language is one more client over the same protocol (section 9).

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

What is already right, and the plan builds on:

- **Recipes are JSON** (`input-recipe.schema.json` is generated from the zod schemas).
- **Records and events are JSON**: `CrawlEvent` is a flat, structural union; the sinks write JSON lines.
- **The callout protocol** (`packages/core/src/callout-protocol`) is a language-neutral contract for hooks,
  captcha solvers and access plugins, with an idempotency key and a `pending` answer. It is the reverse half
  of the driver protocol, already designed.
- **Worker mode** has a `WorkSource` seam (`next / done / failed`) that is three JSON messages.
- **The VSIX build** already stages a Node bundle of every package per platform
  (`apps/vscode-extension/packaging/package-vsix.mjs`). The driver bundle is that, without the extension.

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

In Dart the same shape with `Stream<Record>`. TypeScript keeps `@opencraw/core` in process, untouched.

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

Rules that keep four clients honest:

1. **One schema, generated.** Every message is a zod schema in `packages/driver/src/protocol`; a build step
   writes `driver-protocol.schema.json` next to `input-recipe.schema.json`. Each client's models are
   generated from it (Python: `datamodel-code-generator`; Go: `go-jsonschema`; Dart: `json_serializable`),
   never typed by hand.
2. **A conformance suite as fixtures**: JSON transcripts (request, expected answer, expected notifications)
   under `packages/driver/conformance/`. The driver's own tests replay them; every client's tests replay
   them against the real driver. A client that passes the suite is done.
3. **Protocol version is semver**, separate from the package versions. A client pins a major.
4. Nothing in `@opencraw/core` changes. The driver reuses `loadForRun`, `resolveAccess` and `createCrawler`
   as the MCP server does today.

Slices of `packages/driver`: `protocol/` (contracts, zod, the JSON Schema mapper), `transport/` (line
framing, request ids, cancellation), `session/` (one `createCrawler` per run, event fan-out),
`callout-bridge/` (hook, solver and plugin proxies that await the client), `work-bridge/` (the `WorkSource`
over the wire), `main.ts`.

## 4. The bundled runtime

A client must not depend on a Node on the PATH. The driver ships as a **per-platform archive**: a pinned Node
binary, the esbuild bundle of `@opencraw/driver` and its production dependencies (what `package-vsix.mjs`
stages today), the `@napi-rs/canvas` prebuilt for the platform, pdf.js, the OCR engine and its English
model. Platforms: `win32-x64`, `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`.

- Built by a new `driver-package.yml` from the same matrix as `vscode-package.yml`, attached to a GitHub
  release `driver-v<protocol>.<build>` with a SHA-256 per archive.
- A client **downloads on first use** into a per-user cache (`~/.cache/opencraw/driver/<version>/`), checks
  the hash, and reuses it. `OPENCRAW_DRIVER=<folder>` points at a local build; `OPENCRAW_DRIVER_OFFLINE=1`
  refuses to download (CI, air-gapped). This is what Playwright does with browsers, and what the current
  `OPENCRAW_CLI` variable becomes.
- Browsers are installed the Playwright way, through the driver: `python -m opencraw install`,
  `go run github.com/open-craw/opencraw-go/cmd/install`, `dart run opencraw:install`.
- Why not Node's single-executable (SEA) build: the driver needs native addons and WebAssembly workers,
  which SEA does not carry cleanly; a Node binary beside a bundle does, and it is what Playwright ships.
  Revisit when SEA supports addons.

Size: 60 to 90 MB per platform before browsers. Acceptable for a server-side tool; the plan does not target
mobile (see Dart below).

## 5. Phases

Phases run in this order; each is one or more PRs with its own done criterion, and the engine is never
touched before phase 6.

### Phase 0: measure (1 to 2 days)

A timing harness in `studio-field-tests/` (not shipped) that runs three workloads with per-phase timing:
a 200-page web crawl against a local fixture server, a 50-page digital PDF, a 20-page scanned PDF.
Phases: start-up, navigation and fetch, parse, step flow and transforms, mapping and sink, OCR, PDF
rendering. The numbers go into section 8 of this document. **Done:** the table in section 8 is filled.

### Phase 1: the driver (2 weeks)

`packages/driver` with the protocol of section 3, the generated schema, and the conformance suite. A
TypeScript client (`packages/driver-client`, thin) exists for the suite and for parity testing; it is not a
replacement for `@opencraw/core` in process. **Done:** the suite passes against `opencraw driver` on the
three CI platforms; the MCP `run` tool is re-pointed to stream through the driver's session slice (no
behaviour change for MCP users).

### Phase 2: the bundled runtime (1 to 2 weeks)

`driver-package.yml`, the release assets, the download-and-cache logic specified once (section 4) and a
checked-in fixture of the manifest format. **Done:** on a clean machine with no Node, a client can start the
driver from the cache after one download, offline mode refuses correctly, and the hash check rejects a
tampered archive.

### Phase 3: Python (2 weeks)

`python-packages/opencraw` becomes the client of section 2: `Crawler` (sync, with `asyncio` twin),
`Run.records()` / `Run.events()` / `Run.report()`, `@crawler.hook`, `@crawler.captcha_solver`,
`@crawler.access_plugin`, `WorkSource` protocol for worker mode, generated models, exceptions mirroring
`RecipeValidationError` / `RecipeBindingError` / `CalloutError`. `serve_hook` stays (command callouts
remain valid for out-of-process hooks). Published by the existing `nx-release-publish` target.
**Done:** conformance suite green; the README's examples run on a clean virtualenv.

### Phase 4: Go and Dart (1 week each)

- `packages/opencraw-go` by `mnci add go-lib` (released by tag): `Start`, `Run`, `Hook`, channels for records
  and events, `context.Context` for cancel. No cgo.
- `packages/opencraw-dart` by `mnci add flutter-lib` (released to pub by tag): `Crawler` with `Stream`s.
  **Desktop and server Dart only**: there is no Node runtime on iOS or Android, so the package refuses to
  start there with a clear message rather than pretending.

**Done:** both pass the conformance suite in CI on the three platforms.

### Phase 5: hooks, captcha and access from every language (folded into 3 and 4)

Nothing new to design: the `callout` request carries the existing `CalloutRequest`, so a Python captcha
solver or a Go access plugin is one function registered by name. The CLI's `--plugins <module>` keeps
loading TypeScript modules in process for TypeScript users.

### Phase 6: the measured hot spots in Rust (2 to 4 weeks each, only where phase 0 says so)

Rust, not Go: `napi-rs` turns a crate into a Node addon with prebuilt binaries per platform (so the
TypeScript engine, the driver and the extension all use it), there is no second runtime inside Node's
process, panics are caught at the boundary, and the libraries are the mature ones (`pdfium-render`,
`tesseract` / `leptess`, `image`). Go's `c-shared` puts a Go runtime with its own signal handling inside
every host process and has no equivalent of pdfium or Tesseract without cgo.

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

## 6. What does not change

Recipes and their schema. `@opencraw/core`'s API. Studio, the VS Code extension, the MCP server's tools
(the server gains streaming, nothing is removed). The CLI. `docs/recipes/*`.

## 7. Risks and how each is held

| Risk | Held by |
|---|---|
| Four clients drift from the driver | One generated schema, one conformance suite, a protocol semver the clients pin. |
| Driver processes leak | The driver exits on stdin close; the client owns the process and kills it on dispose. |
| Download at first use surprises a CI job | `OPENCRAW_DRIVER_OFFLINE=1` and `OPENCRAW_DRIVER=<folder>`; a clear error that names both. |
| Archive size | Browsers are separate (as Playwright); the driver bundle excludes Studio's UI. |
| Native prebuilds missing for a platform | WebAssembly fallback, one notice; the CI matrix is the one the VSIX already uses. |
| Windows quoting and paths in a stdio protocol | No shell between client and driver (`execFile`, `subprocess.Popen(list)`); the conformance suite runs on `windows-latest`. |
| Dart on mobile | Out of scope and refused at start-up with a message. |
| Phase 6 built before it is justified | Phase 0 first; a hot spot under 10% of wall-clock is not ported. |

## 8. Measurements (phase 0 fills this)

| Workload | Start-up | Fetch / navigate | Parse | Steps and transforms | Mapping and sink | OCR | PDF render | Total |
|---|---|---|---|---|---|---|---|---|
| 200 web pages | | | | | | n/a | n/a | |
| 50-page digital PDF | | | | | | n/a | | |
| 20-page scanned PDF | | | | | | | | |

## 9. Later

Any other language is a client over the same protocol: C# (`System.Text.Json` and `Process`), Java, PHP,
Ruby, Rust. Each is 500 to 1,000 lines plus generated models, and the conformance suite says when it is
done. None needs the engine to change.

## 10. Estimate

| Phase | Effort | Depends on |
|---|---|---|
| 0 measure | 1 to 2 days | |
| 1 driver | 2 weeks | |
| 2 runtime | 1 to 2 weeks | 1 |
| 3 Python | 2 weeks | 1, 2 |
| 4 Go, Dart | 1 week each | 1, 2 |
| 6 OCR in Rust | 2 to 4 weeks | 0 |
| 6 PDF in Rust | 2 to 4 weeks | 0 |

About three months to real packages in four languages and the two native engines, with no change to the
engine and no risk to what is shipped today.
