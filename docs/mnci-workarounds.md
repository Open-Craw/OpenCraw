# Temporary workarounds for mnci

Tracked by issue [#184](https://github.com/Open-Craw/OpenCraw/issues/184). `tools/check-mnci-workarounds.mjs`
runs in CI (`after-install` slot of `ci.yml`) and as `npm run check:mnci`.

| Workaround | Why | Upstream | Remove when |
|---|---|---|---|
| Nested `@emnapi/core` and `@emnapi/runtime` kept in the lockfile | npm on Windows prunes them, and Linux `npm ci` then fails | npm behaviour, not mnci | the lockfile is regenerated on Linux, or npm stops pruning them |
| The Python package lives in `libs/opencraw`, not `python-packages/` | not a mnci bug: `mnci ci release` globs `python-packages/*/pyproject.toml`, demands `PYPI_TOKEN` for any it finds and ignores `release.projects`, so a publishable Python package fails the release step (#199); PyPI is the owner's decision | MoNecromanCI/MoNecromanCi#432 | the owner decides to publish the package to PyPI, then move it to `python-packages/` with `mnci add python-lib` and remove this row |
