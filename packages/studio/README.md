<p align="center">
  <img src="https://raw.githubusercontent.com/russoedu/open.craw/main/docs/assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# @opencraw/studio

A visual editor for [OpenCraw](https://github.com/russoedu/open.craw) recipes: open a site or a document,
click the data you want, and get a recipe that runs — the same engine, the same JSON files, no hidden state.

## Install

```sh
npm install -g @opencraw/cli @opencraw/studio
```

## Start

```sh
opencraw studio recipes/          # the cli delegates to this package when it's installed
npx @opencraw/studio recipes/     # or run it directly, without the cli
```

Either opens a local server (`127.0.0.1` only, behind a random access token) and prints the URL to open:

```text
OpenCraw Studio: http://127.0.0.1:52341/?token=8f2a1c9e4b7d3f6a0e5c8b1d2a4f7e9c
Workspace: /home/you/project/recipes
```

`recipes/` can already have `.input.json`/`.output.json` files in it, or be empty — the studio's own
**+ New recipe** writes a minimal, valid pair to start from.

## Learn more

[**The OpenCraw Studio manual**](https://github.com/russoedu/open.craw/blob/main/docs/studio/manual.md)
builds one real recipe end to end, tab by tab: picking on a live page, the Record tab's mapping, the
document canvases (JSON, PDF, Excel/CSV, PowerPoint), recording a login, and the JSON editor.
