<p align="center">
  <img src="https://raw.githubusercontent.com/Open-Craw/OpenCraw/main/docs/assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# @opencraw/driver

[OpenCraw](https://github.com/Open-Craw/OpenCraw/blob/main/README.md)'s engine as a process another language talks
to. A client in Python, Go, Dart, C#, Rust, Java, Ruby, PHP or C++ starts `opencraw-driver` once, and speaks
**JSON-RPC 2.0 over its stdin and stdout, one message per line**. It sends recipes, gets every crawl event and
record as it happens, and answers the recipes' hooks with functions in its own language. This is how the
OpenCraw packages for other languages work (`docs/research/driver-and-language-packages.md`).

```sh
npx opencraw-driver   # then write JSON-RPC lines to it
```

## The conversation

```jsonc
→ {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientName":"opencraw-python","clientVersion":"1.0.0","protocolVersion":"1.0.0"}}
← {"jsonrpc":"2.0","id":1,"result":{"driverVersion":"0.1.0","protocolVersion":"1.0.0","methods":["initialize","validate","run","cancel","shutdown"]}}
→ {"jsonrpc":"2.0","id":2,"method":"run","params":{"paths":["recipes/"],"hooks":["tidy"]}}
← {"jsonrpc":"2.0","id":2,"result":{"runId":"run-1"}}
← {"jsonrpc":"2.0","method":"event","params":{"runId":"run-1","event":{"type":"recipe:start",…}}}
← {"jsonrpc":"2.0","id":1,"method":"callout","params":{"runId":"run-1","request":{"kind":"hook","name":"tidy","input":" A ",…}}}
→ {"jsonrpc":"2.0","id":1,"result":{"status":"ok","output":"a"}}
← {"jsonrpc":"2.0","method":"record","params":{"runId":"run-1","recipeId":"things","key":"…","data":{…}}}
← {"jsonrpc":"2.0","method":"finished","params":{"runId":"run-1","report":{…}}}
→ {"jsonrpc":"2.0","id":3,"method":"shutdown"}
```

| Method | From | Does |
|---|---|---|
| `initialize` | client | Must come first. The driver refuses a protocol of another major. |
| `validate` | client | Loads recipes (`paths` or inline `recipes`) without running them: the inputs that would run, every hook they call, and every problem with its path. |
| `run` | client | Starts a run and answers its `runId` at once; the crawl goes on in the background. `hooks` names the hooks the client answers; `out` writes records to a file instead of sending them. |
| `cancel` | client | Stops a run (its crawler is closed); it still ends with `finished`. |
| `shutdown` | client | Closes every run, answers, then exits. Closing stdin does the same. |
| `event` | driver | Every crawl event, as core reports it. |
| `record` | driver | Each record, unless the run has `out`. |
| `finished` | driver | The run is over: its report, or why it could not run. |
| `callout` | driver | A hook the client serves. The request and its answer are core's [callout contract](../core/README.md): `ok`, `error`, or `pending` with `retryAfterMs`, asked again with the same idempotency key. |

Every answer comes back before the driver stops, even when a client writes its last requests and closes
stdin at once. Answers may arrive out of order; match them by `id`.

## For client authors

- `schemas/driver-protocol.schema.json` is every message's shape, generated from the protocol's zod
  contracts. Generate your models from it rather than typing them by hand.
- `conformance/*.json` are recorded conversations. A client is done when it replays them all against the real
  driver. See `conformance/README.md`.
- Errors are JSON-RPC's codes: `-32700` (not JSON), `-32600` (not JSON-RPC), `-32601` (no such method),
  `-32602` (bad params, the problems listed), `-32000` (a failure to act on: its message says what to do).
- stdout carries protocol messages only. The driver's own logs go to stderr.

## Development

`smith run lint typecheck test build -p driver`. After changing a contract in `src/protocol/`, run
`smith run schemas -p driver` to rewrite `schemas/driver-protocol.schema.json`; a test fails until you do.
