import { BlobServiceClient, BlobSASPermissions } from '@azure/storage-blob'
import type { ResultStore } from './result-store.contract'

export interface BlobResultsOptions {
  /** A storage connection string with an account key (the key signs the read links). */
  connectionString: string
  /** Default `opencraw-results`; created when missing. */
  container?:       string
  /** How long a read link works. Default 24 hours. */
  linkTtlMs?:       number
}

const DAY_MS = 86_400_000

/**
 * Results in Azure Blob Storage, as JSON Lines, returned as read-only SAS
 * links that expire.
 *
 * @param options - The account, container and link lifetime.
 * @returns The store.
 */
export function blobResults (options: BlobResultsOptions): ResultStore {
  const container = BlobServiceClient.fromConnectionString(options.connectionString).getContainerClient(options.container ?? 'opencraw-results')
  let ready: Promise<unknown> | undefined

  return {
    async save (name, records) {
      ready ??= container.createIfNotExists()
      await ready
      const blob = container.getBlockBlobClient(name)
      const body = records.map(record => JSON.stringify(record)).join('\n')
      await blob.upload(body, Buffer.byteLength(body), { blobHTTPHeaders: { blobContentType: 'application/x-ndjson' } })

      return await blob.generateSasUrl({ permissions: BlobSASPermissions.parse('r'), expiresOn: new Date(Date.now() + (options.linkTtlMs ?? DAY_MS)) })
    },
  }
}
