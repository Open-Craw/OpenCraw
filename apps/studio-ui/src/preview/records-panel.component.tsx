import { useState } from 'react'
import { Box, Button, CloseButton, Dialog, HStack, NativeSelect, Portal } from '@chakra-ui/react'
import type { PreviewRecord } from './records-table.component'
import { RecordsTable } from './records-table.component'
import { RecordsJsonl } from './records-jsonl.component'
import type { RecordsExportFormat } from './records-export.mapper'
import { buildRecordsExportFile } from './records-export.mapper'

export interface RecordsPanelProps {
  records:      PreviewRecord[]
  /** See `RecordsTableProps.onCellClick`. */
  onCellClick?: (recordIndex: number, field: string) => void
}

type RecordsView = 'table' | 'jsonl'

/**
 * The Records tab's own panel (issue #116): a Table/JSONL toggle over the
 * same `records` (`run-session.store.ts`'s live sample, read here — never
 * re-fetched), an export select that downloads them
 * (`records-export.mapper.ts`), and an "Enlarge" button opening the same
 * toggle bigger in a `Dialog`. Resizable height is handled one level up, in
 * `app.view.tsx`'s own vertical `Splitter` around the whole preview strip —
 * this panel does not add a second resize mechanism.
 *
 * This app has no earlier Modal/Dialog to match, so the enlarge dialog is
 * built to Chakra's own compound-part convention — the same shape
 * `Splitter`/`Table`/`Tabs` already use here (`Dialog.Root`/`Dialog.Content`/…
 * from `@chakra-ui/react`, Chakra v3's renamed `Modal`).
 */
export function RecordsPanel ({ records, onCellClick }: RecordsPanelProps) {
  const [view, setView] = useState<RecordsView>('table')
  const [enlarged, setEnlarged] = useState(false)

  function handleExport (format: RecordsExportFormat): void {
    const file = buildRecordsExportFile(records, format)
    downloadFile(file.filename, file.mimeType, file.content)
  }

  return (
    <Box flex='1' minH='0' display='flex' flexDirection='column'>
      <RecordsToolbar view={view} onViewChange={setView} onExport={handleExport} onEnlarge={() => { setEnlarged(true) }} exportDisabled={records.length === 0} />
      <Box flex='1' minH='0' overflow='auto'>
        <RecordsView view={view} records={records} onCellClick={onCellClick} />
      </Box>
      <Dialog.Root open={enlarged} onOpenChange={(details) => { setEnlarged(details.open) }} size='cover' placement='center'>
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content h='85vh' display='flex' flexDirection='column'>
              <Dialog.Header display='flex' flexDirection='row' alignItems='center' justifyContent='space-between'>
                <Dialog.Title>Records ({records.length})</Dialog.Title>
                <Dialog.CloseTrigger asChild>
                  <CloseButton size='sm' aria-label='Close' />
                </Dialog.CloseTrigger>
              </Dialog.Header>
              <Dialog.Body flex='1' minH='0' display='flex' flexDirection='column' gap={2} pb={4}>
                <RecordsToolbar view={view} onViewChange={setView} onExport={handleExport} exportDisabled={records.length === 0} />
                <Box flex='1' minH='0' overflow='auto'>
                  <RecordsView view={view} records={records} onCellClick={onCellClick} />
                </Box>
              </Dialog.Body>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Box>
  )
}

function RecordsView ({ view, records, onCellClick }: { view: RecordsView, records: PreviewRecord[], onCellClick?: (recordIndex: number, field: string) => void }) {
  return view === 'table' ? <RecordsTable records={records} onCellClick={onCellClick} /> : <RecordsJsonl records={records} />
}

/** The toolbar shared by the inline panel and the enlarge dialog: Table/JSONL toggle, export select and (inline only) the Enlarge button. */
function RecordsToolbar ({ view, onViewChange, onExport, onEnlarge, exportDisabled }: {
  view:            RecordsView
  onViewChange:    (view: RecordsView) => void
  onExport:        (format: RecordsExportFormat) => void
  /** Omitted in the dialog's own toolbar — enlarging what is already enlarged has nothing to do. */
  onEnlarge?:      () => void
  exportDisabled?: boolean
}) {
  return (
    <HStack px={2} py={1} gap={2} borderBottomWidth='1px' flexShrink={0}>
      <Button size='2xs' variant={view === 'table' ? 'solid' : 'outline'} onClick={() => { onViewChange('table') }}>Table</Button>
      <Button size='2xs' variant={view === 'jsonl' ? 'solid' : 'outline'} onClick={() => { onViewChange('jsonl') }}>JSONL</Button>
      <NativeSelect.Root size='xs' width='7em' variant='outline' disabled={exportDisabled}>
        <NativeSelect.Field
          aria-label='Export records'
          value=''
          onChange={(event) => {
            const format = event.target.value as RecordsExportFormat | ''
            if (format !== '') onExport(format)
            event.target.value = ''
          }}
        >
          <option value='' disabled>Export…</option>
          <option value='json'>JSON</option>
          <option value='jsonl'>JSONL</option>
          <option value='csv'>CSV</option>
        </NativeSelect.Field>
      </NativeSelect.Root>
      {onEnlarge !== undefined && <Button size='2xs' variant='outline' onClick={onEnlarge} marginStart='auto'>Enlarge</Button>}
    </HStack>
  )
}

/** Triggers a browser download of `content` as `filename`: an in-memory `Blob` URL and a throwaway `<a download>`, the plain way to do this without a server round-trip. */
function downloadFile (filename: string, mimeType: string, content: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
