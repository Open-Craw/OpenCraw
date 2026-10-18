# Driver conformance transcripts

Each file is one conversation with the driver: messages to send, and what must come back, in order. A
client in any language passes the suite when it replays every transcript against the real driver
(`opencraw-driver`) and each received message contains every field the transcript expects. Extra fields
are allowed, since newer drivers may add them; a value of `"<any>"` matches anything present.

```json
{ "name": "…", "steps": [ { "send": { "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {} } },
                          { "receive": { "jsonrpc": "2.0", "id": 1, "result": { "protocolVersion": "1.0.0" } } } ] }
```

The driver's own tests replay them (`src/server/conformance.integration.test.ts`).
