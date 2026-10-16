# OpenCraw for VS Code

Starts the OpenCraw Studio server and opens it in your normal browser. From the editor you can send a
folder, a recipe file or a document to Studio with **Open on OpenCraw**.

Issue #228. The server side it relies on is `choose-folder` (#234, the Browse button) and `open-path` (#235).

## Use

- **OpenCraw: Open Studio** (command palette): Studio on the workspace folder.
- **Open on OpenCraw** (right-click a file or folder in the explorer, the editor, or an editor tab):
  - a folder opens as the workspace;
  - a recipe file (`.json` with `kind` input or output) opens through its folder with the recipe selected;
  - any other file the engine reads (PDF, spreadsheet, deck, Word, CSV, JSON, YAML, XML, Markdown) starts a
    recipe from it, the same as dropping the file on Studio. A file inside the workspace folder is read in
    place; one from outside is copied into the workspace folder.

## The OpenCraw sidebar

- **Recipes** lists the recipes in your workspace (`*.ocw-in.json`, `*.ocw-out.json`, and the `*.input.json` / `*.output.json` the examples use)
  **grouped by output id**: each output recipe is a row, the input recipes that fill it are under it.
  - **Run** on an input recipe runs that one; on an output recipe it runs every input that feeds it. The crawl runs in a process of its own with
    a notification you can cancel, and its messages go to the **OpenCraw** output.
  - When the crawl is over you are asked where to save the result with your operating system's own save dialog. **The file's extension is the
    format**: `.xlsx` (Excel), `.csv`, `.html` (a page that looks like Studio), `.pdf`, `.json`, `.jsonl` or `.yml`/`.yaml`. A name that is none
    of these is explained and the dialog opens again.
  - **Open in Studio** opens the recipe to change it.
- **AI agent** sets OpenCraw's tools up for an agent. In VS Code's own agent mode there is nothing to do: the extension registers the MCP
  server it carries, so OpenCraw is among the agent's tools. For Claude Code, Cursor and other hosts, **Copy the MCP configuration** puts a
  `claude mcp add` command, or the common `mcpServers` JSON, on the clipboard with this installation's server path filled in.
- **Learn** links the Studio manual, the tutorial, the recipe guides and where to ask.
- **OpenCraw: Get started** opens a walkthrough (it also opens once, the first time the extension runs).

Needs VS Code 1.127 (June 2026) or newer.

The server starts on first use, in a process of its own, and stops with the window. In a remote window
(SSH, WSL, Codespaces, dev containers) it runs where the workspace is and its port is forwarded to the
browser on your machine.

## How it fits together

```
editor (extension host)            Studio process                       browser
  open-on-opencraw  ── link? ──▶   studio-host.process.mjs
  (use case)        ◀─ url ─────   startStudioServer({initialFolder})
        │ openExternal(asExternalUri(url))                              Studio UI
        └──────────────────────────────────────────────────────────▶   /?token=…&folder=…&open=…
```

- `src/open-target`: which workspace folder holds the picked path (pure).
- `src/studio-host`: forks the Studio process and asks it for links over IPC. The process is the editor's own
  executable run as plain Node (`ELECTRON_RUN_AS_NODE`), so the extension ships no Node.
- `src/open-on-opencraw`: the command's outcome, the only place that touches the editor API.
- `src/recipe-explorer`: finds the recipe files, reads each one's `kind`/`id`/`output` (the extension does not carry the engine), groups them by
  output id, and is the recipes view.
- `src/recipe-run`: the Run action: the plan (which files, `--only`), the process that runs the bundled `opencraw` command line, the save dialog
  and the format from the extension, and `opencraw export` to write the records in it.
- `src/mcp-setup`: registers the bundled `@opencraw/mcp` server with the editor's agent mode, the copy-configuration command and the AI agent view.
- `src/learn-studio`: the Learn view and the Get started walkthrough (`media/walkthrough`).
- `src/extension.ts`: the entry point the editor requires.

**Recipe ▾ → Open folder…** in Studio shows the editor's own folder dialog (`vscode.window.showOpenDialog`): the
Studio process asks the extension over its IPC channel (`choose-folder` / `folder`) and the answer becomes the
open workspace. In a remote window the dialog is the remote machine's, which is where the server runs and the
recipe folder is.

## Develop

```
npm run vscode:build        # builds dist/extension.cjs and dist/studio-host.process.mjs
npm run vscode:qa           # lint + unit tests
```

`npm run vscode:package` builds `apps/vscode-extension/opencraw-<version>-<platform>-<arch>.vsix`, for the
platform it runs on (the engine's PDF reader is a native module): it stages the extension with
its production dependencies from tarballs of the workspace packages, starts the staged Studio process once to
prove the dependencies are complete, then runs a pinned `vsce`. Install it with
`code --install-extension <the .vsix>`.

Try it in an Extension Development Host, after `npm run studio:build` and `npm run vscode:build` so
`@opencraw/studio`, the Studio UI and the extension exist:

```
code --extensionDevelopmentPath apps/vscode-extension <a folder of recipes>
```

## Hooks

`opencraw.hooksFile` (user settings only) names an absolute path to a hooks or plugins module, the same file
`opencraw studio --hooks` takes. Studio then runs recipes with those hooks, and the hooks bar names them. The
module runs as your code.

The setting is machine-scoped on purpose: a workspace's `.vscode/settings.json` cannot set it, so opening a
repository can never make Studio load code that repository chose. Changing the setting restarts the server on
the next "Open on OpenCraw".

## Publishing

The workflow `vscode-publish` (Actions > Run workflow) packages the extension on Linux, Windows and macOS and
publishes the three `.vsix` files to the Visual Studio Marketplace and to Open VSX. It runs when a change to the
extension, or to a package bundled in it, lands on `main`, and publishes only if `version` in this
`package.json` is not on the Marketplace yet: raise it in the change that should reach users, and a merge with
the same version does nothing. It can also be started by hand. The project has no release tag.

Before the first run:

1. Create the publisher on the Marketplace (<https://marketplace.visualstudio.com/manage>) and put its id in
   `publisher` in this `package.json` (it is `opencraw` as a placeholder).
2. Let the workflow sign in to the Marketplace with Microsoft Entra, not a token (Azure DevOps PATs are retired
   on 2026-12-01): register an application in Entra ID, add a **GitHub Actions** federated credential for this
   repository with entity type **Branch** and branch `main`, add the application as a member of the publisher
   on the Marketplace manage page, and set the repository secrets `AZURE_CLIENT_ID` and `AZURE_TENANT_ID`.
   The Marketplace job only runs from `main`.
3. For Open VSX: create the namespace with the same name (`npx ovsx create-namespace <name> -p <token>`) and
   add the token as the secret `OVSX_PAT`.
4. Raise `version` in this `package.json`: a registry refuses a version it already has.

Open VSX is skipped when `OVSX_PAT` is not set.

## End-to-end test

`npm run vscode:e2e` stages the extension as the editor loads it, starts a real VS Code (1.127.0, the oldest the
extension supports; downloaded into `.vscode-test` on the first run) and runs `e2e/suite/index.cjs` in its
extension host: the commands exist, "Open on OpenCraw" resolves a link to a real Studio process, the page is
served, `open-path` answers, and the `opencraw.hooksFile` setting reaches the server. The browser the link is
handed to is not looked at. In CI it runs on a virtual display (`vscode-e2e`).

## Not done yet

- Publishing has not been run: it needs the publisher, the Entra application and `OVSX_PAT`.
- Reusing an open Studio tab: a page cannot be raised from outside the browser, so each "Open on OpenCraw"
  opens a new tab, as other tools do.
