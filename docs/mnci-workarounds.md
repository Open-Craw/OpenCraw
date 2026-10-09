# Temporary workarounds for mnci

Tracked by issue [#184](https://github.com/russoedu/open.craw/issues/184). `tools/check-mnci-workarounds.mjs`
runs in CI (`after-install` slot of `ci.yml`) and as `npm run check:mnci`.

| Workaround | Why | Upstream | Remove when |
|---|---|---|---|
| `overrides.nx.undici` kept in `package.json` | `mnci upgrade` rewrites `overrides.nx` and drops it, bringing back a high undici advisory | MoNecromanCI/MoNecromanCi#421 | the upgrade keeps user overrides |
| Nested `@emnapi/core` and `@emnapi/runtime` kept in the lockfile | npm on Windows prunes them, and Linux `npm ci` then fails | npm behaviour, not mnci | the lockfile is regenerated on Linux, or npm stops pruning them |
| `.claude/settings.json` and the two CI-monitor files kept | `mnci upgrade` deleted them without saying so | MoNecromanCI/MoNecromanCi#423 | mnci says whether they are retired |
| `eslint.config.mjs` not importing `eslint.config.mnci.mjs` | the upgrade generates the file but needs a manual edit | MoNecromanCI/MoNecromanCi#422 | mnci documents the migration, then wire it and delete the local rules it replaces |
| The Python package lives in `libs/opencraw`, not `python-packages/` | not a mnci bug: `mnci ci release` globs `python-packages/*/pyproject.toml`, demands `PYPI_TOKEN` for any it finds and ignores `release.projects`, so a publishable Python package fails the release step (#199); PyPI is the owner's decision | MoNecromanCI/MoNecromanCi#432 | the owner decides to publish the package to PyPI, then move it to `python-packages/` with `mnci add python-lib` and remove this row |
