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

Try it in an Extension Development Host, after `npm run studio:build` and `npm run vscode:build` so
`@opencraw/studio`, the Studio UI and the extension exist:

```
code --extensionDevelopmentPath apps/vscode-extension <a folder of recipes>
```

## Not done yet

- Packaging a `.vsix` and publishing to the Marketplace and Open VSX: needs a publisher account and a token
  owned by the maintainer; nothing is published from CI.
- Hooks (`opencraw studio --hooks`) as a setting.
- Reusing an open Studio tab instead of a new one for each "Open on OpenCraw".
- An end-to-end test in a real editor (`@vscode/test-electron`).
