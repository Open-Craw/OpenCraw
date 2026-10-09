# Temporary workarounds for mnci

Tracked by issue [#184](https://github.com/Open-Craw/OpenCraw/issues/184). `tools/check-mnci-workarounds.mjs`
runs in CI (`after-install` slot of `ci.yml`) and as `npm run check:mnci`.

| Workaround | Why | Upstream | Remove when |
|---|---|---|---|
| Nested `@emnapi/core` and `@emnapi/runtime` kept in the lockfile | npm on Windows prunes them, and Linux `npm ci` then fails | npm behaviour, not mnci | the lockfile is regenerated on Linux, or npm stops pruning them |
