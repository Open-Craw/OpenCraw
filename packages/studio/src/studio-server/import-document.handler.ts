import { importDocument } from '../recipe-workspace'
import type { ImportDocumentCommand, ImportDocumentView } from '../studio-api'

/**
 * Handles `import-document` (issue #120): decodes the base64 bytes and copies
 * the file into the folder (see `recipe-workspace/import-document.use-case.ts`
 * for the folder creation and the no-overwrite numbering). Nothing is
 * broadcast: the copy is not a recipe, the workspace listing does not change
 * until the UI saves the recipe pair that points at it, which `save-recipe`
 * announces as usual.
 *
 * @param command - The folder, the file's name and its base64 content.
 * @returns Where the copy landed and its `file:` URL.
 */
export async function handleImportDocument (command: ImportDocumentCommand): Promise<ImportDocumentView> {
  return importDocument(command.folder, command.name, new Uint8Array(Buffer.from(command.bytes, 'base64')))
}
