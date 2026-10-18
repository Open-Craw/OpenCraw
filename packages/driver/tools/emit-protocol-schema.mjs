// Writes schemas/driver-protocol.schema.json from the protocol's zod contracts, through the build
// (run `smith run schemas -p driver`, which builds first). Clients in other languages generate their
// models from that file; a test fails while it is out of date.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { driverProtocolJsonSchema } from '../dist/index.esm.js'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'schemas', 'driver-protocol.schema.json')
writeFileSync(out, `${JSON.stringify(driverProtocolJsonSchema(), null, 2)}\n`)
console.log(`wrote ${out}`)
