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
- `src/extension.ts`: the entry point the editor requires.

The folder dialog is the server's own (`choose-folder`), so the **Browse…** button in the browser works the
same as everywhere else; in a remote window the dialog opens on the remote machine, which has no display, and
the message says to type the folder instead.

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
publishes the three `.vsix` files to the Visual Studio Marketplace and to Open VSX. It only starts by hand;
nothing else publishes the extension, and the project has no release tag.

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

`npm run vscode:e2e` stages the extension as the editor loads it, starts a real VS Code (1.90.0, the oldest the
extension supports; downloaded into `.vscode-test` on the first run) and runs `e2e/suite/index.cjs` in its
extension host: the commands exist, "Open on OpenCraw" resolves a link to a real Studio process, the page is
served, `open-path` answers, and the `opencraw.hooksFile` setting reaches the server. The browser the link is
handed to is not looked at. In CI it runs on a virtual display (`vscode-e2e`).

## Not done yet

- Publishing has not been run: it needs the publisher, the Entra application and `OVSX_PAT`.
- Reusing an open Studio tab: a page cannot be raised from outside the browser, so each "Open on OpenCraw"
  opens a new tab, as other tools do.
