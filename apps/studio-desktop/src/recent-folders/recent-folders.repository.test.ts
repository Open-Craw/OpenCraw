import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRecentFoldersRepository } from './recent-folders.repository'

describe('createRecentFoldersRepository', () => {
  let directory: string

  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'recent-folders-')) })
  afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

  it('reads back what it saved', async () => {
    const repository = createRecentFoldersRepository(join(directory, 'nested', 'recent.json'))
    await repository.save(['a', 'b'])

    expect(await repository.load()).toEqual(['a', 'b'])
  })

  it('is empty when the file is missing', async () => {
    expect(await createRecentFoldersRepository(join(directory, 'none.json')).load()).toEqual([])
  })

  it('is empty when the file is not a list of strings', async () => {
    const file = join(directory, 'broken.json')
    await writeFile(file, '{"not":"a list"')

    expect(await createRecentFoldersRepository(file).load()).toEqual([])
  })

  it('keeps only the strings of a mixed list', async () => {
    const file = join(directory, 'mixed.json')
    await writeFile(file, JSON.stringify(['a', 3, null, 'b']))

    expect(await createRecentFoldersRepository(file).load()).toEqual(['a', 'b'])
  })
})
