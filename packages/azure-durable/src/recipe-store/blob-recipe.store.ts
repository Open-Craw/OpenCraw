import { BlobServiceClient, RestError } from '@azure/storage-blob'
import type { BlobClient } from '@azure/storage-blob'
import { memoryRecipes } from './memory-recipe.store'
import type { RecipeStore, StoredRecipes } from './recipe-store.contract'
import { RecipeStoreError } from './recipe-store.error'

export interface BlobRecipesOptions {
  /** A storage connection string. */
  connectionString: string
  /** Default `opencraw-recipes`; created when missing. */
  container?:       string
  /** The recipe sets the deployment ships with: read-only, promoted, and never shadowed by a publish. */
  shipped?:         Omit<StoredRecipes, 'state'>[]
}

/** Blob metadata the store keeps next to each version's JSON. */
interface VersionMetadata extends Record<string, string> {
  name:    string
  version: string
  state:   StoredRecipes['state']
}

const blobName = (name: string, version: string): string => `${encodeURIComponent(name)}/${encodeURIComponent(version)}.json`
const missing = (error: unknown): boolean => error instanceof RestError && error.statusCode === 404
const taken = (error: unknown): boolean => error instanceof RestError && (error.statusCode === 409 || error.statusCode === 412)

/**
 * Named recipes in Azure Blob Storage: one JSON blob per version, its state
 * (`draft` or `promoted`) in the blob's metadata. A version is written once:
 * a second publish of it fails even when two race, since the write only
 * succeeds when no blob is there.
 *
 * @param options - The account, the container, and the sets the deployment ships with.
 * @returns The store.
 */
export function blobRecipes (options: BlobRecipesOptions): RecipeStore {
  const container = BlobServiceClient.fromConnectionString(options.connectionString).getContainerClient(options.container ?? 'opencraw-recipes')
  const shipped = memoryRecipes(options.shipped ?? [])
  let ready: Promise<unknown> | undefined
  const blob = async (name: string, version: string): Promise<BlobClient> => {
    ready ??= container.createIfNotExists()
    await ready

    return container.getBlobClient(blobName(name, version))
  }

  return {
    async get (name, version) {
      const found = await shipped.get(name, version)
      if (found !== undefined) return found
      const client = await blob(name, version)
      try {
        const [bytes, properties] = await Promise.all([client.downloadToBuffer(), client.getProperties()])

        return { name, version, recipes: JSON.parse(bytes.toString('utf8')) as unknown[], state: properties.metadata?.state === 'promoted' ? 'promoted' : 'draft' }
      } catch (error) {
        if (missing(error)) return
        throw error
      }
    },
    async list () {
      ready ??= container.createIfNotExists()
      await ready
      const published: Omit<StoredRecipes, 'recipes'>[] = []
      const blobs = container.listBlobsFlat({ includeMetadata: true })
      for await (const item of blobs) {
        const metadata = item.metadata as Partial<VersionMetadata> | undefined
        if (metadata?.name !== undefined && metadata.version !== undefined) published.push({ name: metadata.name, version: metadata.version, state: metadata.state === 'promoted' ? 'promoted' : 'draft' })
      }

      return [...await shipped.list(), ...published]
    },
    async put (entry) {
      if (await shipped.get(entry.name, entry.version) !== undefined) throw new RecipeStoreError(`recipes "${entry.name}" version "${entry.version}" ship with the deployment; publish a new version`, 409)
      const body = JSON.stringify(entry.recipes)
      const metadata: VersionMetadata = { name: entry.name, version: entry.version, state: 'draft' }
      const client = await blob(entry.name, entry.version)
      try {
        await client.getBlockBlobClient().upload(body, Buffer.byteLength(body), { metadata, conditions: { ifNoneMatch: '*' }, blobHTTPHeaders: { blobContentType: 'application/json' } })
      } catch (error) {
        if (taken(error)) throw new RecipeStoreError(`recipes "${entry.name}" version "${entry.version}" exist already; publish a new version`, 409)
        throw error
      }
    },
    async promote (name, version) {
      if (await shipped.get(name, version) !== undefined) return
      const client = await blob(name, version)
      try {
        const properties = await client.getProperties()
        await client.setMetadata({ ...properties.metadata, state: 'promoted' }, { conditions: { ifMatch: properties.etag } })
      } catch (error) {
        if (missing(error)) throw new RecipeStoreError(`no recipes "${name}" version "${version}"`, 404)
        throw error
      }
    },
  }
}
