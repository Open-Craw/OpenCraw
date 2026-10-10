import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWindowBoundsRepository } from './window-bounds.repository'

const bounds = { x: 10, y: 20, width: 1000, height: 700, maximized: true }

describe('createWindowBoundsRepository', () => {
  let directory: string

  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'window-bounds-')) })
  afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

  it('reads back what it saved', async () => {
    const repository = createWindowBoundsRepository(join(directory, 'nested', 'bounds.json'))
    await repository.save(bounds)

    expect(await repository.load()).toEqual(bounds)
  })

  it('has nothing when the file is missing', async () => {
    expect(await createWindowBoundsRepository(join(directory, 'none.json')).load()).toBeUndefined()
  })

  it('has nothing when the file is not bounds', async () => {
    const file = join(directory, 'broken.json')
    await writeFile(file, JSON.stringify({ x: 1, y: 2, width: 0, height: 5, maximized: false }))

    expect(await createWindowBoundsRepository(file).load()).toBeUndefined()
  })

  it('has nothing when the file is not JSON', async () => {
    const file = join(directory, 'garbage.json')
    await writeFile(file, '{"x":')

    expect(await createWindowBoundsRepository(file).load()).toBeUndefined()
  })
})
