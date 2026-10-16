# VS Code extension: guide, recipes view, MCP and the OpenCraw agent (issue #292)

Status: plan, agreed in conversation, nothing built yet.

## Goals

A person who installs the extension should be able to (1) learn Studio, (2) see and run the recipes in their workspace, (3) connect an AI agent to
OpenCraw's tools, and (4) get an agent that is an OpenCraw specialist. The same agent is the one the Studio's own chatbot will use (#293).

## Slices

New folders under `apps/vscode-extension/src/`, each with an `index.ts` as its only door.

| Slice | What it gives | Depends on |
|---|---|---|
| `learn-studio/` | A "Get Started" walkthrough (`contributes.walkthroughs`: open Studio, load a document, click to collect, run, connect an agent) and a **Learn** section in the sidebar linking the tutorials, the authoring guide and `docs/how-it-works`. | nothing |
| `recipe-explorer/` | A sidebar tree of the workspace's recipes **grouped by output id**: an output recipe is a node, its input recipes are its children. Inline actions: **Open in Studio** and **Run**. A file watcher keeps it current. | nothing |
| `recipe-run/` | The **Run** action (below). | `recipe-explorer/`, the engine |
| `mcp-setup/` | Help installing the MCP server (below). | the bundled `@opencraw/mcp` |
| `agent-setup/` | "Add the OpenCraw agent to this workspace" (below). | `@opencraw/agent` (new) |

The tree reads only `kind`, `id` and `output` from each recipe file (`*.ocw-in.json`, `*.ocw-out.json`), so the extension does not bundle the engine
to list recipes. Files that are not valid JSON, or have another `kind`, are left out.

## Running from the tree

- **Run on an input recipe** runs that one recipe.
- **Run on an output recipe** runs every input recipe that names it.
- A progress notification shows the run and can cancel it. Records are written to a temporary JSON Lines file in the extension's storage.
- **When the crawl is over** the person is asked where to save the result, with the operating system's own save dialog (`showSaveDialog`). The file
  type chosen in the dialog is the output format. Offered today: the formats the engine writes (JSON Lines, and what the command line supports);
  as #294 ("the output extension defines the output") lands, the same dialog offers CSV, JSON, Excel, YAML, HTML and PDF with no change here.
- The run goes through a process of its own, started the same way as the Studio host (`ELECTRON_RUN_AS_NODE`), so the editor never freezes.

## MCP help

- The minimum VS Code version is raised to the first one that lets an extension provide MCP servers (to confirm; 1.101 at the time of writing).
- The extension contributes an MCP server definition provider that starts the bundled `@opencraw/mcp` over stdio. Agent mode in VS Code then has
  OpenCraw's tools with nothing to set up. The MCP server ships inside the VSIX next to the Studio host.
- For hosts that are not VS Code's (Claude Code, Cursor and others) a **Copy MCP configuration** command puts the JSON (and the `claude mcp add`
  line) on the clipboard with the bundled server's path filled in.
- A sidebar line says whether the server is registered, with a button to open the setup.

## The OpenCraw agent

One specification, many hosts. It is a general agent that is a specialist developer in OpenCraw:

- **Reads every file type the engine parses** (web pages, PDF, spreadsheets, decks, Word, CSV, JSON, YAML, XML, Markdown) and understands inputs and
  outputs, how an input recipe is mapped onto an output recipe, and how a `hook` or a callback function is wired into a recipe.
- **Starts from a prompt** that says what the input is and what the expected output is. The output may be a file; the agent works out what has to be
  transformed to get there, writes the input and output recipes, and checks them.
- **Knows Studio** end to end, can explain how to use it, and can control it when asked (open a recipe, pick values, run a sample).
- **Personality:** casual, respectful, with humour, and serious about extracting data correctly.
- **Gets everything it needs from the MCP server**, never from guesses.

### Where it lives

A new package, `@opencraw/agent`, holds the single source: the persona, the knowledge outline, the list of MCP tools it relies on, and one renderer
per host. The extension's **Add the OpenCraw agent** command writes the file for the host the person picks:

| Host | File written |
|---|---|
| GitHub Copilot | a custom chat mode in `.github/chatmodes/` |
| Claude Code | a subagent in `.claude/agents/` |
| Any other | an `AGENTS.md` section |

The Studio's chatbot (#293) imports the same specification, so the agent in the editor and the agent in Studio are one.

### What the MCP server must gain (separate issues, not part of #292)

The agent can only be as good as its tools. Today the MCP server has `probe`, `validate`, `run`, `list_recipes` and `diff`. For the agent it needs:

1. **Document reading tools:** describe any file the engine parses (pages, sections, tables, sheets, slides, structure), the same view Studio shows.
2. **Recipe explanation tools:** list the output recipes, show which inputs feed one, and explain a mapping.
3. **A Studio control channel:** tools that act on a running Studio (open a recipe, pick, run a sample), through the command channel Studio's UI already uses.
4. **Documentation lookup:** the authoring guide and `how-it-works` pages as retrievable resources.

## Order

1. `learn-studio/` and `recipe-explorer/` (open in Studio), one release.
2. `recipe-run/`, with the save dialog.
3. `mcp-setup/` with the minimum-version bump.
4. `@opencraw/agent` with the MCP document tools, then `agent-setup/`; the Studio control channel arrives with the chatbot (#293).

## Open

- The exact VS Code version that introduced extension-provided MCP servers, to confirm before the bump.
- Which output formats `recipe-run/` can offer on day one, until #294 is built.
