import { fireEvent, render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { RecordsPanel } from './records-panel.component'
import type { PreviewRecord } from './records-table.component'

function renderWithChakra (element: React.ReactElement) {
  return render(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>)
}

const RECORDS: PreviewRecord[] = [
  { key: 'a1', data: { name: 'Widget', price: 9.5 } },
  { key: 'a2', data: { name: 'Gadget' } },
]

/** jsdom's `Blob` has no `.text()` (unlike a browser's); `FileReader`, which jsdom does implement, reads it back for the export test below. */
async function blobText (blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    // eslint-disable-next-line unicorn/prefer-add-event-listener -- this helper exists *because* jsdom's Blob has no `.text()`; FileReader's load/error events are the jsdom-supported way to read one back.
    reader.onload = () => { resolve(String(reader.result)) }
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    reader.onerror = () => { reject(reader.error) }
    // eslint-disable-next-line unicorn/prefer-blob-reading-methods -- see above: jsdom's Blob has no `.text()`.
    reader.readAsText(blob)
  })
}

describe('RecordsPanel', () => {
  it('starts on the Table view, one column per field', () => {
    renderWithChakra(<RecordsPanel records={RECORDS} />)
    expect(screen.getByText('Widget')).toBeTruthy()
    expect(screen.getByText('Gadget')).toBeTruthy()
    expect(screen.getByText('missing')).toBeTruthy()
  })

  it('toggling to JSONL renders the same records raw, one compact object per line', () => {
    renderWithChakra(<RecordsPanel records={RECORDS} />)
    fireEvent.click(screen.getByRole('button', { name: 'JSONL' }))

    expect(screen.getByText(/\{"name":"Widget","price":9\.5\}/)).toBeTruthy()
    expect(screen.getByText(/\{"name":"Gadget"\}/)).toBeTruthy()
    expect(screen.queryByText('Widget', { selector: 'td' })).toBeNull()
  })

  it('toggling back to Table renders the same records as columns again', () => {
    renderWithChakra(<RecordsPanel records={RECORDS} />)
    fireEvent.click(screen.getByRole('button', { name: 'JSONL' }))
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))

    expect(screen.getByText('Widget')).toBeTruthy()
  })

  it('a null cell click still reaches onCellClick through the Table view', () => {
    const onCellClick = jest.fn()
    renderWithChakra(<RecordsPanel records={[{ key: 'a1', data: { name: 'Widget', price: null } }]} onCellClick={onCellClick} />)
    fireEvent.click(screen.getByText('null'))
    expect(onCellClick).toHaveBeenCalledWith(0, 'price')
  })

  it('disables the export select when there are no records', () => {
    renderWithChakra(<RecordsPanel records={[]} />)
    expect(screen.getByLabelText('Export records')).toHaveProperty('disabled', true)
  })

  it('picking a format from the export select downloads the records as that format\'s file content', async () => {
    const realCreateElement = document.createElement.bind(document)
    const anchor = realCreateElement('a')
    const clickSpy = jest.spyOn(anchor, 'click').mockImplementation(() => {})
    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => (tagName === 'a' ? anchor : realCreateElement(tagName)))

    let downloadedBlob: Blob | undefined
    const createObjectURL = jest.fn((blob: Blob) => {
      downloadedBlob = blob

      return 'blob:mock-url'
    })
    const revokeObjectURL = jest.fn()
    Object.defineProperties(URL, {
      createObjectURL: { value: createObjectURL, configurable: true },
      revokeObjectURL: { value: revokeObjectURL, configurable: true },
    })

    renderWithChakra(<RecordsPanel records={RECORDS} />)
    fireEvent.change(screen.getByLabelText('Export records'), { target: { value: 'json' } })

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(anchor.download).toBe('records.json')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    expect(downloadedBlob?.type).toBe('application/json')
    expect(downloadedBlob === undefined ? undefined : await blobText(downloadedBlob)).toBe(JSON.stringify(RECORDS.map(record => record.data), null, 2))

    jest.restoreAllMocks()
  })

  it('the Enlarge button opens a dialog with a bigger view of the same records', async () => {
    renderWithChakra(<RecordsPanel records={RECORDS} />)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Enlarge' }))

    // The dialog mounts once Ark UI's machine finishes opening it, a tick after the click.
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(screen.getByText('Records (2)')).toBeTruthy()
  })

  it('clicking a Table row opens that entry in a detail modal', async () => {
    renderWithChakra(<RecordsPanel records={RECORDS} />)
    fireEvent.click(screen.getByText('Gadget'))

    expect(await screen.findByText('Record 2')).toBeTruthy()
    expect(screen.getByText('a2')).toBeTruthy() // the key, as a subtitle
    expect(screen.getByText(/"name": "Gadget"/)).toBeTruthy()
  })

  it('clicking a JSONL line opens the same entry in a detail modal', async () => {
    renderWithChakra(<RecordsPanel records={RECORDS} />)
    fireEvent.click(screen.getByRole('button', { name: 'JSONL' }))
    fireEvent.click(screen.getByText('{"name":"Widget","price":9.5}'))

    expect(await screen.findByText('Record 1')).toBeTruthy()
    expect(screen.getByText(/"price": 9\.5/)).toBeTruthy()
  })
})
